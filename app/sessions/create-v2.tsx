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

import { useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import Slider from '@react-native-community/slider';
import { sessionsAPIStoreV2 } from '@/src/features/sessions/apiStore-v2';
import type { RobloxFavoriteGame, SessionVisibility } from '@/src/features/sessions/types-v2';
import { useErrorHandler } from '@/hooks/useErrorHandler';
import { ThemedText } from '@/components/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Button, TextInput } from '@/components/ui/paper';
import { ActivityIndicator, Menu, SegmentedButtons } from 'react-native-paper';

const visibilityOptions: { value: SessionVisibility; label: string }[] = [
  { value: 'public', label: 'Public' },
  { value: 'friends', label: 'Friends Only' },
  { value: 'invite_only', label: 'Invite Only' },
];

export default function CreateSessionScreenV2() {
  const router = useRouter();
  const { handleError, getErrorMessage } = useErrorHandler();
  const colorScheme = useColorScheme();

  // Form state
  const [robloxUrl, setRobloxUrl] = useState('');
  const [favorites, setFavorites] = useState<RobloxFavoriteGame[]>([]);
  const [selectedFavorite, setSelectedFavorite] = useState<RobloxFavoriteGame | null>(null);
  const [title, setTitle] = useState('');
  const [visibility, setVisibility] = useState<SessionVisibility>('public');
  const [maxParticipants, setMaxParticipants] = useState(10);
  const [scheduledStart, setScheduledStart] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);

  // UI state
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingFavorites, setIsLoadingFavorites] = useState(false);
  const [favoritesMenuVisible, setFavoritesMenuVisible] = useState(false);
  const [favoritesError, setFavoritesError] = useState<string | null>(null);

  const lastAutoFilledTitleRef = useRef<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setIsLoadingFavorites(true);
    setFavoritesError(null);

    sessionsAPIStoreV2.listMyRobloxFavorites({ limit: 100 })
      .then((data) => {
        if (cancelled) return;
        const available = data.favorites.filter((game) => game.placeId && game.canonicalWebUrl);
        setFavorites(available);
      })
      .catch((err) => {
        if (cancelled) return;
        setFavorites([]);
        setFavoritesError('Could not load your Roblox favorites');
        handleError(err, { fallbackMessage: 'Could not load your Roblox favorites' });
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingFavorites(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [handleError]);

  const handleSelectFavorite = (favorite: RobloxFavoriteGame) => {
    setFavoritesMenuVisible(false);
    setSelectedFavorite(favorite);
    setRobloxUrl(favorite.canonicalWebUrl ?? '');

    const preferredTitle = favorite.name?.trim() || (favorite.placeId ? `Place ${favorite.placeId}` : '');
    if (preferredTitle) {
      setTitle(preferredTitle);
      lastAutoFilledTitleRef.current = preferredTitle;
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
    if (!selectedFavorite || !robloxUrl.trim()) {
      setError('Please select a favorite Roblox game');
      return;
    }
    if (!title.trim()) {
      setError('Session title is required');
      return;
    }

    try {
      setIsCreating(true);

      const result = await sessionsAPIStoreV2.createSession({
        robloxUrl: robloxUrl.trim(),
        title: title.trim(),
        visibility,
        maxParticipants,
        scheduledStart: scheduledStart?.toISOString(),
      });

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
          placeholder="Auto-filled from your favorite game selection"
          autoCapitalize="none"
          keyboardType="url"
          autoCorrect={false}
          variant="outlined"
          editable={false}
        />
        <ThemedText type="bodySmall" lightColor="#666" darkColor="#999" style={styles.helperText}>
          Direct editing is disabled. Choose a game from Favorites below.
        </ThemedText>
      </View>

      {/* Favorites Dropdown */}
      <View style={styles.field}>
        <ThemedText type="titleMedium" style={styles.label}>
          Favorite Game *
        </ThemedText>
        {isLoadingFavorites ? (
          <View style={styles.favoritesLoading}>
            <ActivityIndicator size="small" color="#007AFF" />
            <ThemedText type="bodySmall" lightColor="#666" darkColor="#999">
              Loading Roblox favorites...
            </ThemedText>
          </View>
        ) : (
          <Menu
            visible={favoritesMenuVisible}
            onDismiss={() => setFavoritesMenuVisible(false)}
            anchor={(
              <Button
                title={
                  selectedFavorite
                    ? (selectedFavorite.name || (selectedFavorite.placeId ? `Place ${selectedFavorite.placeId}` : 'Selected favorite'))
                    : 'Select from your Roblox favorites'
                }
                variant="outlined"
                style={styles.dropdownButton}
                contentStyle={styles.dropdownButtonContent}
                labelStyle={styles.dropdownButtonLabel}
                onPress={() => setFavoritesMenuVisible(true)}
                disabled={favorites.length === 0}
              />
            )}
          >
            {favorites.map((favorite) => {
              const key = `${favorite.universeId}-${favorite.placeId ?? 'none'}`;
              const label = favorite.name || (favorite.placeId ? `Place ${favorite.placeId}` : `Universe ${favorite.universeId}`);
              return (
                <Menu.Item
                  key={key}
                  title={label}
                  onPress={() => handleSelectFavorite(favorite)}
                />
              );
            })}
            {favorites.length === 0 && (
              <Menu.Item title="No favorites found" onPress={() => setFavoritesMenuVisible(false)} />
            )}
          </Menu>
        )}
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
          onValueChange={(value) => setVisibility(value as SessionVisibility)}
          buttons={visibilityOptions.map((option) => ({
            value: option.value,
            label: option.label,
          }))}
          style={styles.visibilityPicker}
        />
      </View>

      {/* Max Participants Slider */}
      <View style={styles.field}>
        <ThemedText type="titleMedium" style={styles.label}>
          Max Participants: {maxParticipants}
        </ThemedText>
        <Slider
          style={styles.slider}
          minimumValue={2}
          maximumValue={50}
          step={1}
          value={maxParticipants}
          onValueChange={setMaxParticipants}
          minimumTrackTintColor="#007AFF"
          maximumTrackTintColor={colorScheme === 'dark' ? '#333' : '#ddd'}
        />
        <View style={styles.sliderLabels}>
          <ThemedText type="bodySmall" lightColor="#666" darkColor="#999">2</ThemedText>
          <ThemedText type="bodySmall" lightColor="#666" darkColor="#999">50</ThemedText>
        </View>
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
        disabled={isCreating || !selectedFavorite || !robloxUrl || !title}
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
  favoritesLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  visibilityPicker: {
    marginTop: 4,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -8,
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
