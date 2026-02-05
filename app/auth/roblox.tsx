import { useEffect } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '../../src/lib/api';
import { tokenStorage } from '../../src/lib/tokenStorage';

export default function RobloxCallback() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string; state?: string; error?: string }>();

  useEffect(() => {
    handleCallback();
  }, []);

  const handleCallback = async () => {
    try {
      // Check for OAuth error
      if (params.error) {
        console.error('OAuth error:', params.error);
        router.replace('/auth/sign-in');
        return;
      }

      const { code, state } = params;

      if (!code || !state) {
        console.error('Missing code or state parameter');
        router.replace('/auth/sign-in');
        return;
      }

      // Retrieve stored verifier and state
      const codeVerifier = await AsyncStorage.getItem('pkce_code_verifier');
      const storedState = await AsyncStorage.getItem('pkce_state');

      if (!codeVerifier || !storedState) {
        console.error('Missing stored PKCE parameters');
        router.replace('/auth/sign-in');
        return;
      }

      // Verify state matches
      if (state !== storedState) {
        console.error('State mismatch - possible CSRF attack');
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
      console.error('Failed to complete OAuth flow:', error);
      router.replace('/auth/sign-in');
    }
  };

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" />
      <Text style={styles.text}>Completing sign in...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  text: {
    marginTop: 16,
    fontSize: 16,
  },
});
