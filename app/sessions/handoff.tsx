import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, Image, ScrollView, Alert, ActivityIndicator, Linking } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { sessionsAPIStoreV2 } from '@/src/features/sessions/apiStore-v2';
import type { SessionDetail } from '@/src/features/sessions/types-v2';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/paper';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { launchRobloxGame } from '@/src/services/roblox-launcher';
import { getRobloxGameThumbnail } from '@/src/lib/robloxGameThumbnail';
import { logger } from '@/src/lib/logger';

export default function SessionHandoffScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const router = useRouter();
  const colorScheme = useColorScheme();

  const [session, setSession] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<'open' | 'confirm' | 'stuck' | null>(null);
  const [fallbackThumbnail, setFallbackThumbnail] = useState<string | null>(null);
  const [presenceLabel, setPresenceLabel] = useState('Checking...');
  const [presenceAvailable, setPresenceAvailable] = useState(true);

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

      const presence = await sessionsAPIStoreV2.getRobloxPresence([detail.hostId]);
      if (!presence.available) {
        setPresenceAvailable(false);
        setPresenceLabel('Presence unavailable - connect Roblox to enable');
      } else {
        setPresenceAvailable(true);
        const status = presence.statuses?.[0]?.status || 'unknown';
        setPresenceLabel(
          status === 'in_game'
            ? 'In game'
            : status === 'online'
              ? 'Online'
              : status === 'offline'
                ? 'Offline'
                : 'Unknown'
        );
      }
    } catch (error) {
      logger.warn('Failed to load handoff data', {
        error: error instanceof Error ? error.message : String(error),
      });
      setPresenceAvailable(false);
      setPresenceLabel('Presence unavailable - connect Roblox to enable');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    load();
  }, [load]);

  const thumbnailUrl = useMemo(
    () => session?.game.thumbnailUrl || fallbackThumbnail,
    [session?.game.thumbnailUrl, fallbackThumbnail]
  );

  const handleOpenRoblox = useCallback(async () => {
    if (!session) return;

    setBusyAction('open');
    sessionsAPIStoreV2.updateHandoffState(session.id, 'opened_roblox').catch((error) => {
      logger.warn('Failed to update handoff state: opened_roblox', {
        error: error instanceof Error ? error.message : String(error),
      });
    });

    try {
      await launchRobloxGame(session.game.placeId, session.game.canonicalStartUrl);
    } catch (error) {
      Alert.alert('Error', 'Failed to open Roblox. Please try again.');
    } finally {
      setBusyAction(null);
    }
  }, [session]);

  const handleConfirm = useCallback(async () => {
    if (!session) return;
    try {
      setBusyAction('confirm');
      await sessionsAPIStoreV2.updateHandoffState(session.id, 'confirmed_in_game');
      Alert.alert('Confirmed', "Great - we've updated your status for the host.");
      await load();
    } catch (error) {
      Alert.alert('Error', 'Failed to confirm state. Please try again.');
    } finally {
      setBusyAction(null);
    }
  }, [load, session]);

  const handleStuck = useCallback(async () => {
    if (!session) return;
    try {
      setBusyAction('stuck');
      await sessionsAPIStoreV2.updateHandoffState(session.id, 'stuck');
      Alert.alert('Updated', 'The host can now see that you need help.');
      await load();
    } catch (error) {
      Alert.alert('Error', 'Failed to update state. Please try again.');
    } finally {
      setBusyAction(null);
    }
  }, [load, session]);

  const handleConnectRoblox = useCallback(async () => {
    try {
      const { authorizationUrl, state } = await sessionsAPIStoreV2.getRobloxConnectUrl();
      await AsyncStorage.setItem('roblox_connect_state', state);
      await Linking.openURL(authorizationUrl);
    } catch {
      Alert.alert('Error', 'Failed to start Roblox connect flow.');
    }
  }, []);

  if (loading || !session) {
    return (
      <View style={[styles.centered, { backgroundColor: colorScheme === 'dark' ? '#000' : '#fff' }]}>
        <ActivityIndicator size="large" color="#007AFF" />
        <ThemedText type="bodyLarge" style={styles.loadingText}>Loading handoff...</ThemedText>
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: colorScheme === 'dark' ? '#000' : '#fff' }]} contentContainerStyle={styles.content}>
      <ThemedText type="headlineSmall" style={styles.title}>Join Handoff</ThemedText>

      {thumbnailUrl ? (
        <Image source={{ uri: thumbnailUrl }} style={styles.thumbnail} />
      ) : (
        <View style={[styles.thumbnail, styles.thumbnailFallback]} />
      )}

      <ThemedText type="titleLarge" style={styles.gameName}>{session.game.gameName || 'Roblox Game'}</ThemedText>

      <View style={styles.hostRow}>
        {session.host?.avatarHeadshotUrl ? (
          <Image source={{ uri: session.host.avatarHeadshotUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]} />
        )}
        <View style={styles.hostTextWrap}>
          <ThemedText type="labelLarge">Host</ThemedText>
          <ThemedText type="bodyLarge">{session.host?.robloxDisplayName || session.host?.robloxUsername || session.hostId}</ThemedText>
          <ThemedText type="bodySmall" lightColor="#666" darkColor="#999">Presence: {presenceLabel}</ThemedText>
        </View>
      </View>

      <View style={styles.instructions}>
        <ThemedText type="titleMedium">How to join</ThemedText>
        <ThemedText type="bodyLarge" style={styles.step}>1. Open Roblox</ThemedText>
        <ThemedText type="bodyLarge" style={styles.step}>2. Join host via Friends - Join or Party invite</ThemedText>
        <ThemedText type="bodyLarge" style={styles.step}>3. Return here and tap I&apos;m in</ThemedText>
      </View>

      <Button
        title="Open Roblox"
        variant="filled"
        buttonColor="#007AFF"
        textColor="#fff"
        style={styles.button}
        onPress={handleOpenRoblox}
        loading={busyAction === 'open'}
      />

      <Button
        title="I'm in"
        variant="filled"
        buttonColor="#34C759"
        textColor="#fff"
        style={styles.button}
        onPress={handleConfirm}
        loading={busyAction === 'confirm'}
      />

      <Button
        title="I'm stuck"
        variant="outlined"
        textColor="#ff3b30"
        style={styles.button}
        onPress={handleStuck}
        loading={busyAction === 'stuck'}
      />

      {!presenceAvailable && (
        <Button
          title="Connect Roblox for Presence"
          variant="outlined"
          textColor="#007AFF"
          style={styles.button}
          onPress={handleConnectRoblox}
        />
      )}

      <Button
        title="Back to Session"
        variant="text"
        textColor="#007AFF"
        onPress={() => router.back()}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingBottom: 40, gap: 14 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: 10 },
  title: { textAlign: 'center' },
  thumbnail: { width: '100%', height: 180, borderRadius: 12, backgroundColor: '#f0f0f0' },
  thumbnailFallback: { backgroundColor: '#ddd' },
  gameName: { textAlign: 'center' },
  hostRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  hostTextWrap: { flex: 1 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#ddd' },
  avatarFallback: { backgroundColor: '#ddd' },
  instructions: { borderRadius: 10, backgroundColor: '#f5f7ff', padding: 12, gap: 6 },
  step: { lineHeight: 22 },
  button: { marginTop: 4 },
});
