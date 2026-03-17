import type { SupabaseClient } from '@supabase/supabase-js';
import type { Pool } from 'pg';
import { getSupabase } from '../../config/supabase.js';
import { mapPgError } from '../errors.js';
import type { DbError, DbResult } from '../types.js';

export type DeletionRequestStatus = 'PENDING' | 'COMPLETED' | 'CANCELED' | 'FAILED';
export type DeletionInitiator = 'IN_APP' | 'WEB';

export interface AccountDeletionRequestRow {
  id: string;
  user_id: string;
  requested_at: string;
  scheduled_purge_at: string;
  status: DeletionRequestStatus;
  initiator: DeletionInitiator;
  reason: string | null;
}

export interface LatestDeletionRequestRow {
  id: string;
  requested_at: string;
  scheduled_purge_at: string;
  status: DeletionRequestStatus;
  completed_at: string | null;
}

export interface AccountDeletionRepository {
  findPendingRequest(userId: string): Promise<DbResult<AccountDeletionRequestRow | null>>;
  countRecentRequests(userId: string, oneHourAgoIso: string): Promise<DbResult<number>>;
  createDeletionRequest(input: {
    userId: string;
    requestedAtIso: string;
    scheduledPurgeAtIso: string;
    initiator: DeletionInitiator;
    reason: string | null;
  }): Promise<DbResult<AccountDeletionRequestRow>>;
  updateUserPendingDeletion(userId: string, nowIso: string): Promise<DbResult<void>>;
  getUserTokenVersion(userId: string): Promise<DbResult<number>>;
  incrementUserTokenVersion(userId: string, currentTokenVersion: number): Promise<DbResult<void>>;
  clearRobloxPlatformTokens(userId: string, nowIso: string): Promise<DbResult<void>>;
  deletePushTokens(userId: string): Promise<DbResult<void>>;
  getLatestRequest(userId: string): Promise<DbResult<LatestDeletionRequestRow | null>>;
  cancelRequest(requestId: string, nowIso: string): Promise<DbResult<void>>;
  restoreUserActive(userId: string, tokenVersion: number, nowIso: string): Promise<DbResult<void>>;
  listDuePendingRequests(nowIso: string, limit: number): Promise<DbResult<AccountDeletionRequestRow[]>>;
  markRequestFailed(requestId: string, failedAtIso: string, failureReason: string): Promise<DbResult<void>>;
  purgeAccount(requestId: string, userId: string, nowIso: string): Promise<DbResult<void>>;
}

function toSupabaseError(error: { code?: string; message: string; details?: string }): DbError {
  return {
    code: error.code ?? 'SUPABASE_QUERY_ERROR',
    message: error.message,
    ...(error.details ? { details: error.details } : {}),
  };
}

export class SupabaseAccountDeletionRepository implements AccountDeletionRepository {
  constructor(private readonly supabase: SupabaseClient = getSupabase()) {}

  async findPendingRequest(userId: string): Promise<DbResult<AccountDeletionRequestRow | null>> {
    const { data, error } = await this.supabase
      .from('account_deletion_requests')
      .select('id, user_id, requested_at, scheduled_purge_at, status, initiator, reason')
      .eq('user_id', userId)
      .eq('status', 'PENDING')
      .maybeSingle<AccountDeletionRequestRow>();

    if (error) return { data: null, error: toSupabaseError(error) };
    return { data: data ?? null, error: null };
  }

  async countRecentRequests(userId: string, oneHourAgoIso: string): Promise<DbResult<number>> {
    const { count, error } = await this.supabase
      .from('account_deletion_requests')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('requested_at', oneHourAgoIso);

    if (error) return { data: null, error: toSupabaseError(error) };
    return { data: count ?? 0, error: null };
  }

