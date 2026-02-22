import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Application from 'expo-application';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { logger } from '@/src/lib/logger';
import { monitoring } from '@/src/lib/monitoring';
import { apiClient } from '@/src/lib/api';
import { tokenStorage } from '@/src/lib/tokenStorage';
import { API_URL } from '@/src/lib/runtimeConfig';

let cachedToken: string | null = null;
let lastRegistrationTime: number | null = null;
let activeRegistrationPromise: Promise<string | null> | null = null;

const RESUME_DEBOUNCE_MS = 30_000;

export interface PushRegistrationDiagnostics {
  permissionStatus: string;
  channelStatus: string;
  projectIdMasked: string;
  expoPushTokenMasked: string;
  lastRegisterAttemptAt: number | null;
  lastRegisterResult: 'idle' | 'success' | 'failed';
  lastRegisterError: string | null;
  tokenRetrievalStatus: 'idle' | 'success' | 'failed';
  lastBackendResponse: string;
}

const diagnosticsState: PushRegistrationDiagnostics = {
  permissionStatus: 'unknown',
  channelStatus: Platform.OS === 'android' ? 'not_attempted' : 'not_applicable',
  projectIdMasked: 'missing',
  expoPushTokenMasked: 'missing',
  lastRegisterAttemptAt: null,
  lastRegisterResult: 'idle',
  lastRegisterError: null,
  tokenRetrievalStatus: 'idle',
  lastBackendResponse: 'not_attempted',
};

const diagnosticsListeners = new Set<(state: PushRegistrationDiagnostics) => void>();

function isExpectedPushSetupError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('default firebaseapp is not initialized') ||
    normalized.includes('fcm') ||
    normalized.includes('google play services') ||
    normalized.includes('network') ||
    normalized.includes('service_not_available')
  );
}

function publishDiagnostics(): void {
  const snapshot = { ...diagnosticsState };
  diagnosticsListeners.forEach((listener) => listener(snapshot));
}

function setDiagnostics(update: Partial<PushRegistrationDiagnostics>): void {
  Object.assign(diagnosticsState, update);
  publishDiagnostics();
}

function maskValue(value: string | null | undefined): string {
  if (!value) return 'missing';
  return `…${value.slice(-6)}`;
}

function formatError(err: unknown): string {
  if (err instanceof Error) {
    const withCode = err as Error & { code?: string };
    return withCode.code ? `${err.message} (code=${withCode.code})` : err.message;
  }
  if (typeof err === 'object' && err != null && 'message' in err) {
    const maybeMessage = (err as { message?: unknown }).message;
    const maybeCode = (err as { code?: unknown }).code;
    const message = typeof maybeMessage === 'string' ? maybeMessage : String(err);
    return typeof maybeCode === 'string' ? `${message} (code=${maybeCode})` : message;
  }
  return String(err);
}

function extractProjectId(): string | null {
  return Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? null;
}

