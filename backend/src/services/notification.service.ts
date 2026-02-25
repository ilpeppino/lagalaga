import { request } from 'undici';
import { getSupabase } from '../config/supabase.js';
import { logger } from '../lib/logger.js';
import { ErrorCodes, AppError } from '../utils/errors.js';
import {
  NotificationPreferencesService,
  type NotificationPreferences,
} from './notification-preferences.service.js';

const EXPO_PUSH_SEND_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_PUSH_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
const PUSH_TIMEOUT_MS = 5000;

export type NotificationType =
  | 'SESSION_INVITE'
  | 'SESSION_STARTING_SOON'
  | 'FRIEND_REQUEST_RECEIVED';

export type NotificationPriority = 'default' | 'normal' | 'high';

export interface SendNotificationInput {
  type: NotificationType;
  recipients: string[];
  title: string;
  body: string;
  data?: Record<string, unknown>;
  idempotencyKey: string;
  priority?: NotificationPriority;
  correlationId?: string;
}

interface PushTokenRow {
  expo_push_token: string;
  platform: string | null;
}

interface ExpoPushTicket {
  id?: string;
  status?: 'ok' | 'error';
  message?: string;
  details?: {
    error?: string;
    [key: string]: unknown;
  };
}

interface ReceiptDetails {
  status?: 'ok' | 'error';
  message?: string;
  details?: {
    error?: string;
    [key: string]: unknown;
  };
}

export class NotificationService {
  constructor(
    private readonly prefsService: NotificationPreferencesService = new NotificationPreferencesService()
  ) {}

  async send(input: SendNotificationInput): Promise<void> {
    if (input.recipients.length === 0) {
      return;
    }

    const dedupedRecipients = Array.from(new Set(input.recipients));
    const prefsByUserId = await this.prefsService.getByUserIds(dedupedRecipients);

    for (const recipientUserId of dedupedRecipients) {
      const prefs = prefsByUserId.get(recipientUserId) ?? {
        userId: recipientUserId,
        sessionsRemindersEnabled: true,
        friendRequestsEnabled: true,
      };

      if (!this.isEnabledByPreferences(input.type, prefs)) {
        logger.info(
          {
            type: input.type,
            recipientUserId,
            correlationId: input.correlationId,
          },
          'notification_send: skipped by user preferences'
        );
        continue;
      }

      const inboxNotificationId = await this.insertInboxNotification({
        recipientUserId,
        type: input.type,
        title: input.title,
        body: input.body,
        data: input.data,
        idempotencyKey: input.idempotencyKey,
      });

      if (!inboxNotificationId) {
        logger.info(
          {
            type: input.type,
            recipientUserId,
            idempotencyKey: input.idempotencyKey,
            correlationId: input.correlationId,
          },
          'notification_send: duplicate idempotency key, skipping push'
        );
        continue;
      }

      const tokenRows = await this.getUserPushTokens(recipientUserId);
      const platforms = tokenRows.map((row) => row.platform ?? 'unknown');

      logger.info(
        {
          type: input.type,
          inboxNotificationId,
          recipientUserId,
          tokensFound: tokenRows.length,
          platforms,
          correlationId: input.correlationId,
        },
        'notification_send: prepared'
      );

      if (tokenRows.length === 0) {
        continue;
      }

      await this.sendPushAndHandleReceipts({
        recipientUserId,
        inboxNotificationId,
        type: input.type,
        title: input.title,
        body: input.body,
        data: input.data,
        priority: input.priority,
        tokenRows,
        correlationId: input.correlationId,
      });
    }
  }

  private isEnabledByPreferences(type: NotificationType, prefs: NotificationPreferences): boolean {
    if (type === 'FRIEND_REQUEST_RECEIVED') {
      return prefs.friendRequestsEnabled;
    }

    if (type === 'SESSION_STARTING_SOON') {
      return prefs.sessionsRemindersEnabled;
    }

    return true;
  }

  private async insertInboxNotification(input: {
    recipientUserId: string;
    type: NotificationType;
    title: string;
    body: string;
    data?: Record<string, unknown>;
    idempotencyKey: string;
  }): Promise<string | null> {
    const supabase = getSupabase();

    const payload = {
      user_id: input.recipientUserId,
      type: input.type,
      title: input.title,
      body: input.body,
      data: input.data ?? {},
      idempotency_key: input.idempotencyKey,
    };

    const { data, error } = await supabase
      .from('in_app_notifications')
      .upsert(payload, { onConflict: 'user_id,idempotency_key', ignoreDuplicates: true })
      .select('id');

    if (error) {
      throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to upsert inbox notification: ${error.message}`);
    }

    const row = Array.isArray(data) ? data[0] as { id?: string } | undefined : undefined;
    return row?.id ?? null;
  }

  private async getUserPushTokens(userId: string): Promise<PushTokenRow[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('user_push_tokens')
      .select('expo_push_token, platform')
      .eq('user_id', userId);

    if (error) {
      throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to load push tokens: ${error.message}`);
    }

