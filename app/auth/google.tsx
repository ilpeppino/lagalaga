import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, View } from 'react-native';
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
import { ApiError, isApiError } from '@/src/lib/errors';
import { ThemedText } from '@/components/themed-text';
import { monitoring } from '@/src/lib/monitoring';
import { parseGoogleCallbackPayload } from '@/src/features/auth/oauthCallback';

const processedGoogleCallbackKeys = new Set<string>();

export default function GoogleCallback() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    code?: string;
    state?: string;
    error?: string;
    errorCode?: string;
    accessToken?: string;
    refreshToken?: string;
    callbackUrl?: string;
  }>();
  const colorScheme = useColorScheme();
  const { reloadUser } = useAuth();
  const { handleError } = useErrorHandler();
  const [fatalMessage, setFatalMessage] = useState<string | null>(null);
  const normalizeParam = (value: string | string[] | undefined): string | undefined => {
    if (Array.isArray(value)) {
      return value[0];
    }
    return value;
  };
  const callbackUrl = normalizeParam(params.callbackUrl);
  const directCode = normalizeParam(params.code);
  const directState = normalizeParam(params.state);
  const directError = normalizeParam(params.error);
  const directErrorCode = normalizeParam(params.errorCode);
  const directAccessToken = normalizeParam(params.accessToken);
  const directRefreshToken = normalizeParam(params.refreshToken);
  const parsedPayload = callbackUrl ? parseGoogleCallbackPayload(callbackUrl) : null;
  const code = directCode ?? parsedPayload?.code;
  const state = directState ?? parsedPayload?.state;
  const error = directError ?? parsedPayload?.error;
  const errorCode = directErrorCode ?? parsedPayload?.errorCode;
  const accessToken = directAccessToken ?? parsedPayload?.accessToken;
  const refreshToken = directRefreshToken ?? parsedPayload?.refreshToken;

  const handleCallback = useCallback(async () => {
    const callbackKey = `${error ?? ''}|${errorCode ?? ''}|${code ?? ''}|${state ?? ''}|${accessToken ?? ''}|${refreshToken ?? ''}`;
    if (processedGoogleCallbackKeys.has(callbackKey)) {
      logger.warn('Skipping duplicate Google OAuth callback processing', {
        hasCode: !!code,
        hasState: !!state,
        hasError: !!error,
        hasErrorCode: !!errorCode,
        hasAccessToken: !!accessToken,
        hasRefreshToken: !!refreshToken,
      });
      return;
    }
    processedGoogleCallbackKeys.add(callbackKey);

    try {
      if (error || errorCode) {
        const callbackError = new ApiError({
          code: errorCode || 'AUTH_004',
          message: 'Google sign-in could not be completed.',
          statusCode: 401,
        });
        const callbackErrorMessage = handleError(callbackError, {
          fallbackMessage: 'Google sign-in could not be completed. Please try again.',
        });
        setFatalMessage(callbackErrorMessage);
        monitoring.captureMessage('Google callback provider error', 'warning');
        logger.warn('Google OAuth callback includes provider error details', {
          hasProviderError: Boolean(error),
          errorCode: errorCode ?? null,
        });
        return;
      }

      if (accessToken && refreshToken) {
        await tokenStorage.setToken(accessToken);
        await tokenStorage.setRefreshToken(refreshToken);
        logger.info('Google callback token persistence succeeded', {
          source: 'deep_link_tokens',
        });
      } else if (code && state) {
        const response = await apiClient.auth.completeGoogleAuth(code, state);
        await tokenStorage.setToken(response.accessToken);
        await tokenStorage.setRefreshToken(response.refreshToken);
        logger.info('Google callback token persistence succeeded', {
          source: 'backend_exchange',
        });
      } else {
        logger.error('Missing callback credentials for Google sign-in completion');
        const missingPayloadMessage = handleError(
          new Error('Missing callback credentials from Google sign-in callback'),
          { fallbackMessage: 'Google sign-in could not be completed. Please try again.' }
        );
        setFatalMessage(missingPayloadMessage);
        monitoring.captureMessage('Google callback missing credentials', 'warning');
        return;
      }

      const user = await reloadUser({
        reason: 'google_sign_in_callback',
        noCache: true,
      });
      if (!user) {
        const bootstrapError = new ApiError({
          code: 'AUTH_005',
          message: 'Unable to load your account after sign-in.',
          statusCode: 401,
        });
        throw bootstrapError;
      }
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
      monitoring.captureMessage('Google callback completion failed', 'error');
      const errorMessage = handleError(callbackError, {
        fallbackMessage: 'Google sign-in failed. Please try again.',
      });
      if (isApiError(callbackError) && (callbackError.statusCode === 401 || callbackError.statusCode === 403)) {
        router.replace('/auth/sign-in');
        return;
      }
      setFatalMessage(errorMessage);
    }
  }, [accessToken, code, error, errorCode, handleError, refreshToken, reloadUser, router, state]);

  useEffect(() => {
    logger.info('GoogleCallback mounted', {
      hasCode: !!code,
      hasState: !!state,
      hasError: !!error,
      hasErrorCode: !!errorCode,
      hasAccessToken: !!accessToken,
      hasRefreshToken: !!refreshToken,
      hasCallbackUrl: !!callbackUrl,
    });
    void handleCallback();
  }, [accessToken, callbackUrl, code, error, errorCode, handleCallback, refreshToken, state]);

  if (fatalMessage) {
    return (
      <View style={[styles.container, { backgroundColor: colorScheme === 'dark' ? '#000' : '#fff' }]}>
        <ThemedText type="titleMedium" style={styles.errorTitle}>
          Sign-in failed
        </ThemedText>
        <ThemedText type="bodyMedium" style={styles.errorMessage}>
          {fatalMessage}
        </ThemedText>
        <Pressable onPress={() => router.replace('/auth/sign-in')} style={styles.errorButton}>
          <ThemedText type="labelLarge" style={styles.errorButtonText}>
            Back to sign in
          </ThemedText>
        </Pressable>
      </View>
    );
  }

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
    paddingHorizontal: 24,
  },
  errorTitle: {
    marginBottom: 8,
    textAlign: 'center',
  },
  errorMessage: {
    textAlign: 'center',
    marginBottom: 20,
  },
  errorButton: {
    minHeight: 44,
    borderRadius: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111111',
  },
  errorButtonText: {
    color: '#ffffff',
  },
});
