import { beforeEach, describe, expect, it, jest } from '@jest/globals';

let activeSupabaseMock: any = null;

jest.unstable_mockModule('../../config/supabase.js', () => ({
  getSupabase: () => activeSupabaseMock,
}));

const { AccountDeletionService: AccountDeletionServiceClass } = await import('../account-deletion.service.js');

function buildSupabaseMock(params: {
  pendingRequest: {
    id: string;
    user_id: string;
    requested_at: string;
    scheduled_purge_at: string;
    status: 'PENDING';
    initiator: 'IN_APP';
    reason: string | null;
  } | null;
  countInLastHour?: number;
}) {
  return {
    from: jest.fn((table: string) => {
      if (table !== 'account_deletion_requests') {
        throw new Error(`Unexpected table ${table}`);
      }

      return {
        select: jest.fn((_: string, options?: { count?: 'exact'; head?: boolean }) => {
          if (options?.head) {
            return {
              eq: jest.fn(() => ({
                gte: async () => ({
                  count: params.countInLastHour ?? 0,
                  error: null,
                }),
              })),
            };
          }

          return {
            eq: jest.fn(() => ({
              eq: jest.fn(() => ({
                maybeSingle: async () => ({
                  data: params.pendingRequest,
                  error: null,
                }),
              })),
            })),
          };
        }),
      };
    }),
  };
}

describe('AccountDeletionService', () => {
  let service: import('../account-deletion.service.js').AccountDeletionService;

  beforeEach(() => {
    service = new AccountDeletionServiceClass();
    activeSupabaseMock = null;
  });

  it('returns existing pending request (idempotent)', async () => {
    activeSupabaseMock = buildSupabaseMock({
      pendingRequest: {
        id: 'req-1',
        user_id: 'user-1',
        requested_at: '2026-02-17T20:00:00.000Z',
        scheduled_purge_at: '2026-02-24T20:00:00.000Z',
        status: 'PENDING',
        initiator: 'IN_APP',
        reason: null,
      },
    });

    const result = await service.createDeletionRequest({
      userId: 'user-1',
      initiator: 'IN_APP',
    });

    expect(result.requestId).toBe('req-1');
    expect(result.status).toBe('PENDING');
  });

  it('throws rate limit error when too many requests are made in one hour', async () => {
    activeSupabaseMock = buildSupabaseMock({
      pendingRequest: null,
      countInLastHour: 3,
    });

    await expect(
      service.createDeletionRequest({
        userId: 'user-1',
        initiator: 'IN_APP',
      })
    ).rejects.toMatchObject({
      code: 'RATE_001',
      statusCode: 429,
    });
  });
});
