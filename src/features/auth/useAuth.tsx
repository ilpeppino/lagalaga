import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiClient } from '../../lib/api';
import { tokenStorage } from '../../lib/tokenStorage';
import * as WebBrowser from 'expo-web-browser';
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

      const result = await WebBrowser.openAuthSessionAsync(
        authorizationUrl,
        process.env.EXPO_PUBLIC_ROBLOX_REDIRECT_URI || 'lagalaga://auth/roblox'
      );

      if (result.type === 'success') {
        logger.info('OAuth redirect received');
      }
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