async function getDeviceId(): Promise<string | undefined> {
  try {
    if (Platform.OS === 'android') {
      return Application.getAndroidId();
    }
    if (Platform.OS === 'ios') {
      return (await Application.getIosIdForVendorAsync()) ?? undefined;
    }
  } catch (err) {
    logger.warn('Failed to resolve stable device ID, falling back', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return Device.osBuildId ?? Device.modelId ?? undefined;
}

async function registerPushTokenWithBackend(input: {
  expoPushToken: string;
  platform: 'ios' | 'android';
  deviceId?: string;
}): Promise<void> {
  const authToken = await tokenStorage.getToken();
  if (!authToken) {
    throw new Error('Missing auth token while registering push token with backend');
  }

  const response = await fetch(`${API_URL}/api/me/push-tokens`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${authToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  const rawBody = await response.text();
  const bodyPreview = rawBody.length > 300 ? `${rawBody.slice(0, 300)}…` : rawBody || '<empty>';
  setDiagnostics({
    lastBackendResponse: `status=${response.status} body=${bodyPreview}`,
  });

  if (!response.ok) {
    throw new Error(`Push token backend registration failed: status=${response.status} body=${bodyPreview}`);
  }
}

export async function registerPushToken(options?: { force?: boolean; reason?: string }): Promise<string | null> {
  if (Platform.OS === 'web') {
    setDiagnostics({
      lastRegisterAttemptAt: Date.now(),
      lastRegisterResult: 'failed',
      tokenRetrievalStatus: 'failed',
      lastRegisterError: 'Push token registration is not supported on web.',
      lastBackendResponse: 'not_attempted',
    });
    logger.info('Push tokens not supported on web');
    return null;
  }

  const now = Date.now();
  if (!options?.force && diagnosticsState.lastRegisterAttemptAt && now - diagnosticsState.lastRegisterAttemptAt < RESUME_DEBOUNCE_MS) {
    logger.info('Skipping push token registration due to debounce window', {
      reason: options?.reason ?? 'unspecified',
      lastAttemptAt: diagnosticsState.lastRegisterAttemptAt,
    });
    return cachedToken;
  }

  if (activeRegistrationPromise) {
    return activeRegistrationPromise;
  }

  setDiagnostics({
    lastRegisterAttemptAt: now,
    lastRegisterResult: 'idle',
    lastRegisterError: null,
    tokenRetrievalStatus: 'idle',
    lastBackendResponse: 'in_progress',
  });

  const run = async (): Promise<string | null> => {
    if (!Device.isDevice) {
      const message = 'Push token registration requires a physical device. Android emulators and iOS simulators are not supported.';
      setDiagnostics({
        lastRegisterResult: 'failed',
        tokenRetrievalStatus: 'failed',
        lastRegisterError: message,
        lastBackendResponse: 'not_attempted',
      });
      logger.warn(message);
      return null;
    }

    try {
      monitoring.addBreadcrumb({ category: 'push', message: 'Requesting push permission', level: 'info' });
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      setDiagnostics({ permissionStatus: finalStatus });
      monitoring.addBreadcrumb({ category: 'push', message: `Push permission result: ${finalStatus}`, level: 'info', data: { status: finalStatus } });

      if (finalStatus !== 'granted') {
        throw new Error(`Notification permission not granted (status=${finalStatus}).`);
      }

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#1A2A6C',
        });
        setDiagnostics({ channelStatus: 'configured' });
      }

      const projectId = extractProjectId();
      setDiagnostics({ projectIdMasked: maskValue(projectId) });
      if (!projectId) {
        throw new Error(
          'No Expo projectId found. Checked Constants.expoConfig?.extra?.eas?.projectId and Constants.easConfig?.projectId.'
        );
      }

      const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
      const token = tokenResponse.data;
      setDiagnostics({
        tokenRetrievalStatus: 'success',
        expoPushTokenMasked: maskValue(token),
      });

      monitoring.addBreadcrumb({ category: 'push', message: 'Push token obtained', level: 'info', data: { tokenSuffix: token.slice(-20), platform: Platform.OS } });

      const platform = Platform.OS as 'ios' | 'android';
      const deviceId = await getDeviceId();

      await registerPushTokenWithBackend({
        expoPushToken: token,
        platform,
        deviceId,
      });

      monitoring.addBreadcrumb({ category: 'push', message: 'Push token registered with backend', level: 'info', data: { platform: Platform.OS } });

      cachedToken = token;
      lastRegistrationTime = Date.now();
      setDiagnostics({
        lastRegisterResult: 'success',
        lastRegisterError: null,
      });

      logger.info('Push token registered', { platform: Platform.OS });
      return token;
    } catch (err) {
      const errorMessage = formatError(err);
      setDiagnostics({
        tokenRetrievalStatus: diagnosticsState.tokenRetrievalStatus === 'success' ? 'success' : 'failed',
        lastRegisterResult: 'failed',
        lastRegisterError: errorMessage,
      });

      if (isExpectedPushSetupError(errorMessage)) {
        logger.warn('Push token unavailable in this build/runtime', {
          platform: Platform.OS,
          error: errorMessage,
        });
        return null;
      }

      logger.error('Failed to register push token', {
        error: errorMessage,
      });
      return null;
    }
  };

  activeRegistrationPromise = run();
  try {
    return await activeRegistrationPromise;
  } finally {
    activeRegistrationPromise = null;
  }
}

export function getPushRegistrationDiagnostics(): PushRegistrationDiagnostics {
  return { ...diagnosticsState };
}

export function subscribePushRegistrationDiagnostics(
  listener: (state: PushRegistrationDiagnostics) => void
): () => void {
  diagnosticsListeners.add(listener);
  listener(getPushRegistrationDiagnostics());
  return () => {
    diagnosticsListeners.delete(listener);
  };
}

export function getCachedPushToken(): string | null {
  return cachedToken;
}

export function getLastRegistrationTime(): number | null {
  return lastRegistrationTime;
}

export async function unregisterPushToken(): Promise<void> {
  if (!cachedToken) return;

  try {
    await apiClient.me.unregisterPushToken({
      expoPushToken: cachedToken,
    });
    cachedToken = null;
    logger.info('Push token unregistered');
  } catch (err) {
    logger.warn('Failed to unregister push token', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
