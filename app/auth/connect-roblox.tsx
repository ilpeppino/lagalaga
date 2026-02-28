import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { AnimatedButton } from '@/components/ui/paper';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { sessionsAPIStoreV2 } from '@/src/features/sessions/apiStore-v2';
import { OAUTH_STORAGE_KEYS, oauthTransientStorage } from '@/src/lib/oauthTransientStorage';
import { openRobloxAuthSession } from '@/src/features/auth/robloxAuthSession';
import { useErrorHandler } from '@/hooks/useErrorHandler';

export default function ConnectRobloxScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const { handleError } = useErrorHandler();
  const [connecting, setConnecting] = useState(false);

  const handleConnect = async () => {
    try {
      setConnecting(true);
      const { authorizationUrl, state } = await sessionsAPIStoreV2.getRobloxConnectUrl();
      await oauthTransientStorage.setItem(OAUTH_STORAGE_KEYS.ROBLOX_CONNECT_STATE, state);
      await openRobloxAuthSession(authorizationUrl);
    } catch (error) {
      handleError(error, {
        fallbackMessage: 'Failed to start Roblox account connection. Please try again.',
      });
    } finally {
      setConnecting(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colorScheme === 'dark' ? '#000' : '#fff' }]}>
      <View style={styles.content}>
        <ThemedText type="headlineMedium" style={styles.title}>
          Connect Roblox to Continue
        </ThemedText>
        <ThemedText type="bodyLarge" lightColor="#6b6b72" darkColor="#9a9aa1" style={styles.subtitle}>
          Your Apple sign-in is complete. Connect your Roblox account to unlock full Lagalaga features.
        </ThemedText>

        <AnimatedButton
          title="Connect Roblox Account"
          variant="filled"
          buttonColor="#007AFF"
          onPress={handleConnect}
          loading={connecting}
          enableHaptics
          style={styles.button}
          contentStyle={styles.buttonContent}
        />

        <AnimatedButton
          title="Skip for now"
          variant="text"
          onPress={() => {
            Alert.alert('Roblox not connected', 'You can connect Roblox later from the Me tab.');
            router.replace('/me');
          }}
          disabled={connecting}
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
    padding: 24,
    gap: 14,
    maxWidth: 420,
    width: '100%',
    alignSelf: 'center',
  },
  title: {
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
  },
  button: {
    borderRadius: 8,
    marginTop: 8,
  },
  buttonContent: {
    minHeight: 52,
  },
  secondaryButton: {
    marginTop: 2,
  },
});