    return (data ?? []) as PushTokenRow[];
  }

  private async sendPushAndHandleReceipts(input: {
    recipientUserId: string;
    inboxNotificationId: string;
    type: NotificationType;
    title: string;
    body: string;
    data?: Record<string, unknown>;
    priority?: NotificationPriority;
    tokenRows: PushTokenRow[];
    correlationId?: string;
  }): Promise<void> {
    const messages = input.tokenRows.map((row) => ({
      to: row.expo_push_token,
      title: input.title,
      body: input.body,
      data: {
        type: input.type,
        ...(input.data ?? {}),
      },
      sound: 'default',
      priority: input.priority ?? 'high',
      channelId: row.platform === 'android' ? 'default' : undefined,
    }));

    let tickets: ExpoPushTicket[] = [];
    try {
      const response = await request(EXPO_PUSH_SEND_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(messages),
        signal: AbortSignal.timeout(PUSH_TIMEOUT_MS),
      });

      if (response.statusCode >= 400) {
        const bodyText = await response.body.text();
        logger.error(
          {
            type: input.type,
            inboxNotificationId: input.inboxNotificationId,
            recipientUserId: input.recipientUserId,
            statusCode: response.statusCode,
            body: bodyText,
            correlationId: input.correlationId,
          },
          'notification_send: Expo push API returned error'
        );
        return;
      }

      const payload = await response.body.json() as { data?: ExpoPushTicket[] };
      tickets = Array.isArray(payload?.data) ? payload.data : [];

      logger.info(
        {
          type: input.type,
          inboxNotificationId: input.inboxNotificationId,
          recipientUserId: input.recipientUserId,
          tickets,
          correlationId: input.correlationId,
        },
        'notification_send: Expo ticket response'
      );
    } catch (error) {
      logger.error(
        {
          type: input.type,
          inboxNotificationId: input.inboxNotificationId,
          recipientUserId: input.recipientUserId,
          error: error instanceof Error ? error.message : String(error),
          correlationId: input.correlationId,
        },
        'notification_send: Expo push call failed'
      );
      return;
    }

    const ticketIdToToken = new Map<string, string>();

    for (let index = 0; index < tickets.length; index += 1) {
      const ticket = tickets[index];
      const token = input.tokenRows[index]?.expo_push_token;
      if (!token) continue;

      if (ticket?.id) {
        ticketIdToToken.set(ticket.id, token);
      }

      if (ticket?.details?.error === 'DeviceNotRegistered') {
        await this.deletePushToken(input.recipientUserId, token, {
          source: 'ticket',
          type: input.type,
          inboxNotificationId: input.inboxNotificationId,
          correlationId: input.correlationId,
        });
      }
    }

    const receiptIds = Array.from(ticketIdToToken.keys());
    if (receiptIds.length === 0) {
      return;
    }

    try {
      const response = await request(EXPO_PUSH_RECEIPTS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ ids: receiptIds }),
        signal: AbortSignal.timeout(PUSH_TIMEOUT_MS),
      });

      if (response.statusCode >= 400) {
        const bodyText = await response.body.text();
        logger.warn(
          {
            type: input.type,
            inboxNotificationId: input.inboxNotificationId,
            recipientUserId: input.recipientUserId,
            statusCode: response.statusCode,
            body: bodyText,
            correlationId: input.correlationId,
          },
          'notification_send: Expo receipts API returned error'
        );
        return;
      }

      const payload = await response.body.json() as { data?: Record<string, ReceiptDetails> };
      const receipts = payload?.data ?? {};

      for (const [receiptId, receipt] of Object.entries(receipts)) {
        if (receipt?.details?.error !== 'DeviceNotRegistered') {
          continue;
        }

        const token = ticketIdToToken.get(receiptId);
        if (!token) {
          continue;
        }

        await this.deletePushToken(input.recipientUserId, token, {
          source: 'receipt',
          type: input.type,
          inboxNotificationId: input.inboxNotificationId,
          correlationId: input.correlationId,
        });
      }
    } catch (error) {
      logger.warn(
        {
          type: input.type,
          inboxNotificationId: input.inboxNotificationId,
          recipientUserId: input.recipientUserId,
          error: error instanceof Error ? error.message : String(error),
          correlationId: input.correlationId,
        },
        'notification_send: failed to fetch Expo receipts'
      );
    }
  }

  private async deletePushToken(
    userId: string,
    expoPushToken: string,
    context: {
      source: 'ticket' | 'receipt';
      type: NotificationType;
      inboxNotificationId: string;
      correlationId?: string;
    }
  ): Promise<void> {
    const supabase = getSupabase();
    const { error } = await supabase
      .from('user_push_tokens')
      .delete()
      .eq('user_id', userId)
      .eq('expo_push_token', expoPushToken);

    if (error) {
      logger.warn(
        {
          userId,
          tokenSuffix: expoPushToken.slice(-6),
          source: context.source,
          type: context.type,
          inboxNotificationId: context.inboxNotificationId,
          dbError: error.message,
          correlationId: context.correlationId,
        },
        'notification_send: failed to remove unregistered token'
      );
      return;
    }

    logger.info(
      {
        userId,
        tokenSuffix: expoPushToken.slice(-6),
        source: context.source,
        type: context.type,
        inboxNotificationId: context.inboxNotificationId,
        correlationId: context.correlationId,
      },
      'notification_send: removed unregistered token'
    );
  }
}
