import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { logger } from '@/src/lib/logger';
import { apiClient } from '@/src/lib/api';

let cachedToken: string | null = null;

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
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      logger.warn('Push notification permission denied');
      return null;
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) {
      logger.error('Missing EAS project ID for push token registration');
      return null;
    }

    const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenResponse.data;

    await apiClient.me.registerPushToken({
      expoPushToken: token,
      platform: Platform.OS as 'ios' | 'android',
    });

    cachedToken = token;
    logger.info('Push token registered', { platform: Platform.OS });
    return token;
  } catch (err) {
    logger.error('Failed to register push token', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
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
