import React, { createContext, useContext, useState, useEffect } from 'react';
import { Platform } from 'react-native';
import { apiClient } from '../../lib/api';
import { tokenStorage } from '../../lib/tokenStorage';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { generateCodeVerifier, generateCodeChallenge } from '../../lib/pkce';
import { logger } from '../../lib/logger';
import Constants from 'expo-constants';

WebBrowser.maybeCompleteAuthSession();

interface User {
  id: string;
  robloxUserId: string;
  robloxUsername: string;
  robloxDisplayName?: string;
  robloxProfileUrl?: string;
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

      const { user: userData } = await apiClient.auth.me();
      setUser(userData);
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

      // Create the return URL for our app
      // In development builds, use the development scheme (exp+lagalaga)
      // In production, use the standard scheme (lagalaga)
      const isDevelopment = __DEV__ || Constants.appOwnership === 'expo';
      const scheme = isDevelopment ? 'exp+lagalaga' : 'lagalaga';
      const returnUrl = `${scheme}://auth/roblox`;

      logger.info('Starting OAuth flow', {
        returnUrl,
        isDevelopment,
        authUrl: authorizationUrl.substring(0, 100)
      });

      // For development builds and production, use direct OAuth (no auth proxy)
      // The authorizationUrl from backend already has the correct redirect_uri
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
