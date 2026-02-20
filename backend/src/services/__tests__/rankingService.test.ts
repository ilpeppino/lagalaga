import { beforeEach, describe, expect, it, jest } from '@jest/globals';

let activeSupabase: any = null;

const metrics = {
  suspiciousRankedActivityTotal: { inc: jest.fn() },
  rankedMatchResultsTotal: { inc: jest.fn() },
  ratingUpdatesTotal: { inc: jest.fn() },
  tierPromotionsTotal: { inc: jest.fn() },
};

jest.unstable_mockModule('../../config/supabase.js', () => ({
  getSupabase: () => activeSupabase,
}));

jest.unstable_mockModule('../../config/featureFlags.js', () => ({
  isCompetitiveDepthEnabled: () => false,
}));

jest.unstable_mockModule('../../plugins/metrics.js', () => ({ metrics }));

const { RankingService } = await import('../rankingService.js');
const { AppError, RateLimitError, ValidationError } = await import('../../utils/errors.js');

describe('RankingService.getTierFromRating', () => {
  it('maps ratings to tiers', () => {
    expect(RankingService.getTierFromRating(999)).toBe('bronze');
    expect(RankingService.getTierFromRating(1000)).toBe('silver');
    expect(RankingService.getTierFromRating(1800)).toBe('master');
  });
});

describe('RankingService.enforceSubmissionRateLimit', () => {
  let service: InstanceType<typeof RankingService>;

  beforeEach(() => {
    service = new RankingService();
    (RankingService as any).recentSubmissionByKey = new Map();
  });

  it('blocks rapid repeat submissions for same session', () => {
    service.enforceSubmissionRateLimit('user-1', 'sess-1');
    expect(() => service.enforceSubmissionRateLimit('user-1', 'sess-1')).toThrow(RateLimitError);
  });

  it('allows submissions for different sessions', () => {
    service.enforceSubmissionRateLimit('user-1', 'sess-1');
    expect(() => service.enforceSubmissionRateLimit('user-1', 'sess-2')).not.toThrow();
  });
});

describe('RankingService.ensureRankingRow', () => {
  let service: InstanceType<typeof RankingService>;

  beforeEach(() => {
    service = new RankingService();
  });

  it('throws AppError on upsert failure', async () => {
    activeSupabase = {
      from: jest.fn(() => ({
        upsert: async () => ({ error: { message: 'db down' } }),
      })),
    };

    await expect(service.ensureRankingRow('user-2')).rejects.toBeInstanceOf(AppError);
  });
});

describe('RankingService.enforceMinimumSessionDuration', () => {
  const service = new RankingService();

  it('rejects submissions that are too early', async () => {
    const recentSession = { created_at: new Date().toISOString(), is_ranked: true, status: 'active', id: 's1' } as any;
    await expect((service as any).enforceMinimumSessionDuration(recentSession)).rejects.toBeInstanceOf(ValidationError);
  });
});
