import { request } from 'undici';
import { getSupabase } from '../config/supabase.js';
import { logger } from '../lib/logger.js';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const PUSH_TIMEOUT_MS = 5000;
const BATCH_SIZE = 100;

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  sound?: 'default' | null;
}

export class PushNotificationService {
  async getUserPushTokens(userId: string): Promise<string[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('user_push_tokens')
      .select('expo_push_token')
      .eq('user_id', userId);

    if (error) {
      logger.error({ userId, error: error.message }, 'Failed to fetch push tokens');
      return [];
    }

    return (data ?? []).map((row) => row.expo_push_token);
  }

  async sendSessionInviteNotification(
    userId: string,
    sessionId: string,
    sessionTitle: string,
    hostDisplayName?: string
  ): Promise<void> {
    const tokens = await this.getUserPushTokens(userId);
    if (tokens.length === 0) {
      logger.info({ userId, sessionId }, 'No push tokens for user, skipping notification');
      return;
    }

    const body = hostDisplayName
      ? `${hostDisplayName} invited you to "${sessionTitle}"`
      : `You've been invited to "${sessionTitle}"`;

    const messages: ExpoPushMessage[] = tokens.map((token) => ({
      to: token,
      title: 'Session Invite',
      body,
      data: {
        type: 'session_invite',
        sessionId,
      },
      sound: 'default',
    }));

    await this.sendPushBatch(messages);
  }

  private async sendPushBatch(messages: ExpoPushMessage[]): Promise<void> {
    for (let i = 0; i < messages.length; i += BATCH_SIZE) {
      const batch = messages.slice(i, i + BATCH_SIZE);

      try {
        const response = await request(EXPO_PUSH_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(batch),
          signal: AbortSignal.timeout(PUSH_TIMEOUT_MS),
        });

        if (response.statusCode >= 400) {
          const bodyText = await response.body.text();
          logger.error(
            { statusCode: response.statusCode, body: bodyText },
            'Expo Push API returned error'
          );
          continue;
        }

        const result = await response.body.json() as { data?: Array<{ status?: string; message?: string; details?: unknown }> } | null;
        const tickets = Array.isArray(result?.data) ? result.data : [];
        for (const ticket of tickets) {
          if (ticket?.status === 'error') {
            logger.warn(
              { message: ticket.message, details: ticket.details },
              'Push ticket error'
            );
          }
        }
      } catch (err) {
        logger.error(
          { error: err instanceof Error ? err.message : String(err) },
          'Failed to send push notification batch'
        );
      }
    }
  }
}
