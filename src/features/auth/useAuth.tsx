import React, { createContext, useContext, useState, useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { apiClient } from '../../lib/api';
import { tokenStorage } from '../../lib/tokenStorage';
import * as WebBrowser from 'expo-web-browser';
import { generateCodeVerifier, generateCodeChallenge } from '../../lib/pkce';
import { logger } from '../../lib/logger';
import { OAUTH_STORAGE_KEYS, oauthTransientStorage } from '../../lib/oauthTransientStorage';
import { warmFavorites } from '../favorites/service';
import { registerPushToken, unregisterPushToken } from '../notifications/registerPushToken';
import { API_URL } from '../../lib/runtimeConfig';
import * as AppleAuthentication from 'expo-apple-authentication';

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
  signInWithRoblox: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  signOut: () => Promise<void>;
  reloadUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

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

  const signInWithGoogle = async () => {
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

      if (result.type === 'cancel' || result.type === 'dismiss') {
        return;
      }
    } catch (error) {
      logger.error('Failed to start Google OAuth flow', {
        error: error instanceof Error ? error.message : String(error),
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

  const signInWithApple = async () => {
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
      await loadUser();
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        (error as { code?: string }).code === 'ERR_REQUEST_CANCELED'
      ) {
        return;
      }
      throw error;
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, signInWithRoblox, signInWithGoogle, signInWithApple, signOut, reloadUser: loadUser }}>
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
