/**
 * Epic 4 Story 4.4: Session Detail UI
 *
 * Features:
 * - Complete session information display
 * - Participant list with roles
 * - Share button with invite link
 * - Join button (if not already joined)
 * - Launch Roblox button (will be implemented in Epic 6)
 * - Error handling
 */

import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Share,
  Image,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { sessionsAPIStoreV2 } from '@/src/features/sessions/apiStore-v2';
import type { SessionDetail } from '@/src/features/sessions/types-v2';
import { useAuth } from '@/src/features/auth/useAuth';
import { launchRobloxGame } from '@/src/services/roblox-launcher';

export default function SessionDetailScreenV2() {
  const { id, inviteLink: paramInviteLink, justCreated } = useLocalSearchParams<{
    id: string;
    inviteLink?: string;
    justCreated?: string;
  }>();
  const router = useRouter();
  const { user } = useAuth();

  const [session, setSession] = useState<SessionDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isJoining, setIsJoining] = useState(false);

  useEffect(() => {
    loadSession();

    // Show share prompt if just created
    if (justCreated === 'true' && paramInviteLink) {
      setTimeout(() => {
        Alert.alert(
          'Session Created!',
          'Would you like to share the invite link?',
          [
            { text: 'Later', style: 'cancel' },
            { text: 'Share', onPress: () => handleShare(paramInviteLink) },
          ]
        );
      }, 500);
    }
  }, [id]);

  /**
   * Load session details
   */
  const loadSession = async () => {
    try {
      setIsLoading(true);
      const data = await sessionsAPIStoreV2.getSessionById(id);
      setSession(data);
    } catch (error) {
      console.error('Failed to load session:', error);
      Alert.alert('Error', 'Failed to load session details');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Handle share button
   */
  const handleShare = async (inviteLink?: string) => {
    const link = inviteLink || session?.inviteLink;
    if (!link || !session) return;

    try {
      await Share.share({
        message: `Join my ${session.game.gameName || 'Roblox'} session: "${session.title}"\n\n${link}`,
        title: `Join ${session.title}`,
      });
    } catch (error) {
      console.error('Failed to share:', error);
    }
  };

  /**
   * Handle join session
   */
  const handleJoin = async () => {
    if (!session) return;

    try {
      setIsJoining(true);
      await sessionsAPIStoreV2.joinSession(session.id);
      Alert.alert('Success', 'You have joined the session!');
      await loadSession(); // Refresh to show updated participants
    } catch (error) {
      console.error('Failed to join session:', error);
      Alert.alert(
        'Error',
        error instanceof Error ? error.message : 'Failed to join session'
      );
    } finally {
      setIsJoining(false);
    }
  };

  /**
   * Handle launch Roblox (Epic 6)
   */
  const handleLaunchRoblox = async () => {
    if (!session?.game) return;

    try {
      await launchRobloxGame(session.game.placeId, session.game.canonicalStartUrl);
    } catch (error) {
      console.error('Failed to launch Roblox:', error);
      Alert.alert(
        'Error',
        'Failed to launch Roblox. Please try again later.'
      );
    }
  };

  /**
   * Format date/time
   */
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

  /**
   * Check if user is host
   */
  const isHost = user && session && user.id === session.hostId;

  /**
   * Check if user has joined
   */
  const hasJoined = user && session?.participants.some(
    (p) => p.userId === user.id && p.state === 'joined'
  );

  /**
   * Loading state
   */
  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading session...</Text>
      </View>
    );
  }

  /**
   * Error state
   */
  if (!session) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorTitle}>Session Not Found</Text>
        <Text style={styles.errorSubtitle}>This session may have been deleted</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isFull = session.currentParticipants >= session.maxParticipants;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header Banner */}
      {session.game.thumbnailUrl ? (
        <Image source={{ uri: session.game.thumbnailUrl }} style={styles.banner} />
      ) : (
        <View style={[styles.banner, styles.bannerPlaceholder]}>
          <Text style={styles.bannerPlaceholderText}>
            {session.game.gameName?.[0] || '?'}
          </Text>
        </View>
      )}

      {/* Title Section */}
      <View style={styles.titleSection}>
        <Text style={styles.title}>{session.title}</Text>
        <Text style={styles.gameName}>{session.game.gameName || 'Roblox Game'}</Text>

        {/* Status Badges */}
        <View style={styles.badges}>
          <View style={[styles.badge, styles.statusBadge]}>
            <Text style={styles.badgeText}>{session.status.toUpperCase()}</Text>
          </View>
          {session.visibility !== 'public' && (
            <View style={[styles.badge, styles.visibilityBadge]}>
              <Text style={styles.badgeText}>
                {session.visibility === 'friends' ? 'FRIENDS' : 'INVITE ONLY'}
              </Text>
            </View>
          )}
          {isFull && (
            <View style={[styles.badge, styles.fullBadge]}>
              <Text style={styles.badgeText}>FULL</Text>
            </View>
          )}
        </View>
      </View>

      {/* Info Grid */}
      <View style={styles.infoGrid}>
        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>Players</Text>
          <Text style={styles.infoValue}>
            {session.currentParticipants}/{session.maxParticipants}
          </Text>
        </View>

        {session.scheduledStart && (
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>Starts</Text>
            <Text style={styles.infoValue}>{formatDateTime(session.scheduledStart)}</Text>
          </View>
        )}
      </View>

      {/* Description */}
      {session.description && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Description</Text>
          <Text style={styles.description}>{session.description}</Text>
        </View>
      )}

      {/* Participants */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          Participants ({session.participants.length})
        </Text>
        {session.participants.map((participant) => (
          <View key={participant.userId} style={styles.participant}>
            <View style={styles.participantAvatar}>
              <Text style={styles.participantAvatarText}>
                {participant.userId.substring(0, 2).toUpperCase()}
              </Text>
            </View>
            <View style={styles.participantInfo}>
              <Text style={styles.participantName}>
                {participant.userId === session.hostId ? 'Host' : 'Member'}
              </Text>
              <Text style={styles.participantRole}>{participant.role}</Text>
            </View>
            {participant.role === 'host' && (
              <View style={styles.hostBadgeSmall}>
                <Text style={styles.hostBadgeSmallText}>HOST</Text>
              </View>
            )}
          </View>
        ))}
      </View>

      {/* Action Buttons */}
      <View style={styles.actions}>
        {/* Share Button */}
        {session.inviteLink && (
          <TouchableOpacity
            style={styles.shareButton}
            onPress={() => handleShare()}
          >
            <Text style={styles.shareButtonText}>Share Invite</Text>
          </TouchableOpacity>
        )}

        {/* Join/Launch Button */}
        {!hasJoined && !isFull && (
          <TouchableOpacity
            style={[styles.joinButton, isJoining && styles.buttonDisabled]}
            onPress={handleJoin}
            disabled={isJoining}
          >
            {isJoining ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.joinButtonText}>Join Session</Text>
            )}
          </TouchableOpacity>
        )}

        {hasJoined && (
          <TouchableOpacity
            style={styles.launchButton}
            onPress={handleLaunchRoblox}
          >
            <Text style={styles.launchButtonText}>Launch Roblox</Text>
          </TouchableOpacity>
        )}

        {isFull && !hasJoined && (
          <View style={styles.fullMessage}>
            <Text style={styles.fullMessageText}>This session is full</Text>
          </View>
        )}
      </View>

      {/* Game Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Game Information</Text>
        <Text style={styles.label}>Canonical URL</Text>
        <Text style={[styles.value, styles.link]}>{session.game.canonicalWebUrl}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
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
    fontSize: 16,
    color: '#666',
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  errorSubtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 24,
  },
  backButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  backButtonText: {
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
  bannerPlaceholderText: {
    fontSize: 64,
    fontWeight: '700',
    color: '#999',
  },
  titleSection: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#333',
    marginBottom: 4,
  },
  gameName: {
    fontSize: 18,
    color: '#666',
    marginBottom: 12,
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
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  infoGrid: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  infoCard: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    padding: 16,
    borderRadius: 8,
  },
  infoLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  section: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  description: {
    fontSize: 16,
    color: '#666',
    lineHeight: 24,
  },
  participant: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
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
  participantAvatarText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  participantInfo: {
    flex: 1,
  },
  participantName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  participantRole: {
    fontSize: 14,
    color: '#666',
    textTransform: 'capitalize',
  },
  hostBadgeSmall: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#007AFF',
    borderRadius: 4,
  },
  hostBadgeSmallText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  actions: {
    padding: 16,
    gap: 12,
  },
  shareButton: {
    backgroundColor: '#f0f0f0',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  shareButtonText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
  },
  joinButton: {
    backgroundColor: '#34C759',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  joinButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  launchButton: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  launchButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  fullMessage: {
    backgroundColor: '#ffebee',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  fullMessageText: {
    color: '#c62828',
    fontSize: 16,
    fontWeight: '600',
  },
  label: {
    fontSize: 12,
    color: '#888',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  value: {
    fontSize: 14,
    color: '#333',
  },
  link: {
    color: '#007AFF',
  },
});
