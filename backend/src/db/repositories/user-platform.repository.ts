import type { SupabaseClient } from '@supabase/supabase-js';
import type { Pool, PoolClient } from 'pg';
import { getSupabase } from '../../config/supabase.js';
import { mapPgError } from '../errors.js';
import type { DbResult } from '../types.js';

export type SupportedPlatformId = 'roblox' | 'google' | 'apple';

export interface LinkPlatformToUserInput {
  userId: string;
  platformId: SupportedPlatformId;
  platformUserId: string;
  platformUsername?: string | null;
  platformDisplayName?: string | null;
  platformAvatarUrl?: string | null;
  metadata?: Record<string, unknown> | null;
  robloxProfileUrl?: string | null;
}

export interface LinkPlatformTxResult {
  linkedUserId: string;
  conflictUserId: string | null;
  unavailable: boolean;
}

export interface MergeShadowUserResult {
  merged: boolean;
  mergedUserId: string | null;
  reasonCode: string | null;
  unavailable: boolean;
}

export interface RobloxPlatformLink {
  platform_user_id: string;
  platform_username: string | null;
  platform_display_name: string | null;
}

export interface RobloxPlatformConnection extends RobloxPlatformLink {
  platform_avatar_url: string | null;
  verified_at: string | null;
}

export interface UserPlatformRepository {
  findUserIdByPlatform(platformId: SupportedPlatformId, platformUserId: string): Promise<DbResult<string | null>>;
  upsertLink(input: LinkPlatformToUserInput): Promise<DbResult<void>>;
  linkPlatformToUserTx(input: LinkPlatformToUserInput): Promise<DbResult<LinkPlatformTxResult>>;
  unlinkPlatformFromUser(input: { userId: string; platformId: SupportedPlatformId }): Promise<DbResult<void>>;
  mergeProviderShadowUserIntoRobloxUserTx(input: {
    sourceUserId: string;
    robloxPlatformUserId: string;
  }): Promise<DbResult<MergeShadowUserResult>>;
  findRobloxPlatformLink(userId: string): Promise<DbResult<RobloxPlatformLink | null>>;
  findRobloxConnection(userId: string): Promise<DbResult<RobloxPlatformConnection | null>>;
  updateUserRobloxFields(userId: string, data: {
    robloxUserId: string;
    robloxUsername: string | null;
    robloxDisplayName: string | null;
  }): Promise<DbResult<void>>;
  updateUserRobloxProfileUrl(userId: string, profileUrl: string): Promise<DbResult<void>>;
  updatePlatformMetadata(userId: string, platformId: SupportedPlatformId, metadata: Record<string, unknown>): Promise<DbResult<void>>;
}

interface LinkPlatformTxResponse {
  linked_user_id: string;
  conflict_user_id: string | null;
}

interface SafeMergeTxResponse {
  merged: boolean;
  merged_user_id: string | null;
  reason_code: string | null;
}

export class SupabaseUserPlatformRepository implements UserPlatformRepository {
  constructor(private readonly supabase: SupabaseClient = getSupabase()) {}

  async findUserIdByPlatform(platformId: SupportedPlatformId, platformUserId: string): Promise<DbResult<string | null>> {
    const { data, error } = await this.supabase
      .from('user_platforms')
      .select('user_id')
      .eq('platform_id', platformId)
      .eq('platform_user_id', platformUserId)
      .maybeSingle<{ user_id: string }>();

    if (error && error.code !== 'PGRST116') {
      return { data: null, error: { code: error.code ?? 'SUPABASE_QUERY_ERROR', message: error.message } };
    }

    return { data: data?.user_id ?? null, error: null };
  }

