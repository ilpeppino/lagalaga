/**
 * Epic 4 Story 4.4: Session Detail UI
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Share,
  Image,
  Linking,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { sessionsAPIStoreV2 } from '@/src/features/sessions/apiStore-v2';
import type { SessionDetail } from '@/src/features/sessions/types-v2';
import { useAuth } from '@/src/features/auth/useAuth';
import { launchRobloxGame } from '@/src/services/roblox-launcher';
import { useErrorHandler } from '@/hooks/useErrorHandler';
import { logger } from '@/src/lib/logger';
import { ThemedText } from '@/components/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Button } from '@/components/ui/paper';
import { getRobloxGameThumbnail } from '@/src/lib/robloxGameThumbnail';

export default function SessionDetailScreenV2() {
  const { id, inviteLink: paramInviteLink, justCreated } = useLocalSearchParams<{
    id: string;
    inviteLink?: string;
    justCreated?: string;
  }>();
  const router = useRouter();
  const { user } = useAuth();
  const { handleError, getErrorMessage } = useErrorHandler();
  const colorScheme = useColorScheme();

  const [session, setSession] = useState<SessionDetail | null>(null);
  const [fallbackThumbnail, setFallbackThumbnail] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isJoining, setIsJoining] = useState(false);
  const [presenceLabel, setPresenceLabel] = useState<string>('Checking...');
  const hasShownCreatedPromptRef = useRef(false);

  const loadSession = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await sessionsAPIStoreV2.getSessionById(id);
      setSession(data);
      try {
        const presence = await sessionsAPIStoreV2.getRobloxPresence([data.hostId]);
        if (!presence.available) {
          setPresenceLabel('Presence unavailable - connect Roblox');
        } else {
          const status = presence.statuses?.[0]?.status ?? 'unknown';
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
      } catch {
        setPresenceLabel('Presence unavailable - connect Roblox');
      }
    } catch (error) {
      handleError(error, { fallbackMessage: 'Failed to load session details' });
    } finally {
      setIsLoading(false);
    }
  }, [handleError, id]);

  const handleShare = useCallback(async (inviteLink?: string) => {
    const link = inviteLink || session?.inviteLink;
    if (!link || !session) return;

    try {
      await Share.share({
        message: `Join my ${session.game.gameName || 'Roblox'} session: "${session.title}"\n\n${link}`,
        title: `Join ${session.title}`,
      });
    } catch (error) {
      logger.warn('Failed to share', { error: (error as Error).message });
    }
  }, [session]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  useEffect(() => {
    let cancelled = false;
    const placeId = session?.game.placeId;
    if (!session || session.game.thumbnailUrl || !placeId || placeId <= 0) {
      setFallbackThumbnail(null);
      return;
    }

    getRobloxGameThumbnail(placeId).then((url) => {
      if (!cancelled) {
        setFallbackThumbnail(url);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [session]);

  useEffect(() => {
    if (justCreated !== 'true' || !paramInviteLink || hasShownCreatedPromptRef.current) {
      return;
    }

    hasShownCreatedPromptRef.current = true;
    const timeoutId = setTimeout(() => {
      Alert.alert(
        'Session Created!',
        'Would you like to share the invite link?',
        [
          { text: 'Later', style: 'cancel' },
          { text: 'Share', onPress: () => handleShare(paramInviteLink) },
        ]
      );
    }, 500);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [handleShare, justCreated, paramInviteLink]);

  const handleJoin = async () => {
    if (!session) return;

    try {
      setIsJoining(true);
      const joinedSession = await sessionsAPIStoreV2.joinSession(session.id);
      setSession(joinedSession);
      router.push({
        pathname: '/sessions/handoff',
        params: { sessionId: joinedSession.id },
      } as any);
    } catch (error) {
      const message = getErrorMessage(error, 'Failed to join session');
      Alert.alert('Error', message);
    } finally {
      setIsJoining(false);
    }
  };

  const handleLaunchRoblox = async () => {
    if (!session?.game) return;

    try {
      await launchRobloxGame(session.game.placeId, session.game.canonicalStartUrl);
    } catch (error) {
      handleError(error, { fallbackMessage: 'Failed to launch Roblox. Please try again later.' });
    }
  };

  const handleOpenHandoff = () => {
    if (!session) return;
    router.push({
      pathname: '/sessions/handoff',
      params: { sessionId: session.id },
    } as any);
  };

  const handleConnectRoblox = async () => {
    try {
      const { authorizationUrl, state } = await sessionsAPIStoreV2.getRobloxConnectUrl();
      await AsyncStorage.setItem('roblox_connect_state', state);
      await Linking.openURL(authorizationUrl);
    } catch (error) {
      Alert.alert('Error', 'Failed to start Roblox connect flow');
    }
  };

  const formatDateTime = (isoString: string): string => {
    const date = new Date(isoString);
    return date.toLocaleString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const hasJoined = Boolean(
    user && session && (
      session.hostId === user.id ||
      session.participants.some((p) => p.userId === user.id && p.state === 'joined')
    )
  );

  if (isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: colorScheme === 'dark' ? '#000' : '#fff' }]}>
        <ActivityIndicator size="large" color="#007AFF" />
        <ThemedText type="bodyLarge" style={styles.loadingText}>
          Loading session...
        </ThemedText>
      </View>
    );
  }

  if (!session) {
    return (
      <View style={[styles.centered, { backgroundColor: colorScheme === 'dark' ? '#000' : '#fff' }]}>
        <ThemedText type="titleLarge" style={styles.errorTitle}>
          Session Not Found
        </ThemedText>
        <ThemedText type="bodyLarge" lightColor="#666" darkColor="#999" style={styles.errorSubtitle}>
          This session may have been deleted
        </ThemedText>
        <Button
          title="Go Back"
          variant="filled"
          buttonColor="#007AFF"
          style={styles.backButton}
          contentStyle={styles.backButtonContent}
          labelStyle={styles.backButtonLabel}
          onPress={() => router.back()}
        />
      </View>
    );
  }

  const isFull = session.currentParticipants >= session.maxParticipants;
  const isHost = user?.id === session.hostId;
  const stuckParticipants = session.participants.filter((participant) => participant.handoffState === 'stuck');

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colorScheme === 'dark' ? '#000' : '#fff' }]}
      contentContainerStyle={styles.content}
    >
      {/* Header Banner */}
      {session.game.thumbnailUrl || fallbackThumbnail ? (
        <Image source={{ uri: session.game.thumbnailUrl || fallbackThumbnail || '' }} style={styles.banner} />
      ) : (
        <View style={[styles.banner, styles.bannerPlaceholder]}>
          <ThemedText type="displaySmall" lightColor="#999" darkColor="#666">
            {session.game.gameName?.[0] || '?'}
          </ThemedText>
        </View>
      )}

      {/* Title Section */}
      <View style={[
        styles.titleSection,
        { borderBottomColor: colorScheme === 'dark' ? '#333' : '#e0e0e0' }
      ]}>
        <ThemedText type="headlineSmall" style={styles.title}>
          {session.title}
        </ThemedText>
        <ThemedText type="titleLarge" lightColor="#666" darkColor="#999" style={styles.gameName}>
          {session.game.gameName || 'Roblox Game'}
        </ThemedText>
        <ThemedText type="bodyMedium" lightColor="#666" darkColor="#999" style={styles.hostPresence}>
          Host Presence: {presenceLabel}
        </ThemedText>

        {/* Status Badges */}
        <View style={styles.badges}>
          <View style={[styles.badge, styles.statusBadge]}>
            <ThemedText type="labelMedium" lightColor="#fff" darkColor="#fff">
              {session.status.toUpperCase()}
            </ThemedText>
          </View>
          {session.visibility !== 'public' && (
            <View style={[styles.badge, styles.visibilityBadge]}>
              <ThemedText type="labelMedium" lightColor="#fff" darkColor="#fff">
                {session.visibility === 'friends' ? 'FRIENDS' : 'INVITE ONLY'}
              </ThemedText>
            </View>
          )}
          {isFull && (
            <View style={[styles.badge, styles.fullBadge]}>
              <ThemedText type="labelMedium" lightColor="#fff" darkColor="#fff">
                FULL
              </ThemedText>
            </View>
          )}
        </View>
      </View>

      {/* Info Grid */}
      <View style={styles.infoGrid}>
        <View style={[
          styles.infoCard,
          { backgroundColor: colorScheme === 'dark' ? '#1a1a1a' : '#f8f9fa' }
        ]}>
          <ThemedText type="bodySmall" lightColor="#666" darkColor="#999" style={styles.infoLabel}>
            Players
          </ThemedText>
          <ThemedText type="titleMedium">
            {session.currentParticipants}/{session.maxParticipants}
          </ThemedText>
        </View>

        {session.scheduledStart && (
          <View style={[
            styles.infoCard,
            { backgroundColor: colorScheme === 'dark' ? '#1a1a1a' : '#f8f9fa' }
          ]}>
            <ThemedText type="bodySmall" lightColor="#666" darkColor="#999" style={styles.infoLabel}>
              Starts
            </ThemedText>
            <ThemedText type="titleMedium">
              {formatDateTime(session.scheduledStart)}
            </ThemedText>
          </View>
        )}
      </View>

      {/* Description */}
      {session.description && (
        <View style={[
          styles.section,
          { borderTopColor: colorScheme === 'dark' ? '#333' : '#e0e0e0' }
        ]}>
          <ThemedText type="titleLarge" style={styles.sectionTitle}>
            Description
          </ThemedText>
          <ThemedText type="bodyLarge" lightColor="#666" darkColor="#ccc" style={styles.description}>
            {session.description}
          </ThemedText>
        </View>
      )}

      {/* Participants */}
      <View style={[
        styles.section,
        { borderTopColor: colorScheme === 'dark' ? '#333' : '#e0e0e0' }
      ]}>
        <ThemedText type="titleLarge" style={styles.sectionTitle}>
          Participants ({session.participants.length})
        </ThemedText>
        {session.participants.map((participant) => (
          <View
            key={participant.userId}
            style={[
              styles.participant,
              { borderBottomColor: colorScheme === 'dark' ? '#222' : '#f0f0f0' }
            ]}
          >
            <View style={styles.participantAvatar}>
              <ThemedText type="titleMedium" lightColor="#fff" darkColor="#fff">
                {participant.userId.substring(0, 2).toUpperCase()}
              </ThemedText>
            </View>
            <View style={styles.participantInfo}>
              <ThemedText type="bodyLarge">
                {participant.userId === session.hostId ? 'Host' : 'Member'}
              </ThemedText>
              <ThemedText type="bodyMedium" lightColor="#666" darkColor="#999" style={styles.participantRole}>
                {participant.role}
              </ThemedText>
            </View>
            {participant.handoffState && (
              <View style={styles.handoffBadge}>
                <ThemedText type="labelSmall" lightColor="#fff" darkColor="#fff">
                  {participant.handoffState.replaceAll('_', ' ').toUpperCase()}
                </ThemedText>
              </View>
            )}
            {participant.role === 'host' && (
              <View style={styles.hostBadgeSmall}>
                <ThemedText type="labelSmall" lightColor="#fff" darkColor="#fff">
                  HOST
                </ThemedText>
              </View>
            )}
          </View>
        ))}
      </View>

      {isHost && (
        <View style={[
          styles.section,
          { borderTopColor: colorScheme === 'dark' ? '#333' : '#e0e0e0' }
        ]}>
          <ThemedText type="titleLarge" style={styles.sectionTitle}>
            Stuck Users ({stuckParticipants.length})
          </ThemedText>
          {stuckParticipants.length === 0 ? (
            <ThemedText type="bodyMedium" lightColor="#666" darkColor="#999">
              No users marked as stuck.
            </ThemedText>
          ) : (
            stuckParticipants.map((participant) => (
              <ThemedText key={`stuck-${participant.userId}`} type="bodyLarge" style={styles.stuckUserText}>
                {participant.userId}
              </ThemedText>
            ))
          )}
          <ThemedText type="bodyMedium" lightColor="#666" darkColor="#999" style={styles.stuckTipText}>
            Tip: Ask stuck users to open Roblox, then join you from Friends - Join or party invite.
          </ThemedText>
          <Button
            title="Copy Host Tip"
            variant="outlined"
            textColor="#007AFF"
            style={styles.copyTipButton}
            onPress={() => Clipboard.setStringAsync("Open Roblox, join host from Friends -> Join (or party invite), then return and tap I'm in.")}
          />
        </View>
      )}

      {/* Action Buttons */}
      <View style={styles.actions}>
        {session.inviteLink && (
          <Button
            title="Share Invite"
            variant="outlined"
            textColor="#007AFF"
            style={[
              styles.shareButton,
              { backgroundColor: colorScheme === 'dark' ? '#1a1a1a' : '#f0f0f0' }
            ]}
            onPress={() => handleShare()}
          />
        )}

        {!hasJoined && !isFull && (
          <Button
            title="Join Session"
            variant="filled"
            buttonColor="#34C759"
            textColor="#fff"
            style={styles.joinButton}
            contentStyle={styles.actionButtonContent}
            labelStyle={styles.actionButtonLabel}
            onPress={handleJoin}
            loading={isJoining}
            disabled={isJoining}
          />
        )}

        {hasJoined && (
          <Button
            title={isHost ? 'Launch Roblox' : 'Open Join Handoff'}
            variant="filled"
            buttonColor="#007AFF"
            textColor="#fff"
            style={styles.launchButton}
            contentStyle={styles.actionButtonContent}
            labelStyle={styles.actionButtonLabel}
            onPress={isHost ? handleLaunchRoblox : handleOpenHandoff}
          />
        )}

        {presenceLabel.includes('unavailable') && (
          <Button
            title="Connect Roblox for Presence"
            variant="outlined"
            textColor="#007AFF"
            style={styles.shareButton}
            onPress={handleConnectRoblox}
          />
        )}

        {isFull && !hasJoined && (
          <View style={styles.fullMessage}>
            <ThemedText type="titleMedium" lightColor="#c62828" darkColor="#ff5252">
              This session is full
            </ThemedText>
          </View>
        )}
      </View>

      {/* Game Info */}
      <View style={[
        styles.section,
        { borderTopColor: colorScheme === 'dark' ? '#333' : '#e0e0e0' }
      ]}>
        <ThemedText type="titleLarge" style={styles.sectionTitle}>
          Game Information
        </ThemedText>
        <ThemedText type="bodySmall" lightColor="#888" darkColor="#666" style={styles.label}>
          Canonical URL
        </ThemedText>
        <ThemedText type="bodyMedium" lightColor="#007AFF" darkColor="#007AFF" style={styles.link}>
          {session.game.canonicalWebUrl}
        </ThemedText>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingBottom: 32,
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
  errorTitle: {
    marginBottom: 8,
  },
  errorSubtitle: {
    marginBottom: 24,
  },
  backButton: {
    borderRadius: 8,
  },
  backButtonContent: {
    minHeight: 48,
    paddingHorizontal: 20,
  },
  backButtonLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  banner: {
    width: '100%',
    height: 200,
    backgroundColor: '#e0e0e0',
  },
  bannerPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleSection: {
    padding: 16,
    borderBottomWidth: 1,
  },
  title: {
    marginBottom: 4,
  },
  gameName: {
    marginBottom: 12,
  },
  hostPresence: {
    marginBottom: 10,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  statusBadge: {
    backgroundColor: '#34C759',
  },
  visibilityBadge: {
    backgroundColor: '#007AFF',
  },
  fullBadge: {
    backgroundColor: '#ff3b30',
  },
  infoGrid: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  infoCard: {
    flex: 1,
    padding: 16,
    borderRadius: 8,
  },
  infoLabel: {
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  section: {
    padding: 16,
    borderTopWidth: 1,
  },
  sectionTitle: {
    marginBottom: 12,
  },
  description: {
    lineHeight: 24,
  },
  participant: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  participantAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  participantInfo: {
    flex: 1,
  },
  participantRole: {
    textTransform: 'capitalize',
  },
  handoffBadge: {
    marginRight: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#6c757d',
    borderRadius: 4,
  },
  hostBadgeSmall: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#007AFF',
    borderRadius: 4,
  },
  actions: {
    padding: 16,
    gap: 12,
  },
  stuckUserText: {
    marginBottom: 6,
  },
  stuckTipText: {
    marginTop: 10,
    marginBottom: 8,
  },
  copyTipButton: {
    borderRadius: 8,
  },
  shareButton: {
    borderRadius: 8,
  },
  joinButton: {
    borderRadius: 8,
  },
  launchButton: {
    borderRadius: 8,
  },
  actionButtonContent: {
    minHeight: 56,
  },
  actionButtonLabel: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '600',
  },
  fullMessage: {
    backgroundColor: '#ffebee',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  label: {
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  link: {
    marginTop: 4,
  },
});
