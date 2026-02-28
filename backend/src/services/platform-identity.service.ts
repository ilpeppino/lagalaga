import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabase } from '../config/supabase.js';
import { AppError, ErrorCodes } from '../utils/errors.js';

export type SupportedPlatformId = 'roblox' | 'google' | 'apple';

interface PlatformIdentityServiceDeps {
  supabase?: SupabaseClient;
}

interface LinkPlatformToUserInput {
  userId: string;
  platformId: SupportedPlatformId;
  platformUserId: string;
  platformUsername?: string | null;
  platformDisplayName?: string | null;
  platformAvatarUrl?: string | null;
  metadata?: Record<string, unknown> | null;
  robloxProfileUrl?: string | null;
}

interface LinkPlatformTxResponse {
  linked_user_id: string;
  conflict_user_id: string | null;
}

export class PlatformIdentityService {
  private readonly providedSupabase?: SupabaseClient;
  private metadataColumnSupported: boolean | null = null;

  constructor(deps: PlatformIdentityServiceDeps = {}) {
    this.providedSupabase = deps.supabase;
  }

  async findUserIdByPlatform(platformId: SupportedPlatformId, platformUserId: string): Promise<string | null> {
    const { data, error } = await this.getSupabase()
      .from('user_platforms')
      .select('user_id')
      .eq('platform_id', platformId)
      .eq('platform_user_id', platformUserId)
      .maybeSingle<{ user_id: string }>();

    if (error && error.code !== 'PGRST116') {
      throw new AppError(
        ErrorCodes.INTERNAL_DB_ERROR,
        `Failed to lookup platform identity: ${error.message}`,
        500
      );
    }

    return data?.user_id ?? null;
  }

  async assertPlatformNotLinkedToDifferentUser(input: {
    userId: string;
    platformId: SupportedPlatformId;
    platformUserId: string;
  }): Promise<void> {
    const linkedUserId = await this.findUserIdByPlatform(input.platformId, input.platformUserId);
    if (linkedUserId && linkedUserId !== input.userId) {
      throw new AppError('CONFLICT_ACCOUNT_PROVIDER', `This ${input.platformId} account is already linked to another LagaLaga account.`, 409, {
        severity: 'warning',
        metadata: {
          platformId: input.platformId,
          action: 'use_original_login',
        },
      });
    }
  }

  async linkPlatformToUser(input: LinkPlatformToUserInput): Promise<void> {
    await this.assertPlatformNotLinkedToDifferentUser({
      userId: input.userId,
      platformId: input.platformId,
      platformUserId: input.platformUserId,
    });

    const rpcResult = await this.linkWithTransactionRpc(input);
    if (rpcResult === 'linked') {
      return;
    }

    await this.linkWithFallbackUpsert(input);
  }

  async unlinkPlatformFromUser(input: { userId: string; platformId: SupportedPlatformId }): Promise<void> {
    const { error } = await this.getSupabase()
      .from('user_platforms')
      .delete()
      .eq('user_id', input.userId)
      .eq('platform_id', input.platformId);

    if (error) {
      throw new AppError(
        ErrorCodes.INTERNAL_DB_ERROR,
        `Failed to unlink platform identity: ${error.message}`,
        500
      );
    }
  }

