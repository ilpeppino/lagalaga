import { getSupabase } from '../config/supabase.js';
import { logger } from '../lib/logger.js';
import { metrics } from '../plugins/metrics.js';
import { AppError, ErrorCodes } from '../utils/errors.js';
import { RobloxFriendsService } from './roblox-friends.service.js';

type FriendshipStatus = 'pending' | 'accepted' | 'blocked';

interface FriendshipRow {
  id: string;
  user_id: string;
  friend_id: string;
  status: FriendshipStatus;
  initiated_by: string;
  created_at: string;
  accepted_at: string | null;
}

interface UserProfileRow {
  id: string;
  roblox_user_id: string;
  roblox_username: string | null;
  roblox_display_name: string | null;
  avatar_headshot_url: string | null;
}

export class FriendshipService {
  private robloxFriendsService = new RobloxFriendsService();

  private canonicalPair(a: string, b: string): { userId: string; friendId: string } {
    return a < b ? { userId: a, friendId: b } : { userId: b, friendId: a };
  }

  private async loadProfiles(userIds: string[]): Promise<Map<string, UserProfileRow>> {
    const supabase = getSupabase();
    if (userIds.length === 0) return new Map();

    const { data, error } = await supabase
      .from('app_users')
      .select('id, roblox_user_id, roblox_username, roblox_display_name, avatar_headshot_url')
      .in('id', userIds);

    if (error) {
      throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to load profiles: ${error.message}`);
    }

    return new Map((data ?? []).map((row: UserProfileRow) => [row.id, row]));
  }

  async refreshRobloxCache(userId: string): Promise<{ syncedCount: number; onAppCount: number; syncedAt: string | null }> {
    this.robloxFriendsService.enforceRefreshRateLimit(userId);
    return this.robloxFriendsService.syncForUser(userId);
  }

  async syncRobloxCacheBestEffort(userId: string): Promise<void> {
    try {
      await this.robloxFriendsService.syncForUser(userId);
    } catch (error) {
      logger.warn(
        {
          action: 'roblox_sync',
          userId,
          error: error instanceof Error ? error.message : String(error),
        },
        'Background Roblox friends sync failed'
      );
    }
  }

  async listFriends(userId: string, section: 'all' | 'lagalaga' | 'requests' | 'roblox_suggestions' = 'all'): Promise<any> {
    const supabase = getSupabase();

    const { data: friendships, error: friendshipsError } = await supabase
      .from('friendships')
      .select('id, user_id, friend_id, status, initiated_by, created_at, accepted_at')
      .or(`user_id.eq.${userId},friend_id.eq.${userId}`);

    if (friendshipsError) {
      throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to load friendships: ${friendshipsError.message}`);
    }

    const rows = (friendships ?? []) as FriendshipRow[];
    const relationshipByUserId = new Map<string, FriendshipRow>();
    for (const row of rows) {
      const otherUserId = row.user_id === userId ? row.friend_id : row.user_id;
      relationshipByUserId.set(otherUserId, row);
    }

    const relatedUserIds = rows.map((row) => (row.user_id === userId ? row.friend_id : row.user_id));
    const profilesById = await this.loadProfiles(relatedUserIds);

    const acceptedRows = rows.filter((row) => row.status === 'accepted');
    const lagalaFriends = acceptedRows.map((row) => {
      const otherUserId = row.user_id === userId ? row.friend_id : row.user_id;
      const profile = profilesById.get(otherUserId);
      return {
        userId: otherUserId,
        robloxUsername: profile?.roblox_username ?? null,
        robloxDisplayName: profile?.roblox_display_name ?? null,
        avatarHeadshotUrl: profile?.avatar_headshot_url ?? null,
        friendshipId: row.id,
        acceptedAt: row.accepted_at,
      };
    });

    const incomingRows = rows.filter((row) => row.status === 'pending' && row.initiated_by !== userId);
    const outgoingRows = rows.filter((row) => row.status === 'pending' && row.initiated_by === userId);
    const requests = {
      incoming: incomingRows.map((row) => {
        const fromUserId = row.user_id === userId ? row.friend_id : row.user_id;
        const profile = profilesById.get(fromUserId);
        return {
          friendshipId: row.id,
          fromUser: {
            userId: fromUserId,
            robloxUsername: profile?.roblox_username ?? null,
            robloxDisplayName: profile?.roblox_display_name ?? null,
            avatarHeadshotUrl: profile?.avatar_headshot_url ?? null,
          },
          createdAt: row.created_at,
        };
      }),
      outgoing: outgoingRows.map((row) => {
        const toUserId = row.user_id === userId ? row.friend_id : row.user_id;
        const profile = profilesById.get(toUserId);
        return {
          friendshipId: row.id,
          toUser: {
            userId: toUserId,
            robloxUsername: profile?.roblox_username ?? null,
            robloxDisplayName: profile?.roblox_display_name ?? null,
            avatarHeadshotUrl: profile?.avatar_headshot_url ?? null,
          },
          createdAt: row.created_at,
        };
      }),
    };

