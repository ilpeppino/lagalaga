import Fastify from 'fastify';
import request from 'supertest';
import { describe, expect, it, jest } from '@jest/globals';
import { buildMeRoutes } from '../../routes/me.routes.js';
import { errorHandlerPlugin } from '../../plugins/errorHandler.js';

async function buildApp(enableCompetitiveDepth: boolean, matchHistoryService: any) {
  const app = Fastify({ logger: false });
  (app as any).config = {
    NODE_ENV: 'test',
    ENABLE_COMPETITIVE_DEPTH: enableCompetitiveDepth,
  };

  await app.register(errorHandlerPlugin);
  await app.register(
    buildMeRoutes({
      authPreHandler: async (req: any) => {
        req.user = { userId: 'user-1' };
      },
      matchHistoryService,
      favoritesService: { getFavoritesForUser: jest.fn() } as any,
      friendsCacheService: { getFriendsForUser: jest.fn() } as any,
    }),
    { prefix: '/api/me' }
  );
  await app.ready();

  return app;
}

describe('GET /api/me/match-history', () => {
  it('returns 404 when competitive depth is disabled', async () => {
    const service = { getMyMatchHistory: jest.fn() };
    const app = await buildApp(false, service);

    const res = await request(app.server).get('/api/me/match-history');
    await app.close();

    expect(res.status).toBe(404);
    expect(res.body.error?.code ?? res.body.code).toBe('NOT_FOUND_001');
    expect(service.getMyMatchHistory).not.toHaveBeenCalled();
  });

  it('returns match history when competitive depth is enabled', async () => {
    const service = {
      getMyMatchHistory: jest.fn(async () => ({
        timezone: 'Europe/Amsterdam',
        entries: [
          {
            sessionId: 's-1',
            sessionTitle: 'Ranked Lobby',
            playedAt: new Date().toISOString(),
            result: 'win',
            winnerId: 'user-1',
            ratingDelta: 25,
            opponents: [{ userId: 'user-2', displayName: 'Rival' }],
          },
        ],
      })),
    };

    const app = await buildApp(true, service);
    const res = await request(app.server).get('/api/me/match-history?limit=10');
    await app.close();

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.entries).toHaveLength(1);
    expect((service.getMyMatchHistory as any).mock.calls[0]).toEqual(['user-1', 10]);
  });
});
