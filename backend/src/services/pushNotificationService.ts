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
  priority?: 'default' | 'normal' | 'high';
  channelId?: string;
}

export class PushNotificationService {
  async getUserPushTokens(userId: string): Promise<Array<{ expo_push_token: string; platform: string | null }>> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('user_push_tokens')
      .select('expo_push_token, platform')
      .eq('user_id', userId);

    if (error) {
      logger.error({ userId, error: error.message }, 'Failed to fetch push tokens');
      return [];
    }

    return (data ?? []).map((row) => ({ expo_push_token: row.expo_push_token, platform: row.platform ?? null }));
  }

  async sendSessionInviteNotification(
    userId: string,
    sessionId: string,
    sessionTitle: string,
    hostDisplayName?: string
  ): Promise<void> {
    const tokenRows = await this.getUserPushTokens(userId);
    logger.info(
      {
        userId,
        sessionId,
        tokensFoundCount: tokenRows.length,
        tokensPlatforms: tokenRows.map((r) => r.platform ?? 'unknown'),
        truncatedTokens: tokenRows.map((r) => r.expo_push_token.slice(-6)),
      },
      'push_invite: dispatching'
    );

    if (tokenRows.length === 0) {
      logger.info({ userId, sessionId }, 'No push tokens for user, skipping notification');
      return;
    }

    const body = hostDisplayName
      ? `${hostDisplayName} invited you to "${sessionTitle}"`
      : `You've been invited to "${sessionTitle}"`;

    const messages: ExpoPushMessage[] = tokenRows.map((row) => ({
      to: row.expo_push_token,
      title: 'Session Invite',
      body,
      data: {
        type: 'session_invite',
        sessionId,
      },
      sound: 'default',
      priority: 'high',
      channelId: 'default',
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
        const successCount = tickets.filter((t) => t?.status === 'ok').length;
        const errorTickets = tickets.filter((t) => t?.status === 'error');
        logger.info(
          { batchSize: batch.length, successCount, errorCount: errorTickets.length },
          'push_batch: expo response summary'
        );
        for (let ti = 0; ti < errorTickets.length; ti++) {
          const ticket = errorTickets[ti];
          const tokenSuffix = batch[ti]?.to?.slice(-6) ?? 'unknown';
          logger.warn(
            { tokenSuffix, message: ticket.message, details: ticket.details },
            'push_batch: ticket error'
          );
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
