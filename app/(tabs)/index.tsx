import { StyleSheet, Pressable, ActivityIndicator, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useRouter } from 'expo-router';
import { sessionsAPIStoreV2 } from '@/src/features/sessions/apiStore-v2';
import { useState } from 'react';
import { useErrorHandler } from '@/hooks/useErrorHandler';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function HomeScreen() {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const { handleError } = useErrorHandler();
  const colorScheme = useColorScheme();

  const handleQuickPlay = async () => {
    setIsCreating(true);
    try {
      const session = await sessionsAPIStoreV2.createQuickSession();
      router.push(`/sessions/${session.session.id}-v2`);
    } catch (error) {
      handleError(error, { fallbackMessage: 'Failed to start quick play' });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colorScheme === 'dark' ? '#0d1b3e' : '#1A2A6C' }]}>
      <View style={styles.content}>
        <ThemedText type="displayLarge" lightColor="#fff" darkColor="#fff" style={styles.title}>
          Lagalaga
        </ThemedText>
        <ThemedText type="bodyLarge" lightColor="rgba(255,255,255,0.75)" darkColor="rgba(255,255,255,0.75)" style={styles.subtitle}>
          Find your next Roblox session
        </ThemedText>
        <Pressable
          style={[styles.quickPlayButton, isCreating && styles.quickPlayButtonDisabled]}
          onPress={handleQuickPlay}
          disabled={isCreating}
        >
          {isCreating ? (
            <ActivityIndicator color="#1A2A6C" />
          ) : (
            <ThemedText type="titleMedium" lightColor="#1A2A6C" darkColor="#1A2A6C" style={styles.quickPlayText}>
              ▶  Play Now
            </ThemedText>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 16,
  },
  title: {
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: 24,
  },
  quickPlayButton: {
    backgroundColor: '#ffffff',
    paddingVertical: 18,
    paddingHorizontal: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 60,
    minWidth: 200,
  },
  quickPlayButtonDisabled: {
    opacity: 0.6,
  },
  quickPlayText: {
    fontWeight: 'bold',
  },
});
