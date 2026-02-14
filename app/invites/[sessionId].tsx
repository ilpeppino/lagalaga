import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/paper';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useErrorHandler } from '@/hooks/useErrorHandler';
import { sessionsAPIStoreV2 } from '@/src/features/sessions/apiStore-v2';
import type { SessionDetail } from '@/src/features/sessions/types-v2';
import { logger } from '@/src/lib/logger';

type InviteState = 'loading' | 'ready' | 'accepting' | 'declining' | 'error';

export default function SessionInviteScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const { getErrorMessage } = useErrorHandler();

  const [state, setState] = useState<InviteState>('loading');
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [participantState, setParticipantState] = useState<string>('invited');
  const [error, setError] = useState<string | null>(null);

  const isBusy = state === 'accepting' || state === 'declining';
  const alreadyJoined = participantState === 'joined';
  const alreadyDeclined = participantState === 'left';
  const isFull = useMemo(() => {
    if (!session) return false;
    return session.currentParticipants >= session.maxParticipants;
  }, [session]);

  const loadInvite = useCallback(async () => {
    if (!sessionId) return;
    try {
      setState('loading');
      setError(null);
      const data = await sessionsAPIStoreV2.getInviteDetails(sessionId);
      setSession(data.session);
      setParticipantState(data.participantState);
      setState('ready');
    } catch (err) {
      setError(getErrorMessage(err, 'Invite not found'));
      setState('error');
    }
  }, [getErrorMessage, sessionId]);

  useEffect(() => {
    void loadInvite();
  }, [loadInvite]);

  const handleAccept = useCallback(async () => {
    if (!sessionId) return;
    try {
      setState('accepting');
      await sessionsAPIStoreV2.joinSession(sessionId);
      router.replace({
        pathname: '/sessions/handoff',
        params: { sessionId },
      } as any);
    } catch (err) {
      const message = getErrorMessage(err, 'Failed to accept invite');
      logger.warn('Failed to accept invite', {
        sessionId,
        error: err instanceof Error ? err.message : String(err),
      });
      Alert.alert('Accept Failed', message);
      setState('ready');
    }
  }, [getErrorMessage, router, sessionId]);

  const handleDecline = useCallback(async () => {
    if (!sessionId) return;
    try {
      setState('declining');
      await sessionsAPIStoreV2.declineInvite(sessionId);
      router.replace('/sessions');
    } catch (err) {
      const message = getErrorMessage(err, 'Failed to decline invite');
      Alert.alert('Decline Failed', message);
      setState('ready');
    }
  }, [getErrorMessage, router, sessionId]);

  if (state === 'loading') {
    return (
      <View style={[styles.centered, { backgroundColor: colorScheme === 'dark' ? '#000' : '#f8f9fa' }]}>
        <ActivityIndicator size="large" color="#007AFF" />
        <ThemedText style={styles.loadingText}>Loading invite...</ThemedText>
      </View>
    );
  }

  if (state === 'error' || !session) {
    return (
      <View style={[styles.centered, { backgroundColor: colorScheme === 'dark' ? '#000' : '#f8f9fa' }]}>
        <ThemedText type="headlineSmall">Invite unavailable</ThemedText>
        <ThemedText style={styles.subtle}>{error ?? 'This invite is no longer available'}</ThemedText>
        <Button title="Back to Sessions" onPress={() => router.replace('/sessions')} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colorScheme === 'dark' ? '#000' : '#f8f9fa' }]}>
      <View style={[styles.card, { backgroundColor: colorScheme === 'dark' ? '#1c1c1e' : '#fff' }]}>
        {session.game?.thumbnailUrl ? (
          <Image source={{ uri: session.game.thumbnailUrl }} style={styles.thumbnail} />
        ) : (
          <View style={[styles.thumbnail, styles.thumbnailPlaceholder]}>
            <ThemedText type="displaySmall">{session.game?.gameName?.[0] ?? '?'}</ThemedText>
          </View>
        )}
        <ThemedText type="labelLarge" lightColor="#007AFF" darkColor="#0a84ff">
          Session Invite
        </ThemedText>
        <ThemedText type="headlineSmall" style={styles.title}>{session.title}</ThemedText>
        {session.game?.gameName ? (
          <ThemedText style={styles.subtle}>{session.game.gameName}</ThemedText>
        ) : null}
        <ThemedText style={styles.subtle}>
          Host: {session.host?.robloxDisplayName || session.host?.robloxUsername || 'Unknown'}
        </ThemedText>
        <ThemedText style={styles.subtle}>
          {session.currentParticipants}/{session.maxParticipants} players
        </ThemedText>
      </View>

      <View style={styles.actions}>
        {alreadyJoined ? (
          <Button
            title="Continue to Handoff"
            onPress={() =>
              router.replace({
                pathname: '/sessions/handoff',
                params: { sessionId },
              } as any)
            }
          />
        ) : (
          <Button
            title={isBusy ? 'Accepting...' : alreadyDeclined ? 'Accept Invite' : 'Accept'}
            onPress={handleAccept}
            disabled={isBusy || isFull}
          />
        )}

        <Button
          title={isBusy ? 'Declining...' : 'Decline'}
          variant="outlined"
          onPress={handleDecline}
          disabled={isBusy || alreadyJoined}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    gap: 16,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    padding: 24,
  },
  loadingText: {
    marginTop: 10,
  },
  card: {
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  thumbnail: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    backgroundColor: '#e6e6e6',
    marginBottom: 8,
  },
  thumbnailPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    marginTop: 2,
  },
  subtle: {
    opacity: 0.75,
  },
  actions: {
    gap: 10,
  },
});
