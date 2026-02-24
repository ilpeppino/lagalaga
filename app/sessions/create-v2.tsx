import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { sessionsAPIStoreV2 } from '@/src/features/sessions/apiStore-v2';
import type { RobloxFriend, RobloxFriendPresence, SessionVisibility } from '@/src/features/sessions/types-v2';
import { useErrorHandler } from '@/hooks/useErrorHandler';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/src/features/auth/useAuth';
import type { Favorite } from '@/src/features/favorites/cache';
import { warmFavorites } from '@/src/features/favorites/service';
import { useFavorites } from '@/src/features/favorites/useFavorites';
import { useFriends } from '@/src/features/friends/useFriends';
import { buildCreateSessionPayload, toggleFriendSelection } from '@/src/features/sessions/friendSelection';
import { AdvancedOptionsSection } from '@/src/features/sessions/components/AdvancedOptionsSection';
import { CreateSessionCTA } from '@/src/features/sessions/components/CreateSessionCTA';
import { GameSelectorCard } from '@/src/features/sessions/components/GameSelectorCard';
import { InviteFriendsSection } from '@/src/features/sessions/components/InviteFriendsSection';
import { SessionTitleField } from '@/src/features/sessions/components/SessionTitleField';
import { VisibilitySelector } from '@/src/features/sessions/components/VisibilitySelector';
import { createSessionPalette, spacing } from '@/src/features/sessions/components/createSessionTokens';
import { ThemedText } from '@/components/themed-text';

function getFavoriteDisplayName(favorite: Favorite): string {
  const name = favorite.name?.trim();
  if (name) {
    return name;
  }

  return 'Unnamed Experience';
}

function buildAutoTitle(title: string, selectedFavorite: Favorite | null): string {
  if (title.trim()) {
    return title.trim();
  }

  if (selectedFavorite) {
    return getFavoriteDisplayName(selectedFavorite);
  }

  return 'New Session';
}

