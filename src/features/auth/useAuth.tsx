import React, { createContext, useContext, useState, useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Google from 'expo-auth-session/providers/google';
import { apiClient } from '../../lib/api';
import { tokenStorage } from '../../lib/tokenStorage';
import * as WebBrowser from 'expo-web-browser';
import { generateCodeVerifier, generateCodeChallenge } from '../../lib/pkce';
import { logger } from '../../lib/logger';
import { OAUTH_STORAGE_KEYS, oauthTransientStorage } from '../../lib/oauthTransientStorage';
import { warmFavorites } from '../favorites/service';
import { registerPushToken, unregisterPushToken } from '../notifications/registerPushToken';

if (Platform.OS === 'web') {
  WebBrowser.maybeCompleteAuthSession();
}

interface User {
  id: string;
  robloxUserId: string;
  robloxUsername?: string;
  robloxDisplayName?: string;
  robloxProfileUrl?: string;
  avatarHeadshotUrl?: string | null;
  robloxConnected?: boolean;
  authProvider?: 'ROBLOX' | 'APPLE' | 'GOOGLE';
  email?: string | null;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  signInWithRoblox: () => Promise<void>;
  signInWithApple: () => Promise<boolean>;
  signInWithGoogle: () => Promise<boolean>;
  signOut: () => Promise<void>;
  reloadUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [googleRequest, googleResponse, promptGoogleAsync] = Google.useAuthRequest({
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    scopes: ['openid', 'profile', 'email'],
    responseType: 'id_token',
  });

  useEffect(() => {
    loadUser();
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

  const loadUser = async () => {
    try {
      const token = await tokenStorage.getToken();
      if (!token) {
        setLoading(false);
        return;
      }

      const me = await apiClient.auth.me();
      const userData: User = {
        id: me.id,
        robloxUserId: me.robloxUserId,
        robloxUsername: me.robloxUsername,
        robloxDisplayName: me.robloxDisplayName,
        avatarHeadshotUrl: me.avatarHeadshotUrl,
        robloxConnected: me.robloxConnected,
        authProvider: me.authProvider,
        email: me.email ?? null,
      };
      setUser(userData);
      void warmFavorites(me.id);
      void registerPushToken({ force: true, reason: 'post_login' });
    } catch (error) {
      logger.error('Failed to load user', {
        error: error instanceof Error ? error.message : String(error),
      });
      await tokenStorage.clearTokens();
    } finally {
      setLoading(false);
    }
  };

  const signInWithRoblox = async () => {
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

      // Use in-app auth session on both iOS and Android.
      const result = await WebBrowser.openAuthSessionAsync(authorizationUrl, returnUrl);
      logger.info('OAuth session finished', {
        type: result.type,
        url: result.type === 'success' ? (result as any).url : undefined
      });

      // Note: The deep link callback will be handled by expo-router automatically
      // when the OAuth provider redirects back
      // The code exchange happens in `app/auth/roblox.tsx`
    } catch (error) {
      logger.error('Failed to start OAuth flow', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };

  const signInWithApple = async (): Promise<boolean> => {
    if (Platform.OS !== 'ios') {
      logger.warn('Apple sign-in requested on unsupported platform', {
        platform: Platform.OS,
      });
      return false;
    }

    const isAvailable = await AppleAuthentication.isAvailableAsync();
    if (!isAvailable) {
      logger.warn('Apple sign-in is not available on this iOS device');
      return false;
    }

    try {
      logger.info('Starting Apple sign-in flow');
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        ],
      });

      if (!credential.identityToken) {
        throw new Error('Apple identity token missing');
      }

      const fullNamePayload = credential.fullName
        ? {
            givenName: credential.fullName.givenName ?? undefined,
            middleName: credential.fullName.middleName ?? undefined,
            familyName: credential.fullName.familyName ?? undefined,
            nickname: credential.fullName.nickname ?? undefined,
          }
        : undefined;
      const hasFullName = Boolean(
        fullNamePayload?.givenName ||
        fullNamePayload?.middleName ||
        fullNamePayload?.familyName ||
        fullNamePayload?.nickname
      );

      const authResponse = await apiClient.auth.signInWithApple({
        identityToken: credential.identityToken,
        ...(credential.authorizationCode ? { authorizationCode: credential.authorizationCode } : {}),
        ...(credential.email ? { email: credential.email } : {}),
        ...(hasFullName ? { fullName: fullNamePayload } : {}),
      });

      await tokenStorage.setToken(authResponse.accessToken);
      await tokenStorage.setRefreshToken(authResponse.refreshToken);
      await loadUser();

      logger.info('Apple sign-in completed successfully');
      return true;
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: string }).code === 'ERR_REQUEST_CANCELED'
      ) {
        logger.info('Apple sign-in cancelled by user');
        return false;
      }

      logger.error('Apple sign-in failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };

  const signInWithGoogle = async (): Promise<boolean> => {
    if (Platform.OS !== 'android') {
      logger.warn('Google sign-in requested on unsupported platform', {
        platform: Platform.OS,
      });
      return false;
    }

    if (!googleRequest) {
      logger.warn('Google sign-in request is not ready');
      return false;
    }

    try {
      const result = await promptGoogleAsync();
      if (result.type === 'cancel' || result.type === 'dismiss') {
        logger.info('Google sign-in cancelled by user');
        return false;
      }

      if (result.type !== 'success') {
        logger.warn('Google sign-in failed to complete', { type: result.type });
        return false;
      }

      const identityToken = result.params.id_token;
      if (!identityToken) {
        throw new Error('Google identity token missing');
      }

      const authResponse = await apiClient.auth.signInWithGoogle({
        identityToken,
      });

      await tokenStorage.setToken(authResponse.accessToken);
      await tokenStorage.setRefreshToken(authResponse.refreshToken);
      await loadUser();
      logger.info('Google sign-in completed successfully');
      return true;
    } catch (error) {
      logger.error('Google sign-in failed', {
        error: error instanceof Error ? error.message : String(error),
        lastGoogleResponseType: googleResponse?.type ?? null,
      });
      throw error;
    }
  };

  const signOut = async () => {
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
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, signInWithRoblox, signInWithApple, signInWithGoogle, signOut, reloadUser: loadUser }}>
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
