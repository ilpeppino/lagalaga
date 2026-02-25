import { beforeEach, describe, expect, it, jest } from '@jest/globals';

let activeSupabase: any;

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

const { SessionReminderService } = await import('../session-reminder.service.js');

function buildSupabase() {
  return {
    from: (table: string) => {
      if (table === 'sessions') {
        return {
          select: () => ({
            eq: () => ({
              gte: () => ({
                lt: () => ({
                  limit: async () => ({
                    data: [{
                      id: 'session-1',
                      title: 'Ranked grind',
                      scheduled_start: '2026-02-25T10:10:00.000Z',
                      host_id: 'host-1',
                    }],
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        };
      }

      if (table === 'session_participants') {
        return {
          select: () => ({
            in: () => ({
              in: async () => ({
                data: [
                  { session_id: 'session-1', user_id: 'host-1', state: 'joined' },
                  { session_id: 'session-1', user_id: 'user-2', state: 'joined' },
                  { session_id: 'session-1', user_id: 'user-3', state: 'invited' },
                ],
                error: null,
              }),
            }),
          }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
  };
}

describe('SessionReminderService', () => {
  beforeEach(() => {
    activeSupabase = buildSupabase();
  });

  it('notifies joined/invited participants excluding host', async () => {
    const send = jest.fn(async () => undefined);
    const service = new SessionReminderService({ send } as any, {
      leadMinutes: 10,
      windowSeconds: 60,
    });

    const result = await service.processReminders(new Date('2026-02-25T10:00:00.000Z'));

    expect(result.sessionsMatched).toBe(1);
    expect(result.notificationsQueued).toBe(2);
    const firstCallArg = (send as any).mock.calls[0][0];
    expect(firstCallArg).toMatchObject({
      type: 'SESSION_STARTING_SOON',
      recipients: ['user-2', 'user-3'],
      idempotencyKey: 'SESSION_STARTING_SOON:session-1:10m',
    });
  });
});
