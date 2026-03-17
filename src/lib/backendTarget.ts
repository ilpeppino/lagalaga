import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL, API_URL_ASUS } from './runtimeConfig';

export type BackendTarget = 'render' | 'asus';

const BACKEND_TARGET_STORAGE_KEY = 'dev_backend_target';
const DEV_SETTINGS_UNLOCKED_STORAGE_KEY = 'dev_settings_unlocked';

export function getBackendUrl(target: BackendTarget): string {
  if (target === 'asus') {
    return API_URL_ASUS ?? API_URL;
  }
  return API_URL;
}

export async function getBackendTarget(): Promise<BackendTarget> {
  try {
    const stored = await AsyncStorage.getItem(BACKEND_TARGET_STORAGE_KEY);
    return stored === 'asus' ? 'asus' : 'render';
  } catch {
    return 'render';
  }
}

export async function setBackendTarget(target: BackendTarget): Promise<void> {
  await AsyncStorage.setItem(BACKEND_TARGET_STORAGE_KEY, target);
}

export async function getActiveApiBaseUrl(): Promise<string> {
  const target = await getBackendTarget();
  return getBackendUrl(target);
}

export function isAsusBackendConfigured(): boolean {
  return Boolean(API_URL_ASUS);
}

export async function isDeveloperSettingsUnlocked(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(DEV_SETTINGS_UNLOCKED_STORAGE_KEY);
    return value === '1';
  } catch {
    return false;
  }
}

export async function setDeveloperSettingsUnlocked(unlocked: boolean): Promise<void> {
  if (unlocked) {
    await AsyncStorage.setItem(DEV_SETTINGS_UNLOCKED_STORAGE_KEY, '1');
    return;
  }
  await AsyncStorage.removeItem(DEV_SETTINGS_UNLOCKED_STORAGE_KEY);
}

