import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export const OAUTH_STORAGE_KEYS = {
  PKCE_CODE_VERIFIER: 'pkce_code_verifier',
  PKCE_STATE: 'pkce_state',
  ROBLOX_CONNECT_STATE: 'roblox_connect_state',
} as const;

type OAuthStorageKey = (typeof OAUTH_STORAGE_KEYS)[keyof typeof OAUTH_STORAGE_KEYS];

class OAuthTransientStorage {
  async getItem(key: OAuthStorageKey): Promise<string | null> {
    if (Platform.OS === 'web') {
      if (typeof sessionStorage === 'undefined') {
        return null;
      }
      return sessionStorage.getItem(key);
    }

    return await SecureStore.getItemAsync(key);
  }

  async setItem(key: OAuthStorageKey, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(key, value);
      }
      return;
    }

    await SecureStore.setItemAsync(key, value);
  }

  async removeItem(key: OAuthStorageKey): Promise<void> {
    if (Platform.OS === 'web') {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem(key);
      }
      return;
    }

    await SecureStore.deleteItemAsync(key);
  }
}

export const oauthTransientStorage = new OAuthTransientStorage();
