/**
 * SessionHandoffScreen
 *
 * Guides the current user through the lobby → Roblox → confirmed-in-game flow.
 * Uses LaunchProgressPanel for the staged launch state machine.
 * Shows squad readiness (ParticipantReadinessList) for awareness.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, Image, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { sessionsAPIStoreV2 } from '@/src/features/sessions/apiStore-v2';
import type { SessionDetail } from '@/src/features/sessions/types-v2';
import { ThemedText } from '@/components/themed-text';
import { AnimatedButton as Button } from '@/components/ui/paper';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/src/features/auth/useAuth';
import { getRobloxGameThumbnail } from '@/src/lib/robloxGameThumbnail';
import { logger } from '@/src/lib/logger';
import { monitoring } from '@/src/lib/monitoring';
import { LagaLoadingSpinner } from '@/components/ui/LagaLoadingSpinner';
import { LaunchProgressPanel } from '@/components/session/LaunchProgressPanel';
import { ParticipantReadinessList } from '@/components/session/ParticipantReadinessList';

export default function SessionHandoffScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { user } = useAuth();

  const [session, setSession] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [fallbackThumbnail, setFallbackThumbnail] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    try {
      const detail = await sessionsAPIStoreV2.getSessionById(sessionId);
      setSession(detail);

      if (!detail.game.thumbnailUrl && detail.game.placeId > 0) {
        const thumbnail = await getRobloxGameThumbnail(detail.game.placeId);
        setFallbackThumbnail(thumbnail);
      }

      logger.info('handoff: session loaded', { sessionId });
      monitoring.addBreadcrumb({
        category: 'navigation',
        level: 'info',
        message: 'handoff screen opened',
        data: { sessionId },
      });
    } catch (error) {
      logger.warn('handoff: failed to load session', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const thumbnailUrl = useMemo(
    () => session?.game.thumbnailUrl || fallbackThumbnail,
    [session?.game.thumbnailUrl, fallbackThumbnail]
  );

  const handleConfirmed = useCallback(() => {
    // Reload session so the readiness list updates
    void load();
  }, [load]);

  const handleStuck = useCallback(() => {
    void load();
  }, [load]);

  if (loading || !session) {
    return (
      <View
        style={[styles.centered, { backgroundColor: isDark ? '#000' : '#fff' }]}
      >
        <LagaLoadingSpinner size={56} label="Loading handoff…" />
      </View>
    );
  }

  const hasParticipants = session.participants.length > 0;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: isDark ? '#000' : '#fff' }]}
      contentContainerStyle={styles.content}
    >
      {/* Game thumbnail */}
      {thumbnailUrl ? (
        <Image source={{ uri: thumbnailUrl }} style={styles.thumbnail} />
      ) : (
        <View style={[styles.thumbnail, styles.thumbnailFallback]} />
      )}

      {/* Game name + session title */}
      <ThemedText type="titleLarge" style={styles.gameName}>
        {session.game.gameName || 'Roblox Game'}
      </ThemedText>
      <ThemedText type="bodyMedium" lightColor="#8E8E93" darkColor="#636366" style={styles.sessionTitle}>
        {session.title}
      </ThemedText>

      {/* Squad readiness — shown when there are participants */}
      {hasParticipants && (
        <ParticipantReadinessList
          session={session}
          currentUserId={user?.id}
          defaultExpanded
        />
      )}

      {/* Launch flow panel — only if user is authenticated */}
      {user?.id ? (
        <>
          <ThemedText
            type="labelSmall"
            lightColor="#8E8E93"
            darkColor="#636366"
            style={styles.launchLabel}
          >
            YOUR LAUNCH
          </ThemedText>
          <LaunchProgressPanel
            session={session}
            userId={user.id}
            onConfirmed={handleConfirmed}
            onStuck={handleStuck}
          />
        </>
      ) : null}

      <Button
        title="Back to Session"
        variant="text"
        textColor="#007AFF"
        style={styles.backBtn}
        onPress={() => router.back()}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingBottom: 48, gap: 14 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  thumbnail: {
    width: '100%',
    height: 160,
    borderRadius: 14,
    backgroundColor: '#f0f0f0',
  },
  thumbnailFallback: { backgroundColor: '#ddd' },
  gameName: { textAlign: 'center', fontWeight: '700' },
  sessionTitle: { textAlign: 'center', marginTop: -8 },
  launchLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: 4,
  },
  backBtn: { alignSelf: 'center', marginTop: 8 },
});
