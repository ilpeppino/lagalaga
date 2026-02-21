import { useCallback, useEffect, useState } from 'react';
import { Favorite, loadCachedFavorites, subscribeCachedFavorites } from './cache';
import { refreshFavorites } from './service';

export function useFavorites(userId: string | null | undefined): {
  favorites: Favorite[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  forceRefresh: () => Promise<void>;
} {
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runRefresh = useCallback(async (force: boolean) => {
    if (!userId) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await refreshFavorites(userId, { force });
      setFavorites(result.favorites);
    } catch {
      setError('Couldn\'t load favorites. Tap to retry.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const refresh = useCallback(async () => runRefresh(false), [runRefresh]);
  const forceRefresh = useCallback(async () => runRefresh(true), [runRefresh]);

  useEffect(() => {
    let cancelled = false;

    if (!userId) {
      setFavorites([]);
      setError(null);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setError(null);
    const unsubscribe = subscribeCachedFavorites(userId, (payload) => {
      if (cancelled || !payload) {
        return;
      }
      setFavorites(payload.favorites);
    });

    void loadCachedFavorites(userId)
      .then((payload) => {
        if (cancelled || !payload) {
          return;
        }
        setFavorites(payload.favorites);
      })
      .catch(() => {
        // Ignore cache read errors and continue to network refresh.
      });

    setLoading(true);
    void refreshFavorites(userId)
      .then((result) => {
        if (cancelled) {
          return;
        }
        setFavorites(result.favorites);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setError('Couldn\'t load favorites. Tap to retry.');
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [userId]);

  return {
    favorites,
    loading,
    error,
    refresh,
    forceRefresh,
  };
}
