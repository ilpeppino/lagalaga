import { NotificationService } from './notification.service.js';

export class PushNotificationService {
  constructor(private readonly notificationService: NotificationService = new NotificationService()) {}

  async sendSessionInviteNotification(
    userId: string,
    sessionId: string,
    sessionTitle: string,
    hostDisplayName?: string
  ): Promise<void> {
    const body = hostDisplayName
      ? `${hostDisplayName} invited you to "${sessionTitle}"`
      : `You've been invited to "${sessionTitle}"`;

    await this.notificationService.send({
      type: 'SESSION_INVITE',
      recipients: [userId],
      title: 'Session Invite',
      body,
      data: {
        route: '/invites/[sessionId]',
        sessionId,
      },
      idempotencyKey: `SESSION_INVITE:${sessionId}:${userId}`,
      priority: 'high',
    });
  }
}
