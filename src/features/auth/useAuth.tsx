import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiClient } from '../../lib/api';
import { tokenStorage } from '../../lib/tokenStorage';
import * as WebBrowser from 'expo-web-browser';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { generateCodeVerifier, generateCodeChallenge, generateRandomState } from '../../lib/pkce';

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
    // Load user on mount
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const token = await tokenStorage.getToken();
      if (!token) {
        setLoading(false);
        return;
      }

      // Verify token and get user info
      const { user: userData } = await apiClient.auth.me();
      setUser(userData);
    } catch (error) {
      console.error('Failed to load user:', error);
      // Clear invalid tokens
      await tokenStorage.clearTokens();
    } finally {
      setLoading(false);
    }
  };

  const signInWithRoblox = async () => {
    try {
      // 1. Generate PKCE parameters
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = await generateCodeChallenge(codeVerifier);
      const state = generateRandomState();

      // 2. Store verifier and state temporarily
      await AsyncStorage.setItem('pkce_code_verifier', codeVerifier);
      await AsyncStorage.setItem('pkce_state', state);

      // 3. Get authorization URL from backend
      const { authorizationUrl } = await apiClient.auth.startRobloxAuth(codeChallenge);

      // 4. Open OAuth flow in browser
      const result = await WebBrowser.openAuthSessionAsync(
        authorizationUrl,
        process.env.EXPO_PUBLIC_ROBLOX_REDIRECT_URI || 'lagalaga://auth/roblox'
      );

      if (result.type === 'success') {
        // The callback will handle the rest
        console.log('OAuth redirect received:', result.url);
      }
    } catch (error) {
      console.error('Failed to start OAuth flow:', error);
      throw error;
    }
  };

  const signOut = async () => {
    try {
      await apiClient.auth.revoke();
    } catch (error) {
      console.error('Failed to revoke token:', error);
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
