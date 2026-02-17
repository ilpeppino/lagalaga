import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/paper';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { apiClient } from '@/src/lib/api';
import { useAuth } from '@/src/features/auth/useAuth';
import { useErrorHandler } from '@/hooks/useErrorHandler';
import { isApiError } from '@/src/lib/errors';

export default function DeleteAccountConfirmScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme ?? 'light'];
  const cardBackground = useMemo(() => (colorScheme === 'dark' ? '#171717' : '#f4f5f7'), [colorScheme]);
  const [acknowledged, setAcknowledged] = useState(false);
  const [confirmationText, setConfirmationText] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const { signOut } = useAuth();
  const { handleError } = useErrorHandler();

  const normalized = confirmationText.trim().toUpperCase();
  const canSubmit = acknowledged && normalized === 'DELETE' && !loading;

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const status = await apiClient.account.getDeletionStatus();
        if (status.status === 'PENDING') {
          router.replace({
            pathname: '/account/delete-done',
            params: {
              requestedAt: status.requestedAt ?? undefined,
              scheduledPurgeAt: status.scheduledPurgeAt ?? undefined,
            },
          });
          return;
        }
      } catch {
        // best-effort check; continue with flow if status cannot be loaded
      } finally {
        setCheckingStatus(false);
      }
    };

    void checkStatus();
  }, [router]);

  const submitDeletion = async () => {
    try {
      setLoading(true);
      const result = await apiClient.account.createDeletionRequest({ initiator: 'IN_APP' });
      await signOut();

      router.replace({
        pathname: '/account/delete-done',
        params: {
          requestedAt: result.requestedAt ?? undefined,
          scheduledPurgeAt: result.scheduledPurgeAt ?? undefined,
        },
      });
    } catch (error) {
      if (isApiError(error) && error.statusCode === 429) {
        handleError(error, { fallbackMessage: 'Too many requests. Please try again later.' });
        return;
      }

      handleError(error, { fallbackMessage: 'Failed to submit deletion request. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  if (checkingStatus) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: palette.background }]}> 
        <Stack.Screen options={{ title: 'Confirm Deletion' }} />
        <ActivityIndicator size="large" color={palette.tint} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: palette.background }]}> 
      <Stack.Screen options={{ title: 'Confirm Deletion' }} />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.card, { backgroundColor: cardBackground }]}> 
          <ThemedText type="titleMedium" style={styles.cardTitle}>Before you continue</ThemedText>
          <ThemedText style={styles.paragraph}>
            This action is permanent. To continue, acknowledge the statement below and type DELETE.
          </ThemedText>

          <View style={styles.row}>
            <Switch
              value={acknowledged}
              onValueChange={setAcknowledged}
              trackColor={{ false: '#767577', true: palette.tint }}
            />
            <ThemedText style={styles.rowText}>I understand this cannot be undone.</ThemedText>
          </View>

          <ThemedText style={styles.inputLabel}>Type DELETE to enable account deletion.</ThemedText>
          <TextInput
            value={confirmationText}
            onChangeText={setConfirmationText}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="DELETE"
            placeholderTextColor={colorScheme === 'dark' ? '#8e8e93' : '#9ca3af'}
            style={[
              styles.input,
              {
                color: palette.text,
                borderColor: colorScheme === 'dark' ? '#303030' : '#d1d5db',
                backgroundColor: colorScheme === 'dark' ? '#101010' : '#fff',
              },
            ]}
          />
        </View>

        <Button
          title={loading ? 'Submitting...' : 'Delete my account'}
          onPress={submitDeletion}
          disabled={!canSubmit}
          loading={loading}
          variant="filled"
          buttonColor="#c62828"
          style={styles.deleteButton}
        />

        <TouchableOpacity onPress={() => router.back()}>
          <ThemedText lightColor={palette.tint} darkColor={palette.tint} style={styles.cancelText}>
            Go back
          </ThemedText>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: 20,
    gap: 16,
  },
  card: {
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  cardTitle: {
    marginBottom: 4,
  },
  paragraph: {
    lineHeight: 22,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  rowText: {
    flex: 1,
    lineHeight: 20,
  },
  inputLabel: {
    marginTop: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    letterSpacing: 1,
  },
  deleteButton: {
    marginTop: 6,
  },
  cancelText: {
    textAlign: 'center',
    paddingVertical: 10,
  },
});
