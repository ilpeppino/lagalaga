import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '../../src/lib/api';
import { tokenStorage } from '../../src/lib/tokenStorage';
import { logger } from '@/src/lib/logger';
import { ThemedText } from '@/components/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function RobloxCallback() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string; state?: string; error?: string }>();
  const colorScheme = useColorScheme();

  useEffect(() => {
    handleCallback();
  }, []);

  const handleCallback = async () => {
    try {
      // Check for OAuth error
      if (params.error) {
        logger.error('OAuth error from provider', { oauthError: params.error });
        router.replace('/auth/sign-in');
        return;
      }

      const { code, state } = params;

      if (!code || !state) {
        logger.error('Missing code or state parameter in OAuth callback');
        router.replace('/auth/sign-in');
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

      // Redirect to sessions
      router.replace('/sessions');
    } catch (error) {
      logger.error('Failed to complete OAuth flow', {
        error: error instanceof Error ? error.message : String(error),
      });
      router.replace('/auth/sign-in');
    }
  };

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
