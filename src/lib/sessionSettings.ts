import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '@/src/lib/logger';

export type SessionSettings = {
  autoCompleteLiveAfterHours: number;
  autoHideCompletedAfterHours: number;
  startingSoonWindowHours: number;
};

export const DEFAULT_SESSION_SETTINGS: SessionSettings = {
  autoCompleteLiveAfterHours: 2,
  autoHideCompletedAfterHours: 2,
  startingSoonWindowHours: 2,
};

const SESSION_SETTINGS_STORAGE_KEY = 'session_settings_v1';
const MIN_HOURS = 0;
const MAX_HOURS = 48;

function toSafeHours(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  const rounded = Math.round(value);
  if (rounded < MIN_HOURS) return MIN_HOURS;
  if (rounded > MAX_HOURS) return MAX_HOURS;
  return rounded;
}

function sanitizeSettings(raw: unknown): SessionSettings {
  if (!raw || typeof raw !== 'object') {
    return DEFAULT_SESSION_SETTINGS;
  }

  const source = raw as Partial<SessionSettings>;

  return {
    autoCompleteLiveAfterHours: toSafeHours(
      source.autoCompleteLiveAfterHours,
      DEFAULT_SESSION_SETTINGS.autoCompleteLiveAfterHours
    ),
    autoHideCompletedAfterHours: toSafeHours(
      source.autoHideCompletedAfterHours,
      DEFAULT_SESSION_SETTINGS.autoHideCompletedAfterHours
    ),
    startingSoonWindowHours: toSafeHours(
      source.startingSoonWindowHours,
      DEFAULT_SESSION_SETTINGS.startingSoonWindowHours
    ),
  };
}

export async function loadSessionSettings(): Promise<SessionSettings> {
  try {
    const stored = await AsyncStorage.getItem(SESSION_SETTINGS_STORAGE_KEY);
    if (!stored) {
      return DEFAULT_SESSION_SETTINGS;
    }

    const parsed = JSON.parse(stored);
    return sanitizeSettings(parsed);
  } catch (error) {
    logger.warn('Failed to load session settings, using defaults', {
      error: error instanceof Error ? error.message : String(error),
    });
    return DEFAULT_SESSION_SETTINGS;
  }
}

export async function saveSessionSettings(partial: Partial<SessionSettings>): Promise<SessionSettings> {
  let current = DEFAULT_SESSION_SETTINGS;

  try {
    current = await loadSessionSettings();
    const next = sanitizeSettings({
      ...current,
      ...partial,
    });

    await AsyncStorage.setItem(SESSION_SETTINGS_STORAGE_KEY, JSON.stringify(next));
    logger.info('Session settings updated');
    return next;
  } catch (error) {
    logger.error('Failed to save session settings', {
      error: error instanceof Error ? error.message : String(error),
    });

    return sanitizeSettings({
      ...current,
      ...partial,
    });
  }
}
