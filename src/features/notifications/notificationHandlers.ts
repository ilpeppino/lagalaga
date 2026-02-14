import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { logger } from '@/src/lib/logger';

export function configureNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

function handleNotificationResponse(
  response: Notifications.NotificationResponse
): void {
  const data = response.notification.request.content.data;

  if (data?.type === 'session_invite' && data?.sessionId) {
    const sessionId = String(data.sessionId);
    logger.info('Navigating to invite screen from notification', { sessionId });
    router.push(
      {
        pathname: '/invites/[sessionId]',
        params: { sessionId },
      } as any
    );
  }
}

export function setupNotificationListeners(): () => void {
  const subscription = Notifications.addNotificationResponseReceivedListener(
    handleNotificationResponse
  );

  void Notifications.getLastNotificationResponseAsync().then((response) => {
    if (response) {
      handleNotificationResponse(response);
    }
  });

  return () => {
    subscription.remove();
  };
}
