import { beforeEach, describe, expect, it, jest } from '@jest/globals';

let activeSupabaseMock: any = null;

jest.unstable_mockModule('../../config/supabase.js', () => ({
  getSupabase: () => activeSupabaseMock,
}));

const { CacheCleanupService } = await import('../cache-cleanup.service.js');

function buildDeleteChain(
  result: { count?: number | null; error?: { message: string } | null }
) {
  return {
    lt: jest.fn(async () => ({
      count: result.count ?? 0,
      error: result.error ?? null,
    })),
  };
}

describe('CacheCleanupService', () => {
  beforeEach(() => {
    activeSupabaseMock = null;
  });

  it('deletes expired rows across cache tables', async () => {
    const deleteExperience = buildDeleteChain({ count: 2 });
    const deleteFriends = buildDeleteChain({ count: 1 });
    const deleteFavorites = buildDeleteChain({ count: 2 });
    const deleteGames = buildDeleteChain({ count: 1 });

    activeSupabaseMock = {
      from: jest.fn((table: string) => {
        if (table === 'roblox_experience_cache') {
          return { delete: jest.fn(() => ({ lt: deleteExperience.lt })) };
        }
        if (table === 'roblox_friends_cache') {
          return { delete: jest.fn(() => ({ lt: deleteFriends.lt })) };
        }
        if (table === 'user_favorites_cache') {
          return { delete: jest.fn(() => ({ lt: deleteFavorites.lt })) };
        }
        if (table === 'games') {
          return { delete: jest.fn(() => ({ lt: deleteGames.lt })) };
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    };

    const service = new CacheCleanupService();
    const result = await service.processCleanup(new Date('2026-02-23T18:00:00.000Z'));

    expect(result.deletedExperienceCacheCount).toBe(2);
    expect(result.deletedFriendsCacheCount).toBe(1);
    expect(result.deletedFavoritesCacheCount).toBe(2);
    expect(result.deletedGamesCount).toBe(1);
  });

  it('throws AppError when a delete query fails', async () => {
    const deleteExperience = buildDeleteChain({ error: { message: 'db failure' } });

    activeSupabaseMock = {
      from: jest.fn((table: string) => {
        if (table === 'roblox_experience_cache') {
          return { delete: jest.fn(() => ({ lt: deleteExperience.lt })) };
        }
        const okDelete = buildDeleteChain({ count: 0 });
        return { delete: jest.fn(() => ({ lt: okDelete.lt })) };
      }),
    };

    const service = new CacheCleanupService();
    await expect(service.processCleanup()).rejects.toMatchObject({
      code: 'INT_002',
      statusCode: 500,
    });
  });
});
