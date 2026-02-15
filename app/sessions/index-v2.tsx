/**
 * Epic 4 Story 4.3: Browse Sessions UI
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
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
import { getRobloxGameThumbnail } from '@/src/lib/robloxGameThumbnail';

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

  const [sessions, setSessions] = useState<Session[]>([]);
  const [plannedSessions, setPlannedSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Selection mode state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [fallbackThumbnails, setFallbackThumbnails] = useState<Record<number, string>>({});

  const LIMIT = 20;

  const loadAllSessions = useCallback(async (refresh = false) => {
    try {
      if (refresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setLoadError(null);

      const [activeResult, plannedResult] = await Promise.allSettled([
        sessionsAPIStoreV2.listSessions({
          status: 'active',
          limit: LIMIT,
          offset: 0,
        }),
        sessionsAPIStoreV2.listMyPlannedSessions({
          limit: LIMIT,
          offset: 0,
        }),
      ]);

      if (activeResult.status === 'fulfilled') {
        setSessions(activeResult.value.sessions);
      } else {
        logger.error('Failed to load active sessions', {
          error: activeResult.reason instanceof Error ? activeResult.reason.message : String(activeResult.reason),
        });
      }

      if (plannedResult.status === 'fulfilled') {
        setPlannedSessions(plannedResult.value.sessions);
      } else {
        logger.error('Failed to load planned sessions', {
          error: plannedResult.reason instanceof Error ? plannedResult.reason.message : String(plannedResult.reason),
        });
      }

      if (activeResult.status === 'rejected' && plannedResult.status === 'rejected') {
        setLoadError('Failed to load sessions');
      }
    } catch (error) {
      logger.error('Failed to load sessions list', {
        error: error instanceof Error ? error.message : String(error),
      });
      setLoadError('Failed to load sessions');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []); // LIMIT is a constant, no need in deps

  useFocusEffect(
    useCallback(() => {
      loadAllSessions();
    }, [loadAllSessions])
  );

  const handleRefresh = useCallback(() => {
    loadAllSessions(true);
  }, [loadAllSessions]);

  const handleDeleteSession = useCallback(async (sessionId: string) => {
    try {
      setIsDeleting(true);
      await sessionsAPIStoreV2.deleteSession(sessionId);

      // Optimistically remove from UI
      setPlannedSessions(prev => prev.filter(s => s.id !== sessionId));

      logger.info('Session deleted successfully', { sessionId });
    } catch (error) {
      presentError(error);
      // Reload to ensure consistency
      await loadAllSessions();
    } finally {
      setIsDeleting(false);
    }
  }, [loadAllSessions, presentError]);

  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;

    try {
      setIsDeleting(true);
      const idsToDelete = Array.from(selectedIds);
      const deletedCount = await sessionsAPIStoreV2.bulkDeleteSessions(idsToDelete);

      // Optimistically remove from UI
      setPlannedSessions(prev => prev.filter(s => !selectedIds.has(s.id)));

      // Exit selection mode
      setSelectionMode(false);
      setSelectedIds(new Set());

      logger.info('Sessions deleted successfully', { count: deletedCount });
    } catch (error) {
      presentError(error);
      // Reload to ensure consistency
      await loadAllSessions();
    } finally {
      setIsDeleting(false);
    }
  }, [selectedIds, loadAllSessions, presentError]);

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

  const plannedSessionIds = useMemo(() => new Set(plannedSessions.map((session) => session.id)), [plannedSessions]);

  const mergedSessions = useMemo(() => {
    const uniqueSessions = new Map<string, Session>();
    sessions.forEach((session) => uniqueSessions.set(session.id, session));
    plannedSessions.forEach((session) => {
      if (!uniqueSessions.has(session.id)) {
        uniqueSessions.set(session.id, session);
      }
    });

    return Array.from(uniqueSessions.values()).sort((a, b) => {
      const aIsActive = a.status === 'active';
      const bIsActive = b.status === 'active';
      if (aIsActive !== bIsActive) {
        return aIsActive ? -1 : 1;
      }

      if (a.status === 'scheduled' && b.status === 'scheduled') {
        const aStart = a.scheduledStart ? new Date(a.scheduledStart).getTime() : Number.MAX_SAFE_INTEGER;
        const bStart = b.scheduledStart ? new Date(b.scheduledStart).getTime() : Number.MAX_SAFE_INTEGER;
        return aStart - bStart;
      }

      return 0;
    });
  }, [sessions, plannedSessions]);

  useEffect(() => {
    let cancelled = false;
    const placeIds = Array.from(
      new Set(
        mergedSessions
          .filter((s) => !s.game.thumbnailUrl && s.game.placeId > 0)
          .map((s) => s.game.placeId)
      )
    );

    if (placeIds.length === 0) return;

    placeIds.forEach((placeId) => {
      if (fallbackThumbnails[placeId]) return;
      getRobloxGameThumbnail(placeId).then((url) => {
        if (!url || cancelled) return;
        setFallbackThumbnails((prev) => (prev[placeId] ? prev : { ...prev, [placeId]: url }));
      });
    });

    return () => {
      cancelled = true;
    };
  }, [mergedSessions, fallbackThumbnails]);

  const renderDeleteAction = () => (
    <View style={styles.deleteAction}>
      <ThemedText type="labelLarge" lightColor="#fff" darkColor="#fff">
        Delete
      </ThemedText>
    </View>
  );

  const renderSession = ({ item }: { item: Session }) => {
    const isFull = item.currentParticipants >= item.maxParticipants;
    const isPlanned = plannedSessionIds.has(item.id);
    const isActive = item.status === 'active';
    const isSelected = selectedIds.has(item.id);
    const thumbnailUrl = item.game.thumbnailUrl || fallbackThumbnails[item.game.placeId];
    const visibilityLabel =
      item.visibility === 'public' ? 'Public' : item.visibility === 'friends' ? 'Friends Only' : 'Invite Only';

    const sessionCard = (
      <Card
        style={[
          styles.sessionCard,
          isActive && styles.sessionCardActive,
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

          <View style={styles.thumbnailContainer}>
            {thumbnailUrl ? (
              <Image source={{ uri: thumbnailUrl }} style={styles.thumbnailImage} resizeMode="cover" />
            ) : (
              <View style={[styles.thumbnailImage, styles.thumbnailPlaceholder]}>
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
          </View>

          <View style={styles.sessionInfo}>
            <View style={styles.topRow}>
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
                {isActive && (
                  <View style={styles.activeBadge}>
                    <ThemedText type="labelSmall" lightColor="#fff" darkColor="#fff">
                      Active
                    </ThemedText>
                  </View>
                )}
              </View>
              {isPlanned && (
                <View style={styles.hostBadge}>
                  <ThemedText type="labelSmall" lightColor="#fff" darkColor="#fff">
                    Host
                  </ThemedText>
                </View>
              )}
            </View>

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

            <View style={styles.metadataRow}>
              <ThemedText type="labelSmall" lightColor="#666" darkColor="#aaa">
                {visibilityLabel}
              </ThemedText>
              {item.scheduledStart && (
                <>
                  <ThemedText
                    type="labelSmall"
                    lightColor="#666"
                    darkColor="#aaa"
                    style={styles.metadataSeparator}
                  >
                    •
                  </ThemedText>
                  <ThemedText type="labelSmall" lightColor="#666" darkColor="#aaa">
                    {formatRelativeTime(item.scheduledStart)}
                  </ThemedText>
                </>
              )}
            </View>
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

  if (isLoading && mergedSessions.length === 0) {
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
          ...(selectionMode
            ? {
                headerLeft: () => (
                  <IconButton
                    icon="close"
                    onPress={handleExitSelectionMode}
                    disabled={isDeleting}
                  />
                ),
                headerRight: () => (
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
                ),
              }
            : {}),
        }}
      />
      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />
        }
      >
        <View style={[styles.sectionHeader, { backgroundColor: colorScheme === 'dark' ? '#1c1c1e' : '#fff' }]}>
          <ThemedText type="headlineSmall">Sessions</ThemedText>
        </View>

        {loadError && (
          <View style={styles.errorContainer}>
            <ThemedText type="bodyMedium" lightColor="#c62828" darkColor="#ff5252">
              {loadError}
            </ThemedText>
          </View>
        )}

        {!isLoading && mergedSessions.length === 0 && (
          <View style={styles.sectionEmpty}>
            <ThemedText
              type="bodyMedium"
              lightColor="#666"
              darkColor="#aaa"
            >
              No sessions yet
            </ThemedText>
          </View>
        )}

        {mergedSessions.map((session) => (
          <View key={session.id} style={styles.sessionWrapper}>
            {renderSession({ item: session })}
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
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sessionCardActive: {
    borderWidth: 1,
    borderColor: '#007AFF',
    elevation: 5,
  },
  sessionCardSelected: {
    backgroundColor: '#e3f2fd',
  },
  sessionCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 112,
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
  thumbnailContainer: {
    width: 88,
    height: 88,
    marginLeft: 12,
    marginVertical: 12,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#e0e0e0',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
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
    paddingVertical: 12,
    paddingHorizontal: 12,
    justifyContent: 'center',
    gap: 6,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  title: {
    flex: 1,
    marginRight: 8,
  },
  activeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#007AFF',
    borderRadius: 999,
  },
  hostBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: '#007AFF',
    borderRadius: 4,
  },
  metadataRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
