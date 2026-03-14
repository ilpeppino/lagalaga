import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput as RNTextInput,
  UIManager,
  View,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  buildFriendSearchResults,
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
  const insets = useSafeAreaInsets();
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

  const [startMode, setStartMode] = useState<SessionStartMode>('now');
  const [scheduledDate, setScheduledDate] = useState<Date>(new Date());
  const [scheduledTime, setScheduledTime] = useState<Date>(new Date(Date.now() + 30 * 60 * 1000));
  const [activePicker, setActivePicker] = useState<'date' | 'time' | null>(null);

  const [selectedFriendIds, setSelectedFriendIds] = useState<number[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchInputRef = useRef<RNTextInput | null>(null);

  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

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

  const selectedFriends = useMemo(
    () => buildSelectedFriendsMap(friends, selectedFriendIds),
    [friends, selectedFriendIds]
  );

  const selectedSet = useMemo(() => new Set(selectedFriendIds), [selectedFriendIds]);

  const searchResults = useMemo(
    () =>
      buildFriendSearchResults({
        friends,
        searchQuery,
        limit: 18,
      }),
    [friends, searchQuery]
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
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectedFriendIds((prev) => toggleFriendSelection(prev, friendId));
  };

  const handleFocusSearch = () => {
    searchInputRef.current?.focus?.();
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
          title: autoTitle,
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

  const canStart = !isCreating && Boolean(robloxUrl.trim());

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: isDark ? '#000' : '#fff' }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingBottom: 132 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.section}>
          <ThemedText type="titleMedium" style={styles.blockTitle}>Game</ThemedText>

          {gameInputMode === 'favorites' ? (
            <View style={[styles.heroCard, { backgroundColor: isDark ? '#1a1a1c' : '#f4f5fa' }]}>
              <Pressable
                onPress={() => setIsFavoritesExpanded((prev) => !prev)}
                style={styles.heroCardInner}
                accessibilityRole="button"
                testID="game-card"
              >
                {selectedFavorite?.thumbnailUrl ? (
                  <Image source={{ uri: selectedFavorite.thumbnailUrl }} style={styles.heroThumbnail} />
                ) : (
                  <View style={[styles.heroThumbnail, styles.heroThumbnailPlaceholder]}>
                    <MaterialIcons name="sports-esports" size={42} color={isDark ? '#65656a' : '#b4b4bf'} />
                  </View>
                )}

                <View style={styles.heroTextWrap}>
                  <ThemedText type="titleMedium" numberOfLines={2} style={styles.heroTitle}>
                    {selectedFavorite ? getFavoriteDisplayName(selectedFavorite) : 'Choose a Roblox game'}
                  </ThemedText>
                  <ThemedText type="bodySmall" lightColor="#8E8E93" darkColor="#8b8b91" numberOfLines={2}>
                    {selectedFavorite ? 'Ready to launch with your squad' : 'Tap to pick from your favorites'}
                  </ThemedText>
                </View>

                <Pressable
                  onPress={(event) => {
                    event.stopPropagation();
                    void forceRefreshFavorites();
                  }}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Refresh game favorites"
                  testID="game-refresh"
                >
                  <MaterialIcons name="refresh" size={22} color={isDark ? '#909096' : '#62626c'} />
                </Pressable>
              </Pressable>

              {isFavoritesExpanded ? (
                <View style={[styles.favoriteList, { borderTopColor: isDark ? '#2c2c31' : '#dfdfe6' }]}>
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
              ) : null}
            </View>
          ) : (
            <TextInput
              style={styles.linkInput}
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
          <View style={styles.squadTitleRow}>
            <ThemedText type="titleMedium" style={styles.blockTitle}>Squad</ThemedText>
            {isRefreshingFriends ? <ActivityIndicator size="small" color="#007AFF" /> : null}
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.squadRow}
            testID="squad-row"
          >
            <Pressable
              style={[styles.squadTile, styles.addTile, { borderColor: isDark ? '#2c2c31' : '#d8d8df' }]}
              onPress={handleFocusSearch}
              accessibilityRole="button"
              accessibilityLabel="Add friends to squad"
              testID="squad-add-tile"
            >
              <View style={styles.addIconWrap}>
                <MaterialIcons name="person-add" size={18} color="#007AFF" />
              </View>
              <ThemedText type="bodySmall" numberOfLines={1}>Invite</ThemedText>
            </Pressable>

            <View
              style={[styles.squadTile, styles.selfTile, { borderColor: isDark ? '#2c2c31' : '#d8d8df' }]}
              testID="squad-self-tile"
            >
              {user?.avatarHeadshotUrl ? (
                <Image source={{ uri: user.avatarHeadshotUrl }} style={styles.squadAvatar} />
              ) : (
                <View style={[styles.squadAvatar, styles.avatarFallback]} />
              )}
              <ThemedText type="bodySmall" numberOfLines={1}>
                {user?.robloxDisplayName || user?.robloxUsername || 'You'}
              </ThemedText>
            </View>

            {selectedFriends.map((friend) => (
              <Pressable
                key={friend.id}
                style={[styles.squadTile, styles.selectedTile, { borderColor: '#5ac8fa' }]}
                onPress={() => handleToggleFriend(friend.id)}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${friend.displayName || friend.name} from squad`}
                testID={`squad-member-${friend.id}`}
              >
                {friend.avatarUrl ? (
                  <Image source={{ uri: friend.avatarUrl }} style={styles.squadAvatar} />
                ) : (
                  <View style={[styles.squadAvatar, styles.avatarFallback]} />
                )}
                <ThemedText type="bodySmall" numberOfLines={1} style={styles.squadName}>
                  {friend.displayName || friend.name}
                </ThemedText>
              </Pressable>
            ))}
          </ScrollView>

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

          {isLoadingFriends ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color="#007AFF" />
            </View>
          ) : null}

          {!isLoadingFriends && robloxNotConnected ? (
            <ThemedText type="bodySmall" lightColor="#8E8E93" darkColor="#636366">
              Connect Roblox to build your squad.
            </ThemedText>
          ) : null}

          {!isLoadingFriends && !robloxNotConnected && searchResults.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.resultsRow}
              testID="friend-search-results"
            >
              {searchResults.map((friend) => {
                const isSelected = selectedSet.has(friend.id);
                return (
                  <Pressable
                    key={friend.id}
                    style={[
                      styles.resultCard,
                      {
                        borderColor: isSelected ? '#5ac8fa' : isDark ? '#2c2c31' : '#d8d8df',
                        opacity: isSelected ? 0.72 : 1,
                      },
                    ]}
                    onPress={() => handleToggleFriend(friend.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={`${friend.displayName || friend.name}${isSelected ? ' in squad' : ' add to squad'}`}
                    testID={`friend-search-result-${friend.id}`}
                  >
                    {friend.avatarUrl ? (
                      <Image source={{ uri: friend.avatarUrl }} style={styles.resultAvatar} />
                    ) : (
                      <View style={[styles.resultAvatar, styles.avatarFallback]} />
                    )}
                    <ThemedText type="bodySmall" numberOfLines={1} style={styles.resultName}>
                      {friend.displayName || friend.name}
                    </ThemedText>
                    <ThemedText type="bodySmall" lightColor="#8E8E93" darkColor="#636366" numberOfLines={1}>
                      {isSelected ? 'In squad' : 'Add'}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}

          {friendsError ? (
            <Pressable onPress={() => void refreshFriends()} style={styles.retryRow}>
              <ThemedText type="bodySmall" style={{ color: '#007AFF' }}>
                Could not load friends. Tap to retry.
              </ThemedText>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.section}>
          <ThemedText type="titleMedium" style={styles.blockTitle}>Start time</ThemedText>

          <SegmentedButtons
            value={startMode}
            onValueChange={(value) => setStartMode(value as SessionStartMode)}
            buttons={[
              { value: 'now', label: 'Now' },
              { value: 'scheduled', label: 'Scheduled' },
            ]}
          />

          {startMode === 'scheduled' ? (
            <View style={styles.scheduleWrap}>
              <View style={styles.scheduleRow}>
                <Pressable
                  style={[styles.scheduleButton, { borderColor: isDark ? '#2f2f35' : '#d8d8df' }]}
                  onPress={() => setActivePicker('date')}
                  testID="scheduled-date-button"
                >
                  <MaterialIcons name="calendar-today" size={16} color={isDark ? '#b8b8c0' : '#5f5f66'} />
                  <ThemedText type="bodyMedium">{formatScheduleDate(scheduledDate)}</ThemedText>
                </Pressable>

                <Pressable
                  style={[styles.scheduleButton, { borderColor: isDark ? '#2f2f35' : '#d8d8df' }]}
                  onPress={() => setActivePicker('time')}
                  testID="scheduled-time-button"
                >
                  <MaterialIcons name="schedule" size={16} color={isDark ? '#b8b8c0' : '#5f5f66'} />
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
            borderTopColor: isDark ? '#242428' : '#e6e6eb',
            paddingBottom: Math.max(12, insets.bottom + 4),
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
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  section: {
    marginBottom: 24,
  },
  blockTitle: {
    marginBottom: 10,
    fontWeight: '700',
  },
  heroCard: {
    borderRadius: 18,
    overflow: 'hidden',
  },
  heroCardInner: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    padding: 14,
    minHeight: 132,
  },
  heroThumbnail: {
    width: 104,
    height: 104,
    borderRadius: 14,
  },
  heroThumbnailPlaceholder: {
    backgroundColor: '#d5d5dc',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroTextWrap: {
    flex: 1,
    gap: 5,
  },
  heroTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  favoriteList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  favoriteRow: {
    paddingVertical: 2,
  },
  linkInput: {
    borderRadius: 12,
  },
  inlineAction: {
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  squadTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  squadRow: {
    gap: 10,
    paddingBottom: 8,
  },
  squadTile: {
    width: 86,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  addTile: {
    borderStyle: 'dashed',
  },
  addIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#e8f2ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selfTile: {},
  selectedTile: {
    backgroundColor: '#ebf8ff',
  },
  squadAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  squadName: {
    textAlign: 'center',
    width: '100%',
  },
  avatarFallback: {
    backgroundColor: '#d1d1d6',
  },
  searchInput: {
    borderRadius: 12,
    marginTop: 8,
  },
  loadingRow: {
    paddingVertical: 10,
  },
  resultsRow: {
    gap: 10,
    paddingTop: 10,
    paddingBottom: 4,
  },
  resultCard: {
    width: 108,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 9,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  resultAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  resultName: {
    textAlign: 'center',
    width: '100%',
  },
  retryRow: {
    marginTop: 8,
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
    borderRadius: 11,
    paddingVertical: 10,
    paddingHorizontal: 12,
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
    paddingTop: 10,
  },
  ctaButton: {
    borderRadius: 14,
    shadowColor: '#34C759',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
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
