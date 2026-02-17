import { getSupabase } from '../config/supabase.js';
import { logger } from '../lib/logger.js';
import { sanitize } from '../lib/sanitizer.js';
import { AppError, ErrorCodes, NotFoundError, RateLimitError } from '../utils/errors.js';

export type DeletionRequestStatus = 'PENDING' | 'COMPLETED' | 'CANCELED' | 'FAILED';
export type DeletionInitiator = 'IN_APP' | 'WEB';
export type AccountStatus = 'ACTIVE' | 'PENDING_DELETION' | 'DELETED';

interface AccountDeletionRequestRow {
  id: string;
  user_id: string;
  requested_at: string;
  scheduled_purge_at: string;
  status: DeletionRequestStatus;
  initiator: DeletionInitiator;
  reason: string | null;
}

export interface DeletionStatusResponse {
  requestId: string | null;
  status: AccountStatus | DeletionRequestStatus;
  requestedAt: string | null;
  scheduledPurgeAt: string | null;
  completedAt: string | null;
  retentionSummary: string;
}

interface CreateDeletionRequestInput {
  userId: string;
  initiator: DeletionInitiator;
  reason?: string;
}

interface ServiceOptions {
  gracePeriodDays?: number;
  maxRequestsPerHour?: number;
}

export class AccountDeletionService {
  private readonly gracePeriodDays: number;
  private readonly maxRequestsPerHour: number;

  constructor(options: ServiceOptions = {}) {
    this.gracePeriodDays = options.gracePeriodDays ?? 7;
    this.maxRequestsPerHour = options.maxRequestsPerHour ?? 3;
  }

  private retentionSummary(): string {
    return 'Certain security logs and legally required records may be retained where required by law.';
  }

  private buildScheduledPurgeAt(requestedAt: Date): string {
    const scheduled = new Date(requestedAt);
    scheduled.setUTCDate(scheduled.getUTCDate() + this.gracePeriodDays);
    return scheduled.toISOString();
  }

  async createDeletionRequest(input: CreateDeletionRequestInput): Promise<DeletionStatusResponse> {
    const supabase = getSupabase();

    const existingPending = await this.getPendingRequest(input.userId);
    if (existingPending) {
      return {
        requestId: existingPending.id,
        status: existingPending.status,
        requestedAt: existingPending.requested_at,
        scheduledPurgeAt: existingPending.scheduled_purge_at,
        completedAt: null,
        retentionSummary: this.retentionSummary(),
      };
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error: countError } = await supabase
      .from('account_deletion_requests')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', input.userId)
      .gte('requested_at', oneHourAgo);

    if (countError) {
      throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to check rate limit: ${countError.message}`);
    }

    if ((count ?? 0) >= this.maxRequestsPerHour) {
      throw new RateLimitError('Too many deletion requests. Please try again later.');
    }

    const requestedAt = new Date();
    const scheduledPurgeAt = this.buildScheduledPurgeAt(requestedAt);

    const { data: row, error: insertError } = await supabase
      .from('account_deletion_requests')
      .insert({
        user_id: input.userId,
        requested_at: requestedAt.toISOString(),
        scheduled_purge_at: scheduledPurgeAt,
        status: 'PENDING',
        initiator: input.initiator,
        reason: input.reason ?? null,
      })
      .select('id, user_id, requested_at, scheduled_purge_at, status, initiator, reason')
      .single<AccountDeletionRequestRow>();

    if (insertError) {
      throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to create deletion request: ${insertError.message}`);
    }

    const { error: userUpdateError } = await supabase
      .from('app_users')
      .update({
        status: 'PENDING_DELETION',
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.userId);

    if (userUpdateError) {
      throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to update user status: ${userUpdateError.message}`);
    }

    const { data: userRow, error: userFetchError } = await supabase
      .from('app_users')
      .select('token_version')
      .eq('id', input.userId)
      .single<{ token_version: number }>();

    if (userFetchError) {
      throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to load user token version: ${userFetchError.message}`);
    }

    const { error: tokenVersionError } = await supabase
      .from('app_users')
      .update({ token_version: Number(userRow.token_version ?? 0) + 1 })
      .eq('id', input.userId);

