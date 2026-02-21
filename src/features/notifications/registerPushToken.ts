import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { logger } from '@/src/lib/logger';
import { monitoring } from '@/src/lib/monitoring';
import { apiClient } from '@/src/lib/api';

let cachedToken: string | null = null;
let lastRegistrationTime: number | null = null;

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

export async function registerPushToken(): Promise<string | null> {
  if (Platform.OS === 'web') {
    logger.info('Push tokens not supported on web, skipping');
    return null;
  }

  if (!Device.isDevice) {
    logger.info('Push tokens require physical device, skipping on simulator');
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

    monitoring.addBreadcrumb({ category: 'push', message: `Push permission result: ${finalStatus}`, level: 'info', data: { status: finalStatus } });

    if (finalStatus !== 'granted') {
      logger.warn('Push notification permission denied');
      return null;
    }

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;
    if (!projectId) {
      logger.error('Missing EAS project ID for push token registration');
      return null;
    }

    const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenResponse.data;

    monitoring.addBreadcrumb({ category: 'push', message: 'Push token obtained', level: 'info', data: { tokenSuffix: token.slice(-20), platform: Platform.OS } });

    await apiClient.me.registerPushToken({
      expoPushToken: token,
      platform: Platform.OS as 'ios' | 'android',
    });

    monitoring.addBreadcrumb({ category: 'push', message: 'Push token registered with backend', level: 'info', data: { platform: Platform.OS } });

    cachedToken = token;
    lastRegistrationTime = Date.now();
    logger.info('Push token registered', { platform: Platform.OS });
    return token;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);

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
