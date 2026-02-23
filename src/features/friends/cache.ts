import type { RobloxFriend } from '@/src/features/sessions/types-v2';

export interface FriendsCachePayload {
  friends: RobloxFriend[];
  syncedAt: string | null;
  isStale: boolean;
  robloxNotConnected: boolean;
}

const memoryStore = new Map<string, FriendsCachePayload>();
const listenersByUser = new Map<string, Set<(payload: FriendsCachePayload | null) => void>>();

export function loadCachedFriends(userId: string): FriendsCachePayload | null {
  if (!userId) {
    return null;
  }

  return memoryStore.get(userId) ?? null;
}

export function saveCachedFriends(userId: string, payload: FriendsCachePayload): void {
  if (!userId) {
    return;
  }

  memoryStore.set(userId, payload);
  notifyListeners(userId, payload);
}

export function clearCachedFriends(userId: string): void {
  if (!userId) {
    return;
  }

  memoryStore.delete(userId);
  notifyListeners(userId, null);
}

export function subscribeCachedFriends(
  userId: string,
  listener: (payload: FriendsCachePayload | null) => void
): () => void {
  const listeners = listenersByUser.get(userId) ?? new Set();
  listeners.add(listener);
  listenersByUser.set(userId, listeners);

  return () => {
    const nextListeners = listenersByUser.get(userId);
    if (!nextListeners) {
      return;
    }

    nextListeners.delete(listener);
    if (nextListeners.size === 0) {
      listenersByUser.delete(userId);
    }
  };
}

function notifyListeners(userId: string, payload: FriendsCachePayload | null): void {
  const listeners = listenersByUser.get(userId);
  if (!listeners) {
    return;
  }

  for (const listener of listeners) {
    listener(payload);
  }
}