  async syncRobloxFieldsFromPlatformLink(userId: string): Promise<void> {
    const { data, error } = await this.getSupabase()
      .from('user_platforms')
      .select('platform_user_id, platform_username, platform_display_name')
      .eq('user_id', userId)
      .eq('platform_id', 'roblox')
      .maybeSingle<{
        platform_user_id: string;
        platform_username: string | null;
        platform_display_name: string | null;
      }>();

    if (error && error.code !== 'PGRST116') {
      throw new AppError(
        ErrorCodes.INTERNAL_DB_ERROR,
        `Failed to load Roblox platform link: ${error.message}`,
        500
      );
    }

    if (!data?.platform_user_id) {
      return;
    }

    const { error: updateError } = await this.getSupabase()
      .from('app_users')
      .update({
        roblox_user_id: data.platform_user_id,
        roblox_username: data.platform_username,
        roblox_display_name: data.platform_display_name,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (updateError) {
      throw new AppError(
        ErrorCodes.INTERNAL_DB_ERROR,
        `Failed to sync Roblox profile fields: ${updateError.message}`,
        500
      );
    }
  }

  private async linkWithTransactionRpc(input: LinkPlatformToUserInput): Promise<'linked' | 'fallback'> {
    const { data, error } = await this.getSupabase().rpc('link_platform_to_user_tx', {
      p_user_id: input.userId,
      p_platform_id: input.platformId,
      p_platform_user_id: input.platformUserId,
      p_platform_username: input.platformUsername ?? null,
      p_platform_display_name: input.platformDisplayName ?? null,
      p_platform_avatar_url: input.platformAvatarUrl ?? null,
      p_roblox_profile_url: input.robloxProfileUrl ?? null,
    });

    if (error) {
      if (error.code === 'PGRST202') {
        return 'fallback';
      }
      throw new AppError(
        ErrorCodes.INTERNAL_DB_ERROR,
        `Failed to link platform identity: ${error.message}`,
        500
      );
    }

    const row = (Array.isArray(data) ? data[0] : data) as LinkPlatformTxResponse | null;
    if (row?.conflict_user_id && row.conflict_user_id !== input.userId) {
      throw new AppError('CONFLICT_ACCOUNT_PROVIDER', `This ${input.platformId} account is already linked to another LagaLaga account.`, 409, {
        severity: 'warning',
        metadata: {
          platformId: input.platformId,
          action: 'use_original_login',
        },
      });
    }

    if (input.metadata && this.metadataColumnSupported !== false) {
      await this.tryUpdatePlatformMetadata(input.userId, input.platformId, input.metadata);
    }

    return 'linked';
  }

  private async linkWithFallbackUpsert(input: LinkPlatformToUserInput): Promise<void> {
    const payload: Record<string, unknown> = {
      user_id: input.userId,
      platform_id: input.platformId,
      platform_user_id: input.platformUserId,
      platform_username: input.platformUsername ?? null,
      platform_display_name: input.platformDisplayName ?? null,
      platform_avatar_url: input.platformAvatarUrl ?? null,
      verified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (input.metadata && this.metadataColumnSupported !== false) {
      payload.metadata = input.metadata;
    }

    const { error } = await this.getSupabase()
      .from('user_platforms')
      .upsert(payload, { onConflict: 'user_id,platform_id' });

    if (error) {
      if (error.code === '23505') {
        const linkedUserId = await this.findUserIdByPlatform(input.platformId, input.platformUserId);
        if (linkedUserId && linkedUserId !== input.userId) {
          throw new AppError('CONFLICT_ACCOUNT_PROVIDER', `This ${input.platformId} account is already linked to another LagaLaga account.`, 409, {
            severity: 'warning',
            metadata: {
              platformId: input.platformId,
              action: 'use_original_login',
            },
          });
        }
        throw new AppError('ACCOUNT_LINK_SAME_PROVIDER_DUPLICATE', 'Duplicate provider link detected.', 409, {
          severity: 'warning',
          metadata: { platformId: input.platformId },
        });
      }

      if (error.code === 'PGRST204') {
        this.metadataColumnSupported = false;
        const fallbackPayload = { ...payload };
        delete fallbackPayload.metadata;
        const { error: fallbackError } = await this.getSupabase()
          .from('user_platforms')
          .upsert(fallbackPayload, { onConflict: 'user_id,platform_id' });

        if (!fallbackError) {
          return;
        }
      }

      throw new AppError(
        ErrorCodes.INTERNAL_DB_ERROR,
        `Failed to link platform identity: ${error.message}`,
        500
      );
    }

    if (input.platformId === 'roblox') {
      await this.syncRobloxFieldsFromPlatformLink(input.userId);
      if (input.robloxProfileUrl) {
        const { error: profileError } = await this.getSupabase()
          .from('app_users')
          .update({ roblox_profile_url: input.robloxProfileUrl, updated_at: new Date().toISOString() })
          .eq('id', input.userId);
        if (profileError) {
          throw new AppError(
            ErrorCodes.INTERNAL_DB_ERROR,
            `Failed to sync Roblox profile URL: ${profileError.message}`,
            500
          );
        }
      }
    }
  }

  private async tryUpdatePlatformMetadata(
    userId: string,
    platformId: SupportedPlatformId,
    metadata: Record<string, unknown>
  ): Promise<void> {
    const { error } = await this.getSupabase()
      .from('user_platforms')
      .update({
        metadata,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('platform_id', platformId);

    if (!error) {
      this.metadataColumnSupported = this.metadataColumnSupported ?? true;
      return;
    }

    if (error.code === 'PGRST204') {
      this.metadataColumnSupported = false;
      return;
    }

    throw new AppError(
      ErrorCodes.INTERNAL_DB_ERROR,
      `Failed to update Google metadata: ${error.message}`,
      500
    );
  }

  private getSupabase(): SupabaseClient {
    return this.providedSupabase ?? getSupabase();
  }
}