  async createDeletionRequest(input: {
    userId: string;
    requestedAtIso: string;
    scheduledPurgeAtIso: string;
    initiator: DeletionInitiator;
    reason: string | null;
  }): Promise<DbResult<AccountDeletionRequestRow>> {
    const { data, error } = await this.supabase
      .from('account_deletion_requests')
      .insert({
        user_id: input.userId,
        requested_at: input.requestedAtIso,
        scheduled_purge_at: input.scheduledPurgeAtIso,
        status: 'PENDING',
        initiator: input.initiator,
        reason: input.reason,
      })
      .select('id, user_id, requested_at, scheduled_purge_at, status, initiator, reason')
      .single<AccountDeletionRequestRow>();

    if (error || !data) {
      return {
        data: null,
        error: toSupabaseError({
          code: error?.code,
          message: error?.message ?? 'Failed to create deletion request',
          details: error?.details,
        }),
      };
    }
    return { data, error: null };
  }

  async updateUserPendingDeletion(userId: string, nowIso: string): Promise<DbResult<void>> {
    const { error } = await this.supabase
      .from('app_users')
      .update({
        status: 'PENDING_DELETION',
        updated_at: nowIso,
      })
      .eq('id', userId);

    if (error) return { data: null, error: toSupabaseError(error) };
    return { data: undefined, error: null };
  }

  async getUserTokenVersion(userId: string): Promise<DbResult<number>> {
    const { data, error } = await this.supabase
      .from('app_users')
      .select('token_version')
      .eq('id', userId)
      .single<{ token_version: number }>();

    if (error || !data) {
      return {
        data: null,
        error: toSupabaseError({
          code: error?.code,
          message: error?.message ?? 'Failed to load user token version',
          details: error?.details,
        }),
      };
    }
    return { data: Number(data.token_version ?? 0), error: null };
  }

  async incrementUserTokenVersion(userId: string, currentTokenVersion: number): Promise<DbResult<void>> {
    const { error } = await this.supabase
      .from('app_users')
      .update({ token_version: currentTokenVersion + 1 })
      .eq('id', userId);

    if (error) return { data: null, error: toSupabaseError(error) };
    return { data: undefined, error: null };
  }

  async clearRobloxPlatformTokens(userId: string, nowIso: string): Promise<DbResult<void>> {
    const { error } = await this.supabase
      .from('user_platforms')
      .update({
        roblox_access_token_enc: null,
        roblox_refresh_token_enc: null,
        roblox_token_expires_at: null,
        updated_at: nowIso,
      })
      .eq('user_id', userId)
      .eq('platform_id', 'roblox');

    if (error) return { data: null, error: toSupabaseError(error) };
    return { data: undefined, error: null };
  }

  async deletePushTokens(userId: string): Promise<DbResult<void>> {
    const { error } = await this.supabase
      .from('user_push_tokens')
      .delete()
      .eq('user_id', userId);

    if (error) return { data: null, error: toSupabaseError(error) };
    return { data: undefined, error: null };
  }

  async getLatestRequest(userId: string): Promise<DbResult<LatestDeletionRequestRow | null>> {
    const { data, error } = await this.supabase
      .from('account_deletion_requests')
      .select('id, requested_at, scheduled_purge_at, status, completed_at')
      .eq('user_id', userId)
      .order('requested_at', { ascending: false })
      .limit(1)
      .maybeSingle<LatestDeletionRequestRow>();

    if (error) return { data: null, error: toSupabaseError(error) };
    return { data: data ?? null, error: null };
  }

  async cancelRequest(requestId: string, nowIso: string): Promise<DbResult<void>> {
    const { error } = await this.supabase
      .from('account_deletion_requests')
      .update({
        status: 'CANCELED',
        canceled_at: nowIso,
      })
      .eq('id', requestId);

    if (error) return { data: null, error: toSupabaseError(error) };
    return { data: undefined, error: null };
  }

  async restoreUserActive(userId: string, tokenVersion: number, nowIso: string): Promise<DbResult<void>> {
    const { error } = await this.supabase
      .from('app_users')
      .update({
        status: 'ACTIVE',
        token_version: tokenVersion,
        updated_at: nowIso,
      })
      .eq('id', userId);

    if (error) return { data: null, error: toSupabaseError(error) };
    return { data: undefined, error: null };
  }

