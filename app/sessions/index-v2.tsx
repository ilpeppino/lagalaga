/**
 * Epic 4 Story 4.3: Browse Sessions UI — Option 2 redesign
 *
 * Custom header (Sessions / subtitle / avatar), compact pill filter,
 * simplified session cards, and a grouped bottom action dock.
 */

import { useState, useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  FlatList,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useFocusEffect, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ActivityIndicator as PaperActivityIndicator, IconButton } from 'react-native-paper';
import { LagaLoadingSpinner } from '@/components/ui/LagaLoadingSpinner';
import { useErrorHandler } from '@/src/lib/errors';
import { getRobloxGameThumbnail } from '@/src/lib/robloxGameThumbnail';
import { getSessionLiveBadge, sessionUiColors } from '@/src/ui/sessionStatusUi';
import { LivePulseDot } from '@/components/LivePulseDot';
import {
  DEFAULT_SESSION_SETTINGS,
  type SessionSettings,
  loadSessionSettings,
} from '@/src/lib/sessionSettings';
import {
  type SessionListFilter,
  applySessionFilter,
  isAutoCompleted,
  isAutoHiddenCompleted,
  sortSessionsForList,
} from '@/src/features/sessions/filtering';
import { apiClient } from '@/src/lib/api';

// ---------------------------------------------------------------------------
// Pure helpers (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Format a timestamp as relative time (e.g., "in 5m", "2h ago").
 * Defined at module level to avoid recreation on every render.
 */
export function formatRelativeTime(isoString: string): string {
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

/**
 * Build the compact metadata string for a session card.
 * Exported for unit testing.
 */
export function buildSessionMetaParts(
  session: Pick<Session, 'visibility' | 'currentParticipants' | 'maxParticipants' | 'scheduledStart'>,
  isLive: boolean
): string[] {
  const visibilityLabel =
    session.visibility === 'public'
      ? 'Public'
      : session.visibility === 'friends'
        ? 'Friends'
        : 'Invite';

  const parts: string[] = [
    visibilityLabel,
    `${session.currentParticipants}/${session.maxParticipants}`,
  ];

  if (session.scheduledStart && !isLive) {
    parts.push(formatRelativeTime(session.scheduledStart));
  }

  return parts;
}

// ---------------------------------------------------------------------------
// Filter segments
// ---------------------------------------------------------------------------

const FILTER_SEGMENTS: { value: SessionListFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'starting_soon', label: 'Soon' },
  { value: 'live', label: 'Live' },
];

// ---------------------------------------------------------------------------
// CollapsibleSessionRow (unchanged from previous implementation)
// ---------------------------------------------------------------------------

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
    marginTop: 10 * collapseProgress.value,
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

// ---------------------------------------------------------------------------
// SessionsListScreenV2
// ---------------------------------------------------------------------------