    if (tokenVersionError) {
      throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to revoke tokens: ${tokenVersionError.message}`);
    }

    const { error: platformTokenRevokeError } = await supabase
      .from('user_platforms')
      .update({
        roblox_access_token_enc: null,
        roblox_refresh_token_enc: null,
        roblox_token_expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', input.userId)
      .eq('platform_id', 'roblox');

    if (platformTokenRevokeError) {
      logger.warn(
        sanitize({ userId: input.userId, error: platformTokenRevokeError.message }),
        'Failed to revoke Roblox platform tokens during deletion request'
      );
    }

    const { error: pushTokenDeleteError } = await supabase
      .from('user_push_tokens')
      .delete()
      .eq('user_id', input.userId);

    if (pushTokenDeleteError) {
      logger.warn(
        sanitize({ userId: input.userId, error: pushTokenDeleteError.message }),
        'Failed to delete push tokens during deletion request'
      );
    }

    return {
      requestId: row.id,
      status: row.status,
      requestedAt: row.requested_at,
      scheduledPurgeAt: row.scheduled_purge_at,
      completedAt: null,
      retentionSummary: this.retentionSummary(),
    };
  }

  async getDeletionStatus(userId: string): Promise<DeletionStatusResponse> {
    const supabase = getSupabase();

    const pendingOrLatest = await supabase
      .from('account_deletion_requests')
      .select('id, requested_at, scheduled_purge_at, status, completed_at')
      .eq('user_id', userId)
      .order('requested_at', { ascending: false })
      .limit(1)
      .maybeSingle<{
        id: string;
        requested_at: string;
        scheduled_purge_at: string;
        status: DeletionRequestStatus;
        completed_at: string | null;
      }>();

    if (pendingOrLatest.error) {
      throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to fetch deletion status: ${pendingOrLatest.error.message}`);
    }

    if (!pendingOrLatest.data) {
      return {
        requestId: null,
        status: 'ACTIVE',
        requestedAt: null,
        scheduledPurgeAt: null,
        completedAt: null,
        retentionSummary: this.retentionSummary(),
      };
    }

    return {
      requestId: pendingOrLatest.data.id,
      status: pendingOrLatest.data.status,
      requestedAt: pendingOrLatest.data.requested_at,
      scheduledPurgeAt: pendingOrLatest.data.scheduled_purge_at,
      completedAt: pendingOrLatest.data.completed_at,
      retentionSummary: this.retentionSummary(),
    };
  }

  async cancelDeletionRequest(userId: string): Promise<DeletionStatusResponse> {
    const supabase = getSupabase();
    const pending = await this.getPendingRequest(userId);

    if (!pending) {
      throw new NotFoundError('Deletion request');
    }

    if (new Date(pending.scheduled_purge_at).getTime() <= Date.now()) {
      throw new AppError(ErrorCodes.CONFLICT, 'Deletion request can no longer be canceled', 409);
    }

    const nowIso = new Date().toISOString();

    const { error: requestUpdateError } = await supabase
      .from('account_deletion_requests')
      .update({
        status: 'CANCELED',
        canceled_at: nowIso,
      })
      .eq('id', pending.id);

    if (requestUpdateError) {
      throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to cancel deletion request: ${requestUpdateError.message}`);
    }

    const { data: userRow, error: userFetchError } = await supabase
      .from('app_users')
      .select('token_version')
      .eq('id', userId)
      .single<{ token_version: number }>();

    if (userFetchError) {
      throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to fetch user token version: ${userFetchError.message}`);
    }

    const { error: userUpdateError } = await supabase
      .from('app_users')
      .update({
        status: 'ACTIVE',
        token_version: Number(userRow.token_version ?? 0) + 1,
        updated_at: nowIso,
      })
      .eq('id', userId);

    if (userUpdateError) {
      throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to restore account: ${userUpdateError.message}`);
    }

    return {
      requestId: pending.id,
      status: 'CANCELED',
      requestedAt: pending.requested_at,
      scheduledPurgeAt: pending.scheduled_purge_at,
      completedAt: null,
      retentionSummary: this.retentionSummary(),
    };
  }

  async processDueDeletionRequests(limit = 25): Promise<{ processed: number; failed: number }> {
    const supabase = getSupabase();
    const nowIso = new Date().toISOString();

    const { data, error } = await supabase
      .from('account_deletion_requests')
      .select('id, user_id, requested_at, scheduled_purge_at, status, initiator, reason')
      .eq('status', 'PENDING')
      .lte('scheduled_purge_at', nowIso)
      .order('scheduled_purge_at', { ascending: true })
      .limit(limit)
      .returns<AccountDeletionRequestRow[]>();

    if (error) {
      throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to fetch pending deletion requests: ${error.message}`);
    }

    let processed = 0;
    let failed = 0;

    for (const row of data ?? []) {
      try {
        await this.executePurge(row);
        processed += 1;
      } catch (purgeError) {
        failed += 1;
        const message = purgeError instanceof Error ? purgeError.message : String(purgeError);

        await supabase
          .from('account_deletion_requests')
          .update({
            status: 'FAILED',
            failed_at: new Date().toISOString(),
            failure_reason: message.slice(0, 1000),
          })
          .eq('id', row.id);

        logger.error(
          sanitize({ requestId: row.id, userId: row.user_id, error: message }),
          'Failed to execute account deletion purge'
        );
      }
    }

    return { processed, failed };
  }

  private async getPendingRequest(userId: string): Promise<AccountDeletionRequestRow | null> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('account_deletion_requests')
      .select('id, user_id, requested_at, scheduled_purge_at, status, initiator, reason')
      .eq('user_id', userId)
      .eq('status', 'PENDING')
      .maybeSingle<AccountDeletionRequestRow>();

    if (error) {
      throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to fetch pending request: ${error.message}`);
    }

    return data ?? null;
  }

  private async executePurge(row: AccountDeletionRequestRow): Promise<void> {
    const supabase = getSupabase();
    const nowIso = new Date().toISOString();
    const userId = row.user_id;

    logger.info(sanitize({ requestId: row.id, userId }), 'Starting account purge');

    // 1) Sessions created by user
    const { error: deleteHostedSessionsError } = await supabase
      .from('sessions')
      .delete()
      .eq('host_id', userId);

    if (deleteHostedSessionsError) {
      throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to delete hosted sessions: ${deleteHostedSessionsError.message}`);
    }

    // 2) Participations in sessions created by others
    const { error: deleteParticipantsError } = await supabase
      .from('session_participants')
      .delete()
      .eq('user_id', userId);

    if (deleteParticipantsError) {
      throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to delete session participants: ${deleteParticipantsError.message}`);
    }

    // 3) Remaining invite rows created by user for non-hosted sessions
    const { error: deleteInvitesError } = await supabase
      .from('session_invites')
      .delete()
      .eq('created_by', userId);

    if (deleteInvitesError) {
      throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to delete session invites: ${deleteInvitesError.message}`);
    }

    // 4) Social graph cleanup
    const { error: deleteFriendshipsByUserError } = await supabase
      .from('friendships')
      .delete()
      .eq('user_id', userId);

    if (deleteFriendshipsByUserError) {
      throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to delete friendships by user: ${deleteFriendshipsByUserError.message}`);
    }

    const { error: deleteFriendshipsByFriendError } = await supabase
      .from('friendships')
      .delete()
      .eq('friend_id', userId);

    if (deleteFriendshipsByFriendError) {
      throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to delete friendships for friend side: ${deleteFriendshipsByFriendError.message}`);
    }

    // 5) Roblox and app caches/tokens
    const { error: deleteRobloxFriendsCacheError } = await supabase
      .from('roblox_friends_cache')
      .delete()
      .eq('user_id', userId);

    if (deleteRobloxFriendsCacheError) {
      throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to delete roblox friends cache: ${deleteRobloxFriendsCacheError.message}`);
    }

    const { error: deletePushTokensError } = await supabase
      .from('user_push_tokens')
      .delete()
      .eq('user_id', userId);

    if (deletePushTokensError) {
      throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to delete push tokens: ${deletePushTokensError.message}`);
    }

    const { error: deleteFavoritesCacheError } = await supabase
      .from('user_favorites_cache')
      .delete()
      .eq('user_id', userId);

    if (deleteFavoritesCacheError) {
      throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to delete favorites cache: ${deleteFavoritesCacheError.message}`);
    }

    const { error: deleteMatchResultsError } = await supabase
      .from('match_results')
      .delete()
      .eq('winner_id', userId);

    if (deleteMatchResultsError) {
      throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to delete match results: ${deleteMatchResultsError.message}`);
    }

    const { error: deleteUserPlatformsError } = await supabase
      .from('user_platforms')
      .delete()
      .eq('user_id', userId);

    if (deleteUserPlatformsError) {
      throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to delete user platforms: ${deleteUserPlatformsError.message}`);
    }

    // 6) Mark user as deleted first, then remove row to satisfy hard-delete policy
    const { error: markDeletedError } = await supabase
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

    if (markDeletedError) {
      throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to mark user deleted: ${markDeletedError.message}`);
    }

    const { error: deleteUserError } = await supabase
      .from('app_users')
      .delete()
      .eq('id', userId);

    if (deleteUserError) {
      throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to delete user row: ${deleteUserError.message}`);
    }

    const { error: requestUpdateError } = await supabase
      .from('account_deletion_requests')
      .update({
        status: 'COMPLETED',
        completed_at: nowIso,
      })
      .eq('id', row.id);

    if (requestUpdateError) {
      throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to update deletion request status: ${requestUpdateError.message}`);
    }

    logger.info(sanitize({ requestId: row.id, userId }), 'Account purge completed');
  }
}
