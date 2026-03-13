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
const inFlightGoogleCallbackKeys = new Map<string, Promise<void>>();
const CALLBACK_STEP_TIMEOUT_MS = 15000;
const CALLBACK_TOTAL_TIMEOUT_MS = 45000;
const CALLBACK_WATCHDOG_TIMEOUT_MS = 60000;

function timeoutError(stage: string): Error {
  const error = new Error(`Google callback timeout at stage: ${stage}`);
  error.name = 'GoogleCallbackTimeoutError';
  return error;
}

async function withTimeout<T>(promise: Promise<T>, stage: string, timeoutMs = CALLBACK_STEP_TIMEOUT_MS): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(timeoutError(stage)), timeoutMs);
    }),
  ]);
}

function emitNativeAuthLog(level: 'info' | 'warn' | 'error', message: string, data?: Record<string, unknown>) {
  const payload = data ? ` ${JSON.stringify(data)}` : '';
  const line = `[GoogleAuthCallback] ${message}${payload}`;
  if (level === 'error') {
    console.error(line);
    return;
  }
  if (level === 'warn') {
    console.warn(line);
    return;
  }
  console.log(line);
}

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
  const [statusLabel, setStatusLabel] = useState('Completing sign in...');
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
    const startedAt = Date.now();
    const callbackKey = `${error ?? ''}|${errorCode ?? ''}|${code ?? ''}|${state ?? ''}|${accessToken ?? ''}|${refreshToken ?? ''}`;
    const existingInFlight = inFlightGoogleCallbackKeys.get(callbackKey);
    if (existingInFlight) {
      logger.warn('Duplicate Google OAuth callback detected; waiting for in-flight handler', {
        hasCode: !!code,
        hasState: !!state,
        hasError: !!error,
        hasErrorCode: !!errorCode,
        hasAccessToken: !!accessToken,
        hasRefreshToken: !!refreshToken,
      });
      emitNativeAuthLog('warn', 'duplicate_callback_waiting_for_inflight');
      await withTimeout(existingInFlight, 'await_existing_callback', 10000);
      return;
    }
    if (processedGoogleCallbackKeys.has(callbackKey)) {
      logger.warn('Duplicate Google OAuth callback detected after completion; redirecting to sign-in', {
        hasCode: !!code,
        hasState: !!state,
        hasError: !!error,
        hasErrorCode: !!errorCode,
        hasAccessToken: !!accessToken,
        hasRefreshToken: !!refreshToken,
      });
      emitNativeAuthLog('warn', 'duplicate_callback_after_completion_redirect_signin');
      router.replace('/auth/sign-in');
      return;
    }

    const flow = (async () => {
      try {
      monitoring.addBreadcrumb({
        category: 'info',
        message: 'google_callback_received',
        level: 'info',
        data: {
          hasCode: Boolean(code),
          hasState: Boolean(state),
          hasAccessToken: Boolean(accessToken),
          hasRefreshToken: Boolean(refreshToken),
          hasError: Boolean(error || errorCode),
        },
      });
      emitNativeAuthLog('info', 'callback_received', {
        hasCode: Boolean(code),
        hasState: Boolean(state),
        hasAccessToken: Boolean(accessToken),
        hasRefreshToken: Boolean(refreshToken),
      });

      if (error || errorCode) {
        const canFallbackToExchange = Boolean(code && state);
        if (canFallbackToExchange) {
          logger.warn('Google callback included error flags but also code/state; proceeding with backend exchange fallback', {
            errorCode: errorCode ?? null,
            error: error ?? null,
          });
          emitNativeAuthLog('warn', 'error_flags_with_code_state_fallback_exchange', {
            errorCode: errorCode ?? null,
            error: error ?? null,
          });
        } else {
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
        emitNativeAuthLog('error', 'provider_error', {
          errorCode: errorCode ?? null,
          error: error ?? null,
        });
        return;
        }
      }

      if (accessToken && refreshToken) {
        setStatusLabel('Finalizing Google sign-in...');
        await withTimeout(tokenStorage.setToken(accessToken), 'persist_access_token');
        await withTimeout(tokenStorage.setRefreshToken(refreshToken), 'persist_refresh_token');
        monitoring.addBreadcrumb({
          category: 'info',
          message: 'google_callback_token_persistence_succeeded',
          level: 'info',
          data: { source: 'deep_link_tokens' },
        });
        logger.info('Google callback token persistence succeeded', {
          source: 'deep_link_tokens',
        });
        emitNativeAuthLog('info', 'token_persisted', { source: 'deep_link_tokens' });
      } else if (code && state) {
        setStatusLabel('Exchanging Google callback...');
        emitNativeAuthLog('info', 'exchange_started');
        const response = await withTimeout(
          apiClient.auth.completeGoogleAuth(code, state),
          'exchange_google_callback'
        );
        setStatusLabel('Saving session...');
        await withTimeout(tokenStorage.setToken(response.accessToken), 'persist_access_token');
        await withTimeout(tokenStorage.setRefreshToken(response.refreshToken), 'persist_refresh_token');
        monitoring.addBreadcrumb({
          category: 'info',
          message: 'google_callback_token_persistence_succeeded',
          level: 'info',
          data: { source: 'backend_exchange' },
        });
        logger.info('Google callback token persistence succeeded', {
          source: 'backend_exchange',
        });
        emitNativeAuthLog('info', 'token_persisted', { source: 'backend_exchange' });
      } else {
        logger.error('Missing callback credentials for Google sign-in completion');
        const missingPayloadMessage = handleError(
          new Error('Missing callback credentials from Google sign-in callback'),
          { fallbackMessage: 'Google sign-in could not be completed. Please try again.' }
        );
        setFatalMessage(missingPayloadMessage);
        monitoring.captureMessage('Google callback missing credentials', 'warning');
        emitNativeAuthLog('error', 'missing_callback_credentials');
        return;
      }

      if (Date.now() - startedAt > CALLBACK_TOTAL_TIMEOUT_MS) {
        throw timeoutError('overall_callback_flow');
      }

      setStatusLabel('Loading your account...');
      emitNativeAuthLog('info', 'bootstrap_started');
      monitoring.addBreadcrumb({
        category: 'info',
        message: 'google_callback_bootstrap_started',
        level: 'info',
      });
      const user = await withTimeout(
        reloadUser({
          reason: 'google_sign_in_callback',
          noCache: true,
        }),
        'bootstrap_reload_user'
      );
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
      monitoring.addBreadcrumb({
        category: 'info',
        message: 'google_callback_bootstrap_succeeded',
        level: 'info',
        data: {
          nextRoute,
          robloxConnected: !requiresRobloxConnect,
        },
      });
      logger.info('Final routing decision after Google sign-in', {
        nextRoute,
        reason: requiresRobloxConnect ? 'roblox_not_connected' : 'roblox_connected',
      });
      emitNativeAuthLog('info', 'bootstrap_succeeded', { nextRoute });
      router.replace(nextRoute);
      processedGoogleCallbackKeys.add(callbackKey);
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
      monitoring.addBreadcrumb({
        category: 'info',
        message: 'google_callback_failed',
        level: 'error',
        data: {
          errorName: callbackError instanceof Error ? callbackError.name : 'Unknown',
          isAuthError: isApiError(callbackError) && (callbackError.statusCode === 401 || callbackError.statusCode === 403),
        },
      });
      monitoring.captureMessage('Google callback completion failed', 'error');
      const errorMessage = handleError(callbackError, {
        fallbackMessage: 'Google sign-in failed. Please try again.',
      });
      emitNativeAuthLog('error', 'callback_failed', {
        error: callbackError instanceof Error ? callbackError.message : String(callbackError),
      });
      if (isApiError(callbackError) && (callbackError.statusCode === 401 || callbackError.statusCode === 403)) {
        router.replace('/auth/sign-in');
        return;
      }
      setFatalMessage(errorMessage);
      } finally {
        inFlightGoogleCallbackKeys.delete(callbackKey);
      }
    })();

    inFlightGoogleCallbackKeys.set(callbackKey, flow);
    await flow;
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

  useEffect(() => {
    if (fatalMessage) {
      return;
    }
    const watchdog = setTimeout(() => {
      const message = 'Google sign-in took too long. Please try again.';
      setFatalMessage(message);
      logger.error('Google callback watchdog timeout reached', {
        timeoutMs: CALLBACK_WATCHDOG_TIMEOUT_MS,
      });
      emitNativeAuthLog('error', 'watchdog_timeout', { timeoutMs: CALLBACK_WATCHDOG_TIMEOUT_MS });
      monitoring.captureMessage('Google callback watchdog timeout', 'error');
    }, CALLBACK_WATCHDOG_TIMEOUT_MS);

    return () => clearTimeout(watchdog);
  }, [fatalMessage]);

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
      <LagaLoadingSpinner size={56} label={statusLabel} />
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
