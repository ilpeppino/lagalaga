/**
 * Epic 3 Story 3.2: Session Creation UI
 *
 * Features:
 * - URL input with paste button
 * - Title input (auto-filled from pasted Roblox link when available)
 * - Visibility selector (public/friends/invite_only)
 * - Max participants slider (2-50)
 * - Optional scheduled start date/time
 * - Loading state
 * - Error handling via useErrorHandler
 */

import { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Platform,
  ActivityIndicator,
  Pressable,
  KeyboardAvoidingView,
} from 'react-native';
import { useRouter } from 'expo-router';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { sessionsAPIStoreV2 } from '@/src/features/sessions/apiStore-v2';
import type { RobloxFriend, SessionVisibility } from '@/src/features/sessions/types-v2';
import { useErrorHandler } from '@/hooks/useErrorHandler';
import { ThemedText } from '@/components/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Button, TextInput } from '@/components/ui/paper';
import { Menu, SegmentedButtons, Switch } from 'react-native-paper';
import { useAuth } from '@/src/features/auth/useAuth';
import { ApiError } from '@/src/lib/errors';
import type { Favorite } from '@/src/features/favorites/cache';
import { warmFavorites } from '@/src/features/favorites/service';
import { useFavorites } from '@/src/features/favorites/useFavorites';
import { FriendPickerTwoRowHorizontal } from '@/components/FriendPickerTwoRowHorizontal';
import { buildCreateSessionPayload, toggleFriendSelection } from '@/src/features/sessions/friendSelection';

const visibilityOptions: { value: SessionVisibility; label: string }[] = [
  { value: 'public', label: 'Public' },
  { value: 'friends', label: 'Friends Only' },
  { value: 'invite_only', label: 'Invite Only' },
];

function getFavoriteDisplayName(favorite: Favorite): string {
  const name = favorite.name?.trim();
  if (name) {
    return name;
  }

  return 'Unnamed Experience';
}

