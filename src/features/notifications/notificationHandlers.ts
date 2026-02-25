import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import { logger } from '@/src/lib/logger';

let notificationHandlerConfigured = false;

export function configureNotificationHandler(): void {
  if (notificationHandlerConfigured) {
    return;
  }

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  if (Platform.OS === 'android') {
    void Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF6B00',
    });
  }

  notificationHandlerConfigured = true;
}

function handleNotificationResponse(
  response: Notifications.NotificationResponse
): void {
  const data = response.notification.request.content.data;

  if (data?.route && typeof data.route === 'string') {
    const params: Record<string, string> = {};
    for (const [key, value] of Object.entries(data)) {
      if (key === 'route' || value == null) continue;
      params[key] = String(value);
    }

    logger.info('Navigating from notification route payload', { route: data.route });
    router.push({
      pathname: data.route as any,
      params,
    } as any);
    return;
  }

  if (data?.type === 'session_invite' && data?.sessionId) {
    const sessionId = String(data.sessionId);
    logger.info('Navigating to invite screen from legacy notification payload', { sessionId });
    router.push({
      pathname: '/invites/[sessionId]',
      params: { sessionId },
    } as any);
  }
}

export function setupNotificationListeners(): () => void {
  const subscription = Notifications.addNotificationResponseReceivedListener(
    handleNotificationResponse
  );

  void Notifications.getLastNotificationResponseAsync()
    .then((response) => {
      if (response) {
        handleNotificationResponse(response);
      }
    })
    .catch((error) => {
      logger.warn('Failed to get last notification response', {
        error: error instanceof Error ? error.message : String(error),
      });
    });

  return () => {
    subscription.remove();
  };
}
