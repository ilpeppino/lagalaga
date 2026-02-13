import Fastify from 'fastify';
import request from 'supertest';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { robloxRoutes } from '../../routes/roblox.js';
import { errorHandlerPlugin } from '../../plugins/errorHandler.js';

describe('GET /api/roblox/experience-by-place/:placeId', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  async function buildApp(
    resolver: { resolveExperienceByPlaceId: (placeId: number) => Promise<unknown> }
  ) {
    const app = Fastify({ logger: false });
    (app as any).config = { NODE_ENV: 'test' };

    await app.register(errorHandlerPlugin);
    await app.register(robloxRoutes, {
      experienceByPlaceResolver: resolver,
    });
    await app.ready();
    return app;
  }

  it('returns resolved experience metadata', async () => {
    const resolver = {
      resolveExperienceByPlaceId: ((jest.fn() as any).mockResolvedValue({
        placeId: 606849621,
        universeId: 245683,
        name: 'Jailbreak',
        description: 'Crime and police roleplay.',
        creatorId: 1,
        creatorName: 'Badimo',
        maxPlayers: 30,
        visits: 1000000,
        playing: 15000,
        iconUrl: 'https://tr.rbxcdn.com/icon.png',
        canonicalWebUrl: 'https://www.roblox.com/games/606849621',
        canonicalStartUrl: 'https://www.roblox.com/games/start?placeId=606849621',
      }) as unknown) as (placeId: number) => Promise<unknown>,
    };

    const app = await buildApp(resolver);
    const res = await request(app.server).get('/api/roblox/experience-by-place/606849621');
    await app.close();

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.placeId).toBe(606849621);
    expect(resolver.resolveExperienceByPlaceId).toHaveBeenCalledWith(606849621);
  });

  it('returns 400 for invalid placeId', async () => {
    const resolver = {
      resolveExperienceByPlaceId: ((jest.fn() as any) as unknown) as (placeId: number) => Promise<unknown>,
    };

    const app = await buildApp(resolver);
    const res = await request(app.server).get('/api/roblox/experience-by-place/not-a-number');
    await app.close();

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(resolver.resolveExperienceByPlaceId).not.toHaveBeenCalled();
  });
});
