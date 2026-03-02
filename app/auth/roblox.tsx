import { useCallback, useEffect } from 'react';
import { View, StyleSheet, Alert, Linking } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { apiClient } from '../../src/lib/api';
import { tokenStorage } from '../../src/lib/tokenStorage';
import { OAUTH_STORAGE_KEYS, oauthTransientStorage } from '../../src/lib/oauthTransientStorage';
import { logger } from '@/src/lib/logger';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/src/features/auth/useAuth';
import { sessionsAPIStoreV2 } from '@/src/features/sessions/apiStore-v2';
import { LagaLoadingSpinner } from '@/components/ui/LagaLoadingSpinner';
import { resolveAccountLinkConflict } from '@/src/features/auth/accountLinkConflict';
import { getPostLoginRoute, shouldRequireRobloxConnection } from '@/src/features/auth/robloxConnectionGate';
import {
  clearAuthFlowCorrelationId,
  getOrCreateAuthFlowCorrelationId,
  summarizeState,
} from '@/src/features/auth/authFlowCorrelation';

// Module-level guard prevents duplicate processing across StrictMode remounts.
const processedCallbackKeys = new Set<string>();

export default function RobloxCallback() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string; state?: string; error?: string }>();
  const colorScheme = useColorScheme();
  const { reloadUser, markRobloxConnected, setAuthenticatedUser } = useAuth();
  const { code, state, error } = params;

  const handleCallback = useCallback(async () => {
    const flowCorrelationId = await getOrCreateAuthFlowCorrelationId();
    const callbackKey = `${error ?? ''}|${code ?? ''}|${state ?? ''}`;
    if (processedCallbackKeys.has(callbackKey)) {
      logger.warn('Skipping duplicate OAuth callback processing', {
        flowCorrelationId,
        hasCode: !!code,
        hasState: !!state,
        hasError: !!error,
      });
      return;
    }
    processedCallbackKeys.add(callbackKey);

    try {
      logger.info('Roblox callback received', {
        flowCorrelationId,
        hasCode: !!code,
        hasState: !!state,
        hasError: !!error,
        stateSummary: summarizeState(state ?? null),
      });

      // Check for OAuth error
      if (error) {
        logger.error('OAuth error from provider', {
          flowCorrelationId,
          hasProviderError: true,
        });
        router.replace('/auth/sign-in');
        return;
      }

      if (!code || !state) {
        logger.error('Missing code or state parameter in OAuth callback', {
          flowCorrelationId,
        });
        router.replace('/auth/sign-in');
        return;
      }

      const connectState = await oauthTransientStorage.getItem(OAUTH_STORAGE_KEYS.ROBLOX_CONNECT_STATE);
      if (connectState && connectState === state) {
        logger.info('Exchanging Roblox connect callback with backend', {
          flowCorrelationId,
          stateSummary: summarizeState(state),
        });
        const connectResponse = await sessionsAPIStoreV2.completeRobloxConnect(code, state);
        logger.info('Roblox connect exchange completed', {
          flowCorrelationId,
          connected: connectResponse.connected === true,
          robloxUserIdPresent: Boolean(connectResponse.robloxUserId),
        });
        if (connectResponse.connected !== true) {
          throw new Error('Roblox connect did not return connected=true');
        }
        if (connectResponse.accessToken && connectResponse.refreshToken) {
          await tokenStorage.setToken(connectResponse.accessToken);
          await tokenStorage.setRefreshToken(connectResponse.refreshToken);
          logger.info('Stored replacement session tokens after account merge', {
            flowCorrelationId,
            mergedFromUserId: connectResponse.mergedFromUserId ?? null,
            mergedToUserId: connectResponse.mergedToUserId ?? null,
          });
          if (connectResponse.mergedToUserId) {
            setAuthenticatedUser({
              id: connectResponse.mergedToUserId,
              robloxUserId: connectResponse.robloxUserId ?? null,
            });
          }
        }

        markRobloxConnected({
          robloxUserId: connectResponse.robloxUserId ?? null,
        });
        await oauthTransientStorage.removeItem(OAUTH_STORAGE_KEYS.ROBLOX_CONNECT_STATE);
        logger.info('Refreshing /auth/me after Roblox link', {
          flowCorrelationId,
          beforeConnected: true,
        });
        const refreshedUser = await reloadUser({
          reason: 'roblox_connect_callback',
          noCache: true,
          preserveRobloxConnectedOnFalse: true,
        });
        const refreshedConnected = refreshedUser?.robloxConnected === true;
        logger.info('Completed /auth/me refresh after Roblox link', {
          flowCorrelationId,
          afterConnected: refreshedConnected,
        });
        const nextRoute = '/sessions';
        if (!refreshedConnected) {
          logger.warn('Roblox link succeeded but /auth/me did not reflect connection yet; bypassing connect gate', {
            flowCorrelationId,
          });
        }
        logger.info('Final routing decision after Roblox connect', {
          flowCorrelationId,
          nextRoute,
          reason: refreshedConnected
            ? 'roblox_connected'
            : 'roblox_link_verified_backend_refresh_pending',
        });
        await clearAuthFlowCorrelationId();
        router.replace(nextRoute);
        return;
      }

      // Retrieve stored verifier and state
      const codeVerifier = await oauthTransientStorage.getItem(OAUTH_STORAGE_KEYS.PKCE_CODE_VERIFIER);
      const storedState = await oauthTransientStorage.getItem(OAUTH_STORAGE_KEYS.PKCE_STATE);

      if (!codeVerifier || !storedState) {
        logger.error('Missing stored PKCE parameters', {
          flowCorrelationId,
        });
        router.replace('/auth/sign-in');
        return;
      }

      // Verify state matches
      if (state !== storedState) {
        logger.error('State mismatch - possible CSRF attack', {
          flowCorrelationId,
          stateMatches: false,
        });
        router.replace('/auth/sign-in');
        return;
      }

      // Clear stored PKCE parameters
      await oauthTransientStorage.removeItem(OAUTH_STORAGE_KEYS.PKCE_CODE_VERIFIER);
      await oauthTransientStorage.removeItem(OAUTH_STORAGE_KEYS.PKCE_STATE);

      // Exchange code for tokens
      const response = await apiClient.auth.completeRobloxAuth(code, state, codeVerifier);

      // Store tokens
      await tokenStorage.setToken(response.accessToken);
      await tokenStorage.setRefreshToken(response.refreshToken);
      setAuthenticatedUser({
        id: response.user.id,
        robloxUserId: response.user.robloxUserId,
        robloxUsername: response.user.robloxUsername,
        robloxDisplayName: response.user.robloxDisplayName ?? null,
      });

      logger.info('Tokens stored, reloading user...', {
        flowCorrelationId,
      });

      // Reload user to update AuthContext
      const reloadedUser = await reloadUser({
        reason: 'roblox_sign_in_callback',
        noCache: true,
      });

      const requiresRobloxConnect = shouldRequireRobloxConnection(reloadedUser);
      const nextRoute = getPostLoginRoute(!requiresRobloxConnect);
      logger.info('Final routing decision after Roblox sign-in', {
        flowCorrelationId,
        nextRoute,
        reason: requiresRobloxConnect ? 'roblox_not_connected' : 'roblox_connected',
      });
      if (!requiresRobloxConnect) {
        await clearAuthFlowCorrelationId();
      }
      router.replace(nextRoute);
    } catch (callbackError) {
      const conflictResolution = resolveAccountLinkConflict(callbackError, 'roblox');
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

      logger.error('Failed to complete OAuth flow', {
        flowCorrelationId: await getOrCreateAuthFlowCorrelationId(),
        error: callbackError instanceof Error ? callbackError.message : String(callbackError),
      });
      router.replace('/auth/sign-in');
    }
  }, [code, error, markRobloxConnected, reloadUser, router, setAuthenticatedUser, state]);

  useEffect(() => {
    logger.info('RobloxCallback mounted', {
      callbackPath: '/auth/roblox',
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
