/**
 * Epic 3 Story 3.2: Session Creation UI
 *
 * Features:
 * - URL input with paste button
 * - Title and description
 * - Visibility selector (public/friends/invite_only)
 * - Max participants slider (2-50)
 * - Optional scheduled start date/time
 * - Loading state
 * - Error handling via useErrorHandler
 */

import { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import Slider from '@react-native-community/slider';
import { sessionsAPIStoreV2 } from '@/src/features/sessions/apiStore-v2';
import type { SessionVisibility } from '@/src/features/sessions/types-v2';
import { useErrorHandler } from '@/hooks/useErrorHandler';
import { ThemedText } from '@/components/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Button, TextInput } from '@/components/ui/paper';
import { SegmentedButtons } from 'react-native-paper';

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
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<SessionVisibility>('public');
  const [maxParticipants, setMaxParticipants] = useState(10);
  const [scheduledStart, setScheduledStart] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);

  // UI state
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Handle paste from clipboard
   */
  const handlePaste = async () => {
    try {
      const text = await Clipboard.getStringAsync();
      setRobloxUrl(text);
    } catch (err) {
      handleError(err, { fallbackMessage: 'Failed to paste from clipboard' });
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
      setError('Roblox game link is required');
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
        description: description.trim() || undefined,
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
      {/* Roblox URL Input */}
      <View style={styles.field}>
        <ThemedText type="titleMedium" style={styles.label}>
          Roblox Game Link *
        </ThemedText>
        <View style={styles.inputWithButton}>
          <TextInput
            style={[styles.inputWithButtonField, styles.input]}
            value={robloxUrl}
            onChangeText={setRobloxUrl}
            placeholder="Paste any Roblox link"
            autoCapitalize="none"
            keyboardType="url"
            autoCorrect={false}
            variant="outlined"
          />
          <Button
            title="Paste"
            variant="filled"
            onPress={handlePaste}
            buttonColor="#007AFF"
            style={styles.pasteButton}
            contentStyle={styles.pasteButtonContent}
            labelStyle={styles.buttonLabel}
          />
        </View>
        <ThemedText type="bodySmall" lightColor="#666" darkColor="#999" style={styles.helperText}>
          e.g., https://www.roblox.com/games/606849621/Jailbreak
        </ThemedText>
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

      {/* Description */}
      <View style={styles.field}>
        <ThemedText type="titleMedium" style={styles.label}>
          Description (optional)
        </ThemedText>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={description}
          onChangeText={setDescription}
          placeholder="What are you planning?"
          multiline
          numberOfLines={3}
          maxLength={500}
          variant="outlined"
          contentStyle={styles.textAreaContent}
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
  input: {
    borderRadius: 8,
  },
  textArea: {
    minHeight: 80,
  },
  textAreaContent: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  inputWithButton: {
    flexDirection: 'row',
    gap: 8,
  },
  inputWithButtonField: {
    flex: 1,
  },
  pasteButton: {
    borderRadius: 8,
    justifyContent: 'center',
  },
  pasteButtonContent: {
    minHeight: 56,
    paddingHorizontal: 12,
  },
  buttonLabel: {
    color: '#fff',
    fontWeight: '600',
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
