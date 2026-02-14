import { useCallback, useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '../../src/lib/api';
import { tokenStorage } from '../../src/lib/tokenStorage';
import { logger } from '@/src/lib/logger';
import { ThemedText } from '@/components/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/src/features/auth/useAuth';
import { sessionsAPIStoreV2 } from '@/src/features/sessions/apiStore-v2';

// Module-level guard prevents duplicate processing across StrictMode remounts.
const processedCallbackKeys = new Set<string>();

export default function RobloxCallback() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string; state?: string; error?: string }>();
  const colorScheme = useColorScheme();
  const { reloadUser } = useAuth();
  const { code, state, error } = params;

  const handleCallback = useCallback(async () => {
    const callbackKey = `${error ?? ''}|${code ?? ''}|${state ?? ''}`;
    if (processedCallbackKeys.has(callbackKey)) {
      logger.warn('Skipping duplicate OAuth callback processing', {
        hasCode: !!code,
        hasState: !!state,
        hasError: !!error,
      });
      return;
    }
    processedCallbackKeys.add(callbackKey);

    try {
      // Check for OAuth error
      if (error) {
        logger.error('OAuth error from provider', { oauthError: error });
        router.replace('/auth/sign-in');
        return;
      }

      if (!code || !state) {
        logger.error('Missing code or state parameter in OAuth callback');
        router.replace('/auth/sign-in');
        return;
      }

      const connectState = await AsyncStorage.getItem('roblox_connect_state');
      if (connectState && connectState === state) {
        await sessionsAPIStoreV2.completeRobloxConnect(code, state);
        await AsyncStorage.removeItem('roblox_connect_state');
        await reloadUser();
        router.replace('/sessions');
        return;
      }

      // Retrieve stored verifier and state
      const codeVerifier = await AsyncStorage.getItem('pkce_code_verifier');
      const storedState = await AsyncStorage.getItem('pkce_state');

      if (!codeVerifier || !storedState) {
        logger.error('Missing stored PKCE parameters');
        router.replace('/auth/sign-in');
        return;
      }

      // Verify state matches
      if (state !== storedState) {
        logger.error('State mismatch - possible CSRF attack', {
          receivedState: state,
        });
        router.replace('/auth/sign-in');
        return;
      }

      // Clear stored PKCE parameters
      await AsyncStorage.removeItem('pkce_code_verifier');
      await AsyncStorage.removeItem('pkce_state');

      // Exchange code for tokens
      const response = await apiClient.auth.completeRobloxAuth(code, state, codeVerifier);

      // Store tokens
      await tokenStorage.setToken(response.accessToken);
      await tokenStorage.setRefreshToken(response.refreshToken);

      logger.info('Tokens stored, reloading user...');

      // Reload user to update AuthContext
      await reloadUser();

      logger.info('User reloaded, navigating to sessions...');

      // Redirect to sessions
      router.replace('/sessions');
    } catch (callbackError) {
      logger.error('Failed to complete OAuth flow', {
        error: callbackError instanceof Error ? callbackError.message : String(callbackError),
      });
      router.replace('/auth/sign-in');
    }
  }, [code, error, reloadUser, router, state]);

  useEffect(() => {
    logger.info('RobloxCallback mounted', {
      hasCode: !!code,
      hasState: !!state,
      hasError: !!error,
    });
    void handleCallback();
  }, [code, error, handleCallback, state]);

  return (
    <View style={[styles.container, { backgroundColor: colorScheme === 'dark' ? '#000' : '#fff' }]}>
      <ActivityIndicator size="large" />
      <ThemedText type="bodyLarge" style={styles.text}>
        Completing sign in...
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    marginTop: 16,
  },
});
