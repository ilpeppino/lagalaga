/**
 * Epic 4 Story 4.3: Browse Sessions UI
 *
 * Features:
 * - Infinite scroll pagination
 * - Session cards with thumbnails, title, host, participant count
 * - Pull to refresh
 * - Empty state
 * - Loading states
 */

import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { sessionsAPIStoreV2 } from '@/src/features/sessions/apiStore-v2';
import type { Session } from '@/src/features/sessions/types-v2';

export default function SessionsListScreenV2() {
  const router = useRouter();

  // Data state
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Pagination state
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState(0);

  const LIMIT = 20;

  /**
   * Initial load
   */
  useEffect(() => {
    loadSessions();
  }, []);

  /**
   * Load sessions with optional refresh
   */
  const loadSessions = async (refresh = false) => {
    try {
      if (refresh) {
        setIsRefreshing(true);
      } else if (sessions.length === 0) {
        setIsLoading(true);
      }

      const currentOffset = refresh ? 0 : offset;

      const response = await sessionsAPIStoreV2.listSessions({
        status: 'active',
        limit: LIMIT,
        offset: currentOffset,
      });

      if (refresh) {
        setSessions(response.sessions);
        setOffset(response.sessions.length);
      } else {
        setSessions((prev) => (currentOffset === 0 ? response.sessions : [...prev, ...response.sessions]));
        setOffset(currentOffset + response.sessions.length);
      }

      setHasMore(response.pagination.hasMore);
      setTotal(response.pagination.total);
    } catch (error) {
      console.error('Failed to load sessions:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
      setIsLoadingMore(false);
    }
  };

  /**
   * Handle pull to refresh
   */
  const handleRefresh = useCallback(() => {
    loadSessions(true);
  }, []);

  /**
   * Handle load more (infinite scroll)
   */
  const handleLoadMore = useCallback(() => {
    if (!isLoadingMore && hasMore && !isRefreshing) {
      setIsLoadingMore(true);
      loadSessions();
    }
  }, [isLoadingMore, hasMore, isRefreshing, offset]);

  /**
   * Format relative time (e.g., "in 2 hours", "5 minutes ago")
   */
  const formatRelativeTime = (isoString: string): string => {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 0) {
      const absMins = Math.abs(diffMins);
      if (absMins < 60) return `${absMins}m ago`;
      const hours = Math.floor(absMins / 60);
      if (hours < 24) return `${hours}h ago`;
      const days = Math.floor(hours / 24);
      return `${days}d ago`;
    } else {
      if (diffMins < 60) return `in ${diffMins}m`;
      const hours = Math.floor(diffMins / 60);
      if (hours < 24) return `in ${hours}h`;
      const days = Math.floor(hours / 24);
      return `in ${days}d`;
    }
  };

  /**
   * Format date/time for display
   */
  const formatDateTime = (isoString: string): string => {
    const date = new Date(isoString);
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  /**
   * Render session card
   */
  const renderSession = ({ item }: { item: Session }) => {
    const isFull = item.currentParticipants >= item.maxParticipants;

    return (
      <TouchableOpacity
        style={styles.sessionCard}
        onPress={() => router.push(`/sessions/${item.id}`)}
      >
        {/* Game Thumbnail */}
        {item.game.thumbnailUrl ? (
          <Image source={{ uri: item.game.thumbnailUrl }} style={styles.thumbnail} />
        ) : (
          <View style={[styles.thumbnail, styles.thumbnailPlaceholder]}>
            <Text style={styles.thumbnailPlaceholderText}>
              {item.game.gameName?.[0] || '?'}
            </Text>
          </View>
        )}

        {/* Session Info */}
        <View style={styles.sessionInfo}>
          <Text style={styles.title} numberOfLines={1}>
            {item.title}
          </Text>

          <Text style={styles.gameName} numberOfLines={1}>
            {item.game.gameName || 'Roblox Game'}
          </Text>

          {/* Participant Count */}
          <View style={styles.participants}>
            <Text style={[styles.participantText, isFull && styles.participantTextFull]}>
              {item.currentParticipants}/{item.maxParticipants} players
            </Text>
            {isFull && <Text style={styles.fullBadge}>FULL</Text>}
          </View>

          {/* Scheduled Time */}
          {item.scheduledStart && (
            <Text style={styles.timeText}>
              {formatRelativeTime(item.scheduledStart)}
            </Text>
          )}

          {/* Visibility Badge */}
          {item.visibility !== 'public' && (
            <View style={styles.visibilityBadge}>
              <Text style={styles.visibilityBadgeText}>
                {item.visibility === 'friends' ? 'Friends' : 'Invite Only'}
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  /**
   * Render loading footer
   */
  const renderFooter = () => {
    if (!isLoadingMore) return null;
    return (
      <View style={styles.footer}>
        <ActivityIndicator size="small" color="#007AFF" />
      </View>
    );
  };

  /**
   * Render empty state
   */
  const renderEmpty = () => {
    if (isLoading) return null;

    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>No Active Sessions</Text>
        <Text style={styles.emptySubtitle}>Be the first to create one!</Text>
        <TouchableOpacity
          style={styles.emptyButton}
          onPress={() => router.push('/sessions/create-v2')}
        >
          <Text style={styles.emptyButtonText}>Create Session</Text>
        </TouchableOpacity>
      </View>
    );
  };

  /**
   * Initial loading state
   */
  if (isLoading && sessions.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading sessions...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Active Sessions</Text>
        <Text style={styles.headerSubtitle}>{total} total</Text>
      </View>

      {/* Session List */}
      <FlatList
        data={sessions}
        renderItem={renderSession}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={renderFooter}
        ListEmptyComponent={renderEmpty}
      />

      {/* Floating Create Button */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/sessions/create-v2')}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  header: {
    backgroundColor: '#fff',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#333',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  list: {
    padding: 16,
    paddingBottom: 80, // Space for FAB
  },
  sessionCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  thumbnail: {
    width: 100,
    height: 100,
    backgroundColor: '#e0e0e0',
  },
  thumbnailPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbnailPlaceholderText: {
    fontSize: 32,
    fontWeight: '700',
    color: '#999',
  },
  sessionInfo: {
    flex: 1,
    padding: 12,
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  gameName: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  participants: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  participantText: {
    fontSize: 13,
    color: '#007AFF',
    fontWeight: '500',
  },
  participantTextFull: {
    color: '#ff3b30',
  },
  fullBadge: {
    marginLeft: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: '#ff3b30',
    borderRadius: 4,
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  timeText: {
    fontSize: 12,
    color: '#888',
  },
  visibilityBadge: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#f0f0f0',
    borderRadius: 4,
  },
  visibilityBadgeText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#666',
  },
  footer: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    minHeight: 400,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 24,
  },
  emptyButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  emptyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 8,
  },
  fabText: {
    fontSize: 32,
    color: '#fff',
    fontWeight: '300',
  },
});
