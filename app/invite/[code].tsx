/**
 * Epic 5 Story 5.2: Join via Invite Link
 *
 * Handles deep links: lagalaga://invite/:code
 */

import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
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

type InviteState = 'loading' | 'preview' | 'joining' | 'error' | 'login_required';

export default function InviteScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { handleError, getErrorMessage } = useErrorHandler();

  const [state, setState] = useState<InviteState>('loading');
  const [session, setSession] = useState<Partial<Session> | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadInvite();
  }, [code]);

  const loadInvite = async () => {
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
  };

  const handleAutoJoin = async (id: string) => {
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
  };

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
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading invite...</Text>
      </View>
    );
  }

  if (state === 'error') {
    return (
      <View style={styles.centered}>
        <View style={styles.errorIcon}>
          <Text style={styles.errorIconText}>X</Text>
        </View>
        <Text style={styles.errorTitle}>Invalid Invite</Text>
        <Text style={styles.errorMessage}>
          {error || 'This invite link is not valid or has expired'}
        </Text>
        <TouchableOpacity style={styles.button} onPress={() => router.back()}>
          <Text style={styles.buttonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (state === 'joining') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Joining session...</Text>
      </View>
    );
  }

  if (!session) return null;

  const isFull =
    session.currentParticipants && session.maxParticipants
      ? session.currentParticipants >= session.maxParticipants
      : false;

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {/* Session Preview */}
        <View style={styles.preview}>
          {session.game?.thumbnailUrl ? (
            <Image
              source={{ uri: session.game.thumbnailUrl }}
              style={styles.thumbnail}
            />
          ) : (
            <View style={[styles.thumbnail, styles.thumbnailPlaceholder]}>
              <Text style={styles.thumbnailPlaceholderText}>
                {session.game?.gameName?.[0] || '?'}
              </Text>
            </View>
          )}

          <View style={styles.info}>
            <Text style={styles.inviteTitle}>You've been invited!</Text>

            <Text style={styles.sessionTitle} numberOfLines={2}>
              {session.title || 'Gaming Session'}
            </Text>

            {session.game?.gameName && (
              <Text style={styles.gameName}>{session.game.gameName}</Text>
            )}

            {session.currentParticipants !== undefined &&
              session.maxParticipants !== undefined && (
                <View style={styles.participants}>
                  <Text
                    style={[
                      styles.participantText,
                      isFull && styles.participantTextFull,
                    ]}
                  >
                    {session.currentParticipants}/{session.maxParticipants} players
                  </Text>
                  {isFull && <Text style={styles.fullBadge}>FULL</Text>}
                </View>
              )}
          </View>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          {state === 'login_required' && (
            <>
              <Text style={styles.infoText}>
                Sign in to join this session and start playing!
              </Text>

              <TouchableOpacity
                style={styles.primaryButton}
                onPress={handleLogin}
              >
                <Text style={styles.primaryButtonText}>Sign In to Join</Text>
              </TouchableOpacity>

              {sessionId && (
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => router.push(`/sessions/${sessionId}`)}
                >
                  <Text style={styles.secondaryButtonText}>View Session</Text>
                </TouchableOpacity>
              )}
            </>
          )}

          {state === 'preview' && user && (
            <>
              {!isFull ? (
                <>
                  <TouchableOpacity
                    style={styles.primaryButton}
                    onPress={handleManualJoin}
                  >
                    <Text style={styles.primaryButtonText}>Join Session</Text>
                  </TouchableOpacity>

                  {sessionId && (
                    <TouchableOpacity
                      style={styles.secondaryButton}
                      onPress={() => router.push(`/sessions/${sessionId}`)}
                    >
                      <Text style={styles.secondaryButtonText}>View Details</Text>
                    </TouchableOpacity>
                  )}
                </>
              ) : (
                <>
                  <View style={styles.fullMessage}>
                    <Text style={styles.fullMessageText}>
                      This session is full
                    </Text>
                  </View>

                  {sessionId && (
                    <TouchableOpacity
                      style={styles.secondaryButton}
                      onPress={() => router.push(`/sessions/${sessionId}`)}
                    >
                      <Text style={styles.secondaryButtonText}>
                        View Session Anyway
                      </Text>
                    </TouchableOpacity>
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
    backgroundColor: '#f8f9fa',
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
    fontSize: 16,
    color: '#666',
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
  errorIconText: {
    fontSize: 40,
    color: '#c62828',
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#333',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 32,
    paddingHorizontal: 20,
  },
  preview: {
    backgroundColor: '#fff',
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
  thumbnailPlaceholderText: {
    fontSize: 48,
    fontWeight: '700',
    color: '#999',
  },
  info: {
    alignItems: 'center',
  },
  inviteTitle: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sessionTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#333',
    textAlign: 'center',
    marginBottom: 8,
  },
  gameName: {
    fontSize: 16,
    color: '#666',
    marginBottom: 12,
  },
  participants: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  participantText: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '500',
  },
  participantTextFull: {
    color: '#ff3b30',
  },
  fullBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#ff3b30',
    borderRadius: 4,
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  actions: {
    gap: 12,
  },
  infoText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 8,
  },
  primaryButton: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: '#f0f0f0',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
  },
  button: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  fullMessage: {
    backgroundColor: '#ffebee',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  fullMessageText: {
    color: '#c62828',
    fontSize: 16,
    fontWeight: '600',
  },
});
