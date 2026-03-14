/**
 * Epic 4 Story 4.4: Session Detail UI
 */

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Alert,
  Share,
  Image,
  useWindowDimensions,
  TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { sessionsAPIStoreV2 } from '@/src/features/sessions/apiStore-v2';
import type { SessionDetail } from '@/src/features/sessions/types-v2';
import { useAuth } from '@/src/features/auth/useAuth';
import { launchRobloxGame } from '@/src/services/roblox-launcher';
import { useErrorHandler } from '@/hooks/useErrorHandler';
import { logger } from '@/src/lib/logger';
import { ThemedText } from '@/components/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { AnimatedButton as Button } from '@/components/ui/paper';
import { LagaLoadingSpinner } from '@/components/ui/LagaLoadingSpinner';
import { getRobloxGameThumbnail } from '@/src/lib/robloxGameThumbnail';
import { Dialog, Portal, RadioButton } from 'react-native-paper';
import type { RobloxPresencePayload } from '@/src/features/sessions/apiStore-v2';
import { LivePulseDot } from '@/components/LivePulseDot';
import {
  getSessionLiveBadge,
  getPresenceUi,
  sessionUiColors,
} from '@/src/ui/sessionStatusUi';
import { OAUTH_STORAGE_KEYS, oauthTransientStorage } from '@/src/lib/oauthTransientStorage';
import { openRobloxAuthSession } from '@/src/features/auth/robloxAuthSession';
import {
  buildSessionRoster,
  getDisplayName,
  getInitials,
  getParticipantStateBadge,
  getSessionStateChips,
  isHostParticipant,
} from '@/src/lib/sessionDetailsHelpers';

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
  const { height } = useWindowDimensions();
  const isCompact = height < 700;
  const bannerHeight = isCompact
    ? Math.min(170, Math.max(110, height * 0.16))
    : Math.min(200, Math.max(120, height * 0.18));

  const [session, setSession] = useState<SessionDetail | null>(null);
  const [fallbackThumbnail, setFallbackThumbnail] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isJoining, setIsJoining] = useState(false);
  const [hostPresence, setHostPresence] = useState<RobloxPresencePayload | null>(null);
  const hasShownCreatedPromptRef = useRef(false);
  const [isResultDialogVisible, setIsResultDialogVisible] = useState(false);
  const [selectedWinnerId, setSelectedWinnerId] = useState<string | null>(null);
  const [isSubmittingResult, setIsSubmittingResult] = useState(false);

  const loadSession = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await sessionsAPIStoreV2.getSessionById(id);
      setSession(data);
      try {
        const presence = await sessionsAPIStoreV2.getRobloxPresence([data.hostId]);
        setHostPresence(presence);
      } catch {
        setHostPresence({ available: false });
      }
    } catch (error) {
      handleError(error, { fallbackMessage: 'Failed to load session details' });
    } finally {
      setIsLoading(false);
    }
  }, [handleError, id]);

  const handleShare = useCallback(async (inviteLink?: string) => {
    const link = inviteLink || session?.inviteLink;
    if (!link) return;

    const gameName = session?.game.gameName || 'Roblox';
    const sessionTitle = session?.title?.trim() || 'my session';
    const message = session
      ? `Join my ${gameName} session: "${sessionTitle}"\n\n${link}`
      : `Join my ${gameName} session:\n\n${link}`;

    try {
      await Share.share({
        message,
        title: session ? `Join ${sessionTitle}` : 'Join my session',
      });
    } catch (error) {
      logger.warn('Failed to share', { error: (error as Error).message });
      Alert.alert('Share unavailable', 'Unable to open the share sheet right now. Please try again.');
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
      await oauthTransientStorage.setItem(OAUTH_STORAGE_KEYS.ROBLOX_CONNECT_STATE, state);
      await openRobloxAuthSession(authorizationUrl);
    } catch {
      Alert.alert('Error', 'Failed to start Roblox connect flow');
    }
  };

  const handleOpenSafetyReport = () => {
    if (!session) return;
    router.push({
      pathname: '/safety-report',
      params: {
        targetType: 'SESSION',
        targetSessionId: session.id,
      },
    } as any);
  };

  const handleOpenResultDialog = () => {
    if (!session) return;
    const joined = session.participants.filter((participant) => participant.state === 'joined');
    setSelectedWinnerId(joined[0]?.userId ?? null);
    setIsResultDialogVisible(true);
  };

  const handleSubmitResult = async () => {
    if (!session || !selectedWinnerId) return;

    try {
      setIsSubmittingResult(true);
      const result = await sessionsAPIStoreV2.submitMatchResult(session.id, selectedWinnerId);
      setIsResultDialogVisible(false);

      const summaryLines = result.updates
        .map((update) => {
          const signedDelta = update.delta > 0 ? `+${update.delta}` : `${update.delta}`;
          return `${update.userId.slice(0, 8)}... ${signedDelta} => ${update.rating}`;
        })
        .join('\n');

      Alert.alert('Ranked result submitted', summaryLines || 'Ratings updated');
    } catch (error) {
      Alert.alert('Error', getErrorMessage(error, 'Failed to submit ranked result'));
    } finally {
      setIsSubmittingResult(false);
    }
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
        <LagaLoadingSpinner size={56} label="Loading session..." />
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
  const joinedParticipants = session.participants.filter((participant) => participant.state === 'joined');
  const roster = buildSessionRoster(session);
  const sessionStatusUi = getSessionLiveBadge(session);
  const sessionStateChips = getSessionStateChips(sessionStatusUi.isLive);
  const hostPresenceUi = getPresenceUi(hostPresence);
  const renderParticipantRow = (participant: SessionDetail['participants'][number]) => (
    <View
      key={participant.userId}
      style={[
        styles.participant,
        isHostParticipant(participant, session.hostId) && styles.hostParticipant,
        { borderBottomColor: colorScheme === 'dark' ? '#222' : '#f0f0f0' }
      ]}
      accessibilityLabel={`${getDisplayName(participant.displayName, participant.userId)}, ${getParticipantStateBadge(participant, session.hostId) ?? 'Player'}`}
    >
      <View style={styles.participantAvatar}>
        <ThemedText type="titleMedium" lightColor="#fff" darkColor="#fff">
          {getInitials(participant.displayName ?? participant.userId)}
        </ThemedText>
      </View>
      <View style={styles.participantInfo}>
        <ThemedText type="bodyLarge">
          {getDisplayName(participant.displayName, participant.userId)}
        </ThemedText>
      </View>
      {getParticipantStateBadge(participant, session.hostId) && (
        <View style={styles.handoffBadge}>
          <ThemedText
            type="labelSmall"
            lightColor="#fff"
            darkColor="#fff"
            style={styles.handoffBadgeText}
            accessibilityLabel={`${getParticipantStateBadge(participant, session.hostId)} badge`}
          >
            {getParticipantStateBadge(participant, session.hostId)}
          </ThemedText>
        </View>
      )}
    </View>
  );

  const shouldRenderFooter = Boolean(
    (isHost && session.isRanked) ||
    hostPresenceUi.isUnavailable ||
    (isHost && stuckParticipants.length > 0)
  );

  const renderInvitedRow = (entry: { key: string; displayName: string; initials: string }) => (
    <View
      key={entry.key}
      style={[
        styles.participant,
        { borderBottomColor: colorScheme === 'dark' ? '#222' : '#f0f0f0' }
      ]}
      accessibilityLabel={`${entry.displayName}, Invited`}
    >
      <View style={[styles.participantAvatar, styles.invitedPlaceholderAvatar]}>
        <ThemedText type="titleMedium" lightColor="#fff" darkColor="#fff">
          {entry.initials}
        </ThemedText>
      </View>
      <View style={styles.participantInfo}>
        <ThemedText type="bodyLarge">
          {entry.displayName}
        </ThemedText>
      </View>
      <View style={styles.handoffBadge}>
        <ThemedText
          type="labelSmall"
          lightColor="#fff"
          darkColor="#fff"
          style={styles.handoffBadgeText}
          accessibilityLabel="Invited badge"
        >
          Invited
        </ThemedText>
      </View>
    </View>
  );

  return (
    <Fragment>
      <ScrollView
        style={[styles.container, { backgroundColor: colorScheme === 'dark' ? '#000' : '#fff' }]}
        contentContainerStyle={[styles.content, { minHeight: height + 1 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        scrollEnabled
      >
        {session.game.thumbnailUrl || fallbackThumbnail ? (
          <Image
            source={{ uri: session.game.thumbnailUrl || fallbackThumbnail || '' }}
            style={[styles.banner, { height: bannerHeight }]}
          />
        ) : (
          <View style={[styles.banner, styles.bannerPlaceholder, { height: bannerHeight }]}>
            <ThemedText type="displaySmall" lightColor="#999" darkColor="#666">
              {session.game.gameName?.[0] || '?'}
            </ThemedText>
          </View>
        )}

        <View style={[
          styles.titleSection,
          isCompact && styles.titleSectionCompact,
          { borderBottomColor: colorScheme === 'dark' ? '#333' : '#e0e0e0' }
        ]}>
          <View style={styles.titleRow}>
            <ThemedText type={isCompact ? 'titleLarge' : 'headlineSmall'} style={styles.title}>
              {session.title}
            </ThemedText>
            {sessionStatusUi.isLive && <LivePulseDot color={sessionUiColors.live} />}
          </View>
          <ThemedText type={isCompact ? 'titleMedium' : 'titleLarge'} lightColor="#666" darkColor="#999" style={styles.gameName}>
            {session.game.gameName || 'Game'}
          </ThemedText>
          <ThemedText type="bodyMedium" lightColor="#666" darkColor="#999" style={styles.hostMeta}>
            {`🦇 ${session.host?.robloxUsername || 'Unknown host'}`}
          </ThemedText>

          <View style={styles.badges}>
            {sessionStateChips.map((chipLabel) => (
              <View key={chipLabel} style={[styles.badge, { backgroundColor: sessionUiColors.live }]}>
                <ThemedText type="labelMedium" lightColor="#fff" darkColor="#fff" style={styles.badgeText}>
                  {chipLabel}
                </ThemedText>
              </View>
            ))}
          </View>
        </View>

        <View style={[styles.primaryActions, isCompact && styles.primaryActionsCompact]}>
          {!hasJoined && !isFull && (
            <Button
              title="Join Session"
              variant="filled"
              buttonColor="#34C759"
              textColor="#fff"
              style={styles.joinButton}
              contentStyle={[styles.actionButtonContent, isCompact && styles.actionButtonContentCompact]}
              labelStyle={[styles.actionButtonLabel, isCompact && styles.actionButtonLabelCompact]}
              onPress={handleJoin}
              loading={isJoining}
              disabled={isJoining}
              enableHaptics
            />
          )}

          {hasJoined && (
            <Button
              title={isHost ? 'Launch Roblox' : 'Open Join Handoff'}
              variant="filled"
              buttonColor="#007AFF"
              textColor="#fff"
              style={styles.launchButton}
              contentStyle={[styles.actionButtonContent, isCompact && styles.actionButtonContentCompact]}
              labelStyle={[styles.actionButtonLabel, isCompact && styles.actionButtonLabelCompact]}
              onPress={isHost ? handleLaunchRoblox : handleOpenHandoff}
              enableHaptics={isHost}
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

        <View style={[
          styles.playersHeader,
          isCompact && styles.playersHeaderCompact,
          { borderTopColor: colorScheme === 'dark' ? '#333' : '#e0e0e0' }
        ]}>
          <ThemedText type={isCompact ? 'titleMedium' : 'titleLarge'} style={styles.sectionTitle}>
            Players • {roster.joinedCount} / {session.maxParticipants}
          </ThemedText>
        </View>

        <View style={styles.playersListContainer}>
          {roster.activeParticipants.length > 0 ? (
            <>
              {roster.activeParticipants.map((participant) => renderParticipantRow(participant))}
            </>
          ) : (
            <View style={styles.emptyState}>
              <ThemedText type="bodyLarge" lightColor="#666" darkColor="#999">
                No players in session yet.
              </ThemedText>
            </View>
          )}
        </View>
        <View style={[
          styles.section,
          isCompact && styles.sectionCompact,
          { borderTopColor: colorScheme === 'dark' ? '#333' : '#e0e0e0' }
        ]}>
          <ThemedText type="titleMedium" style={styles.sectionTitle}>
            Invited
          </ThemedText>
          {roster.invitedEntries.length > 0 ? (
            roster.invitedEntries.map((entry) => renderInvitedRow(entry))
          ) : (
            <View style={styles.emptyState}>
              <ThemedText type="bodyLarge" lightColor="#666" darkColor="#999">
                No invited users yet.
              </ThemedText>
            </View>
          )}
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
        </View>
        {shouldRenderFooter ? (
          <View style={styles.playersListFooter}>
            {(isHost && session.isRanked) || hostPresenceUi.isUnavailable ? (
              <View style={[
                styles.section,
                isCompact && styles.sectionCompact,
                { borderTopColor: colorScheme === 'dark' ? '#333' : '#e0e0e0' }
              ]}>
                <ThemedText type="titleMedium" style={styles.hostToolsTitle}>
                  Host tools
                </ThemedText>
                {isHost && session.isRanked && (
                  <Button
                    title="Submit Result"
                    variant="outlined"
                    textColor="#FF6B00"
                    style={styles.hostToolButton}
                    onPress={handleOpenResultDialog}
                    disabled={joinedParticipants.length < 2 || isSubmittingResult}
                    loading={isSubmittingResult}
                  />
                )}
                {hostPresenceUi.isUnavailable && (
                  <Button
                    title="Connect Roblox for Presence"
                    variant="outlined"
                    textColor="#007AFF"
                    style={styles.hostToolButton}
                    onPress={handleConnectRoblox}
                  />
                )}
              </View>
            ) : null}

            {isHost && stuckParticipants.length > 0 && (
              <View style={[
                styles.section,
                isCompact && styles.sectionCompact,
                styles.stuckCard,
                isCompact && styles.stuckCardCompact,
                { borderTopColor: colorScheme === 'dark' ? '#333' : '#e0e0e0' }
              ]}>
                <ThemedText type="titleMedium" style={styles.stuckTitle}>
                  ⚠ Stuck players ({stuckParticipants.length})
                </ThemedText>
                {stuckParticipants.map((participant) => (
                  <ThemedText key={`stuck-${participant.userId}`} type="bodyMedium" style={styles.stuckUserText}>
                    {getDisplayName(participant.displayName, participant.userId)}
                  </ThemedText>
                ))}
                <Button
                  title="Copy Host Tip"
                  variant="outlined"
                  textColor="#007AFF"
                  style={styles.copyTipButton}
                  onPress={() => Clipboard.setStringAsync("Open Roblox, join host from Friends -> Join (or party invite), then return and tap I'm in.")}
                />
              </View>
            )}
          </View>
        ) : null}
        <TouchableOpacity style={styles.safetyLinkContainer} onPress={handleOpenSafetyReport} accessibilityRole="button">
          <ThemedText type="bodyMedium" lightColor="#c62828" darkColor="#ff7b72" style={styles.safetyLinkText}>
            Safety & Report
          </ThemedText>
        </TouchableOpacity>
      </ScrollView>

      {isResultDialogVisible ? (
        <Portal>
          <Dialog visible={isResultDialogVisible} onDismiss={() => setIsResultDialogVisible(false)}>
            <Dialog.Title>Select Winner</Dialog.Title>
            <Dialog.Content>
              {joinedParticipants.map((participant) => (
                <RadioButton.Item
                  key={`winner-${participant.userId}`}
                  label={`${getDisplayName(participant.displayName, participant.userId)}${participant.userId === session.hostId ? ' (Host)' : ''}`}
                  value={participant.userId}
                  status={selectedWinnerId === participant.userId ? 'checked' : 'unchecked'}
                  onPress={() => setSelectedWinnerId(participant.userId)}
                />
              ))}
            </Dialog.Content>
            <Dialog.Actions>
              <Button
                title="Cancel"
                variant="text"
                onPress={() => setIsResultDialogVisible(false)}
                disabled={isSubmittingResult}
              />
              <Button
                title="Confirm Result"
                variant="filled"
                buttonColor="#FF6B00"
                textColor="#fff"
                onPress={handleSubmitResult}
                disabled={!selectedWinnerId || isSubmittingResult}
                loading={isSubmittingResult}
              />
            </Dialog.Actions>
          </Dialog>
        </Portal>
      ) : null}
    </Fragment>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 48,
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
    backgroundColor: '#e0e0e0',
  },
  bannerPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleSection: {
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  titleSectionCompact: {
    paddingVertical: 12,
  },
  title: {
    marginBottom: 0,
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  gameName: {
    marginBottom: 12,
  },
  hostMeta: {
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
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  badgeText: {
    flexShrink: 1,
  },
  primaryActions: {
    paddingTop: 14,
    paddingBottom: 6,
    gap: 12,
  },
  primaryActionsCompact: {
    paddingTop: 10,
    paddingBottom: 4,
    gap: 8,
  },
  section: {
    paddingVertical: 14,
    borderTopWidth: 1,
  },
  sectionCompact: {
    paddingVertical: 10,
  },
  sectionTitle: {
    marginBottom: 10,
  },
  playersListFooter: {
    paddingBottom: 8,
  },
  playersHeader: {
    paddingTop: 14,
    paddingBottom: 8,
    borderTopWidth: 1,
  },
  playersHeaderCompact: {
    paddingTop: 10,
    paddingBottom: 6,
  },
  playersListContainer: {
    width: '100%',
  },
  participant: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 8,
    marginHorizontal: -8,
    marginBottom: 4,
  },
  hostParticipant: {
    backgroundColor: 'rgba(52, 120, 246, 0.10)',
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
  invitedPlaceholderAvatar: {
    backgroundColor: '#7a7a7a',
  },
  participantInfo: {
    flex: 1,
    marginRight: 10,
  },
  handoffBadge: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: '#6c757d',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexShrink: 0,
  },
  handoffBadgeText: {
    fontSize: 12,
    textAlign: 'center',
  },
  stuckUserText: {
    marginBottom: 4,
  },
  copyTipButton: {
    borderRadius: 8,
    marginTop: 6,
  },
  shareButton: {
    borderRadius: 8,
    marginTop: 12,
  },
  hostToolsTitle: {
    marginBottom: 8,
  },
  hostToolButton: {
    borderRadius: 8,
    marginTop: 8,
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
  actionButtonContentCompact: {
    minHeight: 50,
  },
  actionButtonLabel: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '600',
  },
  actionButtonLabelCompact: {
    fontSize: 20,
  },
  fullMessage: {
    backgroundColor: '#ffebee',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  stuckCard: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#ffd8a8',
    borderRadius: 10,
    backgroundColor: '#fff9f1',
    paddingTop: 10,
    paddingBottom: 12,
  },
  stuckCardCompact: {
    marginTop: 6,
    paddingTop: 8,
    paddingBottom: 10,
  },
  stuckTitle: {
    marginBottom: 8,
  },
  emptyState: {
    paddingVertical: 12,
  },
  safetyLinkContainer: {
    paddingTop: 12,
    paddingBottom: 10,
    alignItems: 'center',
  },
  safetyLinkText: {
    textDecorationLine: 'underline',
  },
});
