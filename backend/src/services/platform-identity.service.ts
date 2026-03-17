import type { SupabaseClient } from '@supabase/supabase-js';
import { createUserPlatformRepository } from '../db/repository-factory.js';
import {
  type LinkPlatformToUserInput,
  SupabaseUserPlatformRepository,
  type SupportedPlatformId,
  type UserPlatformRepository,
} from '../db/repositories/user-platform.repository.js';
import { AppError, ErrorCodes } from '../utils/errors.js';

export type { SupportedPlatformId };

interface PlatformIdentityServiceDeps {
  supabase?: SupabaseClient;
  repository?: UserPlatformRepository;
}

export class PlatformIdentityService {
  private readonly repositoryOverride: UserPlatformRepository | null;
  private repositoryInstance: UserPlatformRepository | null = null;
  private metadataColumnSupported: boolean | null = null;

  constructor(deps: PlatformIdentityServiceDeps = {}) {
    this.repositoryOverride = deps.repository
      ?? (deps.supabase
        ? new SupabaseUserPlatformRepository(deps.supabase)
        : null);
  }

  private get repository(): UserPlatformRepository {
    if (this.repositoryOverride) {
      return this.repositoryOverride;
    }
    if (!this.repositoryInstance) {
      this.repositoryInstance = createUserPlatformRepository();
    }
    return this.repositoryInstance;
  }

  async findUserIdByPlatform(platformId: SupportedPlatformId, platformUserId: string): Promise<string | null> {
    const { data, error } = await this.repository.findUserIdByPlatform(platformId, platformUserId);

    if (error) {
      throw new AppError(
        ErrorCodes.INTERNAL_DB_ERROR,
        `Failed to lookup platform identity: ${error.message}`,
        500
      );
    }

    return data;
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

    const rpcResult = await this.repository.linkPlatformToUserTx(input);
    if (rpcResult.error) {
      throw new AppError(
        ErrorCodes.INTERNAL_DB_ERROR,
        `Failed to link platform identity: ${rpcResult.error.message}`,
        500
      );
    }

    if (rpcResult.data?.conflictUserId && rpcResult.data.conflictUserId !== input.userId) {
      throw new AppError('CONFLICT_ACCOUNT_PROVIDER', `This ${input.platformId} account is already linked to another LagaLaga account.`, 409, {
        severity: 'warning',
        metadata: {
          platformId: input.platformId,
          action: 'use_original_login',
        },
      });
    }

    if (!rpcResult.data?.unavailable) {
      if (input.metadata && this.metadataColumnSupported !== false) {
        await this.tryUpdatePlatformMetadata(input.userId, input.platformId, input.metadata);
      }
      return;
    }

    await this.linkWithFallbackUpsert(input);
  }

  async unlinkPlatformFromUser(input: { userId: string; platformId: SupportedPlatformId }): Promise<void> {
    const { error } = await this.repository.unlinkPlatformFromUser(input);

    if (error) {
      throw new AppError(
        ErrorCodes.INTERNAL_DB_ERROR,
        `Failed to unlink platform identity: ${error.message}`,
        500
      );
    }
  }

  async mergeProviderShadowUserIntoRobloxUser(input: {
    sourceUserId: string;
    robloxPlatformUserId: string;
  }): Promise<{ merged: boolean; mergedUserId: string | null; reasonCode: string | null }> {
    const { data, error } = await this.repository.mergeProviderShadowUserIntoRobloxUserTx({
      sourceUserId: input.sourceUserId,
      robloxPlatformUserId: input.robloxPlatformUserId,
    });

    if (error) {
      throw new AppError(
        ErrorCodes.INTERNAL_DB_ERROR,
        `Failed to merge provider shadow user into Roblox user: ${error.message}`,
        500
      );
    }

    return {
      merged: data?.merged === true,
      mergedUserId: data?.mergedUserId ?? null,
      reasonCode: data?.reasonCode ?? null,
    };
  }

  async syncRobloxFieldsFromPlatformLink(userId: string): Promise<void> {
    const { data, error } = await this.repository.findRobloxPlatformLink(userId);

    if (error) {
      throw new AppError(
        ErrorCodes.INTERNAL_DB_ERROR,
        `Failed to load Roblox platform link: ${error.message}`,
        500
      );
    }

    if (!data?.platform_user_id) {
      return;
    }

    const syncResult = await this.repository.updateUserRobloxFields(userId, {
      robloxUserId: data.platform_user_id,
      robloxUsername: data.platform_username,
      robloxDisplayName: data.platform_display_name,
    });

    if (syncResult.error) {
      throw new AppError(
        ErrorCodes.INTERNAL_DB_ERROR,
        `Failed to sync Roblox profile fields: ${syncResult.error.message}`,
        500
      );
    }
  }

  private async linkWithFallbackUpsert(input: LinkPlatformToUserInput): Promise<void> {
    const result = await this.repository.upsertLink(input);

    if (result.error) {
      if (result.error.code === '23505' || result.error.code === ErrorCodes.CONFLICT) {
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

      if (result.error.code === 'PGRST204') {
        this.metadataColumnSupported = false;
        const fallbackPayload = { ...input, metadata: undefined };
        const fallbackResult = await this.repository.upsertLink(fallbackPayload);

        if (!fallbackResult.error) {
          return;
        }
      }

      throw new AppError(
        ErrorCodes.INTERNAL_DB_ERROR,
        `Failed to link platform identity: ${result.error.message}`,
        500
      );
    }

    if (input.platformId === 'roblox') {
      await this.syncRobloxFieldsFromPlatformLink(input.userId);
      if (input.robloxProfileUrl) {
        const profileResult = await this.repository.updateUserRobloxProfileUrl(input.userId, input.robloxProfileUrl);

        if (profileResult.error) {
          throw new AppError(
            ErrorCodes.INTERNAL_DB_ERROR,
            `Failed to sync Roblox profile URL: ${profileResult.error.message}`,
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
    const result = await this.repository.updatePlatformMetadata(userId, platformId, metadata);

    if (!result.error) {
      this.metadataColumnSupported = this.metadataColumnSupported ?? true;
      return;
    }

    if (result.error.code === 'PGRST204') {
      this.metadataColumnSupported = false;
      return;
    }

    throw new AppError(
      ErrorCodes.INTERNAL_DB_ERROR,
      `Failed to update Google metadata: ${result.error.message}`,
      500
    );
  }
}
