import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiClient } from '../../lib/api';
import { tokenStorage } from '../../lib/tokenStorage';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { generateCodeVerifier, generateCodeChallenge } from '../../lib/pkce';
import { logger } from '../../lib/logger';

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

      // Expo Go + Auth Proxy:
      // You must start the flow via `https://auth.expo.io/@owner/slug/start?...` so the proxy
      // can set a cookie mapping the provider callback to our in-app return URL.
      //
      // The backend's `redirect_uri` must be `https://auth.expo.io/@ilpeppino/lagalaga`.
      const returnUrl = Linking.createURL('auth/roblox');
      const startUrl = `https://auth.expo.io/@ilpeppino/lagalaga/start?${new URLSearchParams({
        authUrl: authorizationUrl,
        returnUrl,
      }).toString()}`;

      const result = await WebBrowser.openAuthSessionAsync(startUrl, returnUrl);

      logger.info('OAuth session finished', { type: result.type });
      // The code exchange happens in `app/auth/roblox.tsx` after the proxy deep-link.
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
    <AuthContext.Provider value={{ user, loading, signInWithRoblox, signOut }}>
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
