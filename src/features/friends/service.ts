import { apiClient } from '@/src/lib/api';
import { ApiError } from '@/src/lib/errors';
import { logger } from '@/src/lib/logger';
import { sessionsAPIStoreV2 } from '@/src/features/sessions/apiStore-v2';
import {
  FriendsCachePayload,
  loadCachedFriends,
  saveCachedFriends,
} from './cache';

function fromFriendsResponse(response: {
  fetchedAt: string;
  expiresAt: string;
  friends: FriendsCachePayload['friends'];
}): FriendsCachePayload {
  return {
    friends: response.friends,
    syncedAt: response.fetchedAt,
    isStale: new Date(response.expiresAt) < new Date(),
    robloxNotConnected: false,
  };
}

export async function refreshFriends(
  userId: string,
  options: { force?: boolean } = {}
): Promise<FriendsCachePayload> {
  if (!userId) {
    return {
      friends: [],
      syncedAt: null,
      isStale: false,
      robloxNotConnected: false,
    };
  }

  try {
    if (options.force) {
      await apiClient.friends.refresh();
    }

    const response = await sessionsAPIStoreV2.listMyRobloxFriends();
    const payload = fromFriendsResponse(response);
    saveCachedFriends(userId, payload);
    return payload;
  } catch (error) {
    if (error instanceof ApiError && error.code === 'ROBLOX_NOT_CONNECTED') {
      const payload: FriendsCachePayload = {
        friends: [],
        syncedAt: null,
        isStale: false,
        robloxNotConnected: true,
      };
      saveCachedFriends(userId, payload);
      return payload;
    }
    throw error;
  }
}

export async function warmFriends(userId: string): Promise<void> {
  if (!userId) {
    return;
  }

  loadCachedFriends(userId);
  void refreshFriends(userId).catch((error) => {
    logger.warn('Failed to warm friends cache', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}
