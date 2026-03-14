import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '@/src/lib/logger';

export type ThemePreference = 'light' | 'dark' | 'system';

const THEME_PREF_KEY = 'theme_preference_v1';

export function normalizeThemePreference(stored: string | null): ThemePreference {
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  return 'system';
}

export async function loadThemePreference(): Promise<ThemePreference> {
  try {
    const stored = await AsyncStorage.getItem(THEME_PREF_KEY);
    return normalizeThemePreference(stored);
  } catch (error) {
    logger.warn('Failed to load theme preference, using system default', {
      error: error instanceof Error ? error.message : String(error),
    });
    return 'system';
  }
}

export async function saveThemePreference(pref: ThemePreference): Promise<void> {
  try {
    await AsyncStorage.setItem(THEME_PREF_KEY, pref);
  } catch (error) {
    logger.warn('Failed to save theme preference', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
