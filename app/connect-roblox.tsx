import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { AnimatedButton } from '@/components/ui/paper';
import { ThemedText } from '@/components/themed-text';
import { useErrorHandler } from '@/hooks/useErrorHandler';
import { useAuth } from '@/src/features/auth/useAuth';
import { robloxConnectionService } from '@/src/features/auth/robloxConnectionService';
import { markRobloxConnectPromptDismissed } from '@/src/features/auth/robloxConnectionPrompt';
import { logger } from '@/src/lib/logger';

export default function ConnectRobloxScreen() {
  const router = useRouter();
  const { user, reloadUser } = useAuth();
  const { handleError } = useErrorHandler();
  const [loading, setLoading] = useState(false);

  const finish = useCallback(async () => {
    await markRobloxConnectPromptDismissed();
    router.replace('/sessions');
  }, [router]);

  const handleSkip = useCallback(async () => {
    try {
      await finish();
    } catch (error) {
      handleError(error, { fallbackMessage: 'Failed to continue' });
    }
  }, [finish, handleError]);

  const handleConnect = useCallback(async () => {
    if (loading) return;

    try {
      setLoading(true);
      const result = await robloxConnectionService.connect();
      if (result.status === 'cancelled') {
        return;
      }

      await reloadUser();
      await finish();
    } catch (error) {
      handleError(error, { fallbackMessage: 'Failed to connect Roblox' });
    } finally {
      setLoading(false);
    }
  }, [finish, handleError, loading, reloadUser]);

  useEffect(() => {
    if (user?.robloxConnected) {
      void finish();
    }
  }, [finish, user?.robloxConnected]);

  useEffect(() => {
    logger.info('Roblox interstitial opened', {
      robloxConnected: Boolean(user?.robloxConnected),
      authProvider: user?.authProvider ?? null,
    });
  }, [user?.authProvider, user?.robloxConnected]);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Connect Roblox', headerShown: true }} />
      <View style={styles.content}>
        <ThemedText type="headlineMedium" style={styles.title}>
          Connect Roblox (Recommended)
        </ThemedText>
        <ThemedText type="bodyLarge" style={styles.subtitle}>
          Connect your Roblox account to sync friends, favorites, and presence data.
        </ThemedText>

        <AnimatedButton
          title="Connect Roblox"
          variant="filled"
          loading={loading}
          disabled={loading}
          onPress={handleConnect}
          style={styles.primaryButton}
        />
        <AnimatedButton
          title="Skip for now"
          variant="outlined"
          disabled={loading}
          onPress={handleSkip}
          style={styles.secondaryButton}
        />
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
    paddingHorizontal: 24,
    gap: 16,
  },
  title: {
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    opacity: 0.8,
    marginBottom: 16,
  },
  primaryButton: {
    borderRadius: 10,
  },
  secondaryButton: {
    borderRadius: 10,
  },
});
