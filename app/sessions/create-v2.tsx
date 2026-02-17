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
} from 'react-native';
import { useRouter } from 'expo-router';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
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

  return (
    <ScrollView
      style={[
        styles.container,
        { backgroundColor: colorScheme === 'dark' ? '#000' : '#fff' }
      ]}
      contentContainerStyle={styles.content}
    >
      {/* Roblox URL Input (disabled, auto-filled from favorite selection) */}
      <View style={styles.field}>
        <ThemedText type="titleMedium" style={styles.label}>
          Roblox Game Link *
        </ThemedText>
        <TextInput
          style={styles.input}
          value={robloxUrl}
          placeholder="Paste a Roblox game URL or select a favorite below"
          autoCapitalize="none"
          keyboardType="url"
          autoCorrect={false}
          variant="outlined"
          editable
          onChangeText={setRobloxUrl}
        />
        <ThemedText type="bodySmall" lightColor="#666" darkColor="#999" style={styles.helperText}>
          Favorites auto-fill this field. You can also paste a URL manually.
        </ThemedText>
      </View>

      {/* Favorites Dropdown */}
      <View style={styles.field}>
        <ThemedText type="titleMedium" style={styles.label}>
          Favorite Game *
        </ThemedText>
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
        {favoritesError && (
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

      {/* Ranked Mode */}
      <View style={styles.field}>
        <View style={styles.toggleRow}>
          <View style={styles.toggleTextWrap}>
            <ThemedText type="titleMedium" style={styles.label}>
              Ranked Mode
            </ThemedText>
            <ThemedText type="bodySmall" lightColor="#666" darkColor="#999">
              Winner +25, other joined players -25. Quick Play is casual-only.
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
      </View>

      {/* Friend Picker */}
      <View style={styles.field}>
        <ThemedText type="titleMedium" style={styles.label}>
          Invite Friends
        </ThemedText>
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
            friends={friends}
            selectedIds={selectedFriendIds}
            onToggle={(friendId) => {
              setSelectedFriendIds((current) => toggleFriendSelection(current, friendId));
            }}
            disabled={isCreating}
          />
        )}
      </View>

      {/* Scheduled Start (Optional) */}
      <View style={styles.field}>
        <ThemedText type="titleMedium" style={styles.label}>
          Scheduled Start (optional)
        </ThemedText>
        <Button
          title={scheduledStart ? scheduledStart.toLocaleString() : 'Tap to set start time'}
          variant="outlined"
          style={styles.dateButton}
          contentStyle={styles.dateButtonContent}
          labelStyle={styles.dateButtonLabel}
          onPress={() => {
            if (Platform.OS === 'android') {
              openAndroidDateTimePicker();
            } else {
              setShowDatePicker(true);
            }
          }}
        />
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
        title={isCreating ? 'Creating Session...' : 'Create Session'}
        variant="filled"
        buttonColor="#007AFF"
        style={styles.submitButton}
        contentStyle={styles.submitButtonContent}
        labelStyle={styles.submitButtonLabel}
        onPress={handleCreate}
        loading={isCreating}
        disabled={isCreating || !robloxUrl || !title}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  field: {
    marginBottom: 24,
  },
  label: {
    marginBottom: 8,
  },
  helperText: {
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
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
  dateButton: {
    borderRadius: 8,
  },
  dateButtonContent: {
    minHeight: 52,
    justifyContent: 'center',
  },
  dateButtonLabel: {
    textAlign: 'left',
    width: '100%',
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
    borderRadius: 8,
    marginTop: 8,
  },
  submitButtonContent: {
    minHeight: 56,
  },
  submitButtonLabel: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '600',
  },
});