  async listDuePendingRequests(nowIso: string, limit: number): Promise<DbResult<AccountDeletionRequestRow[]>> {
    const { data, error } = await this.supabase
      .from('account_deletion_requests')
      .select('id, user_id, requested_at, scheduled_purge_at, status, initiator, reason')
      .eq('status', 'PENDING')
      .lte('scheduled_purge_at', nowIso)
      .order('scheduled_purge_at', { ascending: true })
      .limit(limit)
      .returns<AccountDeletionRequestRow[]>();

    if (error) return { data: null, error: toSupabaseError(error) };
    return { data: data ?? [], error: null };
  }

  async markRequestFailed(requestId: string, failedAtIso: string, failureReason: string): Promise<DbResult<void>> {
    const { error } = await this.supabase
      .from('account_deletion_requests')
      .update({
        status: 'FAILED',
        failed_at: failedAtIso,
        failure_reason: failureReason,
      })
      .eq('id', requestId);

    if (error) return { data: null, error: toSupabaseError(error) };
    return { data: undefined, error: null };
  }

  async purgeAccount(requestId: string, userId: string, nowIso: string): Promise<DbResult<void>> {
    const { error: deleteHostedSessionsError } = await this.supabase
      .from('sessions')
      .delete()
      .eq('host_id', userId);
    if (deleteHostedSessionsError) return { data: null, error: toSupabaseError(deleteHostedSessionsError) };

    const { error: deleteParticipantsError } = await this.supabase
      .from('session_participants')
      .delete()
      .eq('user_id', userId);
    if (deleteParticipantsError) return { data: null, error: toSupabaseError(deleteParticipantsError) };

    const { error: deleteInvitesError } = await this.supabase
      .from('session_invites')
      .delete()
      .eq('created_by', userId);
    if (deleteInvitesError) return { data: null, error: toSupabaseError(deleteInvitesError) };

    const { error: deleteFriendshipsByUserError } = await this.supabase
      .from('friendships')
      .delete()
      .eq('user_id', userId);
    if (deleteFriendshipsByUserError) return { data: null, error: toSupabaseError(deleteFriendshipsByUserError) };

    const { error: deleteFriendshipsByFriendError } = await this.supabase
      .from('friendships')
      .delete()
      .eq('friend_id', userId);
    if (deleteFriendshipsByFriendError) return { data: null, error: toSupabaseError(deleteFriendshipsByFriendError) };

    const { error: deleteRobloxFriendsCacheError } = await this.supabase
      .from('roblox_friends_cache')
      .delete()
      .eq('user_id', userId);
    if (deleteRobloxFriendsCacheError) return { data: null, error: toSupabaseError(deleteRobloxFriendsCacheError) };

    const { error: deletePushTokensError } = await this.supabase
      .from('user_push_tokens')
      .delete()
      .eq('user_id', userId);
    if (deletePushTokensError) return { data: null, error: toSupabaseError(deletePushTokensError) };

    const { error: deleteFavoritesCacheError } = await this.supabase
      .from('user_favorites_cache')
      .delete()
      .eq('user_id', userId);
    if (deleteFavoritesCacheError) return { data: null, error: toSupabaseError(deleteFavoritesCacheError) };

    const { error: deleteMatchResultsError } = await this.supabase
      .from('match_results')
      .delete()
      .eq('winner_id', userId);
    if (deleteMatchResultsError) return { data: null, error: toSupabaseError(deleteMatchResultsError) };

    const { error: deleteUserPlatformsError } = await this.supabase
      .from('user_platforms')
      .delete()
      .eq('user_id', userId);
    if (deleteUserPlatformsError) return { data: null, error: toSupabaseError(deleteUserPlatformsError) };

    const { error: markDeletedError } = await this.supabase
      .from('app_users')
      .update({
        status: 'DELETED',
        roblox_username: `deleted_${userId.slice(0, 8)}`,
        roblox_display_name: 'Deleted User',
        roblox_profile_url: null,
        avatar_headshot_url: null,
        last_login_at: null,
        updated_at: nowIso,
      })
      .eq('id', userId);

    if (markDeletedError) return { data: null, error: toSupabaseError(markDeletedError) };

    const { error: deleteUserError } = await this.supabase
      .from('app_users')
      .delete()
      .eq('id', userId);

    if (deleteUserError) return { data: null, error: toSupabaseError(deleteUserError) };

    const { error: requestUpdateError } = await this.supabase
      .from('account_deletion_requests')
      .update({
        status: 'COMPLETED',
        completed_at: nowIso,
      })
      .eq('id', requestId);

    if (requestUpdateError) return { data: null, error: toSupabaseError(requestUpdateError) };
    return { data: undefined, error: null };
  }
}