  async upsertLink(input: LinkPlatformToUserInput): Promise<DbResult<void>> {
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

    if (input.metadata) {
      payload.metadata = input.metadata;
    }

    const { error } = await this.supabase
      .from('user_platforms')
      .upsert(payload, { onConflict: 'user_id,platform_id' });

    if (error) {
      return {
        data: null,
        error: {
          code: error.code ?? 'SUPABASE_QUERY_ERROR',
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
      };
    }

    return { data: undefined, error: null };
  }

  async linkPlatformToUserTx(input: LinkPlatformToUserInput): Promise<DbResult<LinkPlatformTxResult>> {
    const { data, error } = await this.supabase.rpc('link_platform_to_user_tx', {
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
        return {
          data: {
            linkedUserId: input.userId,
            conflictUserId: null,
            unavailable: true,
          },
          error: null,
        };
      }

      return { data: null, error: { code: error.code ?? 'SUPABASE_QUERY_ERROR', message: error.message } };
    }

    const row = (Array.isArray(data) ? data[0] : data) as LinkPlatformTxResponse | null;
    return {
      data: {
        linkedUserId: row?.linked_user_id ?? input.userId,
        conflictUserId: row?.conflict_user_id ?? null,
        unavailable: false,
      },
      error: null,
    };
  }

  async unlinkPlatformFromUser(input: { userId: string; platformId: SupportedPlatformId }): Promise<DbResult<void>> {
    const { error } = await this.supabase
      .from('user_platforms')
      .delete()
      .eq('user_id', input.userId)
      .eq('platform_id', input.platformId);

    if (error) {
      return { data: null, error: { code: error.code ?? 'SUPABASE_QUERY_ERROR', message: error.message } };
    }

    return { data: undefined, error: null };
  }

  async mergeProviderShadowUserIntoRobloxUserTx(input: {
    sourceUserId: string;
    robloxPlatformUserId: string;
  }): Promise<DbResult<MergeShadowUserResult>> {
    const { data, error } = await this.supabase.rpc('merge_provider_shadow_user_into_roblox_user_tx', {
      p_source_user_id: input.sourceUserId,
      p_roblox_platform_user_id: input.robloxPlatformUserId,
    });

    if (error) {
      if (error.code === 'PGRST202') {
        return {
          data: {
            merged: false,
            mergedUserId: null,
            reasonCode: 'RPC_UNAVAILABLE',
            unavailable: true,
          },
          error: null,
        };
      }
      return { data: null, error: { code: error.code ?? 'SUPABASE_QUERY_ERROR', message: error.message } };
    }

    const row = (Array.isArray(data) ? data[0] : data) as SafeMergeTxResponse | null;
    return {
      data: {
        merged: row?.merged === true,
        mergedUserId: row?.merged_user_id ?? null,
        reasonCode: row?.reason_code ?? null,
        unavailable: false,
      },
      error: null,
    };
  }

  async findRobloxPlatformLink(userId: string): Promise<DbResult<RobloxPlatformLink | null>> {
    const { data, error } = await this.supabase
      .from('user_platforms')
      .select('platform_user_id, platform_username, platform_display_name')
      .eq('user_id', userId)
      .eq('platform_id', 'roblox')
      .maybeSingle<RobloxPlatformLink>();

    if (error && error.code !== 'PGRST116') {
      return { data: null, error: { code: error.code ?? 'SUPABASE_QUERY_ERROR', message: error.message } };
    }

    return { data: data ?? null, error: null };
  }

  async findRobloxConnection(userId: string): Promise<DbResult<RobloxPlatformConnection | null>> {
    const { data, error } = await this.supabase
      .from('user_platforms')
      .select('platform_user_id, platform_username, platform_display_name, platform_avatar_url, verified_at')
      .eq('user_id', userId)
      .eq('platform_id', 'roblox')
      .maybeSingle<RobloxPlatformConnection>();

    if (error && error.code !== 'PGRST116') {
      return { data: null, error: { code: error.code ?? 'SUPABASE_QUERY_ERROR', message: error.message } };
    }

    return { data: data ?? null, error: null };
  }

  async updateUserRobloxFields(userId: string, data: {
    robloxUserId: string;
    robloxUsername: string | null;
    robloxDisplayName: string | null;
  }): Promise<DbResult<void>> {
    const { error } = await this.supabase
      .from('app_users')
      .update({
        roblox_user_id: data.robloxUserId,
        roblox_username: data.robloxUsername,
        roblox_display_name: data.robloxDisplayName,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (error) {
      return { data: null, error: { code: error.code ?? 'SUPABASE_QUERY_ERROR', message: error.message } };
    }

    return { data: undefined, error: null };
  }

  async updateUserRobloxProfileUrl(userId: string, profileUrl: string): Promise<DbResult<void>> {
    const { error } = await this.supabase
      .from('app_users')
      .update({ roblox_profile_url: profileUrl, updated_at: new Date().toISOString() })
      .eq('id', userId);

    if (error) {
      return { data: null, error: { code: error.code ?? 'SUPABASE_QUERY_ERROR', message: error.message } };
    }

    return { data: undefined, error: null };
  }

  async updatePlatformMetadata(userId: string, platformId: SupportedPlatformId, metadata: Record<string, unknown>): Promise<DbResult<void>> {
    const { error } = await this.supabase
      .from('user_platforms')
      .update({
        metadata,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('platform_id', platformId);

    if (error) {
      return {
        data: null,
        error: {
          code: error.code ?? 'SUPABASE_QUERY_ERROR',
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
      };
    }

    return { data: undefined, error: null };
  }
}

export class PgUserPlatformRepository implements UserPlatformRepository {
  constructor(private readonly pool: Pool) {}

  async findUserIdByPlatform(platformId: SupportedPlatformId, platformUserId: string): Promise<DbResult<string | null>> {
    try {
      const result = await this.pool.query<{ user_id: string }>(
        `SELECT user_id::text AS user_id
         FROM user_platforms
         WHERE platform_id = $1 AND platform_user_id = $2
         LIMIT 1`,
        [platformId, platformUserId]
      );

      return { data: result.rows[0]?.user_id ?? null, error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }

  async upsertLink(input: LinkPlatformToUserInput): Promise<DbResult<void>> {
    try {
      const now = new Date().toISOString();
      await this.pool.query(
        `INSERT INTO user_platforms (
          user_id,
          platform_id,
          platform_user_id,
          platform_username,
          platform_display_name,
          platform_avatar_url,
          verified_at,
          updated_at,
          metadata
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT (user_id, platform_id)
        DO UPDATE SET
          platform_user_id = EXCLUDED.platform_user_id,
          platform_username = EXCLUDED.platform_username,
          platform_display_name = EXCLUDED.platform_display_name,
          platform_avatar_url = EXCLUDED.platform_avatar_url,
          verified_at = EXCLUDED.verified_at,
          updated_at = EXCLUDED.updated_at,
          metadata = COALESCE(EXCLUDED.metadata, user_platforms.metadata)`,
        [
          input.userId,
          input.platformId,
          input.platformUserId,
          input.platformUsername ?? null,
          input.platformDisplayName ?? null,
          input.platformAvatarUrl ?? null,
          now,
          now,
          input.metadata ?? null,
        ]
      );

      return { data: undefined, error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }

  async linkPlatformToUserTx(input: LinkPlatformToUserInput): Promise<DbResult<LinkPlatformTxResult>> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1 || ':' || $2))`, [input.platformId, input.platformUserId]);

      const owner = await client.query<{ user_id: string }>(
        `SELECT user_id::text AS user_id
         FROM user_platforms
         WHERE platform_id = $1 AND platform_user_id = $2
         LIMIT 1`,
        [input.platformId, input.platformUserId]
      );

      if (owner.rows[0]?.user_id && owner.rows[0].user_id !== input.userId) {
        await client.query('ROLLBACK');
        return {
          data: {
            linkedUserId: input.userId,
            conflictUserId: owner.rows[0].user_id,
            unavailable: false,
          },
          error: null,
        };
      }

      const now = new Date().toISOString();
      await client.query(
        `INSERT INTO user_platforms (
          user_id,
          platform_id,
          platform_user_id,
          platform_username,
          platform_display_name,
          platform_avatar_url,
          verified_at,
          updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (user_id, platform_id)
        DO UPDATE SET
          platform_user_id = EXCLUDED.platform_user_id,
          platform_username = EXCLUDED.platform_username,
          platform_display_name = EXCLUDED.platform_display_name,
          platform_avatar_url = EXCLUDED.platform_avatar_url,
          verified_at = EXCLUDED.verified_at,
          updated_at = NOW()`,
        [
          input.userId,
          input.platformId,
          input.platformUserId,
          input.platformUsername ?? null,
          input.platformDisplayName ?? null,
          input.platformAvatarUrl ?? null,
          now,
          now,
        ]
      );

      if (input.platformId === 'roblox') {
        await client.query(
          `UPDATE app_users
           SET roblox_user_id = $1,
               roblox_username = $2,
               roblox_display_name = COALESCE($3, roblox_display_name),
               roblox_profile_url = COALESCE($4, roblox_profile_url),
               updated_at = NOW()
           WHERE id = $5`,
          [
            input.platformUserId,
            input.platformUsername ?? null,
            input.platformDisplayName ?? null,
            input.robloxProfileUrl ?? null,
            input.userId,
          ]
        );
      }

      await client.query('COMMIT');
      return {
        data: {
          linkedUserId: input.userId,
          conflictUserId: null,
          unavailable: false,
        },
        error: null,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      return { data: null, error: mapPgError(error) };
    } finally {
      client.release();
    }
  }

  async unlinkPlatformFromUser(input: { userId: string; platformId: SupportedPlatformId }): Promise<DbResult<void>> {
    try {
      await this.pool.query(
        'DELETE FROM user_platforms WHERE user_id = $1 AND platform_id = $2',
        [input.userId, input.platformId]
      );
      return { data: undefined, error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }

  async mergeProviderShadowUserIntoRobloxUserTx(input: {
    sourceUserId: string;
    robloxPlatformUserId: string;
  }): Promise<DbResult<MergeShadowUserResult>> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      if (!input.sourceUserId || !input.robloxPlatformUserId?.trim()) {
        await client.query('ROLLBACK');
        return {
          data: {
            merged: false,
            mergedUserId: null,
            reasonCode: 'INVALID_INPUT',
            unavailable: false,
          },
          error: null,
        };
      }

      const targetResult = await client.query<{ user_id: string }>(
        `SELECT user_id::text AS user_id
         FROM user_platforms
         WHERE platform_id = 'roblox' AND platform_user_id = $1
         LIMIT 1`,
        [input.robloxPlatformUserId]
      );
      const targetUserId = targetResult.rows[0]?.user_id ?? null;

      if (!targetUserId) {
        await client.query('ROLLBACK');
        return {
          data: {
            merged: false,
            mergedUserId: null,
            reasonCode: 'TARGET_ROBLOX_USER_NOT_FOUND',
            unavailable: false,
          },
          error: null,
        };
      }

      if (targetUserId === input.sourceUserId) {
        await client.query('ROLLBACK');
        return {
          data: {
            merged: true,
            mergedUserId: targetUserId,
            reasonCode: 'ALREADY_LINKED',
            unavailable: false,
          },
          error: null,
        };
      }

      await client.query(
        'SELECT 1 FROM app_users WHERE id IN ($1, $2) FOR UPDATE',
        [input.sourceUserId, targetUserId]
      );

      const sourceExists = await this.existsById(client, 'app_users', input.sourceUserId);
      if (!sourceExists) {
        await client.query('ROLLBACK');
        return { data: { merged: false, mergedUserId: null, reasonCode: 'SOURCE_NOT_FOUND', unavailable: false }, error: null };
      }

      const targetExists = await this.existsById(client, 'app_users', targetUserId);
      if (!targetExists) {
        await client.query('ROLLBACK');
        return { data: { merged: false, mergedUserId: null, reasonCode: 'TARGET_NOT_FOUND', unavailable: false }, error: null };
      }

      if (await this.userHasPlatform(client, input.sourceUserId, 'roblox')) {
        await client.query('ROLLBACK');
        return { data: { merged: false, mergedUserId: null, reasonCode: 'SOURCE_ALREADY_HAS_ROBLOX', unavailable: false }, error: null };
      }

      if (!(await this.userHasPlatform(client, targetUserId, 'roblox'))) {
        await client.query('ROLLBACK');
        return { data: { merged: false, mergedUserId: null, reasonCode: 'TARGET_MISSING_ROBLOX', unavailable: false }, error: null };
      }

      const sourceProviderLinksCount = await this.countQuery(client,
        `SELECT COUNT(*)::bigint AS count
         FROM user_platforms
         WHERE user_id = $1 AND platform_id IN ('apple','google')`,
        [input.sourceUserId]
      );
      if (sourceProviderLinksCount === 0n) {
        await client.query('ROLLBACK');
        return { data: { merged: false, mergedUserId: null, reasonCode: 'SOURCE_HAS_NO_PROVIDER_LINKS', unavailable: false }, error: null };
      }

      const sourceNonProviderLinksCount = await this.countQuery(client,
        `SELECT COUNT(*)::bigint AS count
         FROM user_platforms
         WHERE user_id = $1 AND platform_id NOT IN ('apple','google')`,
        [input.sourceUserId]
      );
      if (sourceNonProviderLinksCount > 0n) {
        await client.query('ROLLBACK');
        return { data: { merged: false, mergedUserId: null, reasonCode: 'SOURCE_HAS_NON_PROVIDER_LINKS', unavailable: false }, error: null };
      }

      const targetProviderOverlapCount = await this.countQuery(client,
        `SELECT COUNT(*)::bigint AS count
         FROM user_platforms source_links
         JOIN user_platforms target_links
           ON target_links.user_id = $2
          AND target_links.platform_id = source_links.platform_id
         WHERE source_links.user_id = $1
           AND source_links.platform_id IN ('apple','google')`,
        [input.sourceUserId, targetUserId]
      );
      if (targetProviderOverlapCount > 0n) {
        await client.query('ROLLBACK');
        return { data: { merged: false, mergedUserId: null, reasonCode: 'TARGET_ALREADY_HAS_PROVIDER_LINK', unavailable: false }, error: null };
      }

      const hasActivity = await this.sourceHasActivity(client, input.sourceUserId);
      if (hasActivity) {
        await client.query('ROLLBACK');
        return { data: { merged: false, mergedUserId: null, reasonCode: 'SOURCE_HAS_ACTIVITY', unavailable: false }, error: null };
      }

      await client.query(
        `INSERT INTO user_push_tokens (
          user_id, expo_push_token, device_id, platform, created_at, last_seen_at
        )
        SELECT $1, expo_push_token, device_id, platform, created_at, last_seen_at
        FROM user_push_tokens
        WHERE user_id = $2
        ON CONFLICT (user_id, expo_push_token)
        DO UPDATE SET
          device_id = COALESCE(EXCLUDED.device_id, user_push_tokens.device_id),
          platform = COALESCE(EXCLUDED.platform, user_push_tokens.platform),
          last_seen_at = GREATEST(EXCLUDED.last_seen_at, user_push_tokens.last_seen_at)`,
        [targetUserId, input.sourceUserId]
      );
      await client.query('DELETE FROM user_push_tokens WHERE user_id = $1', [input.sourceUserId]);

      await client.query(
        `INSERT INTO user_notification_prefs (
          user_id, sessions_reminders_enabled, friend_requests_enabled, created_at, updated_at
        )
        SELECT $1, sessions_reminders_enabled, friend_requests_enabled, created_at, updated_at
        FROM user_notification_prefs
        WHERE user_id = $2
        ON CONFLICT (user_id) DO NOTHING`,
        [targetUserId, input.sourceUserId]
      );
      await client.query('DELETE FROM user_notification_prefs WHERE user_id = $1', [input.sourceUserId]);

      await client.query(
        `UPDATE user_platforms
         SET user_id = $1,
             updated_at = NOW()
         WHERE user_id = $2
           AND platform_id IN ('apple', 'google')`,
        [targetUserId, input.sourceUserId]
      );

      const sourceProviderFields = await client.query<{
        apple_sub: string | null;
        apple_email: string | null;
        apple_email_is_private: boolean | null;
        apple_full_name: string | null;
        google_sub: string | null;
        google_email: string | null;
        google_email_verified: boolean | null;
        google_full_name: string | null;
      }>(
        `SELECT
          apple_sub,
          apple_email,
          apple_email_is_private,
          apple_full_name,
          google_sub,
          google_email,
          google_email_verified,
          google_full_name
         FROM app_users
         WHERE id = $1
         FOR UPDATE`,
        [input.sourceUserId]
      );
      const sourceRow = sourceProviderFields.rows[0];

      await client.query(
        `UPDATE app_users
         SET apple_sub = NULL,
             apple_email = NULL,
             apple_email_is_private = NULL,
             apple_full_name = NULL,
             google_sub = NULL,
             google_email = NULL,
             google_email_verified = NULL,
             google_full_name = NULL,
             updated_at = NOW()
         WHERE id = $1`,
        [input.sourceUserId]
      );

      await client.query(
        `UPDATE app_users AS target
         SET
           apple_sub = COALESCE(target.apple_sub, $2),
           apple_email = COALESCE(target.apple_email, $3),
           apple_email_is_private = COALESCE(target.apple_email_is_private, $4),
           apple_full_name = COALESCE(target.apple_full_name, $5),
           google_sub = COALESCE(target.google_sub, $6),
           google_email = COALESCE(target.google_email, $7),
           google_email_verified = COALESCE(target.google_email_verified, $8),
           google_full_name = COALESCE(target.google_full_name, $9),
           updated_at = NOW()
         WHERE target.id = $1`,
        [
          targetUserId,
          sourceRow?.apple_sub ?? null,
          sourceRow?.apple_email ?? null,
          sourceRow?.apple_email_is_private ?? null,
          sourceRow?.apple_full_name ?? null,
          sourceRow?.google_sub ?? null,
          sourceRow?.google_email ?? null,
          sourceRow?.google_email_verified ?? null,
          sourceRow?.google_full_name ?? null,
        ]
      );

      await client.query('DELETE FROM app_users WHERE id = $1', [input.sourceUserId]);

      await client.query('COMMIT');
      return {
        data: {
          merged: true,
          mergedUserId: targetUserId,
          reasonCode: 'MERGED',
          unavailable: false,
        },
        error: null,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      return { data: null, error: mapPgError(error) };
    } finally {
      client.release();
    }
  }

  async findRobloxPlatformLink(userId: string): Promise<DbResult<RobloxPlatformLink | null>> {
    try {
      const result = await this.pool.query<RobloxPlatformLink>(
        `SELECT platform_user_id, platform_username, platform_display_name
         FROM user_platforms
         WHERE user_id = $1 AND platform_id = 'roblox'
         LIMIT 1`,
        [userId]
      );
      return { data: result.rows[0] ?? null, error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }

  async findRobloxConnection(userId: string): Promise<DbResult<RobloxPlatformConnection | null>> {
    try {
      const result = await this.pool.query<RobloxPlatformConnection>(
        `SELECT platform_user_id, platform_username, platform_display_name, platform_avatar_url, verified_at
         FROM user_platforms
         WHERE user_id = $1 AND platform_id = 'roblox'
         LIMIT 1`,
        [userId]
      );
      return { data: result.rows[0] ?? null, error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }

  async updateUserRobloxFields(userId: string, data: {
    robloxUserId: string;
    robloxUsername: string | null;
    robloxDisplayName: string | null;
  }): Promise<DbResult<void>> {
    try {
      await this.pool.query(
        `UPDATE app_users
         SET roblox_user_id = $1,
             roblox_username = $2,
             roblox_display_name = $3,
             updated_at = NOW()
         WHERE id = $4`,
        [data.robloxUserId, data.robloxUsername, data.robloxDisplayName, userId]
      );
      return { data: undefined, error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }

  async updateUserRobloxProfileUrl(userId: string, profileUrl: string): Promise<DbResult<void>> {
    try {
      await this.pool.query(
        `UPDATE app_users
         SET roblox_profile_url = $1,
             updated_at = NOW()
         WHERE id = $2`,
        [profileUrl, userId]
      );
      return { data: undefined, error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }

  async updatePlatformMetadata(userId: string, platformId: SupportedPlatformId, metadata: Record<string, unknown>): Promise<DbResult<void>> {
    try {
      await this.pool.query(
        `UPDATE user_platforms
         SET metadata = $1,
             updated_at = NOW()
         WHERE user_id = $2
           AND platform_id = $3`,
        [metadata, userId, platformId]
      );
      return { data: undefined, error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }

  private async existsById(client: PoolClient, table: string, id: string): Promise<boolean> {
    const result = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM ${table} WHERE id = $1) AS exists`,
      [id]
    );
    return result.rows[0]?.exists === true;
  }

  private async userHasPlatform(client: PoolClient, userId: string, platformId: SupportedPlatformId): Promise<boolean> {
    const result = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (
        SELECT 1 FROM user_platforms WHERE user_id = $1 AND platform_id = $2
      ) AS exists`,
      [userId, platformId]
    );
    return result.rows[0]?.exists === true;
  }

  private async countQuery(client: PoolClient, query: string, values: unknown[]): Promise<bigint> {
    const result = await client.query<{ count: string }>(query, values);
    return BigInt(result.rows[0]?.count ?? '0');
  }

  private async countQueryIfTableExists(
    client: PoolClient,
    tableName: string,
    query: string,
    values: unknown[]
  ): Promise<bigint> {
    const exists = await client.query<{ exists: boolean }>('SELECT to_regclass($1) IS NOT NULL AS exists', [tableName]);
    if (!exists.rows[0]?.exists) {
      return 0n;
    }
    return this.countQuery(client, query, values);
  }

  private async sourceHasActivity(client: PoolClient, sourceUserId: string): Promise<boolean> {
    const checks: Array<Promise<bigint>> = [
      this.countQuery(client, 'SELECT COUNT(*)::bigint AS count FROM sessions WHERE host_id = $1', [sourceUserId]),
      this.countQuery(client, 'SELECT COUNT(*)::bigint AS count FROM session_participants WHERE user_id = $1', [sourceUserId]),
      this.countQuery(client, 'SELECT COUNT(*)::bigint AS count FROM session_invites WHERE created_by = $1', [sourceUserId]),
      this.countQuery(client, 'SELECT COUNT(*)::bigint AS count FROM friendships WHERE user_id = $1 OR friend_id = $1 OR initiated_by = $1', [sourceUserId]),
      this.countQuery(client, 'SELECT COUNT(*)::bigint AS count FROM match_results WHERE winner_id = $1', [sourceUserId]),
      this.countQuery(client, 'SELECT COUNT(*)::bigint AS count FROM reports WHERE reporter_id = $1 OR target_user_id = $1', [sourceUserId]),
      this.countQuery(client, 'SELECT COUNT(*)::bigint AS count FROM user_stats WHERE user_id = $1', [sourceUserId]),
      this.countQuery(client, 'SELECT COUNT(*)::bigint AS count FROM user_rankings WHERE user_id = $1', [sourceUserId]),
      this.countQuery(client, 'SELECT COUNT(*)::bigint AS count FROM user_achievements WHERE user_id = $1', [sourceUserId]),
      this.countQuery(client, 'SELECT COUNT(*)::bigint AS count FROM season_rankings WHERE user_id = $1', [sourceUserId]),
      this.countQuery(client, 'SELECT COUNT(*)::bigint AS count FROM account_deletion_requests WHERE user_id = $1', [sourceUserId]),
      this.countQuery(client, 'SELECT COUNT(*)::bigint AS count FROM roblox_friends_cache WHERE user_id = $1', [sourceUserId]),
      this.countQueryIfTableExists(
        client,
        'public.roblox_friends_cache_legacy',
        'SELECT COUNT(*)::bigint AS count FROM roblox_friends_cache_legacy WHERE user_id = $1',
        [sourceUserId]
      ),
      this.countQuery(client, 'SELECT COUNT(*)::bigint AS count FROM in_app_notifications WHERE user_id = $1', [sourceUserId]),
    ];

    const counts = await Promise.all(checks);
    return counts.some((count) => count > 0n);
  }
}