    const { data: cacheRows, error: cacheError } = await supabase
      .from('roblox_friends_cache')
      .select('roblox_friend_user_id, roblox_friend_username, roblox_friend_display_name, synced_at')
      .eq('user_id', userId)
      .order('synced_at', { ascending: false });

    if (cacheError) {
      throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to load Roblox cache: ${cacheError.message}`);
    }

    const cache = cacheRows ?? [];
    const syncedAt = cache[0]?.synced_at ?? null;
    const isStale = syncedAt
      ? (Date.now() - new Date(syncedAt).getTime()) > 60 * 60 * 1000
      : true;
    if (syncedAt) {
      const ageSeconds = Math.floor((Date.now() - new Date(syncedAt).getTime()) / 1000);
      metrics.setGauge('friends_cache_age_seconds', ageSeconds, { user: userId });
    }

    const robloxFriendIds = cache.map((row) => row.roblox_friend_user_id);
    let onAppUsers: UserProfileRow[] = [];
    if (robloxFriendIds.length > 0) {
      const { data: users, error: onAppError } = await supabase
        .from('app_users')
        .select('id, roblox_user_id, roblox_username, roblox_display_name, avatar_headshot_url')
        .in('roblox_user_id', robloxFriendIds);

      if (onAppError) {
        throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to cross-reference Roblox friends: ${onAppError.message}`);
      }
      onAppUsers = (users ?? []) as UserProfileRow[];
    }

    const onAppByRobloxId = new Map(onAppUsers.map((u) => [u.roblox_user_id, u]));
    const onApp = cache
      .map((row) => {
        const appUser = onAppByRobloxId.get(row.roblox_friend_user_id);
        if (!appUser || appUser.id === userId) return null;
        const relationship = relationshipByUserId.get(appUser.id);
        return {
          userId: appUser.id,
          robloxUsername: appUser.roblox_username ?? row.roblox_friend_username ?? null,
          robloxDisplayName: appUser.roblox_display_name ?? row.roblox_friend_display_name ?? null,
          avatarHeadshotUrl: appUser.avatar_headshot_url ?? null,
          alreadyFriend: relationship?.status === 'accepted',
          pendingRequest: relationship?.status === 'pending',
        };
      })
      .filter((value) => value && !(value.alreadyFriend || value.pendingRequest))
      .slice(0, 100);

    const notOnApp = cache
      .filter((row) => !onAppByRobloxId.has(row.roblox_friend_user_id))
      .map((row) => ({
        robloxUserId: row.roblox_friend_user_id,
        robloxUsername: row.roblox_friend_username,
        robloxDisplayName: row.roblox_friend_display_name,
      }))
      .slice(0, 100);

    const response = {
      lagalaFriends,
      requests,
      robloxSuggestions: {
        onApp,
        notOnApp,
        syncedAt,
        isStale,
      },
    };

    if (section === 'lagalaga') {
      return { lagalaFriends: response.lagalaFriends };
    }
    if (section === 'requests') {
      return { requests: response.requests };
    }
    if (section === 'roblox_suggestions') {
      return { robloxSuggestions: response.robloxSuggestions };
    }
    return response;
  }

  async sendRequest(userId: string, targetUserId: string): Promise<{ friendshipId: string; status: 'pending' }> {
    const supabase = getSupabase();
    if (userId === targetUserId) {
      throw new AppError(ErrorCodes.FRIEND_SELF_REQUEST, 'Cannot send friend request to yourself', 400);
    }

    const { data: targetUser, error: targetUserError } = await supabase
      .from('app_users')
      .select('id')
      .eq('id', targetUserId)
      .maybeSingle();

    if (targetUserError || !targetUser) {
      throw new AppError(ErrorCodes.NOT_FOUND_USER, `Target user not found: ${targetUserId}`, 404);
    }

    const pair = this.canonicalPair(userId, targetUserId);
    const { data: existing } = await supabase
      .from('friendships')
      .select('id, status')
      .eq('user_id', pair.userId)
      .eq('friend_id', pair.friendId)
      .maybeSingle();

    if (existing?.status === 'accepted') {
      throw new AppError(ErrorCodes.FRIEND_ALREADY_EXISTS, 'Users are already friends', 409);
    }
    if (existing?.status === 'pending') {
      throw new AppError(ErrorCodes.FRIEND_REQUEST_EXISTS, 'Friend request already exists', 409);
    }
    if (existing?.status === 'blocked') {
      throw new AppError(ErrorCodes.FRIEND_BLOCKED, 'Friend request blocked', 403);
    }

    const { data: inserted, error: insertError } = await supabase
      .from('friendships')
      .insert({
        user_id: pair.userId,
        friend_id: pair.friendId,
        status: 'pending',
        initiated_by: userId,
      })
      .select('id, status')
      .single();

    if (insertError || !inserted) {
      throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to create request: ${insertError?.message ?? 'unknown error'}`);
    }

    metrics.incrementCounter('friends_request_total', { action: 'send' });
    logger.info({ action: 'friend_request', userId, targetUserId, friendshipId: inserted.id }, 'Friend request created');

    return {
      friendshipId: inserted.id,
      status: 'pending',
    };
  }

  async acceptRequest(userId: string, friendshipId: string): Promise<{ friendshipId: string; status: 'accepted'; acceptedAt: string }> {
    const supabase = getSupabase();

    const { data: row, error: lookupError } = await supabase
      .from('friendships')
      .select('id, user_id, friend_id, status, initiated_by')
      .eq('id', friendshipId)
      .maybeSingle();

    if (lookupError || !row) {
      throw new AppError(ErrorCodes.FRIEND_NOT_FOUND, 'Friendship not found', 404);
    }
    if (row.status !== 'pending') {
      throw new AppError(ErrorCodes.FRIEND_NOT_PENDING, 'Friendship is not pending', 400);
    }

    const isRecipient = row.initiated_by !== userId && (row.user_id === userId || row.friend_id === userId);
    if (!isRecipient) {
      throw new AppError(ErrorCodes.FRIEND_NOT_RECIPIENT, 'Only recipient can accept this request', 403);
    }

    const acceptedAt = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('friendships')
      .update({
        status: 'accepted',
        accepted_at: acceptedAt,
        updated_at: acceptedAt,
      })
      .eq('id', friendshipId);

    if (updateError) {
      throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to accept request: ${updateError.message}`);
    }

    metrics.incrementCounter('friends_request_total', { action: 'accept' });
    logger.info({ action: 'friend_accept', userId, friendshipId }, 'Friend request accepted');

    return {
      friendshipId,
      status: 'accepted',
      acceptedAt,
    };
  }

  async rejectRequest(userId: string, friendshipId: string): Promise<{ removed: true }> {
    const supabase = getSupabase();

    const { data: row } = await supabase
      .from('friendships')
      .select('id, user_id, friend_id, status, initiated_by')
      .eq('id', friendshipId)
      .maybeSingle();

    if (!row) {
      throw new AppError(ErrorCodes.FRIEND_NOT_FOUND, 'Friendship not found', 404);
    }
    if (row.status !== 'pending') {
      throw new AppError(ErrorCodes.FRIEND_NOT_PENDING, 'Friendship is not pending', 400);
    }

    const isRecipient = row.initiated_by !== userId && (row.user_id === userId || row.friend_id === userId);
    if (!isRecipient) {
      throw new AppError(ErrorCodes.FRIEND_NOT_RECIPIENT, 'Only recipient can reject this request', 403);
    }

    const { error: deleteError } = await supabase
      .from('friendships')
      .delete()
      .eq('id', friendshipId);

    if (deleteError) {
      throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to reject request: ${deleteError.message}`);
    }

    metrics.incrementCounter('friends_request_total', { action: 'reject' });
    logger.info({ action: 'friend_reject', userId, friendshipId }, 'Friend request rejected');
    return { removed: true };
  }

  async remove(userId: string, friendshipId: string): Promise<{ removed: true }> {
    const supabase = getSupabase();

    const { data: row } = await supabase
      .from('friendships')
      .select('id, user_id, friend_id, status, initiated_by')
      .eq('id', friendshipId)
      .maybeSingle();

    if (!row) {
      throw new AppError(ErrorCodes.FRIEND_NOT_FOUND, 'Friendship not found', 404);
    }

    const isParticipant = row.user_id === userId || row.friend_id === userId;
    if (!isParticipant) {
      throw new AppError(ErrorCodes.FRIEND_NOT_FOUND, 'Friendship not found', 404);
    }

    if (row.status === 'pending' && row.initiated_by !== userId) {
      throw new AppError(ErrorCodes.FRIEND_NOT_RECIPIENT, 'Only initiator can cancel outgoing request', 403);
    }

    const { error: deleteError } = await supabase
      .from('friendships')
      .delete()
      .eq('id', friendshipId);

    if (deleteError) {
      throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to remove friendship: ${deleteError.message}`);
    }

    metrics.incrementCounter('friends_request_total', { action: 'remove' });
    logger.info({ action: 'friend_remove', userId, friendshipId }, 'Friendship removed');
    return { removed: true };
  }

  async areAcceptedFriends(userId: string, otherUserId: string): Promise<boolean> {
    if (userId === otherUserId) return true;
    const supabase = getSupabase();
    const pair = this.canonicalPair(userId, otherUserId);

    const { data } = await supabase
      .from('friendships')
      .select('id')
      .eq('user_id', pair.userId)
      .eq('friend_id', pair.friendId)
      .eq('status', 'accepted')
      .maybeSingle();

    return Boolean(data);
  }
}
