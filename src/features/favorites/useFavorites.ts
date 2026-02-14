import { useCallback, useEffect, useState } from 'react';
import { Favorite, loadCachedFavorites } from './cache';
import { refreshFavorites } from './service';

export function useFavorites(userId: string | null | undefined): {
  favorites: Favorite[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
} {
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await refreshFavorites(userId);
      setFavorites(result.favorites);
    } catch {
      setError('Couldn\'t load favorites. Tap to retry.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

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
    };
  }, [userId]);

  return {
    favorites,
    loading,
    error,
    refresh,
  };
}