export class PgAccountDeletionRepository implements AccountDeletionRepository {
  constructor(private readonly pool: Pool) {}

  async findPendingRequest(userId: string): Promise<DbResult<AccountDeletionRequestRow | null>> {
    try {
      const result = await this.pool.query<AccountDeletionRequestRow>(
        `SELECT id::text, user_id::text, requested_at::text, scheduled_purge_at::text, status::text, initiator::text, reason
         FROM account_deletion_requests
         WHERE user_id = $1
           AND status = 'PENDING'
         LIMIT 1`,
        [userId]
      );
      return { data: result.rows[0] ?? null, error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }

  async countRecentRequests(userId: string, oneHourAgoIso: string): Promise<DbResult<number>> {
    try {
      const result = await this.pool.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count
         FROM account_deletion_requests
         WHERE user_id = $1
           AND requested_at >= $2`,
        [userId, oneHourAgoIso]
      );
      return { data: result.rows[0]?.count ?? 0, error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }

  async createDeletionRequest(input: {
    userId: string;
    requestedAtIso: string;
    scheduledPurgeAtIso: string;
    initiator: DeletionInitiator;
    reason: string | null;
  }): Promise<DbResult<AccountDeletionRequestRow>> {
    try {
      const result = await this.pool.query<AccountDeletionRequestRow>(
        `INSERT INTO account_deletion_requests (
          user_id, requested_at, scheduled_purge_at, status, initiator, reason
        )
        VALUES ($1, $2, $3, 'PENDING', $4, $5)
        RETURNING id::text, user_id::text, requested_at::text, scheduled_purge_at::text, status::text, initiator::text, reason`,
        [input.userId, input.requestedAtIso, input.scheduledPurgeAtIso, input.initiator, input.reason]
      );
      return { data: result.rows[0], error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }

  async updateUserPendingDeletion(userId: string, nowIso: string): Promise<DbResult<void>> {
    try {
      await this.pool.query(
        `UPDATE app_users
         SET status = 'PENDING_DELETION',
             updated_at = $2
         WHERE id = $1`,
        [userId, nowIso]
      );
      return { data: undefined, error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }

  async getUserTokenVersion(userId: string): Promise<DbResult<number>> {
    try {
      const result = await this.pool.query<{ token_version: number }>(
        `SELECT token_version
         FROM app_users
         WHERE id = $1
         LIMIT 1`,
        [userId]
      );
      return { data: Number(result.rows[0]?.token_version ?? 0), error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }

  async incrementUserTokenVersion(userId: string, currentTokenVersion: number): Promise<DbResult<void>> {
    try {
      await this.pool.query(
        `UPDATE app_users
         SET token_version = $2
         WHERE id = $1`,
        [userId, currentTokenVersion + 1]
      );
      return { data: undefined, error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }

  async clearRobloxPlatformTokens(userId: string, nowIso: string): Promise<DbResult<void>> {
    try {
      await this.pool.query(
        `UPDATE user_platforms
         SET roblox_access_token_enc = NULL,
             roblox_refresh_token_enc = NULL,
             roblox_token_expires_at = NULL,
             updated_at = $2
         WHERE user_id = $1
           AND platform_id = 'roblox'`,
        [userId, nowIso]
      );
      return { data: undefined, error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }

  async deletePushTokens(userId: string): Promise<DbResult<void>> {
    try {
      await this.pool.query('DELETE FROM user_push_tokens WHERE user_id = $1', [userId]);
      return { data: undefined, error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }

  async getLatestRequest(userId: string): Promise<DbResult<LatestDeletionRequestRow | null>> {
    try {
      const result = await this.pool.query<LatestDeletionRequestRow>(
        `SELECT id::text, requested_at::text, scheduled_purge_at::text, status::text, completed_at::text
         FROM account_deletion_requests
         WHERE user_id = $1
         ORDER BY requested_at DESC
         LIMIT 1`,
        [userId]
      );
      return { data: result.rows[0] ?? null, error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }

  async cancelRequest(requestId: string, nowIso: string): Promise<DbResult<void>> {
    try {
      await this.pool.query(
        `UPDATE account_deletion_requests
         SET status = 'CANCELED',
             canceled_at = $2
         WHERE id = $1`,
        [requestId, nowIso]
      );
      return { data: undefined, error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }

  async restoreUserActive(userId: string, tokenVersion: number, nowIso: string): Promise<DbResult<void>> {
    try {
      await this.pool.query(
        `UPDATE app_users
         SET status = 'ACTIVE',
             token_version = $2,
             updated_at = $3
         WHERE id = $1`,
        [userId, tokenVersion, nowIso]
      );
      return { data: undefined, error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }

  async listDuePendingRequests(nowIso: string, limit: number): Promise<DbResult<AccountDeletionRequestRow[]>> {
    try {
      const result = await this.pool.query<AccountDeletionRequestRow>(
        `SELECT id::text, user_id::text, requested_at::text, scheduled_purge_at::text, status::text, initiator::text, reason
         FROM account_deletion_requests
         WHERE status = 'PENDING'
           AND scheduled_purge_at <= $1
         ORDER BY scheduled_purge_at ASC
         LIMIT $2`,
        [nowIso, limit]
      );
      return { data: result.rows, error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }

  async markRequestFailed(requestId: string, failedAtIso: string, failureReason: string): Promise<DbResult<void>> {
    try {
      await this.pool.query(
        `UPDATE account_deletion_requests
         SET status = 'FAILED',
             failed_at = $2,
             failure_reason = $3
         WHERE id = $1`,
        [requestId, failedAtIso, failureReason]
      );
      return { data: undefined, error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }

  async purgeAccount(requestId: string, userId: string, nowIso: string): Promise<DbResult<void>> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      await client.query('DELETE FROM user_push_tokens WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM user_achievements WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM user_stats WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM season_rankings WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM user_rankings WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM reports WHERE reporter_id = $1 OR target_user_id = $1', [userId]);
      await client.query('DELETE FROM sessions WHERE host_id = $1', [userId]);
      await client.query('DELETE FROM session_participants WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM session_invites WHERE created_by = $1 OR invited_user_id = $1', [userId]);
      await client.query('DELETE FROM friendships WHERE user_id = $1 OR friend_id = $1', [userId]);
      await client.query('DELETE FROM roblox_friends_cache WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM user_favorites_cache WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM match_results WHERE winner_id = $1', [userId]);
      await client.query('DELETE FROM user_platforms WHERE user_id = $1', [userId]);

      await client.query(
        `UPDATE app_users
         SET status = 'DELETED',
             roblox_username = $2,
             roblox_display_name = 'Deleted User',
             roblox_profile_url = NULL,
             avatar_headshot_url = NULL,
             last_login_at = NULL,
             updated_at = $3
         WHERE id = $1`,
        [userId, `deleted_${userId.slice(0, 8)}`, nowIso]
      );

      await client.query('DELETE FROM app_users WHERE id = $1', [userId]);

      await client.query(
        `UPDATE account_deletion_requests
         SET status = 'COMPLETED',
             completed_at = $3
         WHERE id = $1
           AND user_id = $2`,
        [requestId, userId, nowIso]
      );

      await client.query('COMMIT');
      return { data: undefined, error: null };
    } catch (error) {
      await client.query('ROLLBACK');
      return { data: null, error: mapPgError(error) };
    } finally {
      client.release();
    }
  }
}
