import { useCallback, useEffect } from 'react';
import { Alert, Linking, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { apiClient } from '@/src/lib/api';
import { tokenStorage } from '@/src/lib/tokenStorage';
import { logger } from '@/src/lib/logger';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/src/features/auth/useAuth';
import { LagaLoadingSpinner } from '@/components/ui/LagaLoadingSpinner';
import { resolveAccountLinkConflict } from '@/src/features/auth/accountLinkConflict';
import { getPostLoginRoute, shouldRequireRobloxConnection } from '@/src/features/auth/robloxConnectionGate';
import { useErrorHandler } from '@/hooks/useErrorHandler';

const processedGoogleCallbackKeys = new Set<string>();

export default function GoogleCallback() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string; state?: string; error?: string }>();
  const colorScheme = useColorScheme();
  const { reloadUser } = useAuth();
  const { handleError } = useErrorHandler();
  const { code, state, error } = params;

  const handleCallback = useCallback(async () => {
    const callbackKey = `${error ?? ''}|${code ?? ''}|${state ?? ''}`;
    if (processedGoogleCallbackKeys.has(callbackKey)) {
      logger.warn('Skipping duplicate Google OAuth callback processing', {
        hasCode: !!code,
        hasState: !!state,
        hasError: !!error,
      });
      return;
    }
    processedGoogleCallbackKeys.add(callbackKey);

    try {
      if (error) {
        logger.error('Google OAuth error from provider', { hasProviderError: true });
        router.replace('/auth/sign-in');
        return;
      }

      if (!code || !state) {
        logger.error('Missing code or state parameter in Google OAuth callback');
        handleError(new Error('Missing code or state from Google sign-in callback'), {
          fallbackMessage: 'Google sign-in could not be completed. Please try again.',
        });
        router.replace('/auth/sign-in');
        return;
      }

      const response = await apiClient.auth.completeGoogleAuth(code, state);
      await tokenStorage.setToken(response.accessToken);
      await tokenStorage.setRefreshToken(response.refreshToken);
      const user = await reloadUser({
        reason: 'google_sign_in_callback',
        noCache: true,
      });
      const requiresRobloxConnect = shouldRequireRobloxConnection(user);
      const nextRoute = getPostLoginRoute(!requiresRobloxConnect);
      logger.info('Final routing decision after Google sign-in', {
        nextRoute,
        reason: requiresRobloxConnect ? 'roblox_not_connected' : 'roblox_connected',
      });
      router.replace(nextRoute);
    } catch (callbackError) {
      const conflictResolution = resolveAccountLinkConflict(callbackError, 'google');
      if (conflictResolution.handled) {
        Alert.alert(conflictResolution.title, conflictResolution.message, [
          {
            text: 'Log in with original method',
            onPress: () => {
              router.replace('/auth/sign-in');
            },
          },
          {
            text: 'Contact support',
            onPress: () => {
              void Linking.openURL('mailto:lagalaga@gtemp1.com?subject=Account%20Link%20Conflict');
            },
          },
        ]);
        return;
      }

      logger.error('Failed to complete Google OAuth flow', {
        error: callbackError instanceof Error ? callbackError.message : String(callbackError),
      });
      handleError(callbackError, {
        fallbackMessage: 'Google sign-in failed. Please try again.',
      });
      router.replace('/auth/sign-in');
    }
  }, [code, error, handleError, reloadUser, router, state]);

  useEffect(() => {
    logger.info('GoogleCallback mounted', {
      hasCode: !!code,
      hasState: !!state,
      hasError: !!error,
    });
    void handleCallback();
  }, [code, error, handleCallback, state]);

  return (
    <View style={[styles.container, { backgroundColor: colorScheme === 'dark' ? '#000' : '#fff' }]}>
      <LagaLoadingSpinner size={56} label="Completing sign in..." />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
