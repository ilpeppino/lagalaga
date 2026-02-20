import { beforeEach, describe, expect, it, jest } from '@jest/globals';

let activeSupabaseMock: any;

jest.unstable_mockModule('../../config/supabase.js', () => ({
  getSupabase: () => activeSupabaseMock,
}));

const { LeaderboardService } = await import('../leaderboardService.js');

describe('LeaderboardService', () => {
  beforeEach(() => {
    activeSupabaseMock = null;
  });

  it('returns leaderboard sorted by rating desc', async () => {
    activeSupabaseMock = {
      rpc: jest.fn(async () => ({
        data: [
          {
            rank: 3,
            user_id: 'c-user',
            rating: 1025,
            wins: 3,
            losses: 4,
            display_name: 'C',
          },
          {
            rank: 1,
            user_id: 'a-user',
            rating: 1200,
            wins: 10,
            losses: 1,
            display_name: 'A',
          },
          {
            rank: 2,
            user_id: 'b-user',
            rating: 1100,
            wins: 6,
            losses: 2,
            display_name: 'B',
          },
        ],
        error: null,
      })),
    };

    const service = new LeaderboardService();
    const result = await service.getLeaderboard('weekly');

    expect(result.type).toBe('weekly');
    expect(result.timezone).toBe('Europe/Amsterdam');
    expect(result.entries).toHaveLength(3);
    expect(result.entries[0]).toMatchObject({ rank: 1, userId: 'a-user', rating: 1200 });
    expect(result.entries[1]).toMatchObject({ rank: 2, userId: 'b-user', rating: 1100 });
    expect(result.entries[2]).toMatchObject({ rank: 3, userId: 'c-user', rating: 1025 });
  });

  it('rejects unsupported leaderboard type', async () => {
    activeSupabaseMock = {
      rpc: jest.fn(),
    };

    const service = new LeaderboardService();

    await expect(service.getLeaderboard('all_time')).rejects.toMatchObject({
      code: 'VAL_001',
      statusCode: 400,
    });
  });

  it('includes tier when includeTier is true', async () => {
    activeSupabaseMock = {
      rpc: jest.fn(async () => ({
        data: [
          {
            rank: 1,
            user_id: 'a-user',
            rating: 1810,
            wins: 11,
            losses: 2,
            display_name: 'A',
          },
        ],
        error: null,
      })),
    };

    const service = new LeaderboardService();
    const result = await service.getLeaderboard('weekly', true);
    expect(result.entries[0].tier).toBe('master');
  });
});
