/**
 * Epic 4 Story 4.3: Browse Sessions UI
 */

import { useState, useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import {
  View,
  StyleSheet,
  Image,
  FlatList,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { useRouter, useFocusEffect, Stack } from 'expo-router';
import { Swipeable } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  FadeInDown,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { sessionsAPIStoreV2 } from '@/src/features/sessions/apiStore-v2';
import type { Session } from '@/src/features/sessions/types-v2';
import { logger } from '@/src/lib/logger';
import { ThemedText } from '@/components/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Card } from '@/components/ui/paper';
import { ActivityIndicator, FAB, IconButton } from 'react-native-paper';
import { useErrorHandler } from '@/src/lib/errors';
import { getRobloxGameThumbnail } from '@/src/lib/robloxGameThumbnail';
import { getSessionLiveBadge, sessionUiColors } from '@/src/ui/sessionStatusUi';
import { LivePulseDot } from '@/components/LivePulseDot';

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

function CollapsibleSessionRow({
  sessionId,
  isCollapsing,
  onCollapsed,
  children,
}: {
  sessionId: string;
  isCollapsing: boolean;
  onCollapsed: (sessionId: string) => void;
  children: ReactNode;
}) {
  const [measuredHeight, setMeasuredHeight] = useState<number | null>(null);
  const collapseProgress = useSharedValue(1);
  const collapsedOnceRef = useRef(false);

  const notifyCollapsed = useCallback(() => {
    if (collapsedOnceRef.current) return;
    collapsedOnceRef.current = true;
    onCollapsed(sessionId);
  }, [onCollapsed, sessionId]);

  useEffect(() => {
    if (isCollapsing) {
      collapseProgress.value = withTiming(
        0,
        { duration: 200, easing: Easing.out(Easing.quad) },
        (finished) => {
          if (finished) {
            runOnJS(notifyCollapsed)();
          }
        }
      );
      return;
    }

    collapsedOnceRef.current = false;
    collapseProgress.value = withTiming(1, { duration: 140, easing: Easing.out(Easing.quad) });
  }, [collapseProgress, isCollapsing, notifyCollapsed]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 0.1 + collapseProgress.value * 0.9,
    transform: [{ scaleY: 0.96 + collapseProgress.value * 0.04 }],
    height: measuredHeight == null ? undefined : measuredHeight * collapseProgress.value,
    marginTop: 12 * collapseProgress.value,
  }));

  return (
    <Animated.View
      style={[styles.sessionRowContainer, animatedStyle]}
      onLayout={(event) => {
        if (measuredHeight == null) {
          setMeasuredHeight(event.nativeEvent.layout.height);
        }
      }}
    >
      {children}
    </Animated.View>
  );
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
  const [deletingSessionIds, setDeletingSessionIds] = useState<Set<string>>(new Set());
  const [collapsingSessionIds, setCollapsingSessionIds] = useState<Set<string>>(new Set());
  const [isQuickStarting, setIsQuickStarting] = useState(false);
  const [fallbackThumbnails, setFallbackThumbnails] = useState<Record<number, string>>({});
  const swipeableRefs = useRef<Record<string, Swipeable | null>>({});
  const sessionsRef = useRef<Session[]>([]);
  const plannedSessionsRef = useRef<Session[]>([]);
  const deleteBackupsRef = useRef<Record<string, { active: Session | null; planned: Session | null }>>({});

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

  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  useEffect(() => {
    plannedSessionsRef.current = plannedSessions;
  }, [plannedSessions]);

  const handleRefresh = useCallback(() => {
    loadAllSessions(true);
  }, [loadAllSessions]);

  const handleDeleteSession = useCallback(async (sessionId: string) => {
    if (deletingSessionIds.has(sessionId) || collapsingSessionIds.has(sessionId)) return;

    const activeBackup = sessionsRef.current.find((session) => session.id === sessionId) ?? null;
    const plannedBackup = plannedSessionsRef.current.find((session) => session.id === sessionId) ?? null;
    if (!activeBackup && !plannedBackup) return;

    deleteBackupsRef.current[sessionId] = { active: activeBackup, planned: plannedBackup };

    setDeletingSessionIds((current) => {
      const next = new Set(current);
      next.add(sessionId);
      return next;
    });
    setCollapsingSessionIds((current) => {
      const next = new Set(current);
      next.add(sessionId);
      return next;
    });
    swipeableRefs.current[sessionId]?.close();
  }, [collapsingSessionIds, deletingSessionIds]);

  const handleCollapsedDelete = useCallback(async (sessionId: string) => {
    setSessions((prev) => prev.filter((session) => session.id !== sessionId));
    setPlannedSessions((prev) => prev.filter((session) => session.id !== sessionId));

    try {
      await sessionsAPIStoreV2.deleteSession(sessionId);
      logger.info('Session deleted successfully', { sessionId });
    } catch (error) {
      const backup = deleteBackupsRef.current[sessionId];
      if (backup?.active) {
        setSessions((prev) => (prev.some((session) => session.id === sessionId) ? prev : [...prev, backup.active!]));
      }
      if (backup?.planned) {
        setPlannedSessions((prev) => (prev.some((session) => session.id === sessionId) ? prev : [...prev, backup.planned!]));
      }
      presentError(error, { fallbackMessage: 'Failed to delete session. Please try again.' });
    } finally {
      delete deleteBackupsRef.current[sessionId];
      setDeletingSessionIds((current) => {
        const next = new Set(current);
        next.delete(sessionId);
        return next;
      });
      setCollapsingSessionIds((current) => {
        const next = new Set(current);
        next.delete(sessionId);
        return next;
      });
    }
  }, [presentError]);

  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;

    try {
      setIsDeleting(true);
      const idsToDelete = Array.from(selectedIds);
      const deletedCount = await sessionsAPIStoreV2.bulkDeleteSessions(idsToDelete);

      // Optimistically remove from UI
      setSessions(prev => prev.filter(s => !selectedIds.has(s.id)));
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

  const handleQuickPlay = useCallback(async () => {
    try {
      setIsQuickStarting(true);
      const result = await sessionsAPIStoreV2.createQuickSession();
      router.push({
        pathname: '/sessions/[id]',
        params: {
          id: result.session.id,
          inviteLink: result.inviteLink,
          justCreated: 'true',
        },
      });
    } catch (error) {
      presentError(error);
    } finally {
      setIsQuickStarting(false);
    }
  }, [presentError, router]);

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

  const renderSession = ({ item }: { item: Session }) => {
    const isFull = item.currentParticipants >= item.maxParticipants;
    const isPlanned = plannedSessionIds.has(item.id);
    const sessionStatusUi = getSessionLiveBadge(item);
    const isLive = sessionStatusUi.isLive;
    const isSelected = selectedIds.has(item.id);
    const isDeletingSession = deletingSessionIds.has(item.id);
    const thumbnailUrl = item.game.thumbnailUrl || fallbackThumbnails[item.game.placeId];
    const visibilityLabel =
      item.visibility === 'public' ? 'Public' : item.visibility === 'friends' ? 'Friends Only' : 'Invite Only';

    const sessionCard = (
      <Card
        style={[
          styles.sessionCard,
          isLive && styles.sessionCardLive,
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
                {isLive && (
                  <View style={styles.liveIndicatorWrap}>
                    <LivePulseDot color={sessionUiColors.live} />
                  </View>
                )}
                {isLive && (
                  <View style={[styles.liveBadge, { backgroundColor: sessionStatusUi.color }]}>
                    <ThemedText type="labelSmall" lightColor={sessionStatusUi.textColor} darkColor={sessionStatusUi.textColor}>
                      {sessionStatusUi.label}
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
        <View style={styles.swipeableWrapper}>
          <Swipeable
            ref={(instance) => {
              swipeableRefs.current[item.id] = instance;
            }}
            renderRightActions={() => (
              <View style={styles.deleteAction}>
                {isDeletingSession ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <ThemedText type="labelLarge" lightColor="#fff" darkColor="#fff">
                    Delete
                  </ThemedText>
                )}
              </View>
            )}
            onSwipeableOpen={(direction) => {
              if (direction === 'right') {
                handleDeleteSession(item.id);
              }
            }}
            friction={1.8}
            rightThreshold={36}
            overshootRight={false}
            overshootFriction={8}
            enableTrackpadTwoFingerGesture
          >
            {sessionCard}
          </Swipeable>
        </View>
      );
    }

    // For web or when in selection mode, provide a simple delete button (optional)
    if (isPlanned && !selectionMode && Platform.OS === 'web') {
      return (
        <View style={styles.webDeleteContainer}>
          {sessionCard}
          <TouchableOpacity
            style={[styles.webDeleteButton, isDeletingSession && styles.webDeleteButtonDisabled]}
            onPress={() => handleDeleteSession(item.id)}
            disabled={isDeletingSession}
          >
            {isDeletingSession ? (
              <ActivityIndicator size="small" color="#ff3b30" />
            ) : (
              <ThemedText type="labelSmall" lightColor="#ff3b30" darkColor="#ff453a">
                Delete
              </ThemedText>
            )}
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
          title: selectionMode ? `${selectedIds.size} Selected` : '',
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
      <FlatList
        data={mergedSessions}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <CollapsibleSessionRow
            sessionId={item.id}
            isCollapsing={collapsingSessionIds.has(item.id)}
            onCollapsed={handleCollapsedDelete}
          >
            {renderSession({ item })}
          </CollapsibleSessionRow>
        )}
        contentContainerStyle={styles.list}
        refreshing={isRefreshing}
        onRefresh={handleRefresh}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={(
          <>
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
          </>
        )}
        ListEmptyComponent={!isLoading ? (
          <Animated.View
            entering={FadeInDown.duration(230).withInitialValues({
              opacity: 0,
              transform: [{ translateY: 10 }],
            })}
            style={styles.sectionEmpty}
          >
            <ThemedText type="bodyMedium" lightColor="#666" darkColor="#aaa">
              No sessions yet
            </ThemedText>
          </Animated.View>
        ) : null}
      />

      {!selectionMode && (
        <View style={styles.fabStack}>
          <FAB
            icon="flash"
            label={isQuickStarting ? 'Starting...' : 'Quick Play'}
            style={styles.quickPlayFab}
            color="#fff"
            loading={isQuickStarting}
            disabled={isQuickStarting}
            onPress={handleQuickPlay}
          />
          <FAB
            icon="plus"
            style={styles.fab}
            color="#fff"
            onPress={() => router.push('/sessions/create')}
          />
        </View>
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
  sessionRowContainer: {
    paddingHorizontal: 16,
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
  swipeableWrapper: {
    borderRadius: 12,
    overflow: 'hidden',
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
  sessionCardLive: {
    borderWidth: 1,
    borderColor: sessionUiColors.live,
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
  liveBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  liveIndicatorWrap: {
    marginRight: 4,
    alignItems: 'center',
    justifyContent: 'center',
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
    width: 104,
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
  webDeleteButtonDisabled: {
    opacity: 0.6,
  },
  footer: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  fabStack: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    gap: 12,
    alignItems: 'flex-end',
  },
  quickPlayFab: {
    backgroundColor: '#10b981',
  },
  fab: {
    backgroundColor: '#007AFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 8,
  },
});
