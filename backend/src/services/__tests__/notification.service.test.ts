import { beforeEach, describe, expect, it, jest } from '@jest/globals';

let requestMock: any;
let activeSupabase: any;

jest.unstable_mockModule('undici', () => ({
  request: (...args: any[]) => requestMock(...args),
}));

jest.unstable_mockModule('../../config/supabase.js', () => ({
  getSupabase: () => activeSupabase,
}));

jest.unstable_mockModule('../../lib/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { NotificationService } = await import('../notification.service.js');

function buildSupabase(options: {
  insertedNotificationId?: string | null;
  pushTokens?: Array<{ expo_push_token: string; platform: string | null }>;
}) {
  const insertedNotificationId =
    Object.prototype.hasOwnProperty.call(options, 'insertedNotificationId')
      ? options.insertedNotificationId
      : 'notif-1';
  const pushTokens = options.pushTokens ?? [];
  const deletedTokens: string[] = [];

  return {
    deletedTokens,
    from: (table: string) => {
      if (table === 'in_app_notifications') {
        return {
          upsert: () => ({
            select: async () => ({
              data: insertedNotificationId ? [{ id: insertedNotificationId }] : [],
              error: null,
            }),
          }),
        };
      }

      if (table === 'user_push_tokens') {
        return {
          select: () => ({
            eq: async () => ({ data: pushTokens, error: null }),
          }),
          delete: () => ({
            eq: (_column: string, userId: string) => ({
              eq: (_tokenColumn: string, token: string) => {
                deletedTokens.push(`${userId}:${token}`);
                return Promise.resolve({ error: null });
              },
            }),
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };
}

describe('NotificationService', () => {
  beforeEach(() => {
    requestMock = jest.fn();
    activeSupabase = null;
  });

  it('dedupes by idempotency key and skips push when inbox row already exists', async () => {
    activeSupabase = buildSupabase({
      insertedNotificationId: null,
      pushTokens: [{ expo_push_token: 'ExponentPushToken[abc]', platform: 'ios' }],
    });

    const service = new NotificationService({
      getByUserIds: async () =>
        new Map([
          ['user-1', { userId: 'user-1', sessionsRemindersEnabled: true, friendRequestsEnabled: true }],
        ]),
    } as any);

    await service.send({
      type: 'FRIEND_REQUEST_RECEIVED',
      recipients: ['user-1'],
      title: 'New friend request',
      body: 'Hello',
      idempotencyKey: 'FRIEND_REQUEST_RECEIVED:friend-1',
    });

    expect(requestMock).not.toHaveBeenCalled();
  });

  it('sends Android channelId and removes token on DeviceNotRegistered', async () => {
    activeSupabase = buildSupabase({
      insertedNotificationId: 'notif-1',
      pushTokens: [{ expo_push_token: 'ExponentPushToken[android-token]', platform: 'android' }],
    });

    requestMock
      .mockResolvedValueOnce({
        statusCode: 200,
        body: {
          json: async () => ({
            data: [
              {
                id: 'ticket-1',
                status: 'error',
                details: { error: 'DeviceNotRegistered' },
              },
            ],
          }),
        },
      })
      .mockResolvedValueOnce({
        statusCode: 200,
        body: {
          json: async () => ({
            data: {
              'ticket-1': {
                status: 'error',
                details: { error: 'DeviceNotRegistered' },
              },
            },
          }),
        },
      });

    const service = new NotificationService({
      getByUserIds: async () =>
        new Map([
          ['user-1', { userId: 'user-1', sessionsRemindersEnabled: true, friendRequestsEnabled: true }],
        ]),
    } as any);

    await service.send({
      type: 'SESSION_STARTING_SOON',
      recipients: ['user-1'],
      title: 'Starting soon',
      body: 'Soon',
      idempotencyKey: 'SESSION_STARTING_SOON:s1:10m',
    });

    const firstCallBody = JSON.parse(requestMock.mock.calls[0][1].body as string);
    expect(firstCallBody[0].channelId).toBe('default');
    expect(activeSupabase.deletedTokens).toContain('user-1:ExponentPushToken[android-token]');
  });
});
