/**
 * SessionLobbyScreen
 *
 * Post-creation session management screen.
 * Shows session info, smart invite strip, invited participants,
 * and a START SESSION action.
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Share,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Switch } from 'react-native-paper';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/src/features/auth/useAuth';
import { useErrorHandler } from '@/hooks/useErrorHandler';
import { sessionsAPIStoreV2 } from '@/src/features/sessions/apiStore-v2';
import { useSmartInviteSuggestions } from '@/src/features/sessions/useSmartInviteSuggestions';
import { recordInvite } from '@/src/features/sessions/inviteHistory';
import { ThemedText } from '@/components/themed-text';
import { AnimatedButton as Button } from '@/components/ui/paper';
import { SessionHeroCard } from '@/components/session/SessionHeroCard';
import { QuickInviteStrip } from '@/components/session/QuickInviteStrip';
import { InvitedFriendsCard } from '@/components/session/InvitedFriendsCard';
import { ParticipantReadinessList } from '@/components/session/ParticipantReadinessList';
import { logger } from '@/src/lib/logger';
import { monitoring } from '@/src/lib/monitoring';
import type {
  SessionDetail,
  ParticipantHandoffState,
} from '@/src/features/sessions/types-v2';

export default function SessionLobbyScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { user } = useAuth();
  const { handleError } = useErrorHandler();
  const params = useLocalSearchParams<{
    id: string;
    inviteLink?: string;
  }>();

  const sessionId = params.id;
  const inviteLink = params.inviteLink ?? '';

  // Session state
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [localTitle, setLocalTitle] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [optionsExpanded, setOptionsExpanded] = useState(false);

  // Track locally invited IDs (Roblox user IDs, UI state)
  const [localInvitedIds, setLocalInvitedIds] = useState<number[]>([]);

  // Roblox user IDs to exclude from suggestions (already in session as participants)
  const alreadyInvitedRobloxIds = useMemo<number[]>(() => {
    if (!session?.invitedRobloxUsers) return [];
    return session.invitedRobloxUsers
      .map((u) => parseInt(u.robloxUserId, 10))
      .filter((id) => !isNaN(id));
  }, [session]);

  const excludeFromSuggestions = useMemo(
    () => [...alreadyInvitedRobloxIds, ...localInvitedIds],
    [alreadyInvitedRobloxIds, localInvitedIds]
  );

  // Smart invite suggestions
  const { suggestions, isLoading: suggestionsLoading } = useSmartInviteSuggestions({
    userId: user?.id,
    excludeIds: excludeFromSuggestions,
    limit: 8,
  });

  // Load session
  const loadSession = useCallback(async () => {
    if (!sessionId) return;
    try {
      setIsLoading(true);
      const detail = await sessionsAPIStoreV2.getSessionById(sessionId);
      setSession(detail);
      if (!localTitle) setLocalTitle(detail.title);
    } catch (err) {
      handleError(err, { fallbackMessage: 'Failed to load session' });
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, handleError, localTitle]);

  useEffect(() => {
    void loadSession();
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Periodically refresh session so readiness list stays current while host waits
  useEffect(() => {
    if (!sessionId) return;
    const interval = setInterval(() => {
      void sessionsAPIStoreV2.getSessionById(sessionId).then((detail) => {
        setSession(detail);
      }).catch(() => {
        // Non-critical background refresh — ignore errors
      });
    }, 15_000);
    return () => clearInterval(interval);
  }, [sessionId]);

  // Log strip impression once suggestions are ready
  useEffect(() => {
    if (!suggestionsLoading && session) {
      const hasNoSuggestions = suggestions.length === 0;
      logger.info('smart_suggestions: strip impression', {
        sessionId,
        suggestionCount: suggestions.length,
        noSuggestions: hasNoSuggestions,
      });
      monitoring.addBreadcrumb({
        category: 'user',
        level: 'info',
        message: 'QuickInviteStrip impression',
        data: { sessionId, suggestionCount: suggestions.length },
      });
    }
  }, [suggestionsLoading, session, suggestions.length, sessionId]);

  const handleInvite = useCallback(
    async (friendId: number) => {
      // Optimistic UI update — move chip to invited state
      setLocalInvitedIds((prev) =>
        prev.includes(friendId) ? prev : [...prev, friendId]
      );

      // Record in local invite history (powers "Played with you" in future sessions)
      if (user?.id) {
        void recordInvite(user.id, friendId);
      }

      logger.info('smart_suggestions: invite tapped', { friendId, sessionId });

      // Share the invite link
      if (inviteLink) {
        const startMs = Date.now();
        try {
          await Share.share({ message: inviteLink });
          logger.info('smart_suggestions: invite share succeeded', {
            friendId,
            sessionId,
            latencyMs: Date.now() - startMs,
          });
        } catch {
          // User cancelled share sheet — not an error
        }
      }
    },
    [inviteLink, user?.id, sessionId]
  );

  const handleShareLink = useCallback(async () => {
    if (!inviteLink) return;
    try {
      await Share.share({ message: inviteLink });
    } catch {
      // user cancelled
    }
  }, [inviteLink]);

  const handleOpenFriendPicker = useCallback(() => {
    router.push({
      pathname: '/sessions/friend-picker',
      params: { inviteLink },
    });
  }, [router, inviteLink]);

  const handleStartSession = useCallback(async () => {
    if (!sessionId) return;
    setIsStarting(true);
    try {
      router.replace({
        pathname: '/sessions/[id]',
        params: {
          id: sessionId,
          inviteLink,
          justCreated: 'true',
        },
      });
    } finally {
      setIsStarting(false);
    }
  }, [sessionId, inviteLink, router]);

  // Build invited participants list from session data
  const invitedParticipants = useMemo(() => {
    if (!session) return [];
    return session.participants
      .filter((p) => p.userId !== session.hostId)
      .map((p) => ({
        id: p.userId,
        displayName: p.displayName ?? null,
        avatarUrl: null as string | null,
        state: p.state,
        handoffState: p.handoffState as ParticipantHandoffState | undefined,
      }));
  }, [session]);

  const hostName =
    session?.host?.robloxDisplayName ??
    session?.host?.robloxUsername ??
    user?.robloxDisplayName ??
    user?.robloxUsername ??
    'Host';

  if (isLoading || !session) {
    return (
      <View style={[styles.center, { backgroundColor: isDark ? '#000' : '#fff' }]}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: isDark ? '#000' : '#fff' }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* Hero card */}
        <SessionHeroCard
          gameName={session.game.gameName ?? 'Roblox Game'}
          thumbnailUrl={session.game.thumbnailUrl}
          title={localTitle}
          onTitleChange={setLocalTitle}
          visibility={session.visibility}
          hostName={hostName}
        />

        {/* Squad readiness — shows participants' launch states */}
        {session.participants.length > 0 && (
          <ParticipantReadinessList
            session={session}
            currentUserId={user?.id}
          />
        )}

        {/* Smart invite strip — shows skeleton while loading, hides when empty */}
        <QuickInviteStrip
          suggestions={suggestions}
          isLoading={suggestionsLoading}
          invitedIds={localInvitedIds}
          onInvite={handleInvite}
          onShowMore={handleOpenFriendPicker}
        />

        {/* Invited friends section */}
        <View style={styles.section}>
          <ThemedText
            type="labelSmall"
            lightColor="#8E8E93"
            darkColor="#636366"
            style={styles.sectionLabel}
          >
            INVITED
          </ThemedText>
          <InvitedFriendsCard participants={invitedParticipants} />
        </View>

        {/* Search / open friend picker */}
        <View style={styles.section}>
          <Pressable
            style={[styles.searchTrigger, { borderColor: isDark ? '#3a3a3c' : '#d0d0d0' }]}
            onPress={handleOpenFriendPicker}
          >
            <MaterialIcons name="search" size={18} color={isDark ? '#636366' : '#8E8E93'} />
            <ThemedText type="bodyMedium" lightColor="#8E8E93" darkColor="#636366">
              Search friends...
            </ThemedText>
          </Pressable>
        </View>

        {/* Session settings */}
        <View style={styles.section}>
          <Pressable
            style={[styles.expandHeader, { borderColor: isDark ? '#2a2a2a' : '#e0e0e0' }]}
            onPress={() => setOptionsExpanded((v) => !v)}
          >
            <ThemedText type="titleMedium">Session Settings</ThemedText>
            <MaterialIcons
              name={optionsExpanded ? 'expand-less' : 'expand-more'}
              size={20}
              color={isDark ? '#bbb' : '#555'}
            />
          </Pressable>

          {optionsExpanded && (
            <View style={[styles.expandBody, { borderColor: isDark ? '#2a2a2a' : '#e0e0e0' }]}>
              <View style={styles.optionRow}>
                <View style={styles.optionText}>
                  <ThemedText type="bodyLarge">Ranked session</ThemedText>
                  <ThemedText type="bodySmall" lightColor="#8E8E93" darkColor="#636366">
                    Affects player rating
                  </ThemedText>
                </View>
                <Switch value={session.isRanked} disabled />
              </View>

              {inviteLink ? (
                <Pressable style={styles.shareLinkRow} onPress={handleShareLink}>
                  <MaterialIcons name="link" size={18} color="#007AFF" />
                  <ThemedText type="bodyMedium" style={{ color: '#007AFF' }}>
                    Share invite link
                  </ThemedText>
                </Pressable>
              ) : null}
            </View>
          )}
        </View>
      </ScrollView>

      {/* START SESSION CTA */}
      <View
        style={[
          styles.footer,
          {
            backgroundColor: isDark ? '#000' : '#fff',
            borderTopColor: isDark ? '#2a2a2a' : '#e0e0e0',
          },
        ]}
      >
        <Button
          title={isStarting ? 'Starting...' : 'START SESSION'}
          variant="filled"
          buttonColor="#34C759"
          enableHaptics
          style={styles.startBtn}
          contentStyle={styles.startBtnContent}
          labelStyle={styles.startBtnLabel}
          onPress={handleStartSession}
          loading={isStarting}
          disabled={isStarting}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 24 },
  section: { marginBottom: 20 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  searchTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  expandHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  expandBody: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 14,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  optionText: { flex: 1, gap: 2 },
  shareLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  startBtn: {
    borderRadius: 14,
    shadowColor: '#34C759',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  startBtnContent: { minHeight: 56 },
  startBtnLabel: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
