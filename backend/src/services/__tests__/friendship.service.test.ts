import { beforeEach, describe, expect, it, jest } from '@jest/globals';

let activeSupabase: any = null;

const logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

const metrics = {
  incrementCounter: jest.fn(),
};

jest.unstable_mockModule('../../config/supabase.js', () => ({
  getSupabase: () => activeSupabase,
}));

jest.unstable_mockModule('../../plugins/metrics.js', () => ({ metrics }));

jest.unstable_mockModule('../../lib/logger.js', () => ({ logger }));

jest.unstable_mockModule('../roblox-friends.service.js', () => ({
  RobloxFriendsService: class {
    enforceRefreshRateLimit = jest.fn();
    syncForUser = jest.fn();
  },
}));

const { FriendshipService } = await import('../friendship.service.js');
const { AppError } = await import('../../utils/errors.js');

function buildSupabase(options: {
  targetExists?: boolean;
  existingStatus?: 'accepted' | 'pending' | 'blocked' | null;
} = {}) {
  const targetExists = options.targetExists ?? true;
  const existingStatus = options.existingStatus ?? null;

  return {
    from: (table: string) => {
      if (table === 'app_users') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: targetExists ? { id: 'target-user' } : null,
                error: null,
              }),
            }),
          }),
        };
      }

      if (table === 'friendships') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: existingStatus ? { id: 'friend-1', status: existingStatus } : null,
                  error: null,
                }),
              }),
            }),
          }),
          insert: () => ({
            select: () => ({
              single: async () => ({
                data: { id: 'friend-new', status: 'pending' },
                error: null,
              }),
            }),
          }),
          delete: jest.fn(() => ({ eq: jest.fn(async () => ({ error: null })) })),
          update: jest.fn(() => ({ eq: jest.fn(async () => ({ error: null })) })),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
  };
}

describe('FriendshipService.sendRequest', () => {
  let service: InstanceType<typeof FriendshipService>;

  beforeEach(() => {
    metrics.incrementCounter.mockClear();
    Object.values(logger).forEach((fn) => fn.mockClear());
    activeSupabase = buildSupabase();
    service = new FriendshipService();
  });

  it('rejects self friend requests', async () => {
    await expect(service.sendRequest('user-1', 'user-1')).rejects.toBeInstanceOf(AppError);
  });

  it('rejects when target user is missing', async () => {
    activeSupabase = buildSupabase({ targetExists: false });
    await expect(service.sendRequest('user-1', 'missing-user')).rejects.toBeInstanceOf(AppError);
  });

  it('rejects when friendship already accepted', async () => {
    activeSupabase = buildSupabase({ existingStatus: 'accepted' });
    await expect(service.sendRequest('user-1', 'target-user')).rejects.toBeInstanceOf(AppError);
  });

  it('creates pending request when no conflict exists', async () => {
    const result = await service.sendRequest('user-1', 'target-user');

    expect(result).toEqual({ friendshipId: 'friend-new', status: 'pending' });
    expect(metrics.incrementCounter).toHaveBeenCalledWith('friends_request_total', { action: 'send' });
  });
});
