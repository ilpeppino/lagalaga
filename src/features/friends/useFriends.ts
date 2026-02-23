import { useCallback, useEffect, useState } from 'react';
import {
  FriendsCachePayload,
  loadCachedFriends,
  subscribeCachedFriends,
} from './cache';
import { refreshFriends } from './service';

const DEFAULT_PAYLOAD: FriendsCachePayload = {
  friends: [],
  syncedAt: null,
  isStale: false,
  robloxNotConnected: false,
};

export function useFriends(userId: string | null | undefined): {
  friends: FriendsCachePayload['friends'];
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  syncedAt: string | null;
  isStale: boolean;
  robloxNotConnected: boolean;
  refresh: () => Promise<void>;
  reload: () => Promise<void>;
} {
  const [friends, setFriends] = useState<FriendsCachePayload['friends']>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [isStale, setIsStale] = useState(false);
  const [robloxNotConnected, setRobloxNotConnected] = useState(false);

  const applyPayload = useCallback((payload: FriendsCachePayload) => {
    setFriends(payload.friends);
    setSyncedAt(payload.syncedAt);
    setIsStale(payload.isStale);
    setRobloxNotConnected(payload.robloxNotConnected);
  }, []);

  const reload = useCallback(async () => {
    if (!userId) {
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const payload = await refreshFriends(userId);
      applyPayload(payload);
    } catch {
      setError('Couldn\'t load friends. Tap to retry.');
    } finally {
      setIsLoading(false);
    }
  }, [applyPayload, userId]);

  const refresh = useCallback(async () => {
    if (!userId) {
      return;
    }

    setIsRefreshing(true);
    setError(null);
    try {
      const payload = await refreshFriends(userId, { force: true });
      applyPayload(payload);
    } catch {
      setError('Couldn\'t refresh friends. Tap to retry.');
    } finally {
      setIsRefreshing(false);
    }
  }, [applyPayload, userId]);

  useEffect(() => {
    if (!userId) {
      applyPayload(DEFAULT_PAYLOAD);
      setError(null);
      setIsLoading(false);
      setIsRefreshing(false);
      return;
    }

    const cached = loadCachedFriends(userId);
    if (cached) {
      applyPayload(cached);
    } else {
      applyPayload(DEFAULT_PAYLOAD);
    }

    const unsubscribe = subscribeCachedFriends(userId, (payload) => {
      if (!payload) {
        applyPayload(DEFAULT_PAYLOAD);
        return;
      }
      applyPayload(payload);
    });

    void reload();

    return unsubscribe;
  }, [applyPayload, reload, userId]);

  return {
    friends,
    isLoading,
    isRefreshing,
    error,
    syncedAt,
    isStale,
    robloxNotConnected,
    refresh,
    reload,
  };
}
