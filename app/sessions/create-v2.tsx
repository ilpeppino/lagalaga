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
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import DateTimePicker from '@react-native-community/datetimepicker';
import Slider from '@react-native-community/slider';
import { sessionsAPIStoreV2 } from '@/src/features/sessions/apiStore-v2';
import type { SessionVisibility } from '@/src/features/sessions/types-v2';
import { useErrorHandler } from '@/hooks/useErrorHandler';
import { ThemedText } from '@/components/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';

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
            style={[
              styles.input,
              styles.inputWithButtonField,
              {
                backgroundColor: colorScheme === 'dark' ? '#1a1a1a' : '#fff',
                borderColor: colorScheme === 'dark' ? '#333' : '#ddd',
                color: colorScheme === 'dark' ? '#fff' : '#000'
              }
            ]}
            value={robloxUrl}
            onChangeText={setRobloxUrl}
            placeholder="Paste any Roblox link"
            placeholderTextColor={colorScheme === 'dark' ? '#666' : '#999'}
            autoCapitalize="none"
            keyboardType="url"
            autoCorrect={false}
          />
          <TouchableOpacity style={styles.pasteButton} onPress={handlePaste}>
            <ThemedText type="titleMedium" lightColor="#fff" darkColor="#fff">
              Paste
            </ThemedText>
          </TouchableOpacity>
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
          style={[
            styles.input,
            {
              backgroundColor: colorScheme === 'dark' ? '#1a1a1a' : '#fff',
              borderColor: colorScheme === 'dark' ? '#333' : '#ddd',
              color: colorScheme === 'dark' ? '#fff' : '#000'
            }
          ]}
          value={title}
          onChangeText={setTitle}
          placeholder="e.g., Late night Jailbreak"
          placeholderTextColor={colorScheme === 'dark' ? '#666' : '#999'}
          maxLength={100}
        />
      </View>

      {/* Description */}
      <View style={styles.field}>
        <ThemedText type="titleMedium" style={styles.label}>
          Description (optional)
        </ThemedText>
        <TextInput
          style={[
            styles.input,
            styles.textArea,
            {
              backgroundColor: colorScheme === 'dark' ? '#1a1a1a' : '#fff',
              borderColor: colorScheme === 'dark' ? '#333' : '#ddd',
              color: colorScheme === 'dark' ? '#fff' : '#000'
            }
          ]}
          value={description}
          onChangeText={setDescription}
          placeholder="What are you planning?"
          placeholderTextColor={colorScheme === 'dark' ? '#666' : '#999'}
          multiline
          numberOfLines={3}
          maxLength={500}
        />
      </View>

      {/* Visibility */}
      <View style={styles.field}>
        <ThemedText type="titleMedium" style={styles.label}>
          Visibility
        </ThemedText>
        <View style={styles.visibilityPicker}>
          {visibilityOptions.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.visibilityOption,
                {
                  backgroundColor: visibility === option.value
                    ? '#007AFF'
                    : (colorScheme === 'dark' ? '#1a1a1a' : '#f5f5f5'),
                  borderColor: visibility === option.value
                    ? '#007AFF'
                    : (colorScheme === 'dark' ? '#333' : '#ddd'),
                },
              ]}
              onPress={() => setVisibility(option.value)}
            >
              <ThemedText
                type={visibility === option.value ? 'labelLarge' : 'bodyMedium'}
                lightColor={visibility === option.value ? '#fff' : '#333'}
                darkColor={visibility === option.value ? '#fff' : '#ccc'}
              >
                {option.label}
              </ThemedText>
            </TouchableOpacity>
          ))}
        </View>
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
        <TouchableOpacity
          style={[
            styles.dateButton,
            {
              backgroundColor: colorScheme === 'dark' ? '#1a1a1a' : '#f5f5f5',
              borderColor: colorScheme === 'dark' ? '#333' : '#ddd',
            }
          ]}
          onPress={() => setShowDatePicker(true)}
        >
          <ThemedText type="bodyLarge">
            {scheduledStart
              ? scheduledStart.toLocaleString()
              : 'Tap to set start time'}
          </ThemedText>
        </TouchableOpacity>
        {scheduledStart && (
          <TouchableOpacity
            style={styles.clearButton}
            onPress={() => setScheduledStart(null)}
          >
            <ThemedText type="bodyMedium" lightColor="#007AFF" darkColor="#007AFF">
              Clear
            </ThemedText>
          </TouchableOpacity>
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
      <TouchableOpacity
        style={[
          styles.submitButton,
          (isCreating || !robloxUrl || !title) && styles.submitButtonDisabled,
        ]}
        onPress={handleCreate}
        disabled={isCreating || !robloxUrl || !title}
      >
        <ThemedText type="titleLarge" lightColor="#fff" darkColor="#fff">
          {isCreating ? 'Creating Session...' : 'Create Session'}
        </ThemedText>
      </TouchableOpacity>
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
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
  textArea: {
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
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    justifyContent: 'center',
  },
  visibilityPicker: {
    flexDirection: 'row',
    gap: 8,
  },
  visibilityOption: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
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
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
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
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
});
