/**
 * useSmartInviteSuggestions
 *
 * Composes friends cache + presence + invite history into a ranked
 * suggestion list for the QuickInviteStrip.
 *
 * Resilience contract:
 *   - Friends cache miss → empty suggestions (no crash)
 *   - Presence fetch failure → suggestions degrade to cache-only ordering
 *   - Invite history miss → no "Played with you" boost (graceful)
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useFocusEffect } from 'expo-router';
import { useFriends } from '@/src/features/friends/useFriends';
import { sessionsAPIStoreV2 } from './apiStore-v2';
import { getRecentlyInvitedIds } from './inviteHistory';
import { rankInviteSuggestions } from './smartInviteSuggestions';
import type { SuggestedFriend } from './smartInviteSuggestions';
import type { RobloxFriendPresence } from './types-v2';
import { logger } from '@/src/lib/logger';
import { monitoring } from '@/src/lib/monitoring';

export interface SmartInviteSuggestionsResult {
  suggestions: SuggestedFriend[];
  /** True while initial friends + presence are loading */
  isLoading: boolean;
  /** True while presence is refreshing (friends already loaded) */
  isPresenceLoading: boolean;
  totalFriendCount: number;
}

export interface UseSmartInviteSuggestionsParams {
  userId: string | undefined;
  /** Roblox user IDs to exclude from suggestions (already in session, host) */
  excludeIds: number[];
  limit?: number;
}

export function useSmartInviteSuggestions({
  userId,
  excludeIds,
  limit = 8,
}: UseSmartInviteSuggestionsParams): SmartInviteSuggestionsResult {
  const { friends, isLoading: friendsLoading } = useFriends(userId);

  const [presenceMap, setPresenceMap] = useState<Map<number, RobloxFriendPresence>>(new Map());
  const [isPresenceLoading, setIsPresenceLoading] = useState(false);
  const [recentlyInvitedIds, setRecentlyInvitedIds] = useState<number[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  // Load invite history once
  useEffect(() => {
    if (!userId) {
      setHistoryLoaded(true);
      return;
    }
    void (async () => {
      try {
        const ids = await getRecentlyInvitedIds(userId);
        setRecentlyInvitedIds(ids);
      } catch {
        // non-critical
      } finally {
        setHistoryLoaded(true);
      }
    })();
  }, [userId]);

  const fetchPresence = useCallback(async () => {
    if (friends.length === 0) return;
    setIsPresenceLoading(true);
    const startMs = Date.now();
    try {
      logger.info('smart_suggestions: fetching presence', { friendCount: friends.length });
      const map = await sessionsAPIStoreV2.fetchBulkPresence(friends.map((f) => f.id));
      setPresenceMap(map);
      logger.info('smart_suggestions: presence loaded', {
        latencyMs: Date.now() - startMs,
        friendCount: friends.length,
      });
    } catch (err) {
      logger.warn('smart_suggestions: presence fetch failed — degrading gracefully', {
        error: err instanceof Error ? err.message : String(err),
      });
      monitoring.addBreadcrumb({
        category: 'info',
        level: 'warning',
        message: 'smart_suggestions presence fetch failed',
        data: { error: err instanceof Error ? err.message : String(err) },
      });
    } finally {
      setIsPresenceLoading(false);
    }
  }, [friends]);

  // Fetch presence on mount once friends are available
  useEffect(() => {
    if (friends.length > 0) {
      void fetchPresence();
    }
  }, [friends.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch presence on screen focus
  useFocusEffect(
    useCallback(() => {
      if (friends.length > 0) {
        void fetchPresence();
      }
    }, [fetchPresence, friends.length])
  );

  const suggestions = useMemo<SuggestedFriend[]>(() => {
    if (friends.length === 0) return [];
    const ranked = rankInviteSuggestions({
      friends,
      presenceMap,
      recentlyInvitedIds,
      excludeIds,
      limit,
    });

    if (ranked.length > 0) {
      logger.info('smart_suggestions: ranked', {
        count: ranked.length,
        topReason: ranked[0]?.reason,
      });
    }

    return ranked;
  }, [friends, presenceMap, recentlyInvitedIds, excludeIds, limit]);

  const isLoading = friendsLoading || !historyLoaded;

  return {
    suggestions,
    isLoading,
    isPresenceLoading,
    totalFriendCount: friends.length,
  };
}
