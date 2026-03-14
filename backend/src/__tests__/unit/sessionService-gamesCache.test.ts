import { describe, expect, it, jest, beforeEach } from '@jest/globals';

jest.mock('../../config/supabase.js', () => ({ getSupabase: jest.fn() }));
jest.mock('../../plugins/metrics.js', () => ({
  metrics: {
    incrementCounter: jest.fn(),
    rankedSessionsCreatedTotal: { inc: jest.fn() },
    quickSessionsCreatedTotal: { inc: jest.fn() },
  },
}));
jest.mock('../../lib/logger.js', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../../services/roblox-link-normalizer.js', () => ({
  RobloxLinkNormalizer: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('../../services/roblox-enrichment.service.js', () => ({
  RobloxEnrichmentService: jest.fn().mockImplementation(() => ({})),
}));

import { getSupabase } from '../../config/supabase.js';
import { metrics } from '../../plugins/metrics.js';
import { SessionServiceV2 } from '../../services/sessionService-v2.js';

const mockGetSupabase = getSupabase as jest.MockedFunction<any>;
const mockIncrementCounter = metrics.incrementCounter as jest.MockedFunction<typeof metrics.incrementCounter>;

const GAME_ROW = { place_id: 606849621, canonical_web_url: 'https://roblox.com/games/606849621' };

function makeSupabaseSpy(gameRow: unknown) {
  const insertSpy = jest.fn(async () => ({ data: gameRow, error: null }));
  mockGetSupabase.mockReturnValue({
    from: () => ({
      select: () => ({ eq: () => ({ single: insertSpy }) }),
    }),
  });
  return insertSpy;
}

describe('SessionServiceV2.getGameByPlaceId (via cache)', () => {
  let service: SessionServiceV2;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SessionServiceV2();
  });

  it('queries the database on first call (cache miss)', async () => {
    const dbSpy = makeSupabaseSpy(GAME_ROW);

    const result = await (service as any).getGameByPlaceId(606849621);

    expect(result).toEqual(GAME_ROW);
    expect(dbSpy).toHaveBeenCalledTimes(1);
    expect(mockIncrementCounter).toHaveBeenCalledWith('games_cache_misses_total');
  });

  it('returns cached value on second call without hitting the database', async () => {
    // Prime the cache
    makeSupabaseSpy(GAME_ROW);
    await (service as any).getGameByPlaceId(606849621);

    // Second call — fresh spy to detect any DB access
    jest.clearAllMocks();
    const dbSpy2 = makeSupabaseSpy(GAME_ROW);
    const result = await (service as any).getGameByPlaceId(606849621);

    expect(result).toEqual(GAME_ROW);
    expect(dbSpy2).not.toHaveBeenCalled();
    expect(mockIncrementCounter).toHaveBeenCalledWith('games_cache_hits_total');
  });

  it('returns null and does not cache when database returns no row', async () => {
    makeSupabaseSpy(null);

    const result = await (service as any).getGameByPlaceId(999999);

    expect(result).toBeNull();
    // Second call should re-query (null not cached)
    const dbSpy2 = makeSupabaseSpy(null);
    await (service as any).getGameByPlaceId(999999);
    expect(dbSpy2).toHaveBeenCalledTimes(1);
  });
});
