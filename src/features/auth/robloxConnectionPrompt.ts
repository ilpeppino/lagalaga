import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const PROMPT_DISMISSED_KEY = 'roblox_connect_prompt_dismissed_v1';

async function getStorageValue(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    if (typeof sessionStorage === 'undefined') return null;
    return sessionStorage.getItem(key);
  }
  return SecureStore.getItemAsync(key);
}

async function setStorageValue(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(key, value);
    }
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function hasDismissedRobloxConnectPrompt(): Promise<boolean> {
  const value = await getStorageValue(PROMPT_DISMISSED_KEY);
  return value === '1';
}

export async function markRobloxConnectPromptDismissed(): Promise<void> {
  await setStorageValue(PROMPT_DISMISSED_KEY, '1');
}

export async function clearRobloxConnectPromptDismissed(): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(PROMPT_DISMISSED_KEY);
    }
    return;
  }
  await SecureStore.deleteItemAsync(PROMPT_DISMISSED_KEY);
}
