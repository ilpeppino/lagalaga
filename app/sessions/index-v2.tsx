/**
 * Epic 4 Story 4.3: Browse Sessions UI
 */

import { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  RefreshControl,
  Image,
  ScrollView,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { useRouter, useFocusEffect, Stack } from 'expo-router';
import { Swipeable } from 'react-native-gesture-handler';
import { sessionsAPIStoreV2 } from '@/src/features/sessions/apiStore-v2';
import type { Session } from '@/src/features/sessions/types-v2';
import { logger } from '@/src/lib/logger';
import { ThemedText } from '@/components/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Card } from '@/components/ui/paper';
import { ActivityIndicator, FAB, IconButton } from 'react-native-paper';
import { useErrorHandler } from '@/src/lib/errors';

/**
 * Format a timestamp as relative time (e.g., "in 5m", "2h ago")
 * Moved outside component to avoid recreation on every render
 */
function formatRelativeTime(isoString: string): string {
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
}

export default function SessionsListScreenV2() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const { presentError } = useErrorHandler();

  // Active sessions state
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [total, setTotal] = useState(0);

  // Planned sessions state
  const [plannedSessions, setPlannedSessions] = useState<Session[]>([]);
  const [plannedLoading, setPlannedLoading] = useState(true);
  const [plannedError, setPlannedError] = useState<string | null>(null);
  const [plannedTotal, setPlannedTotal] = useState(0);

  // Selection mode state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);

  const LIMIT = 20;

  const loadSessions = useCallback(async (refresh = false) => {
    try {
      if (refresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      const response = await sessionsAPIStoreV2.listSessions({
        status: 'active',
        limit: LIMIT,
        offset: 0,
      });

      setSessions(response.sessions);
      setTotal(response.pagination.total);
    } catch (error) {
      logger.error('Failed to load sessions', {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []); // LIMIT is a constant, no need in deps

  const loadPlannedSessions = useCallback(async () => {
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
  }, []); // LIMIT is a constant, no need in deps

  useFocusEffect(
    useCallback(() => {
      loadSessions(true);
      loadPlannedSessions();
    }, [loadPlannedSessions, loadSessions])
  );

  const handleRefresh = useCallback(() => {
    loadSessions(true);
    loadPlannedSessions();
  }, [loadPlannedSessions, loadSessions]);

  const handleDeleteSession = useCallback(async (sessionId: string) => {
    try {
      setIsDeleting(true);
      await sessionsAPIStoreV2.deleteSession(sessionId);

      // Optimistically remove from UI
      setPlannedSessions(prev => prev.filter(s => s.id !== sessionId));
      setPlannedTotal(prev => prev - 1);

      logger.info('Session deleted successfully', { sessionId });
    } catch (error) {
      presentError(error);
      // Reload to ensure consistency
      await loadPlannedSessions();
    } finally {
      setIsDeleting(false);
    }
  }, [loadPlannedSessions, presentError]);

  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;

    try {
      setIsDeleting(true);
      const idsToDelete = Array.from(selectedIds);
      const deletedCount = await sessionsAPIStoreV2.bulkDeleteSessions(idsToDelete);

      // Optimistically remove from UI
      setPlannedSessions(prev => prev.filter(s => !selectedIds.has(s.id)));
      setPlannedTotal(prev => prev - deletedCount);

      // Exit selection mode
      setSelectionMode(false);
      setSelectedIds(new Set());

      logger.info('Sessions deleted successfully', { count: deletedCount });
    } catch (error) {
      presentError(error);
      // Reload to ensure consistency
      await loadPlannedSessions();
    } finally {
      setIsDeleting(false);
    }
  }, [selectedIds, loadPlannedSessions, presentError]);

  const handleLongPress = useCallback((sessionId: string) => {
    setSelectionMode(true);
    setSelectedIds(new Set([sessionId]));
  }, []);

  const handleToggleSelection = useCallback((sessionId: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sessionId)) {
        newSet.delete(sessionId);
      } else {
        newSet.add(sessionId);
      }
      return newSet;
    });
  }, []);

  const handleToggleAll = useCallback(() => {
    const allPlannedIds = plannedSessions.map(s => s.id);
    const allSelected = allPlannedIds.every(id => selectedIds.has(id));

    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allPlannedIds));
    }
  }, [plannedSessions, selectedIds]);

  const handleExitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const renderDeleteAction = () => (
    <View style={styles.deleteAction}>
      <ThemedText type="labelLarge" lightColor="#fff" darkColor="#fff">
        Delete
      </ThemedText>
    </View>
  );

  const renderSession = ({ item, isPlanned = false }: { item: Session; isPlanned?: boolean }) => {
    const isFull = item.currentParticipants >= item.maxParticipants;
    const isSelected = selectedIds.has(item.id);

    const sessionCard = (
      <Card
        style={[
          styles.sessionCard,
          isSelected && styles.sessionCardSelected,
        ]}
        mode="elevated"
        onPress={() => {
          if (selectionMode && isPlanned) {
            handleToggleSelection(item.id);
          } else {
            router.push(`/sessions/${item.id}`);
          }
        }}
        onLongPress={isPlanned ? () => handleLongPress(item.id) : undefined}
      >
        <View style={styles.sessionCardContent}>
          {isPlanned && selectionMode && (
            <View style={styles.checkboxContainer}>
              <View style={[
                styles.checkbox,
                isSelected && styles.checkboxSelected,
              ]}>
                {isSelected && (
                  <ThemedText type="labelSmall" lightColor="#fff" darkColor="#fff">
                    ✓
                  </ThemedText>
                )}
              </View>
            </View>
          )}

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
        </View>
      </Card>
    );

    // Wrap in Swipeable only for planned sessions when not in selection mode
    if (isPlanned && !selectionMode && Platform.OS !== 'web') {
      return (
        <Swipeable
          renderRightActions={renderDeleteAction}
          onSwipeableOpen={() => handleDeleteSession(item.id)}
          overshootRight={false}
        >
          {sessionCard}
        </Swipeable>
      );
    }

    // For web or when in selection mode, provide a simple delete button (optional)
    if (isPlanned && !selectionMode && Platform.OS === 'web') {
      return (
        <View style={styles.webDeleteContainer}>
          {sessionCard}
          <TouchableOpacity
            style={styles.webDeleteButton}
            onPress={() => handleDeleteSession(item.id)}
          >
            <ThemedText type="labelSmall" lightColor="#ff3b30" darkColor="#ff453a">
              Delete
            </ThemedText>
          </TouchableOpacity>
        </View>
      );
    }

    return sessionCard;
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

  const allPlannedSelected = plannedSessions.length > 0 && plannedSessions.every(s => selectedIds.has(s.id));

  return (
    <View style={[styles.container, { backgroundColor: colorScheme === 'dark' ? '#000' : '#f8f9fa' }]}>
      <Stack.Screen
        options={{
          title: selectionMode ? `${selectedIds.size} Selected` : 'Sessions',
          headerLeft: selectionMode
            ? () => (
                <IconButton
                  icon="close"
                  onPress={handleExitSelectionMode}
                  disabled={isDeleting}
                />
              )
            : undefined,
          headerRight: selectionMode
            ? () => (
                <View style={styles.headerActions}>
                  <IconButton
                    icon={allPlannedSelected ? 'checkbox-marked' : 'checkbox-blank-outline'}
                    onPress={handleToggleAll}
                    disabled={isDeleting || plannedSessions.length === 0}
                  />
                  <IconButton
                    icon="delete"
                    onPress={handleBulkDelete}
                    disabled={isDeleting || selectedIds.size === 0}
                  />
                </View>
              )
            : undefined,
        }}
      />
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
      </ScrollView>

      {!selectionMode && (
        <FAB
          icon="plus"
          style={styles.fab}
          color="#fff"
          onPress={() => router.push('/sessions/create')}
        />
      )}
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
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
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sessionCardSelected: {
    backgroundColor: '#e3f2fd',
  },
  sessionCardContent: {
    flexDirection: 'row',
  },
  checkboxContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 40,
    paddingLeft: 8,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    backgroundColor: '#007AFF',
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
  deleteAction: {
    backgroundColor: '#ff3b30',
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    height: '100%',
  },
  webDeleteContainer: {
    position: 'relative',
  },
  webDeleteButton: {
    position: 'absolute',
    right: 12,
    top: 12,
    padding: 8,
    backgroundColor: '#fff',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#ff3b30',
  },
  footer: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    backgroundColor: '#007AFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 8,
  },
});
