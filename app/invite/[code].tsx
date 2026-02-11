/**
 * Epic 5 Story 5.2: Join via Invite Link
 *
 * Handles deep links: lagalaga://invite/:code
 */

import { useCallback, useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { sessionsAPIStoreV2 } from '@/src/features/sessions/apiStore-v2';
import type { Session } from '@/src/features/sessions/types-v2';
import { useAuth } from '@/src/features/auth/useAuth';
import { useErrorHandler } from '@/hooks/useErrorHandler';
import { logger } from '@/src/lib/logger';
import { isApiError } from '@/src/lib/errors';
import { ThemedText } from '@/components/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Button } from '@/components/ui/paper';

type InviteState = 'loading' | 'preview' | 'joining' | 'error' | 'login_required';

export default function InviteScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { getErrorMessage } = useErrorHandler();
  const colorScheme = useColorScheme();

  const [state, setState] = useState<InviteState>('loading');
  const [session, setSession] = useState<Partial<Session> | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAutoJoin = useCallback(async (id: string) => {
    try {
      setState('joining');
      await sessionsAPIStoreV2.joinSession(id, code);
      router.replace(`/sessions/${id}`);
    } catch (err) {
      logger.warn('Failed to auto-join session', {
        sessionId: id,
        error: err instanceof Error ? err.message : String(err),
      });

      // If already joined, just navigate to the session
      if (isApiError(err) && err.code === 'SESSION_003') {
        router.replace(`/sessions/${id}`);
      } else if (err instanceof Error && err.message.includes('already joined')) {
        router.replace(`/sessions/${id}`);
      } else {
        const message = getErrorMessage(err, 'Failed to join session');
        Alert.alert('Join Failed', message, [
          {
            text: 'View Session',
            onPress: () => router.replace(`/sessions/${id}`),
          },
        ]);
        setState('preview');
      }
    }
  }, [code, getErrorMessage, router]);

  const loadInvite = useCallback(async () => {
    try {
      setState('loading');
      setError(null);

      const response = await sessionsAPIStoreV2.getSessionByInviteCode(code);
      setSession(response.session);
      setSessionId(response.sessionId);

      if (user) {
        await handleAutoJoin(response.sessionId);
      } else {
        setState('login_required');
      }
    } catch (err) {
      const message = getErrorMessage(err, 'Invalid invite code');
      logger.error('Failed to load invite', {
        code,
        error: err instanceof Error ? err.message : String(err),
      });
      setError(message);
      setState('error');
    }
  }, [code, getErrorMessage, handleAutoJoin, user]);

  useEffect(() => {
    loadInvite();
  }, [loadInvite]);

  const handleManualJoin = async () => {
    if (!sessionId) return;

    try {
      setState('joining');
      await sessionsAPIStoreV2.joinSession(sessionId, code);
      router.replace(`/sessions/${sessionId}`);
    } catch (err) {
      const message = getErrorMessage(err, 'Failed to join session');
      Alert.alert('Error', message);
      setState('preview');
    }
  };

  const handleLogin = () => {
    router.push({
      pathname: '/auth/sign-in',
      params: { returnTo: `/invite/${code}` },
    });
  };

  if (state === 'loading') {
    return (
      <View style={[styles.centered, { backgroundColor: colorScheme === 'dark' ? '#000' : '#f8f9fa' }]}>
        <ActivityIndicator size="large" color="#007AFF" />
        <ThemedText type="bodyLarge" lightColor="#666" darkColor="#999" style={styles.loadingText}>
          Loading invite...
        </ThemedText>
      </View>
    );
  }

  if (state === 'error') {
    return (
      <View style={[styles.centered, { backgroundColor: colorScheme === 'dark' ? '#000' : '#f8f9fa' }]}>
        <View style={styles.errorIcon}>
          <ThemedText type="displaySmall" lightColor="#c62828" darkColor="#ef5350">
            X
          </ThemedText>
        </View>
        <ThemedText type="headlineSmall" style={styles.errorTitle}>
          Invalid Invite
        </ThemedText>
        <ThemedText type="bodyLarge" lightColor="#666" darkColor="#999" style={styles.errorMessage}>
          {error || 'This invite link is not valid or has expired'}
        </ThemedText>
        <Button
          title="Go Back"
          variant="filled"
          buttonColor="#007AFF"
          style={styles.button}
          contentStyle={styles.buttonContent}
          labelStyle={styles.buttonLabel}
          onPress={() => router.back()}
        />
      </View>
    );
  }

  if (state === 'joining') {
    return (
      <View style={[styles.centered, { backgroundColor: colorScheme === 'dark' ? '#000' : '#f8f9fa' }]}>
        <ActivityIndicator size="large" color="#007AFF" />
        <ThemedText type="bodyLarge" lightColor="#666" darkColor="#999" style={styles.loadingText}>
          Joining session...
        </ThemedText>
      </View>
    );
  }

  if (!session) return null;

  const isFull =
    session.currentParticipants && session.maxParticipants
      ? session.currentParticipants >= session.maxParticipants
      : false;

  return (
    <View style={[styles.container, { backgroundColor: colorScheme === 'dark' ? '#000' : '#f8f9fa' }]}>
      <View style={styles.content}>
        {/* Session Preview */}
        <View style={[styles.preview, { backgroundColor: colorScheme === 'dark' ? '#1c1c1e' : '#fff' }]}>
          {session.game?.thumbnailUrl ? (
            <Image
              source={{ uri: session.game.thumbnailUrl }}
              style={styles.thumbnail}
            />
          ) : (
            <View style={[styles.thumbnail, styles.thumbnailPlaceholder]}>
              <ThemedText type="displayMedium" lightColor="#999" darkColor="#666">
                {session.game?.gameName?.[0] || '?'}
              </ThemedText>
            </View>
          )}

          <View style={styles.info}>
            <ThemedText type="labelLarge" lightColor="#007AFF" darkColor="#0a84ff" style={styles.inviteTitle}>
              You have been invited!
            </ThemedText>

            <ThemedText type="headlineSmall" style={styles.sessionTitle} numberOfLines={2}>
              {session.title || 'Gaming Session'}
            </ThemedText>

            {session.game?.gameName && (
              <ThemedText type="bodyLarge" lightColor="#666" darkColor="#999" style={styles.gameName}>
                {session.game.gameName}
              </ThemedText>
            )}

            {session.currentParticipants !== undefined &&
              session.maxParticipants !== undefined && (
                <View style={styles.participants}>
                  <ThemedText
                    type="labelLarge"
                    lightColor={isFull ? '#ff3b30' : '#007AFF'}
                    darkColor={isFull ? '#ff453a' : '#0a84ff'}
                  >
                    {session.currentParticipants}/{session.maxParticipants} players
                  </ThemedText>
                  {isFull && (
                    <ThemedText type="labelSmall" lightColor="#fff" darkColor="#fff" style={styles.fullBadge}>
                      FULL
                    </ThemedText>
                  )}
                </View>
              )}
          </View>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          {state === 'login_required' && (
            <>
              <ThemedText type="bodyLarge" lightColor="#666" darkColor="#999" style={styles.infoText}>
                Sign in to join this session and start playing!
              </ThemedText>

              <Button
                title="Sign In to Join"
                variant="filled"
                buttonColor="#007AFF"
                textColor="#fff"
                style={styles.primaryButton}
                contentStyle={styles.primaryButtonContent}
                labelStyle={styles.primaryButtonLabel}
                onPress={handleLogin}
              />

              {sessionId && (
                <Button
                  title="View Session"
                  variant="outlined"
                  textColor="#007AFF"
                  style={[styles.secondaryButton, { backgroundColor: colorScheme === 'dark' ? '#2c2c2e' : '#f0f0f0' }]}
                  onPress={() => router.push(`/sessions/${sessionId}`)}
                />
              )}
            </>
          )}

          {state === 'preview' && user && (
            <>
              {!isFull ? (
                <>
                  <Button
                    title="Join Session"
                    variant="filled"
                    buttonColor="#007AFF"
                    textColor="#fff"
                    style={styles.primaryButton}
                    contentStyle={styles.primaryButtonContent}
                    labelStyle={styles.primaryButtonLabel}
                    onPress={handleManualJoin}
                  />

                  {sessionId && (
                    <Button
                      title="View Details"
                      variant="outlined"
                      textColor="#007AFF"
                      style={[styles.secondaryButton, { backgroundColor: colorScheme === 'dark' ? '#2c2c2e' : '#f0f0f0' }]}
                      onPress={() => router.push(`/sessions/${sessionId}`)}
                    />
                  )}
                </>
              ) : (
                <>
                  <View style={[styles.fullMessage, { backgroundColor: colorScheme === 'dark' ? '#3a1a1a' : '#ffebee' }]}>
                    <ThemedText type="bodyLarge" lightColor="#c62828" darkColor="#ef5350">
                      This session is full
                    </ThemedText>
                  </View>

                  {sessionId && (
                    <Button
                      title="View Session Anyway"
                      variant="outlined"
                      textColor="#007AFF"
                      style={[styles.secondaryButton, { backgroundColor: colorScheme === 'dark' ? '#2c2c2e' : '#f0f0f0' }]}
                      onPress={() => router.push(`/sessions/${sessionId}`)}
                    />
                  )}
                </>
              )}
            </>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 16,
  },
  errorIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#ffebee',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  errorTitle: {
    marginBottom: 8,
    textAlign: 'center',
  },
  errorMessage: {
    textAlign: 'center',
    marginBottom: 32,
    paddingHorizontal: 20,
  },
  preview: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  thumbnail: {
    width: '100%',
    height: 160,
    borderRadius: 12,
    backgroundColor: '#e0e0e0',
    marginBottom: 16,
  },
  thumbnailPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  info: {
    alignItems: 'center',
  },
  inviteTitle: {
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sessionTitle: {
    textAlign: 'center',
    marginBottom: 8,
  },
  gameName: {
    marginBottom: 12,
  },
  participants: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  fullBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#ff3b30',
    borderRadius: 4,
  },
  actions: {
    gap: 12,
  },
  infoText: {
    textAlign: 'center',
    marginBottom: 8,
  },
  primaryButton: {
    borderRadius: 12,
  },
  primaryButtonContent: {
    minHeight: 56,
  },
  primaryButtonLabel: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '600',
  },
  secondaryButton: {
    borderRadius: 12,
  },
  button: {
    borderRadius: 12,
  },
  buttonContent: {
    minHeight: 52,
    paddingHorizontal: 20,
  },
  buttonLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  fullMessage: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
});
