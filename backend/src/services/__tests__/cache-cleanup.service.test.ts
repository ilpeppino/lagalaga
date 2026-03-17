import { beforeEach, describe, expect, it, jest } from '@jest/globals';

let activeRepositoryMock: any = null;

jest.unstable_mockModule('../../db/repository-factory.js', () => ({
  createCacheCleanupRepository: () => activeRepositoryMock,
}));

const { CacheCleanupService } = await import('../cache-cleanup.service.js');

describe('CacheCleanupService', () => {
  beforeEach(() => {
    activeRepositoryMock = null;
  });

  it('deletes expired rows across cache tables', async () => {
    activeRepositoryMock = {
      deleteExperienceCacheBefore: jest.fn(async () => ({ data: 2, error: null })),
      deleteFriendsCacheBefore: jest.fn(async () => ({ data: 1, error: null })),
      deleteFavoritesCacheBefore: jest.fn(async () => ({ data: 2, error: null })),
      deleteGamesBefore: jest.fn(async () => ({ data: 1, error: null })),
    };

    const service = new CacheCleanupService();
    const result = await service.processCleanup(new Date('2026-02-23T18:00:00.000Z'));

    expect(result.deletedExperienceCacheCount).toBe(2);
    expect(result.deletedFriendsCacheCount).toBe(1);
    expect(result.deletedFavoritesCacheCount).toBe(2);
    expect(result.deletedGamesCount).toBe(1);
  });

  it('throws AppError when a delete query fails', async () => {
    activeRepositoryMock = {
      deleteExperienceCacheBefore: jest.fn(async () => ({
        data: null,
        error: { code: 'INT_002', message: 'db failure' },
      })),
      deleteFriendsCacheBefore: jest.fn(async () => ({ data: 0, error: null })),
      deleteFavoritesCacheBefore: jest.fn(async () => ({ data: 0, error: null })),
      deleteGamesBefore: jest.fn(async () => ({ data: 0, error: null })),
    };

    const service = new CacheCleanupService();
    await expect(service.processCleanup()).rejects.toMatchObject({
      code: 'INT_002',
      statusCode: 500,
    });
  });
});
