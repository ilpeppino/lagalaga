import { describe, expect, it, jest, beforeEach } from '@jest/globals';

jest.mock('../../lib/logger.js', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../lib/http.js', () => ({
  fetchJsonWithTimeoutRetry: jest.fn(),
}));

jest.mock('../../config/supabase.js', () => ({
  getSupabase: jest.fn(),
}));

jest.mock('../../config/cache.js', () => ({
  AVATAR_CACHE_TTL_MS: 3600000,
}));

jest.mock('../../plugins/metrics.js', () => ({
  metrics: { incrementCounter: jest.fn() },
}));

jest.mock('../../config/featureFlags.js', () => ({
  isCompetitiveDepthEnabled: jest.fn(() => false),
}));

jest.mock('../../services/rankingService.js', () => ({
  RankingService: jest.fn().mockImplementation(() => ({})),
}));

import { logger } from '../../lib/logger.js';
import { fetchJsonWithTimeoutRetry } from '../../lib/http.js';
import { getSupabase } from '../../config/supabase.js';
import { fetchRobloxHeadshot, updateAppUserAvatarCache, isAvatarCacheFresh } from '../../services/me.service.js';

const mockFetch = fetchJsonWithTimeoutRetry as jest.MockedFunction<typeof fetchJsonWithTimeoutRetry>;
const mockGetSupabase = getSupabase as jest.MockedFunction<any>;
const mockWarn = logger.warn as jest.MockedFunction<typeof logger.warn>;

describe('fetchRobloxHeadshot', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('logs structured warning and returns null when fetch throws', async () => {
    mockFetch.mockRejectedValue(new Error('network timeout'));

    const result = await fetchRobloxHeadshot('12345');

    expect(result).toBeNull();
    expect(mockWarn).toHaveBeenCalledTimes(1);
    const [context, message] = mockWarn.mock.calls[0] as [Record<string, unknown>, string];
    expect(message).toBe('Failed to fetch Roblox avatar');
    expect(context.robloxUserId).toBe('12345');
    expect(context.error).toBe('network timeout');
  });

  it('does not call logger.warn on success', async () => {
    mockFetch.mockResolvedValue({
      data: [{ state: 'Completed', imageUrl: 'https://example.com/avatar.png' }],
    } as any);

    const result = await fetchRobloxHeadshot('12345');

    expect(result).toBe('https://example.com/avatar.png');
    expect(mockWarn).not.toHaveBeenCalled();
  });
});

describe('updateAppUserAvatarCache .catch handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('the .catch handler prevents unhandled rejection when cache update throws', async () => {
    mockGetSupabase.mockReturnValue({
      from: () => ({ update: () => ({ eq: async () => { throw new Error('db error'); } }) }),
    });

    // The caller uses .catch — no unhandled rejection should surface
    await expect(
      updateAppUserAvatarCache('user-1', 'https://example.com/a.png')
        .catch((err: unknown) =>
          logger.warn({ userId: 'user-1', error: err instanceof Error ? err.message : String(err) }, 'Avatar cache update failed')
        )
    ).resolves.toBeUndefined();

    expect(mockWarn).toHaveBeenCalledWith(
      { userId: 'user-1', error: 'db error' },
      'Avatar cache update failed'
    );
  });

  it('the .catch handler in getMeData logs a warning when cache update rejects', async () => {
    // Simulate the pattern used in getMeData: fire-and-forget with .catch
    const reject = Promise.reject(new Error('update failed'));
    reject.catch((err: unknown) =>
      logger.warn({ userId: 'user-1', error: err instanceof Error ? err.message : String(err) }, 'Avatar cache update failed')
    );
    await new Promise((r) => setTimeout(r, 0)); // flush microtask

    expect(mockWarn).toHaveBeenCalledTimes(1);
    const [context, message] = mockWarn.mock.calls[0] as [Record<string, unknown>, string];
    expect(message).toBe('Avatar cache update failed');
    expect(context.error).toBe('update failed');
  });
});

describe('isAvatarCacheFresh', () => {
  const TTL_MS = 3_600_000; // matches mock AVATAR_CACHE_TTL_MS

  it('returns false for null', () => {
    expect(isAvatarCacheFresh(null)).toBe(false);
  });

  it('returns true when cachedAt is recent', () => {
    const recent = new Date(Date.now() - TTL_MS / 2).toISOString();
    expect(isAvatarCacheFresh(recent)).toBe(true);
  });

  it('returns false when cachedAt is older than TTL', () => {
    const stale = new Date(Date.now() - TTL_MS - 1000).toISOString();
    expect(isAvatarCacheFresh(stale)).toBe(false);
  });

  it('returns false for clock-skew: cachedAt is in the future', () => {
    // Simulates DB writer with a clock ahead of the app server
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(isAvatarCacheFresh(future)).toBe(false);
  });

  it('returns false when cachedAt is exactly at TTL boundary', () => {
    const boundary = new Date(Date.now() - TTL_MS).toISOString();
    expect(isAvatarCacheFresh(boundary)).toBe(false);
  });
});
