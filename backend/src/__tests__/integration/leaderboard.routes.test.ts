import Fastify from 'fastify';
import request from 'supertest';
import { describe, expect, it, jest } from '@jest/globals';
import { buildLeaderboardRoutes } from '../../routes/leaderboard.routes.js';
import { errorHandlerPlugin } from '../../plugins/errorHandler.js';

describe('leaderboard routes', () => {
  it('returns weekly leaderboard entries', async () => {
    const leaderboardService = {
      getLeaderboard: jest.fn(async () => ({
        type: 'weekly' as const,
        timezone: 'Europe/Amsterdam' as const,
        generatedAt: new Date().toISOString(),
        entries: [
          { rank: 1, userId: 'u1', rating: 1200, wins: 10, losses: 2, displayName: 'Alpha' },
          { rank: 2, userId: 'u2', rating: 1100, wins: 8, losses: 4, displayName: 'Beta' },
        ],
      })),
    };

    const app = Fastify({ logger: false });
    (app as any).config = { NODE_ENV: 'test', ENABLE_COMPETITIVE_DEPTH: false };
    await app.register(errorHandlerPlugin);
    await app.register(buildLeaderboardRoutes({ leaderboardService: leaderboardService as any }));
    await app.ready();

    const res = await request(app.server).get('/api/leaderboard?type=weekly');
    await app.close();

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.entries[0].rating).toBeGreaterThan(res.body.data.entries[1].rating);
    expect((leaderboardService.getLeaderboard as any).mock.calls[0]).toEqual(['weekly', false]);
  });

  it('passes includeTier=true when competitive depth is enabled', async () => {
    const leaderboardService = {
      getLeaderboard: jest.fn(async () => ({
        type: 'weekly' as const,
        timezone: 'Europe/Amsterdam' as const,
        generatedAt: new Date().toISOString(),
        entries: [],
      })),
    };

    const app = Fastify({ logger: false });
    (app as any).config = { NODE_ENV: 'test', ENABLE_COMPETITIVE_DEPTH: true };
    await app.register(errorHandlerPlugin);
    await app.register(buildLeaderboardRoutes({ leaderboardService: leaderboardService as any }));
    await app.ready();

    const res = await request(app.server).get('/api/leaderboard?type=weekly');
    await app.close();

    expect(res.status).toBe(200);
    expect((leaderboardService.getLeaderboard as any).mock.calls[0]).toEqual(['weekly', true]);
  });
});
