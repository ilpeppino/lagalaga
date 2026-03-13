import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { apiClient } from '../../lib/api';
import { tokenStorage } from '../../lib/tokenStorage';
import { isApiError } from '../../lib/errors';
import * as WebBrowser from 'expo-web-browser';
import { generateCodeVerifier, generateCodeChallenge } from '../../lib/pkce';
import { logger } from '../../lib/logger';
import { OAUTH_STORAGE_KEYS, oauthTransientStorage } from '../../lib/oauthTransientStorage';
import { warmFavorites } from '../favorites/service';
import { clearCachedFavorites } from '../favorites/cache';
import { clearSessionSettings } from '../../lib/sessionSettings';
import { registerPushToken, unregisterPushToken } from '../notifications/registerPushToken';
import { API_URL } from '../../lib/runtimeConfig';
import * as AppleAuthentication from 'expo-apple-authentication';
import { redactUserId } from './authFlowCorrelation';

if (Platform.OS === 'web') {
  WebBrowser.maybeCompleteAuthSession();
}

interface User {
  id: string;
  robloxUserId: string | null;
  robloxUsername?: string | null;
  robloxDisplayName?: string;
  robloxProfileUrl?: string;
  avatarHeadshotUrl?: string | null;
  robloxConnected?: boolean;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  signInWithRoblox: () => Promise<WebBrowser.WebBrowserAuthSessionResult>;
  signInWithGoogle: () => Promise<WebBrowser.WebBrowserAuthSessionResult>;
  signInWithApple: (options?: { flowCorrelationId?: string }) => Promise<User | null>;
  signOut: () => Promise<void>;
  reloadUser: (options?: {
    reason?: string;
    noCache?: boolean;
    preserveRobloxConnectedOnFalse?: boolean;
  }) => Promise<User | null>;
  markRobloxConnected: (input: {
    robloxUserId?: string | null;
    robloxUsername?: string | null;
    robloxDisplayName?: string | null;
  }) => void;
  setAuthenticatedUser: (input: {
    id: string;
    robloxUserId: string | null;
    robloxUsername?: string | null;
    robloxDisplayName?: string | null;
  }) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const latestLoadRequestRef = useRef(0);

  const applyUserFromMe = useCallback((me: {
    id: string;
    robloxUserId: string | null;
    robloxUsername?: string | null;
    robloxDisplayName?: string;
    avatarHeadshotUrl: string | null;
    robloxConnected: boolean;
  }): User => {
    return {
      id: me.id,
      robloxUserId: me.robloxUserId,
      robloxUsername: me.robloxUsername,
      robloxDisplayName: me.robloxDisplayName,
      avatarHeadshotUrl: me.avatarHeadshotUrl,
      robloxConnected: me.robloxConnected,
    };
  }, []);

