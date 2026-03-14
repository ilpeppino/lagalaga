import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { SegmentedButtons } from 'react-native-paper';
import { ThemedText } from '@/components/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useErrorHandler } from '@/hooks/useErrorHandler';
import { useAuth } from '@/src/features/auth/useAuth';
import { useFavorites } from '@/src/features/favorites/useFavorites';
import type { Favorite } from '@/src/features/favorites/cache';
import { warmFavorites } from '@/src/features/favorites/service';
import { useFriends } from '@/src/features/friends/useFriends';
import { sessionsAPIStoreV2 } from '@/src/features/sessions/apiStore-v2';
import { buildCreateSessionPayload, toggleFriendSelection } from '@/src/features/sessions/friendSelection';
import {
  buildAutoSessionTitle,
  buildAvailableFriends,
  buildScheduledStartIso,
  buildSelectedFriendsMap,
  type SessionStartMode,
} from '@/src/features/sessions/createSessionFlow';
import { AnimatedButton as Button, TextInput } from '@/components/ui/paper';

function getFavoriteDisplayName(favorite: Favorite): string {
  return favorite.name?.trim() || 'Unnamed Experience';
}

function formatScheduleDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatScheduleTime(date: Date): string {
  return date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function CreateSessionScreenV2() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { user } = useAuth();
  const { getErrorMessage } = useErrorHandler();

  const {
    favorites,
    loading: isLoadingFavorites,
    error: favoritesError,
    refresh: refreshFavorites,
    forceRefresh: forceRefreshFavorites,
  } = useFavorites(user?.id);

  const {
    friends,
    isLoading: isLoadingFriends,
    isRefreshing: isRefreshingFriends,
    error: friendsError,
    robloxNotConnected,
    refresh: refreshFriends,
  } = useFriends(user?.id);

  const [robloxUrl, setRobloxUrl] = useState('');
  const [selectedFavorite, setSelectedFavorite] = useState<Favorite | null>(null);
  const [gameInputMode, setGameInputMode] = useState<'favorites' | 'link'>('favorites');
  const [isFavoritesExpanded, setIsFavoritesExpanded] = useState(false);

  const [sessionName, setSessionName] = useState('');
  const [hasEditedSessionName, setHasEditedSessionName] = useState(false);

  const [startMode, setStartMode] = useState<SessionStartMode>('now');
  const [scheduledDate, setScheduledDate] = useState<Date>(new Date());
  const [scheduledTime, setScheduledTime] = useState<Date>(new Date(Date.now() + 30 * 60 * 1000));
  const [activePicker, setActivePicker] = useState<'date' | 'time' | null>(null);

  const [selectedFriendIds, setSelectedFriendIds] = useState<number[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchVisible, setSearchVisible] = useState(false);

  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchInputRef = useRef<any>(null);

  useEffect(() => {
    if (user?.id) {
      void warmFavorites(user.id);
    }
  }, [user?.id]);

  const autoTitle = useMemo(
    () =>
      buildAutoSessionTitle({
        robloxDisplayName: user?.robloxDisplayName,
        robloxUsername: user?.robloxUsername,
        gameName: selectedFavorite ? getFavoriteDisplayName(selectedFavorite) : 'Roblox',
      }),
    [selectedFavorite, user?.robloxDisplayName, user?.robloxUsername]
  );

  useEffect(() => {
    if (!hasEditedSessionName) {
      setSessionName(autoTitle);
    }
  }, [autoTitle, hasEditedSessionName]);

  const selectedFriends = useMemo(
    () => buildSelectedFriendsMap(friends, selectedFriendIds),
    [friends, selectedFriendIds]
  );

  const availableFriends = useMemo(
    () =>
      buildAvailableFriends({
        friends,
        selectedIds: selectedFriendIds,
        searchQuery,
      }),
    [friends, searchQuery, selectedFriendIds]
  );

  const scheduledStartIso = useMemo(
    () =>
      buildScheduledStartIso({
        startMode,
        scheduledDate,
        scheduledTime,
      }),
    [scheduledDate, scheduledTime, startMode]
  );

  const timezone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'Local timezone',
    []
  );

  const handleSelectFavorite = (favorite: Favorite) => {
    setSelectedFavorite(favorite);
    setRobloxUrl(favorite.url ?? '');
    setIsFavoritesExpanded(false);
  };

  const handleToggleFriend = (friendId: number) => {
    setSelectedFriendIds((prev) => toggleFriendSelection(prev, friendId));
  };

  const handleOpenSearch = () => {
    setSearchVisible(true);
    setTimeout(() => {
      searchInputRef.current?.focus?.();
    }, 50);
  };

  const handlePickerChange = (mode: 'date' | 'time') => (event: DateTimePickerEvent, value?: Date) => {
    if (Platform.OS === 'android') {
      setActivePicker(null);
    }

    if (event.type !== 'set' || !value) {
      return;
    }

    if (mode === 'date') {
      setScheduledDate(value);
      return;
    }

    setScheduledTime(value);
  };

  const handleStartSession = async () => {
    setError(null);

    if (!robloxUrl.trim()) {
      setError('Please select or enter a Roblox game link.');
      return;
    }

    if (!sessionName.trim()) {
      setError('Session name cannot be empty.');
      return;
    }

    if (startMode === 'scheduled' && scheduledStartIso) {
      const now = Date.now();
      const scheduledMs = new Date(scheduledStartIso).getTime();
      if (scheduledMs <= now) {
        setError('Scheduled start must be in the future.');
        return;
      }
    }

    try {
      setIsCreating(true);
      const result = await sessionsAPIStoreV2.createSession(
        buildCreateSessionPayload({
          robloxUrl: robloxUrl.trim(),
          title: sessionName.trim(),
          visibility: 'friends',
          isRanked: false,
          scheduledStart: scheduledStartIso,
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
      setError(getErrorMessage(err, 'Failed to create session'));
    } finally {
      setIsCreating(false);
    }
  };

  const canStart = !isCreating && Boolean(robloxUrl.trim()) && Boolean(sessionName.trim());

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: isDark ? '#000' : '#fff' }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.section}>
          <ThemedText type="labelSmall" lightColor="#8E8E93" darkColor="#636366" style={styles.sectionLabel}>
            GAME
          </ThemedText>

          {gameInputMode === 'favorites' ? (
            <View style={[styles.gameCard, { backgroundColor: isDark ? '#1c1c1e' : '#f2f2f7' }]}>
              <Pressable
                onPress={() => setIsFavoritesExpanded((prev) => !prev)}
                style={styles.gameCardInner}
                accessibilityRole="button"
                testID="game-card"
              >
                {selectedFavorite?.thumbnailUrl ? (
                  <Image source={{ uri: selectedFavorite.thumbnailUrl }} style={styles.gameThumbnail} />
                ) : (
                  <View style={[styles.gameThumbnail, styles.gameThumbnailPlaceholder]}>
                    <MaterialIcons name="gamepad" size={24} color={isDark ? '#555' : '#bbb'} />
                  </View>
                )}

                <View style={styles.gameTextWrap}>
                  <ThemedText type="bodyMedium" numberOfLines={2} style={styles.gameTitle}>
                    {selectedFavorite ? getFavoriteDisplayName(selectedFavorite) : 'Select from your Roblox favorites'}
                  </ThemedText>
                  {isLoadingFavorites ? (
                    <ThemedText type="bodySmall" lightColor="#8E8E93" darkColor="#636366">Loading...</ThemedText>
                  ) : null}
                </View>

                <Pressable
                  onPress={(event) => {
                    event.stopPropagation();
                    void forceRefreshFavorites();
                  }}
                  hitSlop={8}
                  accessibilityRole="button"
                  testID="game-refresh"
                >
                  <MaterialIcons name="refresh" size={20} color={isDark ? '#636366' : '#8E8E93'} />
                </Pressable>
              </Pressable>

              {isFavoritesExpanded && (
                <View style={[styles.favoriteList, { borderTopColor: isDark ? '#2c2c2e' : '#dddddd' }]}>
                  {favorites.map((favorite) => (
                    <Pressable
                      key={favorite.id}
                      style={styles.favoriteRow}
                      onPress={() => handleSelectFavorite(favorite)}
                      testID={`favorite-option-${favorite.id}`}
                    >
                      <ThemedText type="bodyMedium" numberOfLines={1}>
                        {getFavoriteDisplayName(favorite)}
                      </ThemedText>
                    </Pressable>
                  ))}

                  {favorites.length === 0 && isLoadingFavorites ? (
                    <ThemedText type="bodySmall" lightColor="#8E8E93" darkColor="#636366">
                      Loading favorites...
                    </ThemedText>
                  ) : null}

                  {favorites.length === 0 && favoritesError ? (
                    <Pressable onPress={() => void refreshFavorites()}>
                      <ThemedText type="bodySmall" style={{ color: '#007AFF' }}>
                        Could not load favorites. Tap to retry.
                      </ThemedText>
                    </Pressable>
                  ) : null}

                  {favorites.length === 0 && !isLoadingFavorites && !favoritesError ? (
                    <ThemedText type="bodySmall" lightColor="#8E8E93" darkColor="#636366">
                      No favorites found.
                    </ThemedText>
                  ) : null}
                </View>
              )}
            </View>
          ) : (
            <TextInput
              style={styles.textInput}
              value={robloxUrl}
              onChangeText={setRobloxUrl}
              placeholder="https://www.roblox.com/games/..."
              autoCapitalize="none"
              keyboardType="url"
              autoCorrect={false}
              variant="outlined"
              testID="game-link-input"
            />
          )}

          <Button
            title={gameInputMode === 'favorites' ? 'Paste a link instead' : 'Back to favorites'}
            variant="text"
            textColor="#007AFF"
            style={styles.inlineAction}
            onPress={() => {
              setGameInputMode((prev) => {
                if (prev === 'favorites') {
                  setSelectedFavorite(null);
                  return 'link';
                }
                return 'favorites';
              });
            }}
          />
        </View>

        <View style={styles.section}>
          <ThemedText type="labelSmall" lightColor="#8E8E93" darkColor="#636366" style={styles.sectionLabel}>
            SESSION NAME
          </ThemedText>
          <TextInput
            style={styles.textInput}
            value={sessionName}
            onChangeText={(value) => {
              setHasEditedSessionName(true);
              setSessionName(value);
            }}
            placeholder="Session name"
            variant="outlined"
            maxLength={100}
            testID="session-name-input"
          />
        </View>

        <View style={styles.section}>
          <ThemedText type="labelSmall" lightColor="#8E8E93" darkColor="#636366" style={styles.sectionLabel}>
            START TIME
          </ThemedText>

          <SegmentedButtons
            value={startMode}
            onValueChange={(value) => setStartMode(value as SessionStartMode)}
            buttons={[
              { value: 'now', label: 'Now' },
              { value: 'scheduled', label: 'Scheduled' },
            ]}
          />

          {startMode === 'scheduled' && (
            <View style={styles.scheduleWrap}>
              <View style={styles.scheduleRow}>
                <Pressable
                  style={[styles.scheduleButton, { borderColor: isDark ? '#2f2f2f' : '#d8d8d8' }]}
                  onPress={() => setActivePicker('date')}
                  testID="scheduled-date-button"
                >
                  <MaterialIcons name="calendar-today" size={16} color={isDark ? '#b8b8b8' : '#5f5f5f'} />
                  <ThemedText type="bodyMedium">{formatScheduleDate(scheduledDate)}</ThemedText>
                </Pressable>

                <Pressable
                  style={[styles.scheduleButton, { borderColor: isDark ? '#2f2f2f' : '#d8d8d8' }]}
                  onPress={() => setActivePicker('time')}
                  testID="scheduled-time-button"
                >
                  <MaterialIcons name="schedule" size={16} color={isDark ? '#b8b8b8' : '#5f5f5f'} />
                  <ThemedText type="bodyMedium">{formatScheduleTime(scheduledTime)}</ThemedText>
                </Pressable>
              </View>

              <ThemedText type="bodySmall" lightColor="#8E8E93" darkColor="#636366">
                Times use {timezone}.
              </ThemedText>

              {activePicker === 'date' ? (
                <DateTimePicker
                  value={scheduledDate}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'inline' : 'default'}
                  minimumDate={new Date()}
                  onChange={handlePickerChange('date')}
                />
              ) : null}

              {activePicker === 'time' ? (
                <DateTimePicker
                  value={scheduledTime}
                  mode="time"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={handlePickerChange('time')}
                />
              ) : null}
            </View>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <ThemedText type="labelSmall" lightColor="#8E8E93" darkColor="#636366" style={styles.sectionLabel}>
              SQUAD
            </ThemedText>
            {isRefreshingFriends ? <ActivityIndicator size="small" color="#007AFF" /> : null}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.squadRow}>
            <View style={[styles.memberCard, styles.memberCardHost, { borderColor: isDark ? '#2f2f2f' : '#d8d8d8' }]}>
              {user?.avatarHeadshotUrl ? (
                <Image source={{ uri: user.avatarHeadshotUrl }} style={styles.memberAvatar} />
              ) : (
                <View style={[styles.memberAvatar, styles.memberAvatarFallback]} />
              )}
              <ThemedText type="bodySmall" numberOfLines={1}>
                {user?.robloxDisplayName || user?.robloxUsername || 'You'}
              </ThemedText>
            </View>

            {selectedFriends.map((friend) => (
              <Pressable
                key={friend.id}
                style={[styles.memberCard, { borderColor: isDark ? '#2f2f2f' : '#d8d8d8' }]}
                onPress={() => handleToggleFriend(friend.id)}
                accessibilityRole="button"
                testID={`squad-member-${friend.id}`}
              >
                {friend.avatarUrl ? (
                  <Image source={{ uri: friend.avatarUrl }} style={styles.memberAvatar} />
                ) : (
                  <View style={[styles.memberAvatar, styles.memberAvatarFallback]} />
                )}
                <ThemedText type="bodySmall" numberOfLines={1}>
                  {friend.displayName || friend.name}
                </ThemedText>
                <View style={styles.removeBadge}>
                  <MaterialIcons name="close" size={12} color="#fff" />
                </View>
              </Pressable>
            ))}
          </ScrollView>

          {searchVisible ? (
            <TextInput
              ref={searchInputRef}
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search friends"
              autoCapitalize="none"
              autoCorrect={false}
              variant="outlined"
              testID="squad-search-input"
            />
          ) : null}

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.friendRail}
            testID="friend-rail"
          >
            <Pressable
              style={[styles.addCard, styles.searchCard, { borderColor: isDark ? '#2f2f2f' : '#d8d8d8' }]}
              onPress={handleOpenSearch}
              testID="friend-rail-search-tile"
            >
              <MaterialIcons name="search" size={18} color={isDark ? '#b8b8b8' : '#5f5f5f'} />
              <ThemedText type="bodySmall">Search</ThemedText>
            </Pressable>

            {isLoadingFriends ? (
              <View style={[styles.addCard, styles.loadingCard, { borderColor: isDark ? '#2f2f2f' : '#d8d8d8' }]}>
                <ActivityIndicator size="small" color="#007AFF" />
              </View>
            ) : null}

            {!isLoadingFriends && robloxNotConnected ? (
              <View style={[styles.addCard, styles.messageCard, { borderColor: isDark ? '#2f2f2f' : '#d8d8d8' }]}>
                <ThemedText type="bodySmall" lightColor="#8E8E93" darkColor="#636366">
                  Connect Roblox
                </ThemedText>
              </View>
            ) : null}

            {!isLoadingFriends && !robloxNotConnected && availableFriends.map((friend) => (
              <Pressable
                key={friend.id}
                style={[styles.addCard, { borderColor: isDark ? '#2f2f2f' : '#d8d8d8' }]}
                onPress={() => handleToggleFriend(friend.id)}
                testID={`friend-rail-item-${friend.id}`}
              >
                {friend.avatarUrl ? (
                  <Image source={{ uri: friend.avatarUrl }} style={styles.addAvatar} />
                ) : (
                  <View style={[styles.addAvatar, styles.memberAvatarFallback]} />
                )}
                <ThemedText type="bodySmall" numberOfLines={1} style={styles.addName}>
                  {friend.displayName || friend.name}
                </ThemedText>
              </Pressable>
            ))}
          </ScrollView>

          {friendsError ? (
            <Pressable onPress={() => void refreshFriends()} style={styles.retryRow}>
              <ThemedText type="bodySmall" style={{ color: '#007AFF' }}>
                Could not load friends. Tap to retry.
              </ThemedText>
            </Pressable>
          ) : null}
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <ThemedText type="bodyMedium" lightColor="#c62828" darkColor="#ff5252">
              {error}
            </ThemedText>
          </View>
        ) : null}
      </ScrollView>

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
          title={isCreating ? 'Starting...' : 'Start Session'}
          variant="filled"
          buttonColor="#34C759"
          enableHaptics
          style={[styles.ctaButton, !canStart && styles.ctaButtonDisabled]}
          contentStyle={styles.ctaButtonContent}
          labelStyle={styles.ctaButtonLabel}
          onPress={handleStartSession}
          loading={isCreating}
          disabled={!canStart}
          testID="start-session-cta"
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 120,
  },
  section: {
    marginBottom: 22,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  gameCard: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  gameCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
  },
  gameThumbnail: {
    width: 62,
    height: 62,
    borderRadius: 12,
  },
  gameThumbnailPlaceholder: {
    backgroundColor: '#d1d1d6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  gameTextWrap: {
    flex: 1,
    gap: 2,
  },
  gameTitle: {
    fontWeight: '600',
  },
  favoriteList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  favoriteRow: {
    paddingVertical: 2,
  },
  inlineAction: {
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  textInput: {
    borderRadius: 10,
  },
  scheduleWrap: {
    marginTop: 12,
    gap: 10,
  },
  scheduleRow: {
    flexDirection: 'row',
    gap: 10,
  },
  scheduleButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  squadRow: {
    gap: 10,
    paddingBottom: 8,
  },
  memberCard: {
    width: 86,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    position: 'relative',
  },
  memberCardHost: {
    borderStyle: 'solid',
  },
  memberAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  memberAvatarFallback: {
    backgroundColor: '#d1d1d6',
  },
  removeBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#ff3b30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchInput: {
    borderRadius: 10,
    marginBottom: 10,
  },
  friendRail: {
    gap: 10,
    paddingBottom: 4,
  },
  addCard: {
    width: 92,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  searchCard: {
    backgroundColor: 'transparent',
  },
  loadingCard: {
    height: 92,
  },
  messageCard: {
    width: 132,
    height: 92,
  },
  addAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  addName: {
    textAlign: 'center',
    width: '100%',
  },
  retryRow: {
    marginTop: 8,
  },
  errorBox: {
    backgroundColor: '#ffebee',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
  },
  ctaButton: {
    borderRadius: 14,
    shadowColor: '#34C759',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.24,
    shadowRadius: 10,
    elevation: 5,
  },
  ctaButtonDisabled: {
    opacity: 0.55,
    shadowOpacity: 0,
    elevation: 0,
  },
  ctaButtonContent: {
    minHeight: 56,
  },
  ctaButtonLabel: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
});