export default function CreateSessionScreenV2() {
  const router = useRouter();
  const { getErrorMessage } = useErrorHandler();
  const colorScheme = useColorScheme();
  const { user } = useAuth();
  const { favorites, loading: isLoadingFavorites, error: favoritesError, refresh: refreshFavorites } = useFavorites(user?.id);

  // Form state
  const [robloxUrl, setRobloxUrl] = useState('');
  const [selectedFavorite, setSelectedFavorite] = useState<Favorite | null>(null);
  const [gameInputMode, setGameInputMode] = useState<'favorites' | 'link'>('favorites');
  const [title, setTitle] = useState('');
  const [visibility, setVisibility] = useState<SessionVisibility>('public');
  const [isRanked, setIsRanked] = useState(false);
  const [friends, setFriends] = useState<RobloxFriend[]>([]);
  const [selectedFriendIds, setSelectedFriendIds] = useState<number[]>([]);
  const [scheduledStart, setScheduledStart] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);

  // UI state
  const [isCreating, setIsCreating] = useState(false);
  const [isLoadingFriends, setIsLoadingFriends] = useState(false);
  const [friendsError, setFriendsError] = useState<string | null>(null);
  const [robloxNotConnected, setRobloxNotConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [favoritesMenuVisible, setFavoritesMenuVisible] = useState(false);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [friendSearch, setFriendSearch] = useState('');

  useEffect(() => {
    if (!user?.id) {
      return;
    }

    void warmFavorites(user.id);
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) {
      return;
    }

    const loadFriends = async () => {
      try {
        setIsLoadingFriends(true);
        setFriendsError(null);
        setRobloxNotConnected(false);
        const response = await sessionsAPIStoreV2.listMyRobloxFriends();
        setFriends(response.friends);
      } catch (err) {
        if (err instanceof ApiError && err.code === 'ROBLOX_NOT_CONNECTED') {
          setRobloxNotConnected(true);
          setFriends([]);
          return;
        }
        setFriendsError(getErrorMessage(err, 'Failed to load Roblox friends'));
      } finally {
        setIsLoadingFriends(false);
      }
    };

    void loadFriends();
  }, [user?.id, getErrorMessage]);

  const handleSelectFavorite = (favorite: Favorite) => {
    setFavoritesMenuVisible(false);
    setSelectedFavorite(favorite);
    setRobloxUrl(favorite.url ?? '');

    const preferredTitle = getFavoriteDisplayName(favorite);
    if (preferredTitle) {
      setTitle(preferredTitle);
    }
  };

  const switchToLinkMode = () => {
    setGameInputMode('link');
    setSelectedFavorite(null);
  };

  const switchToFavoritesMode = () => {
    setGameInputMode('favorites');
  };

  /**
   * Handle date/time picker change
   */
  const handleDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === 'ios'); // Keep open on iOS
    if (selectedDate) {
      setScheduledStart(selectedDate);
    }
  };

  const openAndroidDateTimePicker = () => {
    const base = scheduledStart ?? new Date();

    // Android doesn't support mode="datetime" via the component; open date then time.
    DateTimePickerAndroid.open({
      value: base,
      mode: 'date',
      is24Hour: true,
      onChange: (event, date) => {
        if (event.type !== 'set' || !date) return;

        const withDate = new Date(base);
        withDate.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());

        DateTimePickerAndroid.open({
          value: withDate,
          mode: 'time',
          is24Hour: true,
          onChange: (timeEvent, time) => {
            if (timeEvent.type !== 'set' || !time) return;
            const final = new Date(withDate);
            final.setHours(time.getHours(), time.getMinutes(), 0, 0);
            setScheduledStart(final);
          },
        });
      },
    });
  };

  /**
   * Validate and submit form
   */
  const handleCreate = async () => {
    setError(null);

    // Validation
    if (!robloxUrl.trim()) {
      setError('Please enter or select a Roblox game link');
      return;
    }
    if (!title.trim()) {
      setError('Session title is required');
      return;
    }

    try {
      setIsCreating(true);

      const result = await sessionsAPIStoreV2.createSession(
        buildCreateSessionPayload({
          robloxUrl: robloxUrl.trim(),
          title: title.trim(),
          visibility,
          isRanked,
          scheduledStart: scheduledStart?.toISOString(),
          selectedFriendIds,
        })
      );

      // Navigate to session detail with invite link
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

  const filteredFriends = friendSearch.trim().length === 0
    ? friends
    : friends.filter((friend) => {
        const q = friendSearch.trim().toLowerCase();
        const display = (friend.displayName || '').toLowerCase();
        const username = (friend.name || '').toLowerCase();
        return display.includes(q) || username.includes(q);
      });

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colorScheme === 'dark' ? '#000' : '#fff' }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
      {/* Game */}
      <View style={styles.field}>
        <ThemedText type="titleMedium" style={styles.label}>
          Game *
        </ThemedText>
        {gameInputMode === 'favorites' ? (
          <>
            <Menu
              visible={favoritesMenuVisible}
              onDismiss={() => setFavoritesMenuVisible(false)}
              anchor={(
                <Button
                  title={
                    selectedFavorite
                      ? getFavoriteDisplayName(selectedFavorite)
                      : 'Select from your Roblox favorites'
                  }
                  variant="outlined"
                  style={styles.dropdownButton}
                  contentStyle={styles.dropdownButtonContent}
                  labelStyle={styles.dropdownButtonLabel}
                  onPress={() => setFavoritesMenuVisible(true)}
                />
              )}
            >
              {favorites.map((favorite) => (
                <Menu.Item
                  key={favorite.id}
                  title={getFavoriteDisplayName(favorite)}
                  onPress={() => handleSelectFavorite(favorite)}
                />
              ))}
              {favorites.length === 0 && isLoadingFavorites && (
                <Menu.Item title="Loading favorites..." onPress={() => setFavoritesMenuVisible(false)} />
              )}
              {favorites.length === 0 && !!favoritesError && (
                <Menu.Item
                  title="Couldn't load favorites. Tap to retry"
                  onPress={() => {
                    void refreshFavorites();
                    setFavoritesMenuVisible(false);
                  }}
                />
              )}
              {favorites.length === 0 && !isLoadingFavorites && !favoritesError && (
                <Menu.Item title="No favorites found" onPress={() => setFavoritesMenuVisible(false)} />
              )}
            </Menu>
            <Button
              title="Paste a link instead"
              variant="text"
              style={styles.modeSwitchButton}
              textColor="#007AFF"
              onPress={switchToLinkMode}
            />
          </>
        ) : (
          <>
            <TextInput
              style={styles.input}
              value={robloxUrl}
              placeholder="https://www.roblox.com/games/..."
              autoCapitalize="none"
              keyboardType="url"
              autoCorrect={false}
              variant="outlined"
              editable
              onChangeText={setRobloxUrl}
            />
            <Button
              title="Back to favorites"
              variant="text"
              style={styles.modeSwitchButton}
              textColor="#007AFF"
              onPress={switchToFavoritesMode}
            />
          </>
        )}
        {favoritesError && gameInputMode === 'favorites' && (
          <ThemedText type="bodySmall" lightColor="#c62828" darkColor="#ff8a80" style={styles.resolveHint}>
            {favoritesError}
          </ThemedText>
        )}
      </View>

      {/* Title */}
      <View style={styles.field}>
        <ThemedText type="titleMedium" style={styles.label}>
          Session Title *
        </ThemedText>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="e.g., Late night Jailbreak"
          maxLength={100}
          variant="outlined"
        />
      </View>

      {/* Visibility */}
      <View style={styles.field}>
        <ThemedText type="titleMedium" style={styles.label}>
          Visibility
        </ThemedText>
        <SegmentedButtons
          value={visibility}
          onValueChange={(value) => {
            if (isRanked) {
              setVisibility('public');
              return;
            }
            setVisibility(value as SessionVisibility);
          }}
          buttons={visibilityOptions.map((option) => ({
            value: option.value,
            label: option.label,
            disabled: isRanked && option.value !== 'public',
          }))}
          style={styles.visibilityPicker}
        />
        {isRanked && (
          <ThemedText type="bodySmall" lightColor="#666" darkColor="#999" style={styles.helperText}>
            Ranked sessions are always public.
          </ThemedText>
        )}
      </View>

      {/* Friend Picker */}
      <View style={styles.field}>
        <ThemedText type="titleMedium" style={styles.label}>
          Invite Friends
        </ThemedText>
        <TextInput
          style={styles.searchInput}
          value={friendSearch}
          onChangeText={setFriendSearch}
          placeholder="Search friends"
          variant="outlined"
        />
        {isLoadingFriends ? (
          <View style={styles.loadingFriendsContainer}>
            <View style={styles.skeletonRow}>
              <View style={styles.skeletonCard} />
              <View style={styles.skeletonCard} />
              <View style={styles.skeletonCard} />
            </View>
            <ActivityIndicator size="small" color="#007AFF" />
          </View>
        ) : null}

        {!isLoadingFriends && robloxNotConnected ? (
          <View style={styles.inlineInfoBox}>
            <ThemedText type="bodySmall" lightColor="#666" darkColor="#999">
              Connect Roblox to invite friends directly.
            </ThemedText>
            <Button
              title="Connect Roblox"
              variant="text"
              onPress={() => router.push('/roblox')}
            />
          </View>
        ) : null}

        {!isLoadingFriends && !robloxNotConnected && friendsError ? (
          <View style={styles.inlineInfoBox}>
            <ThemedText type="bodySmall" lightColor="#c62828" darkColor="#ff8a80">
              {friendsError}
            </ThemedText>
            <Button
              title="Retry"
              variant="text"
              onPress={() => {
                setFriendsError(null);
                setIsLoadingFriends(true);
                sessionsAPIStoreV2
                  .listMyRobloxFriends()
                  .then((response) => {
                    setFriends(response.friends);
                  })
                  .catch((err) => {
                    setFriendsError(getErrorMessage(err, 'Failed to load Roblox friends'));
                  })
                  .finally(() => setIsLoadingFriends(false));
              }}
            />
          </View>
        ) : null}

        {!isLoadingFriends && !robloxNotConnected && !friendsError && (
          <FriendPickerTwoRowHorizontal
            friends={filteredFriends}
            selectedIds={selectedFriendIds}
            onToggle={(friendId) => {
              setSelectedFriendIds((current) => toggleFriendSelection(current, friendId));
            }}
            disabled={isCreating}
          />
        )}
      </View>

      {/* Advanced Options */}
      <View style={styles.field}>
        <Pressable
          style={[
            styles.advancedHeader,
            { borderColor: colorScheme === 'dark' ? '#2d2d2d' : '#d9d9d9' },
          ]}
          onPress={() => {
            setShowAdvancedOptions((current) => !current);
          }}
        >
          <View style={styles.advancedHeaderTextWrap}>
            <ThemedText type="titleMedium">Advanced options</ThemedText>
            <ThemedText type="bodySmall" lightColor="#666" darkColor="#999">
              Ranked and schedule settings
            </ThemedText>
          </View>
          <MaterialIcons
            name={showAdvancedOptions ? 'expand-less' : 'expand-more'}
            size={20}
            color={colorScheme === 'dark' ? '#bbb' : '#555'}
          />
        </Pressable>

        {showAdvancedOptions && (
          <View style={styles.advancedBody}>
            <View style={styles.toggleRow}>
              <View style={styles.toggleTextWrap}>
                <ThemedText type="titleMedium" style={styles.label}>
                  Ranked session
                </ThemedText>
                <ThemedText type="bodySmall" lightColor="#666" darkColor="#999">
                  Ranked session (affects rating)
                </ThemedText>
                <ThemedText type="bodySmall" lightColor="#666" darkColor="#999">
                  Only applies to eligible sessions.
                </ThemedText>
              </View>
              <Switch
                value={isRanked}
                onValueChange={(value) => {
                  setIsRanked(value);
                  if (value) {
                    setVisibility('public');
                  }
                }}
                disabled={isCreating}
              />
            </View>

            <View style={styles.advancedInnerSection}>
              <ThemedText type="titleMedium" style={styles.label}>
                Scheduled Start (optional)
              </ThemedText>
              <Pressable
                style={[
                  styles.scheduleRow,
                  { borderColor: colorScheme === 'dark' ? '#333' : '#d9d9d9' },
                  { backgroundColor: colorScheme === 'dark' ? '#1a1a1a' : '#f8f9fb' },
                ]}
                onPress={() => {
                  if (Platform.OS === 'android') {
                    openAndroidDateTimePicker();
                  } else {
                    setShowDatePicker(true);
                  }
                }}
                disabled={isCreating}
              >
                <View style={styles.scheduleLeft}>
                  <MaterialIcons name="calendar-today" size={18} color={colorScheme === 'dark' ? '#bbb' : '#666'} />
                  <ThemedText type="bodyLarge" lightColor="#222" darkColor="#eee" style={styles.scheduleValue}>
                    {scheduledStart ? scheduledStart.toLocaleString() : 'Set start time'}
                  </ThemedText>
                </View>
                <MaterialIcons name="chevron-right" size={20} color={colorScheme === 'dark' ? '#bbb' : '#666'} />
              </Pressable>
              {scheduledStart && (
                <Button
                  title="Clear"
                  variant="text"
                  style={styles.clearButton}
                  textColor="#007AFF"
                  onPress={() => setScheduledStart(null)}
                />
              )}
            </View>
          </View>
        )}
      </View>

      {showDatePicker && (
        <DateTimePicker
          value={scheduledStart || new Date()}
          mode="datetime"
          display="default"
          onChange={handleDateChange}
        />
      )}

      {/* Error Message */}
      {error && (
        <View style={styles.errorContainer}>
          <ThemedText type="bodyMedium" lightColor="#c62828" darkColor="#ff5252">
            {error}
          </ThemedText>
        </View>
      )}

      {/* Submit Button */}
      <Button
        title={isCreating ? 'Creating Session...' : 'CREATE SESSION'}
        variant="filled"
        buttonColor="#007AFF"
        style={[styles.submitButton, (isCreating || !robloxUrl || !title) && styles.submitButtonDisabled]}
        contentStyle={styles.submitButtonContent}
        labelStyle={styles.submitButtonLabel}
        onPress={handleCreate}
        loading={isCreating}
        disabled={isCreating || !robloxUrl || !title}
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
    padding: 16,
    paddingBottom: 56,
  },
  field: {
    marginBottom: 20,
  },
  label: {
    marginBottom: 8,
  },
  helperText: {
    marginTop: 4,
  },
  modeSwitchButton: {
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  resolveHint: {
    marginTop: 6,
  },
  input: {
    borderRadius: 8,
  },
  dropdownButton: {
    borderRadius: 8,
  },
  dropdownButtonContent: {
    minHeight: 52,
    justifyContent: 'center',
  },
  dropdownButtonLabel: {
    textAlign: 'left',
    width: '100%',
  },
  visibilityPicker: {
    marginTop: 4,
  },
  searchInput: {
    borderRadius: 8,
    marginBottom: 10,
  },
  advancedHeader: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  advancedHeaderTextWrap: {
    flex: 1,
  },
  advancedBody: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 12,
    gap: 10,
  },
  advancedInnerSection: {
    marginTop: 4,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  toggleTextWrap: {
    flex: 1,
  },
  loadingFriendsContainer: {
    minHeight: 90,
    justifyContent: 'center',
    gap: 10,
  },
  skeletonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  skeletonCard: {
    width: 100,
    height: 64,
    borderRadius: 10,
    backgroundColor: '#ececec',
  },
  inlineInfoBox: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 10,
    gap: 4,
  },
  scheduleRow: {
    borderWidth: 1,
    borderRadius: 10,
    minHeight: 52,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  scheduleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
  },
  scheduleValue: {
    flex: 1,
  },
  clearButton: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  errorContainer: {
    backgroundColor: '#ffebee',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  submitButton: {
    borderRadius: 12,
    marginTop: 10,
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  submitButtonDisabled: {
    opacity: 0.6,
    shadowOpacity: 0,
  },
  submitButtonContent: {
    minHeight: 60,
  },
  submitButtonLabel: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '600',
  },
});
