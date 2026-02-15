import React, { createContext, useContext, useState, useEffect } from 'react';
import { Linking, Platform } from 'react-native';
import { apiClient } from '../../lib/api';
import { tokenStorage } from '../../lib/tokenStorage';
import * as WebBrowser from 'expo-web-browser';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { generateCodeVerifier, generateCodeChallenge } from '../../lib/pkce';
import { logger } from '../../lib/logger';
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
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  signInWithRoblox: () => Promise<void>;
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
      void registerPushToken();
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

      await AsyncStorage.setItem('pkce_code_verifier', codeVerifier);

      const { authorizationUrl, state } = await apiClient.auth.startRobloxAuth(codeChallenge);

      await AsyncStorage.setItem('pkce_state', state);

      // Always use app scheme for dev builds / standalone.
      // Expo Auth Proxy URL should be used only when explicitly configured.
      const returnUrl =
        process.env.EXPO_PUBLIC_ROBLOX_REDIRECT_URI?.trim() || 'lagalaga://auth/roblox';

      logger.info('Starting OAuth flow', {
        returnUrl,
        authUrl: authorizationUrl.substring(0, 100)
      });

      // iOS dev-client can route auth sessions through Expo pages.
      // Opening URL directly in browser preserves custom scheme callback handling.
      if (Platform.OS === 'ios') {
        await Linking.openURL(authorizationUrl);
        logger.info('Opened OAuth URL in iOS browser');
        return;
      }

      // Android: keep auth session flow.
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
    <AuthContext.Provider value={{ user, loading, signInWithRoblox, signOut, reloadUser: loadUser }}>
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
