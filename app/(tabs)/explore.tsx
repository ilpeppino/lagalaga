import { useState, useCallback, useEffect } from 'react';
import { View, StyleSheet, Image, FlatList } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { sessionsAPIStoreV2 } from '@/src/features/sessions/apiStore-v2';
import type { Session } from '@/src/features/sessions/types-v2';
import { ThemedText } from '@/components/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Card } from '@/components/ui/paper';
import { LagaLoadingSpinner } from '@/components/ui/LagaLoadingSpinner';
import { useErrorHandler } from '@/hooks/useErrorHandler';
import { getRobloxGameThumbnail } from '@/src/lib/robloxGameThumbnail';
import { getSessionLiveBadge, sessionUiColors } from '@/src/ui/sessionStatusUi';
import { LivePulseDot } from '@/components/LivePulseDot';
import { logger } from '@/src/lib/logger';

const LIMIT = 20;

export default function ExploreScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const { handleError } = useErrorHandler();

  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [fallbackThumbnails, setFallbackThumbnails] = useState<Record<number, string>>({});

  const loadSessions = useCallback(
    async (refresh = false) => {
      try {
        if (refresh) {
          setIsRefreshing(true);
        } else {
          setIsLoading(true);
        }
        const result = await sessionsAPIStoreV2.listSessions({
          status: 'active',
          limit: LIMIT,
          offset: 0,
        });
        setSessions(result.sessions);
      } catch (error) {
        logger.error('Failed to load explore sessions', {
          error: error instanceof Error ? error.message : String(error),
        });
        if (!refresh) {
          handleError(error, { fallbackMessage: 'Failed to load sessions' });
        }
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [handleError]
  );

  useFocusEffect(
    useCallback(() => {
      loadSessions();
    }, [loadSessions])
  );

  useEffect(() => {
    let cancelled = false;
    const placeIds = Array.from(
      new Set(
        sessions
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
  }, [sessions, fallbackThumbnails]);

  if (isLoading && sessions.length === 0) {
    return (
      <View style={styles.centered}>
        <LagaLoadingSpinner size={56} label="Loading sessions..." />
      </View>
    );
  }

  const renderSession = ({ item }: { item: Session }) => {
    const isFull = item.currentParticipants >= item.maxParticipants;
    const sessionStatusUi = getSessionLiveBadge(item);
    const isLive = sessionStatusUi.isLive;
    const thumbnailUrl = item.game.thumbnailUrl || fallbackThumbnails[item.game.placeId];
    const visibilityLabel =
      item.visibility === 'public'
        ? 'Public'
        : item.visibility === 'friends'
          ? 'Friends Only'
          : 'Invite Only';

    return (
      <View style={styles.sessionRowContainer}>
        <Card
          style={[styles.sessionCard, isLive && styles.sessionCardLive]}
          mode="elevated"
          onPress={() => router.push(`/sessions/${item.id}`)}
        >
          <View style={styles.sessionCardContent}>
            <View style={styles.thumbnailContainer}>
              {thumbnailUrl ? (
                <Image source={{ uri: thumbnailUrl }} style={styles.thumbnailImage} resizeMode="cover" />
              ) : (
                <View style={[styles.thumbnailImage, styles.thumbnailPlaceholder]}>
                  <ThemedText type="displaySmall" lightColor="#999" darkColor="#666">
                    {item.game.gameName?.[0] || '?'}
                  </ThemedText>
                </View>
              )}
            </View>

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
                {isLive && (
                  <View style={styles.liveIndicatorWrap}>
                    <LivePulseDot color={sessionUiColors.live} />
                  </View>
                )}
                {isLive && (
                  <View style={[styles.liveBadge, { backgroundColor: sessionStatusUi.color }]}>
                    <ThemedText
                      type="labelSmall"
                      lightColor={sessionStatusUi.textColor}
                      darkColor={sessionStatusUi.textColor}
                    >
                      {sessionStatusUi.label}
                    </ThemedText>
                  </View>
                )}
              </View>

              <View style={styles.participants}>
                <ThemedText
                  type="labelMedium"
                  lightColor={isFull ? '#ff3b30' : '#007AFF'}
                  darkColor={isFull ? '#ff453a' : '#0a84ff'}
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

              <ThemedText type="labelSmall" lightColor="#666" darkColor="#aaa">
                {visibilityLabel}
              </ThemedText>
            </View>
          </View>
        </Card>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colorScheme === 'dark' ? '#000' : '#f8f9fa' }]}>
      <FlatList
        data={sessions}
        keyExtractor={(item) => item.id}
        renderItem={renderSession}
        contentContainerStyle={styles.list}
        refreshing={isRefreshing}
        onRefresh={() => loadSessions(true)}
        ListHeaderComponent={
          <View
            style={[
              styles.sectionHeader,
              { backgroundColor: colorScheme === 'dark' ? '#1c1c1e' : '#fff' },
            ]}
          >
            <ThemedText type="headlineSmall">Live Sessions</ThemedText>
          </View>
        }
        ListEmptyComponent={
          !isLoading ? (
            <Animated.View
              entering={FadeInDown.duration(230).withInitialValues({
                opacity: 0,
                transform: [{ translateY: 10 }],
              })}
              style={styles.empty}
            >
              <ThemedText type="bodyMedium" lightColor="#666" darkColor="#aaa">
                No active sessions right now
              </ThemedText>
            </Animated.View>
          ) : null
        }
      />
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
  sectionHeader: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  sessionRowContainer: {
    paddingHorizontal: 16,
    marginTop: 12,
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
  sessionCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 112,
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
  sessionInfo: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    justifyContent: 'center',
    gap: 6,
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
  liveIndicatorWrap: {
    marginRight: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  participants: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fullBadge: {
    marginLeft: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: '#ff3b30',
    borderRadius: 4,
  },
  empty: {
    padding: 20,
    alignItems: 'center',
  },
  list: {
    paddingBottom: 24,
  },
});
