import { useMemo } from 'react';
import { Linking, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/paper';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { useErrorHandler } from '@/hooks/useErrorHandler';
import { DELETE_ACCOUNT_WEB_URL } from '@/src/lib/runtimeConfig';

export default function DeleteAccountInfoScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const { handleError } = useErrorHandler();
  const palette = Colors[colorScheme ?? 'light'];

  const cardBackground = useMemo(() => (colorScheme === 'dark' ? '#171717' : '#f4f5f7'), [colorScheme]);

  const openWebFallback = async () => {
    try {
      await Linking.openURL(DELETE_ACCOUNT_WEB_URL);
    } catch (error) {
      handleError(error, { fallbackMessage: 'Unable to open the web deletion page.' });
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: palette.background }]}> 
      <Stack.Screen options={{ title: 'Delete Account' }} />

      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="headlineSmall" style={styles.title}>
          Delete Your LagaLaga Account
        </ThemedText>
        <ThemedText style={styles.lead}>
          You can permanently delete your LagaLaga account and account data directly in the app.
        </ThemedText>

        <View style={[styles.card, { backgroundColor: cardBackground }]}> 
          <ThemedText type="titleMedium" style={styles.cardTitle}>What gets deleted</ThemedText>
          <ThemedText style={styles.bullet}>• Account profile</ThemedText>
          <ThemedText style={styles.bullet}>• Sessions you created</ThemedText>
          <ThemedText style={styles.bullet}>• Friend associations</ThemedText>
          <ThemedText style={styles.bullet}>• Active tokens and connected push tokens</ThemedText>
        </View>

        <View style={[styles.card, { backgroundColor: cardBackground }]}> 
          <ThemedText type="titleMedium" style={styles.cardTitle}>Data that may be retained</ThemedText>
          <ThemedText style={styles.bullet}>• Security logs</ThemedText>
          <ThemedText style={styles.bullet}>• Fraud prevention records</ThemedText>
          <ThemedText style={styles.bullet}>• Records required to meet legal obligations</ThemedText>
          <ThemedText style={styles.note}>Only minimal data is retained where legally required.</ThemedText>
        </View>

        <View style={[styles.card, { backgroundColor: cardBackground }]}> 
          <ThemedText type="titleMedium" style={styles.cardTitle}>Timeline</ThemedText>
          <ThemedText style={styles.lead}>Deletion is initiated immediately and completed within 30 days.</ThemedText>
        </View>

        <Button
          title="Continue"
          onPress={() => router.push('/account/delete-confirm')}
          variant="filled"
          buttonColor={palette.tint}
          style={styles.primaryButton}
        />

        <TouchableOpacity onPress={openWebFallback} style={styles.linkButton}>
          <ThemedText lightColor={palette.tint} darkColor={palette.tint}>
            Use web page instead
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
  content: {
    padding: 20,
    gap: 16,
    paddingBottom: 28,
  },
  title: {
    marginBottom: 4,
  },
  lead: {
    lineHeight: 22,
  },
  card: {
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  cardTitle: {
    marginBottom: 2,
  },
  bullet: {
    lineHeight: 22,
  },
  note: {
    marginTop: 4,
    lineHeight: 22,
  },
  primaryButton: {
    marginTop: 8,
  },
  linkButton: {
    alignItems: 'center',
    paddingVertical: 10,
  },
});