  // Re-register push token when app returns to foreground (covers Android background→active transitions)
  useEffect(() => {
    if (!user) return;
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void registerPushToken({ reason: 'app_state_active' });
      }
    });
    return () => subscription.remove();
  }, [user]);

  const loadUser = useCallback(async (options?: {
    reason?: string;
    noCache?: boolean;
    preserveRobloxConnectedOnFalse?: boolean;
  }): Promise<User | null> => {
    const requestId = ++latestLoadRequestRef.current;
    const reason = options?.reason ?? 'auth_refresh';
    const noCache = options?.noCache ?? false;
    setLoading(true);

    try {
      const token = await tokenStorage.getToken();
      if (!token) {
        if (requestId === latestLoadRequestRef.current) {
          setUser(null);
        }
        logger.info('Auth refresh finished without token', {
          reason,
          requestId,
        });
        return null;
      }

      logger.info('Auth refresh started', {
        reason,
        requestId,
        noCache,
      });

      const me = await apiClient.auth.me({ noCache });
      const nextUser = applyUserFromMe(me);
      const shouldPreserveRobloxConnected =
        options?.preserveRobloxConnectedOnFalse === true &&
        nextUser.robloxConnected !== true &&
        user?.robloxConnected === true;

      if (shouldPreserveRobloxConnected) {
        nextUser.robloxConnected = true;
        nextUser.robloxUserId = nextUser.robloxUserId ?? user?.robloxUserId ?? null;
        nextUser.robloxUsername = nextUser.robloxUsername ?? user?.robloxUsername ?? null;
        nextUser.robloxDisplayName = nextUser.robloxDisplayName ?? user?.robloxDisplayName;
        logger.warn('Preserving local robloxConnected=true during auth refresh', {
          reason,
          requestId,
        });
      }
      if (requestId !== latestLoadRequestRef.current) {
        logger.warn('Ignoring stale auth refresh response', {
          reason,
          requestId,
          latestRequestId: latestLoadRequestRef.current,
          userId: redactUserId(nextUser.id),
          robloxConnected: nextUser.robloxConnected === true,
        });
        return nextUser;
      }

      setUser(nextUser);
      logger.info('Auth refresh applied', {
        reason,
        requestId,
        userId: redactUserId(nextUser.id),
        robloxConnected: nextUser.robloxConnected === true,
      });
      void warmFavorites(me.id);
      void registerPushToken({ force: true, reason: 'post_login' });
      return nextUser;
    } catch (error) {
      const shouldClearTokens = isApiError(error) && (error.statusCode === 401 || error.statusCode === 403);
      const isLatestRequest = requestId === latestLoadRequestRef.current;
      logger.error('Failed to load user', {
        reason,
        requestId,
        isLatestRequest,
        error: error instanceof Error ? error.message : String(error),
        shouldClearTokens,
      });
      if (shouldClearTokens && isLatestRequest) {
        await tokenStorage.clearTokens();
        setUser(null);
      }
      return null;
    } finally {
      if (requestId === latestLoadRequestRef.current) {
        setLoading(false);
      }
    }
  }, [applyUserFromMe, user?.robloxConnected, user?.robloxDisplayName, user?.robloxUserId, user?.robloxUsername]);

  useEffect(() => {
    void loadUser({ reason: 'initial_hydration', noCache: true });
  }, [loadUser]);

  const signInWithRoblox = async (): Promise<WebBrowser.WebBrowserAuthSessionResult> => {
    try {
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = await generateCodeChallenge(codeVerifier);

      await oauthTransientStorage.setItem(OAUTH_STORAGE_KEYS.PKCE_CODE_VERIFIER, codeVerifier);

      const { authorizationUrl, state } = await apiClient.auth.startRobloxAuth(codeChallenge);

      await oauthTransientStorage.setItem(OAUTH_STORAGE_KEYS.PKCE_STATE, state);

      // Always use app scheme for dev builds / standalone.
      // Expo Auth Proxy URL should be used only when explicitly configured.
      const returnUrl =
        process.env.EXPO_PUBLIC_ROBLOX_REDIRECT_URI?.trim() || 'lagalaga://auth/roblox';

      logger.info('Starting OAuth flow', {
        returnUrl,
        authUrl: authorizationUrl.substring(0, 100)
      });

      const result = await WebBrowser.openAuthSessionAsync(authorizationUrl, returnUrl);
      logger.info('OAuth session finished', {
        type: result.type,
        url: result.type === 'success' ? (result as any).url : undefined
      });

      // Return the result so callers can explicitly handle the callback URL.
      // On iOS, ASWebAuthenticationSession may not deliver the URL to the app's
      // Linking handler (especially when the user is already authenticated with Roblox),
      // so callers must parse result.url and navigate to /auth/roblox directly.
      return result;
    } catch (error) {
      logger.error('Failed to start OAuth flow', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };

  const signInWithGoogle = async (): Promise<WebBrowser.WebBrowserAuthSessionResult> => {
    try {
      logger.info('Initiating Google sign-in', {
        apiUrl: API_URL,
        platform: Platform.OS,
      });
      const { url } = await apiClient.auth.startGoogleAuth();
      const returnUrl =
        process.env.EXPO_PUBLIC_GOOGLE_REDIRECT_URI?.trim() || 'lagalaga://auth/google';
      let providerHost = 'invalid-url';
      try {
        providerHost = new URL(url).host;
      } catch {
        providerHost = 'invalid-url';
      }

      logger.info('Launching Google OAuth browser flow', {
        apiUrl: API_URL,
        providerHost,
        returnUrl,
      });
      const result = await WebBrowser.openAuthSessionAsync(url, returnUrl);
      logger.info('Google OAuth session finished', {
        type: result.type,
      });
      return result;
    } catch (error) {
      logger.error('Failed to start Google OAuth flow', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };

  const signOut = async () => {
    const userId = user?.id;
    try {
      await apiClient.auth.revoke();
    } catch (error) {
      logger.warn('Failed to revoke token on server', {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      try {
        await unregisterPushToken();
      } catch {
        // best effort
      }
      await tokenStorage.clearTokens();
      await clearSessionSettings();
      if (userId) {
        await clearCachedFavorites(userId);
      }
      setUser(null);
    }
  };

  const signInWithApple = async (options?: { flowCorrelationId?: string }): Promise<User | null> => {
    if (Platform.OS !== 'ios') {
      throw new Error('Apple Sign-In is only supported on iOS.');
    }

    const available = await AppleAuthentication.isAvailableAsync();
    if (!available) {
      throw new Error('Apple Sign-In is not available on this device.');
    }

    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (!credential.identityToken) {
        throw new Error('Apple did not return an identity token.');
      }

      const response = await apiClient.auth.completeAppleAuth({
        identityToken: credential.identityToken,
        email: credential.email ?? null,
        givenName: credential.fullName?.givenName ?? null,
        familyName: credential.fullName?.familyName ?? null,
        isPrivateEmail: credential.email ? credential.email.endsWith('@privaterelay.appleid.com') : null,
      });

      await tokenStorage.setToken(response.accessToken);
      await tokenStorage.setRefreshToken(response.refreshToken);
      const refreshedUser = await loadUser({
        reason: options?.flowCorrelationId
          ? `apple_sign_in:${options.flowCorrelationId}`
          : 'apple_sign_in',
        noCache: true,
      });
      logger.info('Apple sign-in user hydration completed', {
        flowCorrelationId: options?.flowCorrelationId ?? null,
        userId: redactUserId(refreshedUser?.id ?? null),
        robloxConnected: refreshedUser?.robloxConnected === true,
      });
      return refreshedUser;
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        (error as { code?: string }).code === 'ERR_REQUEST_CANCELED'
      ) {
        return null;
      }
      throw error;
    }
  };

  const markRobloxConnected = useCallback((input: {
    robloxUserId?: string | null;
    robloxUsername?: string | null;
    robloxDisplayName?: string | null;
  }) => {
    setUser((prev) => {
      if (!prev) {
        return prev;
      }

      return {
        ...prev,
        robloxConnected: true,
        robloxUserId: input.robloxUserId ?? prev.robloxUserId ?? null,
        robloxUsername: input.robloxUsername ?? prev.robloxUsername ?? null,
        robloxDisplayName: input.robloxDisplayName ?? prev.robloxDisplayName,
      };
    });
  }, []);

  const setAuthenticatedUser = useCallback((input: {
    id: string;
    robloxUserId: string | null;
    robloxUsername?: string | null;
    robloxDisplayName?: string | null;
  }) => {
    setUser((prev) => ({
      id: input.id,
      robloxUserId: input.robloxUserId,
      robloxUsername: input.robloxUsername ?? prev?.robloxUsername ?? null,
      robloxDisplayName: input.robloxDisplayName ?? prev?.robloxDisplayName,
      avatarHeadshotUrl: prev?.avatarHeadshotUrl ?? null,
      robloxConnected: input.robloxUserId != null,
    }));
    setLoading(false);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signInWithRoblox,
        signInWithGoogle,
        signInWithApple,
        signOut,
        reloadUser: loadUser,
        markRobloxConnected,
        setAuthenticatedUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
