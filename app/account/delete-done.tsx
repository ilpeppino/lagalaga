import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/paper';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';

function formatDate(value?: string): string {
  if (!value) return 'Pending';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

export default function DeleteAccountDoneScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme ?? 'light'];
  const cardBackground = useMemo(() => (colorScheme === 'dark' ? '#171717' : '#f4f5f7'), [colorScheme]);
  const params = useLocalSearchParams<{ requestedAt?: string; scheduledPurgeAt?: string }>();

  return (
    <View style={[styles.container, { backgroundColor: palette.background }]}> 
      <Stack.Screen options={{ title: 'Deletion Requested', headerBackVisible: false }} />

      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="headlineSmall" style={styles.title}>Deletion requested</ThemedText>
        <ThemedText style={styles.paragraph}>
          Your account deletion request is now pending. Deletion is initiated immediately and completed within 30 days.
        </ThemedText>

        <View style={[styles.card, { backgroundColor: cardBackground }]}> 
          <ThemedText type="titleMedium" style={styles.cardTitle}>Status</ThemedText>
          <ThemedText style={styles.row}>Current status: PENDING</ThemedText>
          <ThemedText style={styles.row}>Requested at: {formatDate(params.requestedAt)}</ThemedText>
          <ThemedText style={styles.row}>Scheduled purge at: {formatDate(params.scheduledPurgeAt)}</ThemedText>
        </View>

        <ThemedText style={styles.paragraph}>
          If deletion cancellation is available during your grace period, you may sign in and check account status before purge completes.
        </ThemedText>

        <Button
          title="Return to sign in"
          onPress={() => router.replace('/auth/sign-in')}
          variant="filled"
          buttonColor={palette.tint}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
    gap: 16,
    paddingBottom: 28,
  },
  title: {
    marginBottom: 4,
  },
  paragraph: {
    lineHeight: 22,
  },
  card: {
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  cardTitle: {
    marginBottom: 4,
  },
  row: {
    lineHeight: 22,
  },
});
