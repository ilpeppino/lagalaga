/**
 * Epic 4 Story 4.3: Browse Sessions UI
 */

import { useEffect, useState, useCallback } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Image,
  ScrollView,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { sessionsAPIStoreV2 } from '@/src/features/sessions/apiStore-v2';
import type { Session } from '@/src/features/sessions/types-v2';
import { logger } from '@/src/lib/logger';
import { ThemedText } from '@/components/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function SessionsListScreenV2() {
  const router = useRouter();
  const colorScheme = useColorScheme();

  // Active sessions state
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Pagination state
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState(0);

  // Planned sessions state
  const [plannedSessions, setPlannedSessions] = useState<Session[]>([]);
  const [plannedLoading, setPlannedLoading] = useState(true);
  const [plannedError, setPlannedError] = useState<string | null>(null);
  const [plannedTotal, setPlannedTotal] = useState(0);

  const LIMIT = 20;

  useEffect(() => {
    loadSessions();
    loadPlannedSessions();
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadSessions(true);
      loadPlannedSessions();
    }, [])
  );

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
      logger.error('Failed to load sessions', {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
      setIsLoadingMore(false);
    }
  };

  const loadPlannedSessions = async () => {
    try {
      setPlannedLoading(true);
      setPlannedError(null);

      const response = await sessionsAPIStoreV2.listMyPlannedSessions({
        limit: LIMIT,
        offset: 0,
      });

      setPlannedSessions(response.sessions);
      setPlannedTotal(response.pagination.total);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('Failed to load planned sessions', { error: errorMsg });
      setPlannedError('Failed to load your planned sessions');
    } finally {
      setPlannedLoading(false);
    }
  };

  const handleRefresh = useCallback(() => {
    loadSessions(true);
    loadPlannedSessions();
  }, []);

  const handleLoadMore = useCallback(() => {
    if (!isLoadingMore && hasMore && !isRefreshing) {
      setIsLoadingMore(true);
      loadSessions();
    }
  }, [isLoadingMore, hasMore, isRefreshing, offset]);

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

  const renderSession = ({ item, isPlanned = false }: { item: Session; isPlanned?: boolean }) => {
    const isFull = item.currentParticipants >= item.maxParticipants;

    return (
      <TouchableOpacity
        style={styles.sessionCard}
        onPress={() => router.push(`/sessions/${item.id}`)}
      >
        {item.game.thumbnailUrl ? (
          <Image source={{ uri: item.game.thumbnailUrl }} style={styles.thumbnail} />
        ) : (
          <View style={[styles.thumbnail, styles.thumbnailPlaceholder]}>
            <ThemedText
              type="displaySmall"
              lightColor="#999"
              darkColor="#666"
              style={styles.thumbnailPlaceholderText}
            >
              {item.game.gameName?.[0] || '?'}
            </ThemedText>
          </View>
        )}

        <View style={styles.sessionInfo}>
          <View style={styles.titleRow}>
            <ThemedText
              type="titleMedium"
              lightColor="#333"
              darkColor="#fff"
              numberOfLines={1}
              style={styles.title}
            >
              {item.title || item.game.gameName || 'Roblox Session'}
            </ThemedText>
            {isPlanned && (
              <View style={styles.hostBadge}>
                <ThemedText type="labelSmall" lightColor="#fff" darkColor="#fff">
                  Host
                </ThemedText>
              </View>
            )}
          </View>

          <ThemedText
            type="bodyMedium"
            lightColor="#666"
            darkColor="#aaa"
            numberOfLines={1}
            style={styles.gameName}
          >
            {item.game.gameName || 'Roblox Game'}
          </ThemedText>

          <View style={styles.participants}>
            <ThemedText
              type="labelMedium"
              lightColor={isFull ? "#ff3b30" : "#007AFF"}
              darkColor={isFull ? "#ff453a" : "#0a84ff"}
              style={styles.participantText}
            >
              {item.currentParticipants}/{item.maxParticipants} players
            </ThemedText>
            {isFull && (
              <View style={styles.fullBadge}>
                <ThemedText type="labelSmall" lightColor="#fff" darkColor="#fff">
                  FULL
                </ThemedText>
              </View>
            )}
          </View>

          {item.scheduledStart && (
            <ThemedText
              type="bodySmall"
              lightColor="#888"
              darkColor="#999"
              style={styles.timeText}
            >
              {formatRelativeTime(item.scheduledStart)}
            </ThemedText>
          )}

          {isPlanned && (
            <View style={styles.metadataRow}>
              <ThemedText
                type="labelSmall"
                lightColor="#666"
                darkColor="#aaa"
              >
                {item.visibility === 'public' ? 'Public' : item.visibility === 'friends' ? 'Friends Only' : 'Invite Only'}
              </ThemedText>
              <ThemedText
                type="labelSmall"
                lightColor="#666"
                darkColor="#aaa"
                style={styles.metadataSeparator}
              >
                •
              </ThemedText>
              <ThemedText
                type="labelSmall"
                lightColor="#666"
                darkColor="#aaa"
              >
                {item.status === 'scheduled' ? 'Scheduled' : 'Active'}
              </ThemedText>
            </View>
          )}

          {!isPlanned && item.visibility !== 'public' && (
            <View style={styles.visibilityBadge}>
              <ThemedText
                type="labelSmall"
                lightColor="#666"
                darkColor="#aaa"
              >
                {item.visibility === 'friends' ? 'Friends' : 'Invite Only'}
              </ThemedText>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderFooter = () => {
    if (!isLoadingMore) return null;
    return (
      <View style={styles.footer}>
        <ActivityIndicator size="small" color="#007AFF" />
      </View>
    );
  };

  if (isLoading && sessions.length === 0 && plannedLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007AFF" />
        <ThemedText
          type="bodyLarge"
          lightColor="#666"
          darkColor="#aaa"
          style={styles.loadingText}
        >
          Loading sessions...
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colorScheme === 'dark' ? '#000' : '#f8f9fa' }]}>
      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />
        }
      >
        {/* Planned Sessions Section */}
        <View style={[styles.sectionHeader, { backgroundColor: colorScheme === 'dark' ? '#1c1c1e' : '#fff' }]}>
          <ThemedText type="headlineSmall">Planned Sessions</ThemedText>
          <ThemedText
            type="bodyMedium"
            lightColor="#666"
            darkColor="#aaa"
            style={styles.headerSubtitle}
          >
            {plannedTotal} total
          </ThemedText>
        </View>

        {plannedLoading && (
          <View style={styles.sectionLoading}>
            <ActivityIndicator size="small" color="#007AFF" />
          </View>
        )}

        {plannedError && (
          <View style={styles.errorContainer}>
            <ThemedText type="bodyMedium" lightColor="#c62828" darkColor="#ff5252">
              {plannedError}
            </ThemedText>
          </View>
        )}

        {!plannedLoading && !plannedError && plannedSessions.length === 0 && (
          <View style={styles.sectionEmpty}>
            <ThemedText
              type="bodyMedium"
              lightColor="#666"
              darkColor="#aaa"
            >
              No planned sessions yet
            </ThemedText>
          </View>
        )}

        {!plannedLoading && !plannedError && plannedSessions.map((session) => (
          <View key={session.id} style={styles.sessionWrapper}>
            {renderSession({ item: session, isPlanned: true })}
          </View>
        ))}

        {/* Active Sessions Section */}
        <View style={[styles.sectionHeader, styles.sectionHeaderSpacing, { backgroundColor: colorScheme === 'dark' ? '#1c1c1e' : '#fff' }]}>
          <ThemedText type="headlineSmall">Active Sessions</ThemedText>
          <ThemedText
            type="bodyMedium"
            lightColor="#666"
            darkColor="#aaa"
            style={styles.headerSubtitle}
          >
            {total} total
          </ThemedText>
        </View>

        {!isLoading && sessions.length === 0 && (
          <View style={styles.sectionEmpty}>
            <ThemedText
              type="bodyMedium"
              lightColor="#666"
              darkColor="#aaa"
            >
              No active sessions
            </ThemedText>
            <ThemedText
              type="bodySmall"
              lightColor="#888"
              darkColor="#999"
              style={{ marginTop: 4 }}
            >
              Be the first to create one!
            </ThemedText>
          </View>
        )}

        {sessions.map((session) => (
          <View key={session.id} style={styles.sessionWrapper}>
            {renderSession({ item: session, isPlanned: false })}
          </View>
        ))}

        {renderFooter()}
      </ScrollView>

      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/sessions/create')}
      >
        <ThemedText type="displaySmall" lightColor="#fff" darkColor="#fff" style={styles.fabText}>
          +
        </ThemedText>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
  },
  sectionHeader: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  sectionHeaderSpacing: {
    marginTop: 24,
  },
  headerSubtitle: {
    marginTop: 4,
  },
  sectionLoading: {
    padding: 20,
    alignItems: 'center',
  },
  sectionEmpty: {
    padding: 20,
    alignItems: 'center',
  },
  sessionWrapper: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  errorContainer: {
    margin: 16,
    padding: 12,
    backgroundColor: '#ffebee',
    borderRadius: 8,
  },
  list: {
    paddingBottom: 80,
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
    // Font from displaySmall token
  },
  sessionInfo: {
    flex: 1,
    padding: 12,
    justifyContent: 'space-between',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  title: {
    flex: 1,
    marginRight: 8,
  },
  hostBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: '#007AFF',
    borderRadius: 4,
  },
  gameName: {
    marginBottom: 8,
  },
  metadataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  metadataSeparator: {
    marginHorizontal: 8,
  },
  participants: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  participantText: {
    // Font from labelMedium token
  },
  fullBadge: {
    marginLeft: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: '#ff3b30',
    borderRadius: 4,
  },
  timeText: {
    // Font from bodySmall token
  },
  visibilityBadge: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#f0f0f0',
    borderRadius: 4,
  },
  footer: {
    paddingVertical: 20,
    alignItems: 'center',
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
    // Font from displaySmall token
  },
});
