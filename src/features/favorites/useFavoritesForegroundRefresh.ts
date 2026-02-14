import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { logger } from '@/src/lib/logger';
import { REFRESH_MIN_INTERVAL_MS } from './constants';
import { refreshFavorites } from './service';

const lastRefreshAttemptAtByUser = new Map<string, number>();

export function useFavoritesForegroundRefresh(userId: string | null | undefined): void {
  useEffect(() => {
    if (!userId) {
      return;
    }

    if (Platform.OS === 'web') {
      return;
    }

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') {
        return;
      }

      const now = Date.now();
      const lastAttempt = lastRefreshAttemptAtByUser.get(userId) ?? 0;
      if (now - lastAttempt < REFRESH_MIN_INTERVAL_MS) {
        return;
      }

      lastRefreshAttemptAtByUser.set(userId, now);
      void refreshFavorites(userId).catch((error) => {
        logger.warn('Failed foreground favorites refresh', {
          userId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    });

    return () => {
      subscription.remove();
    };
  }, [userId]);
}