export default function SessionsListScreenV2() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const { presentError } = useErrorHandler();

  const isDark = colorScheme === 'dark';
  const backgroundColor = Colors[colorScheme].background;
  const textColor = Colors[colorScheme].text;
  const tintColor = Colors[colorScheme].tint;
  const cardColor = isDark ? '#1c1c1e' : '#ffffff';
  const secondaryTextColor = isDark ? '#b3b3b8' : '#5f6368';
  const rowBorderColor = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.09)';
  const segmentBg = isDark ? '#2c2c2e' : '#e5e5ea';
  const segmentActiveBg = isDark ? '#3a3a3c' : '#ffffff';

  // ---------------------------------------------------------------------------
  // Avatar (fetched in background; non-critical)
  // ---------------------------------------------------------------------------
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    apiClient.auth
      .me()
      .then((data) => setAvatarUrl(data.avatarHeadshotUrl))
      .catch(() => {
        // Silently fail — header avatar is not critical
      });
  }, []);

  // ---------------------------------------------------------------------------
  // Sessions state
  // ---------------------------------------------------------------------------
  const [sessions, setSessions] = useState<Session[]>([]);
  const [plannedSessions, setPlannedSessions] = useState<Session[]>([]);
  const [sessionFilter, setSessionFilter] = useState<SessionListFilter>('live');
  const [sessionSettings, setSessionSettings] = useState<SessionSettings>(DEFAULT_SESSION_SETTINGS);
  const [isSettingsLoading, setIsSettingsLoading] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Selection mode
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
  const deleteBackupsRef = useRef<
    Record<string, { active: Session | null; planned: Session | null }>
  >({});

  const LIMIT = 20;

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------
  const loadSettings = useCallback(async () => {
    try {
      setIsSettingsLoading(true);
      const loaded = await loadSessionSettings();
      setSessionSettings(loaded);
    } catch (error) {
      logger.warn('Failed to load session settings on sessions list', {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsSettingsLoading(false);
    }
  }, []);

  const loadAllSessions = useCallback(
    async (refresh = false) => {
      try {
        if (refresh) {
          setIsRefreshing(true);
        } else {
          setIsLoading(true);
        }
        setLoadError(null);

        const statusesToFetch: ('active' | 'scheduled')[] =
          sessionFilter === 'live'
            ? ['active']
            : sessionFilter === 'starting_soon'
              ? ['scheduled']
              : ['active', 'scheduled'];

        const [sessionResults, plannedResult] = await Promise.all([
          Promise.allSettled(
            statusesToFetch.map((status) =>
              sessionsAPIStoreV2.listSessions({ status, limit: LIMIT, offset: 0 })
            )
          ),
          Promise.allSettled([
            sessionsAPIStoreV2.listMyPlannedSessions({ limit: LIMIT, offset: 0 }),
          ]),
        ]);

        const fetchedSessions = new Map<string, Session>();
        sessionResults.forEach((result, index) => {
          const status = statusesToFetch[index];
          if (result.status === 'fulfilled') {
            result.value.sessions.forEach((session) =>
              fetchedSessions.set(session.id, session)
            );
          } else {
            logger.error(`Failed to load ${status} sessions`, {
              error:
                result.reason instanceof Error
                  ? result.reason.message
                  : String(result.reason),
            });
          }
        });

        if (fetchedSessions.size > 0) {
          setSessions(Array.from(fetchedSessions.values()).sort(sortSessionsForList));
        } else if (sessionResults.every((result) => result.status === 'rejected')) {
          setSessions([]);
        }

        const plannedSessionsResult = plannedResult[0];
        if (plannedSessionsResult.status === 'fulfilled') {
          setPlannedSessions(plannedSessionsResult.value.sessions);
        } else {
          logger.error('Failed to load planned sessions', {
            error:
              plannedSessionsResult.reason instanceof Error
                ? plannedSessionsResult.reason.message
                : String(plannedSessionsResult.reason),
          });
        }

        if (
          sessionResults.every((result) => result.status === 'rejected') &&
          plannedSessionsResult.status === 'rejected'
        ) {
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
    },
    [sessionFilter]
  );

  useFocusEffect(
    useCallback(() => {
      void loadSettings();
      loadAllSessions();
    }, [loadAllSessions, loadSettings])
  );

  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  useEffect(() => {
    plannedSessionsRef.current = plannedSessions;
  }, [plannedSessions]);

  useEffect(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, [sessionFilter]);

  // ---------------------------------------------------------------------------
  // Session CRUD handlers
  // ---------------------------------------------------------------------------
  const handleRefresh = useCallback(() => {
    loadAllSessions(true);
  }, [loadAllSessions]);

  const handleDeleteSession = useCallback(
    async (sessionId: string) => {
      if (deletingSessionIds.has(sessionId) || collapsingSessionIds.has(sessionId)) return;

      const activeBackup =
        sessionsRef.current.find((session) => session.id === sessionId) ?? null;
      const plannedBackup =
        plannedSessionsRef.current.find((session) => session.id === sessionId) ?? null;
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
    },
    [collapsingSessionIds, deletingSessionIds]
  );

  const handleCollapsedDelete = useCallback(
    async (sessionId: string) => {
      setSessions((prev) => prev.filter((session) => session.id !== sessionId));
      setPlannedSessions((prev) => prev.filter((session) => session.id !== sessionId));

      try {
        await sessionsAPIStoreV2.deleteSession(sessionId);
        logger.info('Session deleted successfully', { sessionId });
      } catch (error) {
        const backup = deleteBackupsRef.current[sessionId];
        if (backup?.active) {
          setSessions((prev) =>
            prev.some((session) => session.id === sessionId)
              ? prev
              : [...prev, backup.active!]
          );
        }
        if (backup?.planned) {
          setPlannedSessions((prev) =>
            prev.some((session) => session.id === sessionId)
              ? prev
              : [...prev, backup.planned!]
          );
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
    },
    [presentError]
  );

  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;

    try {
      setIsDeleting(true);
      const idsToDelete = Array.from(selectedIds);
      const deletedCount = await sessionsAPIStoreV2.bulkDeleteSessions(idsToDelete);

      setSessions((prev) => prev.filter((s) => !selectedIds.has(s.id)));
      setPlannedSessions((prev) => prev.filter((s) => !selectedIds.has(s.id)));
      setSelectionMode(false);
      setSelectedIds(new Set());

      logger.info('Sessions deleted successfully', { count: deletedCount });
    } catch (error) {
      presentError(error);
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
    setSelectedIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(sessionId)) {
        newSet.delete(sessionId);
      } else {
        newSet.add(sessionId);
      }
      return newSet;
    });
  }, []);

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

  // ---------------------------------------------------------------------------
  // Derived data
  // ---------------------------------------------------------------------------
  const plannedSessionIds = useMemo(
    () => new Set(plannedSessions.map((session) => session.id)),
    [plannedSessions]
  );

  const mergedSessions = useMemo(() => {
    const uniqueSessions = new Map<string, Session>();
    sessions.forEach((session) => uniqueSessions.set(session.id, session));

    const filteredPlannedSessions = plannedSessions.filter((session) => {
      if (sessionFilter === 'live') return session.status === 'active';
      if (sessionFilter === 'starting_soon') return session.status === 'scheduled';
      return session.status === 'active' || session.status === 'scheduled';
    });

    filteredPlannedSessions.forEach((session) => {
      if (!uniqueSessions.has(session.id)) {
        uniqueSessions.set(session.id, session);
      }
    });

    return applySessionFilter(
      Array.from(uniqueSessions.values()).sort(sortSessionsForList),
      sessionFilter,
      sessionSettings
    );
  }, [plannedSessions, sessionFilter, sessionSettings, sessions]);

  const eligiblePlannedSessionIds = useMemo(
    () =>
      mergedSessions
        .filter((session) => plannedSessionIds.has(session.id))
        .map((session) => session.id),
    [mergedSessions, plannedSessionIds]
  );

  const handleToggleAll = useCallback(() => {
    const allSelected = eligiblePlannedSessionIds.every((id) => selectedIds.has(id));
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(eligiblePlannedSessionIds));
    }
  }, [eligiblePlannedSessionIds, selectedIds]);

  // ---------------------------------------------------------------------------
  // Fallback thumbnail fetching (unchanged)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    const pendingIds = Array.from(
      new Set(
        mergedSessions
          .filter((s) => !s.game.thumbnailUrl && s.game.placeId > 0)
          .map((s) => s.game.placeId)
      )
    ).filter((id) => !fallbackThumbnails[id]);

    if (pendingIds.length === 0) return;

    const BATCH_SIZE = 5;
    const fetchBatched = async () => {
      for (let i = 0; i < pendingIds.length; i += BATCH_SIZE) {
        if (cancelled) break;
        await Promise.all(
          pendingIds.slice(i, i + BATCH_SIZE).map(async (placeId) => {
            const url = await getRobloxGameThumbnail(placeId).catch(() => null);
            if (!url || cancelled) return;
            setFallbackThumbnails((prev) =>
              prev[placeId] ? prev : { ...prev, [placeId]: url }
            );
          })
        );
      }
    };

    void fetchBatched();
    return () => {
      cancelled = true;
    };
  }, [mergedSessions, fallbackThumbnails]);

  // ---------------------------------------------------------------------------
  // Dev-only diagnostics
  // ---------------------------------------------------------------------------
  useEffect(() => {
    logger.info('Sessions list filter changed', { filter: sessionFilter });
  }, [sessionFilter]);

  useEffect(() => {
    logger.debug('Sessions list filters applied', {
      filter: sessionFilter,
      visibleCount: mergedSessions.length,
      soonWindowHours: sessionSettings.startingSoonWindowHours,
    });
  }, [mergedSessions.length, sessionFilter, sessionSettings.startingSoonWindowHours]);

  useEffect(() => {
    if (!__DEV__) return;
    const uniqueSessions = new Map<string, Session>();
    sessions.forEach((s) => uniqueSessions.set(s.id, s));
    plannedSessions.forEach((s) => {
      if (!uniqueSessions.has(s.id)) uniqueSessions.set(s.id, s);
    });
    const allSessions = Array.from(uniqueSessions.values());
    const autoCompletedCount = allSessions.filter((s) =>
      isAutoCompleted(s, sessionSettings)
    ).length;
    const autoHiddenCompletedCount = allSessions.filter((s) =>
      isAutoHiddenCompleted(s, sessionSettings)
    ).length;
    if (autoCompletedCount > 0 || autoHiddenCompletedCount > 0) {
      logger.debug('Sessions hidden by local settings', {
        filter: sessionFilter,
        autoCompletedCount,
        autoHiddenCompletedCount,
      });
    }
  }, [plannedSessions, sessionFilter, sessionSettings, sessions]);

  // ---------------------------------------------------------------------------
  // Card renderer
  // ---------------------------------------------------------------------------
  const renderSession = ({ item }: { item: Session }) => {
    const isPlanned = plannedSessionIds.has(item.id);
    const sessionStatusUi = getSessionLiveBadge(item);
    const isLive = sessionStatusUi.isLive;
    const isSelected = selectedIds.has(item.id);
    const isDeletingSession = deletingSessionIds.has(item.id);
    const thumbnailUrl = item.game.thumbnailUrl || fallbackThumbnails[item.game.placeId];

    const metaParts = buildSessionMetaParts(item, isLive);
    const metaText = metaParts.join(' · ');

    const liveCardBg = isDark ? '#0a2218' : '#f0fdf4';
    const cardBg = isLive ? liveCardBg : cardColor;

    const sessionCard = (
      <TouchableOpacity
        activeOpacity={0.75}
        style={[
          styles.card,
          { backgroundColor: cardBg },
          isLive && styles.cardLiveAccent,
          isSelected && [styles.cardSelected, { borderColor: tintColor }],
        ]}
        onPress={() => {
          if (selectionMode && isPlanned) {
            handleToggleSelection(item.id);
          } else {
            router.push(`/sessions/${item.id}`);
          }
        }}
        onLongPress={isPlanned ? () => handleLongPress(item.id) : undefined}
        accessibilityRole="button"
        accessibilityLabel={`${item.title || item.game.gameName || 'Roblox Session'}${isLive ? ', live' : ''}${isPlanned ? ', you host' : ''}`}
      >
        {/* Selection checkbox */}
        {isPlanned && selectionMode ? (
          <View style={styles.checkboxWrap}>
            <View
              style={[
                styles.checkbox,
                isSelected && { backgroundColor: tintColor, borderColor: tintColor },
                !isSelected && { borderColor: rowBorderColor },
              ]}
            >
              {isSelected ? (
                <Text style={styles.checkmark}>✓</Text>
              ) : null}
            </View>
          </View>
        ) : null}

        {/* Thumbnail */}
        <View style={styles.thumbnail}>
          {thumbnailUrl ? (
            <Image source={{ uri: thumbnailUrl }} style={styles.thumbnailImg} resizeMode="cover" />
          ) : (
            <View style={[styles.thumbnailImg, styles.thumbnailPlaceholder]}>
              <Text style={[styles.thumbnailInitial, { color: secondaryTextColor }]}>
                {item.game.gameName?.[0]?.toUpperCase() || '?'}
              </Text>
            </View>
          )}
        </View>

        {/* Session info */}
        <View style={styles.cardInfo}>
          {/* Title row + "You host" chip */}
          <View style={styles.cardTitleRow}>
            <Text
              style={[styles.cardTitle, { color: textColor }]}
              numberOfLines={1}
            >
              {item.title || item.game.gameName || 'Roblox Session'}
            </Text>
            {isPlanned && !selectionMode ? (
              <View style={[styles.youHostChip, { borderColor: tintColor }]}>
                <Text style={[styles.youHostText, { color: tintColor }]}>You host</Text>
              </View>
            ) : null}
          </View>

          {/* Compact metadata row */}
          <View style={styles.metaRow}>
            {isLive ? (
              <>
                <LivePulseDot size={7} color={sessionUiColors.live} />
                <Text style={[styles.metaLive, { color: sessionUiColors.live }]}>Live</Text>
                {metaText.length > 0 ? (
                  <Text style={[styles.metaDot, { color: secondaryTextColor }]}> · </Text>
                ) : null}
              </>
            ) : null}
            <Text style={[styles.metaText, { color: secondaryTextColor }]}>{metaText}</Text>
          </View>
        </View>

        {/* Trailing chevron */}
        {!selectionMode ? (
          <IconSymbol name="chevron.right" size={16} color={rowBorderColor} style={styles.chevron} />
        ) : null}
      </TouchableOpacity>
    );

    // Swipeable delete — planned sessions on native only
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
                  <Text style={styles.deleteActionText}>Delete</Text>
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

    if (isPlanned && !selectionMode && Platform.OS === 'web') {
      return (
        <View style={styles.webDeleteContainer}>
          {sessionCard}
          <TouchableOpacity
            style={[styles.webDeleteButton, isDeletingSession && { opacity: 0.6 }]}
            onPress={() => handleDeleteSession(item.id)}
            disabled={isDeletingSession}
          >
            {isDeletingSession ? (
              <ActivityIndicator size="small" color="#ff3b30" />
            ) : (
              <Text style={{ color: '#ff3b30', fontSize: 13 }}>Delete</Text>
            )}
          </TouchableOpacity>
        </View>
      );
    }

    return sessionCard;
  };

  // ---------------------------------------------------------------------------
  // Derived display values
  // ---------------------------------------------------------------------------
  const allPlannedSelected =
    eligiblePlannedSessionIds.length > 0 &&
    eligiblePlannedSessionIds.every((id) => selectedIds.has(id));

  // Dock height for FlatList bottom padding
  const DOCK_HEIGHT = 72;
  const listBottomPadding = insets.bottom + DOCK_HEIGHT + 20;

  // ---------------------------------------------------------------------------
  // Loading state (initial only — before any data arrives)
  // ---------------------------------------------------------------------------
  if (isLoading && mergedSessions.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor }]}>
        <Stack.Screen options={{ headerShown: false }} />
        {/* Header still shown during load so screen doesn't jump */}
        <View style={[styles.headerArea, { paddingTop: insets.top + 8, backgroundColor }]}>
          <SessionsHeader
            avatarUrl={avatarUrl}
            tintColor={tintColor}
            textColor={textColor}
            secondaryTextColor={secondaryTextColor}
            cardColor={cardColor}
            onAvatarPress={() => router.push('/me')}
          />
          <FilterControl
            value={sessionFilter}
            onChange={setSessionFilter}
            isDark={isDark}
            tintColor={tintColor}
            secondaryTextColor={secondaryTextColor}
            segmentBg={segmentBg}
            segmentActiveBg={segmentActiveBg}
          />
        </View>
        <View style={styles.centered}>
          <LagaLoadingSpinner size={56} label="Loading sessions..." />
        </View>
      </View>
    );
  }

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------
  return (
    <View style={[styles.container, { backgroundColor }]}>
      {/* Stack header — only visible in selection mode */}
      <Stack.Screen
        options={{
          headerShown: selectionMode,
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
                      disabled={isDeleting || eligiblePlannedSessionIds.length === 0}
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

      {/* Custom sticky header — hidden in selection mode */}
      {!selectionMode ? (
        <View style={[styles.headerArea, { paddingTop: insets.top + 8, backgroundColor }]}>
          <SessionsHeader
            avatarUrl={avatarUrl}
            tintColor={tintColor}
            textColor={textColor}
            secondaryTextColor={secondaryTextColor}
            cardColor={cardColor}
            onAvatarPress={() => router.push('/me')}
          />
          <FilterControl
            value={sessionFilter}
            onChange={setSessionFilter}
            isDark={isDark}
            tintColor={tintColor}
            secondaryTextColor={secondaryTextColor}
            segmentBg={segmentBg}
            segmentActiveBg={segmentActiveBg}
          />
        </View>
      ) : null}

      {/* Session list */}
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
        contentContainerStyle={[styles.list, { paddingBottom: listBottomPadding }]}
        refreshing={isRefreshing}
        onRefresh={handleRefresh}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          loadError ? (
            <View style={[styles.errorContainer, { backgroundColor: isDark ? '#3b1212' : '#ffebee' }]}>
              <Text style={{ color: isDark ? '#ff8a80' : '#c62828', fontSize: 14 }}>
                {loadError}
              </Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          !isLoading ? (
            <Animated.View
              entering={FadeInDown.duration(230).withInitialValues({
                opacity: 0,
                transform: [{ translateY: 10 }],
              })}
              style={styles.emptyState}
            >
              <Text style={[styles.emptyText, { color: secondaryTextColor }]}>
                No sessions yet
              </Text>
            </Animated.View>
          ) : null
        }
      />

      {/* Bottom action dock — hidden in selection mode */}
      {!selectionMode ? (
        <View
          style={[
            styles.bottomDock,
            {
              paddingBottom: insets.bottom + 12,
              backgroundColor: isDark ? '#1c1c1e' : '#ffffff',
              borderTopColor: rowBorderColor,
            },
          ]}
        >
          {/* Quick Play */}
          <TouchableOpacity
            style={[styles.dockButton, styles.quickPlayButton]}
            onPress={handleQuickPlay}
            disabled={isQuickStarting}
            accessibilityRole="button"
            accessibilityLabel={isQuickStarting ? 'Starting session…' : 'Quick Play'}
          >
            {isQuickStarting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <IconSymbol name="bolt.fill" size={18} color="#fff" />
            )}
            <Text style={styles.dockButtonText}>
              {isQuickStarting ? 'Starting…' : 'Quick Play'}
            </Text>
          </TouchableOpacity>

          {/* Create */}
          <TouchableOpacity
            style={[styles.dockButton, styles.createButton, { borderColor: tintColor }]}
            onPress={() => router.push('/sessions/create')}
            accessibilityRole="button"
            accessibilityLabel="Create session"
          >
            <IconSymbol name="plus" size={18} color={tintColor} />
            <Text style={[styles.dockButtonText, { color: tintColor }]}>Create</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Sub-components (defined outside to avoid re-creation on render)
// ---------------------------------------------------------------------------

function SessionsHeader({
  avatarUrl,
  tintColor,
  textColor,
  secondaryTextColor,
  cardColor,
  onAvatarPress,
}: {
  avatarUrl: string | null;
  tintColor: string;
  textColor: string;
  secondaryTextColor: string;
  cardColor: string;
  onAvatarPress: () => void;
}) {
  return (
    <View style={styles.headerRow}>
      <View style={styles.headerText}>
        <Text style={[styles.headerTitle, { color: textColor }]}>Sessions</Text>
        <Text style={[styles.headerSubtitle, { color: secondaryTextColor }]}>
          Your Roblox sessions
        </Text>
      </View>

      <TouchableOpacity
        onPress={onAvatarPress}
        style={styles.avatarButton}
        accessibilityRole="button"
        accessibilityLabel="Open profile"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.headerAvatar} />
        ) : (
          <View style={[styles.headerAvatarPlaceholder, { backgroundColor: cardColor }]}>
            <IconSymbol name="person.fill" size={20} color={tintColor} />
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

function FilterControl({
  value,
  onChange,
  isDark,
  tintColor,
  secondaryTextColor,
  segmentBg,
  segmentActiveBg,
}: {
  value: SessionListFilter;
  onChange: (v: SessionListFilter) => void;
  isDark: boolean;
  tintColor: string;
  secondaryTextColor: string;
  segmentBg: string;
  segmentActiveBg: string;
}) {
  return (
    <View style={[styles.filterControl, { backgroundColor: segmentBg }]}>
      {FILTER_SEGMENTS.map((seg) => {
        const isActive = value === seg.value;
        return (
          <TouchableOpacity
            key={seg.value}
            style={[
              styles.filterSegment,
              isActive && [
                styles.filterSegmentActive,
                { backgroundColor: segmentActiveBg },
              ],
            ]}
            onPress={() => onChange(seg.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: isActive }}
            accessibilityLabel={seg.label}
          >
            {seg.value === 'live' ? (
              <LivePulseDot
                size={6}
                color={isActive ? sessionUiColors.live : secondaryTextColor}
              />
            ) : null}
            <Text
              style={[
                styles.filterLabel,
                { color: isActive ? tintColor : secondaryTextColor },
              ]}
            >
              {seg.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
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

  // ---- Header ----
  headerArea: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerText: {
    gap: 2,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 13,
    fontWeight: '400',
  },
  avatarButton: {
    borderRadius: 999,
  },
  headerAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#e0e0e0',
  },
  headerAvatarPlaceholder: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  // ---- Filter ----
  filterControl: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 3,
  },
  filterSegment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    borderRadius: 8,
    gap: 5,
  },
  filterSegmentActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  filterLabel: {
    fontSize: 13,
    fontWeight: '600',
  },

  // ---- List ----
  list: {
    paddingTop: 8,
  },
  emptyState: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 15,
  },
  errorContainer: {
    margin: 16,
    padding: 12,
    borderRadius: 8,
  },
  sessionRowContainer: {
    paddingHorizontal: 16,
  },

  // ---- Cards ----
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    overflow: 'hidden',
    minHeight: 80,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  cardLiveAccent: {
    borderLeftWidth: 3,
    borderLeftColor: sessionUiColors.live,
  },
  cardSelected: {
    borderWidth: 2,
  },
  checkboxWrap: {
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  thumbnail: {
    width: 76,
    height: 76,
    margin: 10,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#e0e0e0',
    flexShrink: 0,
  },
  thumbnailImg: {
    width: '100%',
    height: '100%',
  },
  thumbnailPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbnailInitial: {
    fontSize: 28,
    fontWeight: '700',
  },
  cardInfo: {
    flex: 1,
    paddingVertical: 12,
    paddingRight: 6,
    gap: 5,
    justifyContent: 'center',
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  cardTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  youHostChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
    flexShrink: 0,
  },
  youHostText: {
    fontSize: 10,
    fontWeight: '600',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaLive: {
    fontSize: 12,
    fontWeight: '600',
  },
  metaDot: {
    fontSize: 12,
  },
  metaText: {
    fontSize: 12,
  },
  chevron: {
    paddingRight: 12,
    flexShrink: 0,
  },

  // ---- Swipe delete ----
  swipeableWrapper: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  deleteAction: {
    backgroundColor: '#ff3b30',
    justifyContent: 'center',
    alignItems: 'center',
    width: 88,
    height: '100%',
  },
  deleteActionText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
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

  // ---- Bottom dock ----
  bottomDock: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  dockButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 48,
    borderRadius: 12,
  },
  quickPlayButton: {
    backgroundColor: '#10b981',
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  createButton: {
    borderWidth: 1.5,
  },
  dockButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
