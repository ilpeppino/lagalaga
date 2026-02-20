import { beforeEach, describe, expect, it, jest } from '@jest/globals';

let activeSupabase: any = null;

const logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

jest.unstable_mockModule('../../config/supabase.js', () => ({
  getSupabase: () => activeSupabase,
}));

jest.unstable_mockModule('../../lib/logger.js', () => ({
  logger,
}));

const { ReportingService } = await import('../reporting.service.js');
const { ValidationError, RateLimitError, ConflictError } = await import('../../utils/errors.js');

function buildSupabase(options: {
  rateLimitCount?: number;
  duplicateRows?: any[];
  insertResult?: { data: any; error: any };
} = {}) {
  const rateLimitCount = options.rateLimitCount ?? 0;
  const duplicateRows = options.duplicateRows ?? [];
  const insertResult = options.insertResult ?? {
    data: { id: 'rep-1', status: 'OPEN', created_at: '2026-02-20T00:00:00Z' },
    error: null,
  };

  return {
    from: (table: string) => {
      if (table === 'app_users') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { id: 'target-user' }, error: null }),
            }),
          }),
        };
      }

      if (table === 'reports') {
        return {
          select: (_cols: string, opts?: { count?: 'exact'; head?: boolean }) => {
            if (opts?.head) {
              return {
                eq: () => ({
                  gte: async () => ({ count: rateLimitCount, error: null }),
                }),
              };
            }

            return {
              eq: () => ({
                eq: () => ({
                  gte: async () => ({ data: duplicateRows, error: null }),
                }),
              }),
            };
          },
          insert: () => ({
            select: () => ({
              single: async () => insertResult,
            }),
          }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
  };
}

describe('ReportingService.validateInput', () => {
  let service: InstanceType<typeof ReportingService>;

  beforeEach(() => {
    activeSupabase = buildSupabase();
    service = new ReportingService();
  });

  it('rejects invalid category', async () => {
    await expect(
      service.createReport({
        reporterId: 'user-1',
        category: 'NOT_REAL' as any,
        description: 'test',
        targetType: 'GENERAL',
        requestId: 'req-1',
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('ReportingService.createReport', () => {
  beforeEach(() => {
    Object.values(logger).forEach((fn) => fn.mockClear());
  });

  it('enforces rate limits', async () => {
    activeSupabase = buildSupabase({ rateLimitCount: 5 });
    const service = new ReportingService({ maxReportsPerHour: 1 });

    await expect(
      service.createReport({
        reporterId: 'user-1',
        category: 'OTHER',
        description: 'Spam',
        targetType: 'USER',
        targetUserId: 'target-user',
        requestId: 'req-2',
      })
    ).rejects.toBeInstanceOf(RateLimitError);
  });

  it('blocks duplicate submissions in recent window', async () => {
    activeSupabase = buildSupabase({
      duplicateRows: [
        {
          id: 'dup-1',
          target_user_id: 'target-user',
          target_session_id: null,
          description: 'spam message',
        },
      ],
    });
    const service = new ReportingService({ duplicateWindowMinutes: 10 });

    await expect(
      service.createReport({
        reporterId: 'user-1',
        category: 'OTHER',
        description: 'Spam   message',
        targetType: 'USER',
        targetUserId: 'target-user',
        requestId: 'req-3',
      })
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('escalates CSAM reports and returns ticket', async () => {
    const insertResult = {
      data: { id: 'rep-9', status: 'ESCALATED', created_at: '2026-02-20T00:00:00Z' },
      error: null,
    };
    activeSupabase = buildSupabase({ insertResult });
    const service = new ReportingService();
    const notifySpy = jest.spyOn(service as any, 'notifySafetyMailbox').mockResolvedValue(undefined);

    const result = await service.createReport({
      reporterId: 'user-1',
      category: 'CSAM',
      description: 'serious violation',
      targetType: 'USER',
      targetUserId: 'target-user',
      requestId: 'req-4',
      correlationId: 'corr-1',
    });

    expect(result).toEqual({
      ticketId: 'rep-9',
      status: 'ESCALATED',
      createdAt: '2026-02-20T00:00:00Z',
    });
    expect(notifySpy).toHaveBeenCalledWith('rep-9', 'CSAM');
  });
});