export default function CreateSessionScreenV2() {
  const router = useRouter();
  const { getErrorMessage } = useErrorHandler();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const palette = isDark ? createSessionPalette.dark : createSessionPalette.light;
  const { user } = useAuth();
  const scrollViewRef = useRef<ScrollView>(null);
  const {
    favorites,
    loading: isLoadingFavorites,
    error: favoritesError,
    syncedAt: favoritesSyncedAt,
    isStale: favoritesIsStale,
    refresh: refreshFavorites,
    forceRefresh: forceRefreshFavorites,
  } = useFavorites(user?.id);
  const {
    friends,
    isLoading: isLoadingFriends,
    isRefreshing: isRefreshingFriends,
    error: friendsError,
    syncedAt: friendsSyncedAt,
    refresh: refreshFriends,
    reload: reloadFriends,
    robloxNotConnected,
  } = useFriends(user?.id);

  const [robloxUrl, setRobloxUrl] = useState('');
  const [selectedFavorite, setSelectedFavorite] = useState<Favorite | null>(null);
  const [title, setTitle] = useState('');
  const [visibility, setVisibility] = useState<SessionVisibility>('public');
  const [isRanked, setIsRanked] = useState(false);
  const [selectedFriendIds, setSelectedFriendIds] = useState<number[]>([]);
  const [scheduledStart, setScheduledStart] = useState<Date | null>(null);

  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [friendSearch, setFriendSearch] = useState('');

  const [presenceMap, setPresenceMap] = useState<Map<number, RobloxFriendPresence>>(new Map());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const presenceIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasInitialFriendsLoadRef = useRef(false);

  useEffect(() => {
    if (!user?.id) {
      return;
    }

    void warmFavorites(user.id);
  }, [user?.id]);

  const fetchPresence = useCallback(async (friendIds: number[]) => {
    if (friendIds.length === 0) return;
    try {
      const map = await sessionsAPIStoreV2.fetchBulkPresence(friendIds);
      setPresenceMap(map);
    } catch {
      // Presence is best-effort; ignore errors.
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!hasInitialFriendsLoadRef.current) {
        hasInitialFriendsLoadRef.current = true;
        return;
      }
      void reloadFriends();
    }, [reloadFriends])
  );

  useFocusEffect(
    useCallback(() => {
      if (friends.length > 0) {
        void fetchPresence(friends.map((f) => f.id));
      }

      presenceIntervalRef.current = setInterval(() => {
        if (AppState.currentState === 'active' && friends.length > 0) {
          void fetchPresence(friends.map((f) => f.id));
        }
      }, 30_000);

      return () => {
        if (presenceIntervalRef.current != null) {
          clearInterval(presenceIntervalRef.current);
          presenceIntervalRef.current = null;
        }
      };
    }, [friends, fetchPresence])
  );

  useEffect(() => {
    if (friends.length > 0) {
      void fetchPresence(friends.map((f) => f.id));
    }
  }, [friends, fetchPresence]);

  const handlePullToRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await fetchPresence(friends.map((f) => f.id));
    } finally {
      setIsRefreshing(false);
    }
  }, [friends, fetchPresence]);

  const handleSelectFavorite = useCallback((favorite: Favorite) => {
    setSelectedFavorite(favorite);
    setRobloxUrl(favorite.url ?? '');

    const preferredTitle = getFavoriteDisplayName(favorite);
    if (preferredTitle) {
      setTitle(preferredTitle);
    }
  }, []);

  const handleForceFavoritesRefresh = useCallback(() => {
    void forceRefreshFavorites();
  }, [forceRefreshFavorites]);

  const handleCreate = async () => {
    setError(null);

    if (!robloxUrl.trim()) {
      setError('Please enter or select a Roblox game link');
      return;
    }

    const computedTitle = buildAutoTitle(title, selectedFavorite);
    if (!title.trim()) {
      setTitle(computedTitle);
    }

    if (!computedTitle.trim()) {
      setError('Session title is required');
      return;
    }

    try {
      setIsCreating(true);

      const result = await sessionsAPIStoreV2.createSession(
        buildCreateSessionPayload({
          robloxUrl: robloxUrl.trim(),
          title: computedTitle,
          visibility,
          isRanked,
          scheduledStart: scheduledStart?.toISOString(),
          selectedFriendIds,
        })
      );

      router.replace({
        pathname: '/sessions/[id]',
        params: {
          id: result.session.id,
          inviteLink: result.inviteLink,
          justCreated: 'true',
        },
      });
    } catch (err) {
      const message = getErrorMessage(err, 'Failed to create session');
      setError(message);
    } finally {
      setIsCreating(false);
    }
  };

  const friendsWithPresence = useMemo<RobloxFriend[]>(
    () => friends.map((f) => ({ ...f, presence: presenceMap.get(f.id) })),
    [friends, presenceMap]
  );

  const filteredFriends = friendSearch.trim().length === 0
    ? friendsWithPresence
    : friendsWithPresence.filter((friend) => {
      const q = friendSearch.trim().toLowerCase();
      const display = (friend.displayName || '').toLowerCase();
      const username = (friend.name || '').toLowerCase();
      return display.includes(q) || username.includes(q);
    });

  const hasGameSelected = robloxUrl.trim().length > 0;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: palette.page }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        ref={scrollViewRef}
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => {
              void handlePullToRefresh();
            }}
            tintColor={palette.accent}
          />
        }
      >
        <View style={styles.section}>
          <GameSelectorCard
            favorites={favorites}
            selectedFavorite={selectedFavorite}
            robloxUrl={robloxUrl}
            favoritesError={favoritesError}
            isLoadingFavorites={isLoadingFavorites}
            isCreating={isCreating}
            onSelectFavorite={handleSelectFavorite}
            onSetRobloxUrl={(value) => {
              setSelectedFavorite(null);
              setRobloxUrl(value);
            }}
            onForceRefreshFavorites={handleForceFavoritesRefresh}
            onRetryFavorites={() => {
              void refreshFavorites();
            }}
          />
          {favoritesSyncedAt && (
            <ThemedText type="bodySmall" lightColor={palette.textSecondary} darkColor={palette.textSecondary} style={styles.syncedCaption}>
              {favoritesIsStale ? 'Game data may be stale.' : `Games synced ${new Date(favoritesSyncedAt).toLocaleTimeString()}`}
            </ThemedText>
          )}
        </View>

        <View style={styles.section}>
          <SessionTitleField
            title={title}
            onChangeTitle={setTitle}
            disabled={isCreating}
            onFocus={() => {
              scrollViewRef.current?.scrollTo({ y: 180, animated: true });
            }}
          />
        </View>

        <View style={styles.section}>
          <VisibilitySelector
            visibility={visibility}
            isRanked={isRanked}
            isCreating={isCreating}
            onChangeVisibility={(value) => {
              if (isRanked) {
                setVisibility('public');
                return;
              }
              setVisibility(value);
            }}
          />
        </View>

        <View style={styles.section}>
          <InviteFriendsSection
            friends={filteredFriends}
            selectedFriendIds={selectedFriendIds}
            onToggleFriend={(friendId) => {
              setSelectedFriendIds((current) => toggleFriendSelection(current, friendId));
            }}
            friendSearch={friendSearch}
            onChangeFriendSearch={setFriendSearch}
            isLoadingFriends={isLoadingFriends}
            isRefreshingFriends={isRefreshingFriends}
            friendsError={friendsError}
            friendsSyncedAt={friendsSyncedAt}
            robloxNotConnected={robloxNotConnected}
            isCreating={isCreating}
            onRefreshFriends={() => {
              void refreshFriends();
            }}
            onReloadFriends={() => {
              void reloadFriends();
            }}
            onConnectRoblox={() => {
              router.push('/roblox');
            }}
          />
        </View>

        <View style={styles.section}>
          <AdvancedOptionsSection
            isRanked={isRanked}
            scheduledStart={scheduledStart}
            isCreating={isCreating}
            onChangeRanked={(value) => {
              setIsRanked(value);
              if (value) {
                setVisibility('public');
              }
            }}
            onChangeScheduledStart={setScheduledStart}
          />
        </View>

        {error && (
          <View style={[styles.errorContainer, { backgroundColor: palette.dangerBg }]}> 
            <ThemedText type="bodyMedium" lightColor={palette.dangerText} darkColor={palette.dangerText}>
              {error}
            </ThemedText>
          </View>
        )}

        <CreateSessionCTA
          hasGameSelected={hasGameSelected}
          isCreating={isCreating}
          onPress={handleCreate}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  section: {
    marginBottom: spacing.lg,
  },
  syncedCaption: {
    marginTop: spacing.sm,
    textAlign: 'right',
    fontSize: 12,
  },
  errorContainer: {
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
});
