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
  Text,
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

const visibilityOptions: { value: SessionVisibility; label: string }[] = [
  { value: 'public', label: 'Public' },
  { value: 'friends', label: 'Friends Only' },
  { value: 'invite_only', label: 'Invite Only' },
];

export default function CreateSessionScreenV2() {
  const router = useRouter();
  const { handleError, getErrorMessage } = useErrorHandler();

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
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Roblox URL Input */}
      <View style={styles.field}>
        <Text style={styles.label}>Roblox Game Link *</Text>
        <View style={styles.inputWithButton}>
          <TextInput
            style={[styles.input, styles.inputWithButtonField]}
            value={robloxUrl}
            onChangeText={setRobloxUrl}
            placeholder="Paste any Roblox link"
            autoCapitalize="none"
            keyboardType="url"
            autoCorrect={false}
          />
          <TouchableOpacity style={styles.pasteButton} onPress={handlePaste}>
            <Text style={styles.pasteButtonText}>Paste</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.helperText}>
          e.g., https://www.roblox.com/games/606849621/Jailbreak
        </Text>
      </View>

      {/* Title */}
      <View style={styles.field}>
        <Text style={styles.label}>Session Title *</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="e.g., Late night Jailbreak"
          maxLength={100}
        />
      </View>

      {/* Description */}
      <View style={styles.field}>
        <Text style={styles.label}>Description (optional)</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={description}
          onChangeText={setDescription}
          placeholder="What are you planning?"
          multiline
          numberOfLines={3}
          maxLength={500}
        />
      </View>

      {/* Visibility */}
      <View style={styles.field}>
        <Text style={styles.label}>Visibility</Text>
        <View style={styles.visibilityPicker}>
          {visibilityOptions.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.visibilityOption,
                visibility === option.value && styles.visibilityOptionActive,
              ]}
              onPress={() => setVisibility(option.value)}
            >
              <Text
                style={[
                  styles.visibilityText,
                  visibility === option.value && styles.visibilityTextActive,
                ]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Max Participants Slider */}
      <View style={styles.field}>
        <Text style={styles.label}>Max Participants: {maxParticipants}</Text>
        <Slider
          style={styles.slider}
          minimumValue={2}
          maximumValue={50}
          step={1}
          value={maxParticipants}
          onValueChange={setMaxParticipants}
          minimumTrackTintColor="#007AFF"
          maximumTrackTintColor="#ddd"
        />
        <View style={styles.sliderLabels}>
          <Text style={styles.sliderLabel}>2</Text>
          <Text style={styles.sliderLabel}>50</Text>
        </View>
      </View>

      {/* Scheduled Start (Optional) */}
      <View style={styles.field}>
        <Text style={styles.label}>Scheduled Start (optional)</Text>
        <TouchableOpacity
          style={styles.dateButton}
          onPress={() => setShowDatePicker(true)}
        >
          <Text style={styles.dateButtonText}>
            {scheduledStart
              ? scheduledStart.toLocaleString()
              : 'Tap to set start time'}
          </Text>
        </TouchableOpacity>
        {scheduledStart && (
          <TouchableOpacity
            style={styles.clearButton}
            onPress={() => setScheduledStart(null)}
          >
            <Text style={styles.clearButtonText}>Clear</Text>
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
          <Text style={styles.errorText}>{error}</Text>
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
        <Text style={styles.submitButtonText}>
          {isCreating ? 'Creating Session...' : 'Create Session'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  field: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    color: '#333',
  },
  helperText: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
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
  pasteButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
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
    borderColor: '#ddd',
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
  },
  visibilityOptionActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  visibilityText: {
    fontSize: 14,
    color: '#333',
  },
  visibilityTextActive: {
    color: '#fff',
    fontWeight: '600',
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
  sliderLabel: {
    fontSize: 12,
    color: '#666',
  },
  dateButton: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#f5f5f5',
  },
  dateButtonText: {
    fontSize: 16,
    color: '#333',
  },
  clearButton: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  clearButtonText: {
    fontSize: 14,
    color: '#007AFF',
  },
  errorContainer: {
    backgroundColor: '#ffebee',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    color: '#c62828',
    fontSize: 14,
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
  submitButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});
