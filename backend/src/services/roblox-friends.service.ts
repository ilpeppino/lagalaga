import { request } from 'undici';
import { getSupabase } from '../config/supabase.js';
import { withRetry, CircuitBreaker } from '../lib/errorRecovery.js';
import { logger } from '../lib/logger.js';
import { metrics } from '../plugins/metrics.js';
import { AppError, ErrorCodes } from '../utils/errors.js';

interface RobloxFriendEdge {
  id: number;
}

interface RobloxUserRecord {
  id: number;
  name: string;
  displayName: string;
}

export interface SyncResult {
  syncedCount: number;
  onAppCount: number;
  syncedAt: string | null;
}

const FRIENDS_SYNC_COOLDOWN_MS = 5 * 60 * 1000;
const friendsCircuitBreaker = new CircuitBreaker({
  name: 'RobloxFriendsAPI',
  failureThreshold: 5,
  resetTimeoutMs: 60_000,
});

export class RobloxFriendsService {
  private static refreshCooldownByUser = new Map<string, number>();

  async syncForUser(userId: string): Promise<SyncResult> {
    const startedAt = Date.now();
    const supabase = getSupabase();

    const { data: user, error: userError } = await supabase
      .from('app_users')
      .select('roblox_user_id')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      throw new AppError(
        ErrorCodes.NOT_FOUND_USER,
        `User not found for friends sync: ${userId}`,
        404
      );
    }

    const robloxUserId = user.roblox_user_id;
    if (!robloxUserId) {
      return { syncedCount: 0, onAppCount: 0, syncedAt: null };
    }

    let friendIds: string[];
    let usersById: Map<string, RobloxUserRecord>;
    try {
      friendIds = await this.fetchFriendIds(robloxUserId);
      usersById = await this.fetchRobloxUsers(friendIds);
    } catch (error) {
      metrics.incrementCounter('friends_roblox_sync_total', { status: 'failure' });
      throw new AppError(
        ErrorCodes.FRIEND_SYNC_FAILED,
        `Failed to sync Roblox friends: ${error instanceof Error ? error.message : String(error)}`,
        502
      );
    }

    const syncedAt = new Date().toISOString();
    const rows = friendIds.map((friendId) => {
      const userRecord = usersById.get(friendId);
      return {
        user_id: userId,
        roblox_friend_user_id: friendId,
        roblox_friend_username: userRecord?.name ?? null,
        roblox_friend_display_name: userRecord?.displayName ?? null,
        synced_at: syncedAt,
      };
    });

    const { error: deleteError } = await supabase
      .from('roblox_friends_cache')
      .delete()
      .eq('user_id', userId);
    if (deleteError) {
      throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to clear friends cache: ${deleteError.message}`);
    }

    if (rows.length > 0) {
      const { error: insertError } = await supabase
        .from('roblox_friends_cache')
        .insert(rows);
      if (insertError) {
        throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to write friends cache: ${insertError.message}`);
      }
    }

    let onAppCount = 0;
    if (friendIds.length > 0) {
      const { data: onAppUsers } = await supabase
        .from('app_users')
        .select('id')
        .in('roblox_user_id', friendIds);
      onAppCount = onAppUsers?.length ?? 0;
    }

    metrics.incrementCounter('friends_roblox_sync_total', { status: 'success' });
    metrics.observeHistogram('friends_roblox_sync_duration_ms', Date.now() - startedAt);
    metrics.observeHistogram('friends_roblox_sync_count', friendIds.length);

    logger.info(
      {
        action: 'roblox_sync',
        userId,
        syncedCount: friendIds.length,
        onAppCount,
      },
      'Roblox friends synced'
    );

    return {
      syncedCount: friendIds.length,
      onAppCount,
      syncedAt,
    };
  }

  enforceRefreshRateLimit(userId: string): void {
    const now = Date.now();
    const existing = RobloxFriendsService.refreshCooldownByUser.get(userId);
    if (existing && now - existing < FRIENDS_SYNC_COOLDOWN_MS) {
      throw new AppError(
        ErrorCodes.FRIEND_RATE_LIMITED,
        'Friends refresh is limited to once every 5 minutes',
        429
      );
    }
    RobloxFriendsService.refreshCooldownByUser.set(userId, now);
  }

  private async fetchFriendIds(robloxUserId: string): Promise<string[]> {
    return friendsCircuitBreaker.execute(async () =>
      withRetry(
        async () => {
          const response = await request(
            `https://friends.roblox.com/v1/users/${encodeURIComponent(robloxUserId)}/friends`,
            {
              method: 'GET',
              headers: {
                accept: 'application/json',
                'user-agent': 'lagalaga-backend/1.0',
              },
            }
          );

          if (response.statusCode >= 400) {
            throw new Error(`Roblox friends API returned ${response.statusCode}`);
          }

          const payload = (await response.body.json()) as { data?: RobloxFriendEdge[] };
          return (payload.data ?? []).map((entry) => String(entry.id));
        },
        {
          maxAttempts: 3,
          baseDelayMs: 500,
          isRetryable: (err) => !String(err.message).includes(' 4'),
        }
      )
    );
  }

  private async fetchRobloxUsers(friendIds: string[]): Promise<Map<string, RobloxUserRecord>> {
    const result = new Map<string, RobloxUserRecord>();
    if (friendIds.length === 0) {
      return result;
    }

    for (let i = 0; i < friendIds.length; i += 100) {
      const batch = friendIds.slice(i, i + 100).map((id) => Number(id)).filter((id) => Number.isInteger(id));
      if (batch.length === 0) continue;

      const users = await friendsCircuitBreaker.execute(async () =>
        withRetry(
          async () => {
            const response = await request('https://users.roblox.com/v1/users', {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                accept: 'application/json',
                'user-agent': 'lagalaga-backend/1.0',
              },
              body: JSON.stringify({
                userIds: batch,
                excludeBannedUsers: false,
              }),
            });

            if (response.statusCode >= 400) {
              throw new Error(`Roblox users API returned ${response.statusCode}`);
            }

            const payload = (await response.body.json()) as { data?: RobloxUserRecord[] };
            return payload.data ?? [];
          },
          {
            maxAttempts: 3,
            baseDelayMs: 500,
            isRetryable: (err) => !String(err.message).includes(' 4'),
          }
        )
      );

      for (const user of users) {
        result.set(String(user.id), user);
      }
    }

    return result;
  }
}
