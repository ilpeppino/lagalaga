import { beforeEach, describe, expect, it, jest } from '@jest/globals';

let activeSupabase: any = null;

const logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

const metrics = {
  achievementsUnlockedTotal: {
    inc: jest.fn(),
  },
};

jest.unstable_mockModule('../../config/supabase.js', () => ({
  getSupabase: () => activeSupabase,
}));

jest.unstable_mockModule('../../lib/logger.js', () => ({
  logger,
}));

jest.unstable_mockModule('../../plugins/metrics.js', () => ({
  metrics,
}));

const { AchievementService } = await import('../achievementService.js');
const { AppError } = await import('../../utils/errors.js');

describe('AchievementService.ensureUserStatsRow', () => {
  let service: InstanceType<typeof AchievementService>;

  beforeEach(() => {
    service = new AchievementService();
    activeSupabase = null;
    Object.values(logger).forEach((fn) => fn.mockClear());
    metrics.achievementsUnlockedTotal.inc.mockClear();
  });

  it('throws when Supabase upsert fails', async () => {
    activeSupabase = {
      from: jest.fn(() => ({
        upsert: async () => ({ error: { message: 'boom' } }),
      })),
    };

    await expect(service.ensureUserStatsRow('u1')).rejects.toBeInstanceOf(AppError);
  });

  it('creates row when upsert succeeds', async () => {
    const upsert = jest.fn(async () => ({ error: null }));
    activeSupabase = {
      from: jest.fn(() => ({ upsert })),
    };

    await service.ensureUserStatsRow('u1');

    expect(upsert).toHaveBeenCalled();
    const firstCall = upsert.mock.calls[0] as any[];
    const payload = firstCall?.[0];
    expect(payload).toBeDefined();
    expect(payload.user_id).toBe('u1');
    expect(payload.sessions_hosted).toBe(0);
    expect(payload.sessions_joined).toBe(0);
  });
});

describe('AchievementService.incrementUserStat', () => {
  let service: InstanceType<typeof AchievementService>;

  beforeEach(() => {
    service = new AchievementService();
    activeSupabase = null;
  });

  it('invokes RPC when available', async () => {
    const rpc = jest.fn(async () => ({ error: null }));
    const upsert = jest.fn(async () => ({ error: null }));
    activeSupabase = {
      from: jest.fn(() => ({ upsert })),
      rpc,
    };

    await service.incrementUserStat('user-1', 'sessions_hosted');

    expect(rpc).toHaveBeenCalled();
    const rpcCall = rpc.mock.calls[0] as any[];
    const fnName = rpcCall?.[0];
    const payload = rpcCall?.[1];
    expect(payload).toBeDefined();
    expect(fnName).toBe('increment_user_stat');
    expect(payload).toEqual({ p_user_id: 'user-1', p_column: 'sessions_hosted' });
  });

  it('falls back to manual increment when RPC fails', async () => {
    let updatePayload: Record<string, unknown> | null = null;
    const upsert = jest.fn(async () => ({ error: null }));
    const select = jest.fn(() => ({
      eq: jest.fn(() => ({
        maybeSingle: async () => ({
          data: { sessions_joined: 2 },
          error: null,
        }),
      })),
    }));
    const update = jest.fn((payload: Record<string, unknown>) => {
      updatePayload = payload;
      return {
        eq: jest.fn(async () => ({ error: null })),
      };
    });

    activeSupabase = {
      from: jest.fn((table: string) => {
        if (table !== 'user_stats') throw new Error('Unexpected table');
        return { upsert, select, update };
      }),
      rpc: jest.fn(async () => ({ error: { message: 'missing function' } })),
    };

    await service.incrementUserStat('user-2', 'sessions_joined');

    expect(updatePayload).toMatchObject({ sessions_joined: 3 });
  });
});

describe('AchievementService.evaluateAndUnlock', () => {
  let service: InstanceType<typeof AchievementService>;

  beforeEach(() => {
    service = new AchievementService();
    activeSupabase = null;
    metrics.achievementsUnlockedTotal.inc.mockClear();
  });

  it('unlocks achievements and ignores duplicates', async () => {
    const selectStats = jest.fn(() => ({
      eq: jest.fn(() => ({
        maybeSingle: async () => ({
          data: { sessions_hosted: 1, sessions_joined: 2 },
          error: null,
        }),
      })),
    }));

    const insert = jest
      .fn()
      .mockReturnValueOnce({
        select: () => ({
          maybeSingle: async () => ({ error: null }),
        }),
      })
      .mockReturnValueOnce({
        select: () => ({
          maybeSingle: async () => ({ error: { code: '23505', message: 'duplicate' } }),
        }),
      });

    activeSupabase = {
      from: jest.fn((table: string) => {
        if (table === 'user_stats') {
          return { select: selectStats };
        }
        if (table === 'user_achievements') {
          return { insert };
        }
        throw new Error('Unexpected table');
      }),
    };

    await service.evaluateAndUnlock('user-3');

    expect(insert).toHaveBeenCalledTimes(2);
    expect(metrics.achievementsUnlockedTotal.inc).toHaveBeenCalledTimes(1);
  });
});

describe('AchievementService.getUserStatsAndAchievements', () => {
  let service: InstanceType<typeof AchievementService>;

  beforeEach(() => {
    service = new AchievementService();
    activeSupabase = null;
  });

  it('returns mapped results and tolerates missing stats row', async () => {
    const selectStats = jest.fn(() => ({
      eq: jest.fn(() => ({
        maybeSingle: async () => ({
          data: null,
          error: { code: 'PGRST116', message: 'No row' },
        }),
      })),
    }));

    const selectAchievements = jest.fn(() => ({
      eq: jest.fn(() => ({
        order: jest.fn(async () => ({
          data: [
            { id: 'a1', user_id: 'user-4', code: 'FIRST_JOIN', unlocked_at: '2026-02-10T00:00:00Z' },
          ],
          error: null,
        })),
      })),
    }));

    activeSupabase = {
      from: jest.fn((table: string) => {
        if (table === 'user_stats') {
          return { select: selectStats };
        }
        if (table === 'user_achievements') {
          return { select: selectAchievements };
        }
        throw new Error('Unexpected table');
      }),
    };

    const result = await service.getUserStatsAndAchievements('user-4');

    expect(result.stats).toBeNull();
    expect(result.achievements).toEqual([
      {
        id: 'a1',
        userId: 'user-4',
        code: 'FIRST_JOIN',
        unlockedAt: '2026-02-10T00:00:00Z',
      },
    ]);
  });
});
