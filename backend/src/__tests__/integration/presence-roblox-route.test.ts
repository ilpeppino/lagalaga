import Fastify from 'fastify';
import request from 'supertest';
import { describe, expect, it, jest } from '@jest/globals';
import { buildPresenceRoutes } from '../../routes/presence.routes.js';
import { errorHandlerPlugin } from '../../plugins/errorHandler.js';
import { AppError } from '../../utils/errors.js';

describe('GET /api/presence/roblox/users', () => {
  it('returns mocked presence statuses', async () => {
    const app = Fastify({ logger: false });
    (app as any).config = { NODE_ENV: 'test' };

    await app.register(errorHandlerPlugin);
    await app.register(buildPresenceRoutes({
      authPreHandler: async (req) => {
        (req as any).user = { userId: 'viewer-1' };
      },
      presenceService: {
        getPresenceForUsers: jest.fn(async () => ({
          available: true,
          statuses: [{ userId: 'u1', status: 'online' }],
        })),
      } as any,
    }));
    await app.ready();

    const res = await request(app.server).get('/api/presence/roblox/users?userIds=u1');

    expect(res.status).toBe(200);
    expect(res.body.available).toBe(true);
    expect(res.body.statuses[0].status).toBe('online');

    await app.close();
  });

  it('returns unavailable payload when Roblox is not connected', async () => {
    const app = Fastify({ logger: false });
    (app as any).config = { NODE_ENV: 'test' };

    await app.register(errorHandlerPlugin);
    await app.register(buildPresenceRoutes({
      authPreHandler: async (req) => {
        (req as any).user = { userId: 'viewer-1' };
      },
      presenceService: {
        getPresenceForUsers: jest.fn(async () => ({
          available: false,
          reason: 'ROBLOX_NOT_CONNECTED',
        })),
      } as any,
    }));
    await app.ready();

    const res = await request(app.server).get('/api/presence/roblox/users?userIds=u1,u2');

    expect(res.status).toBe(200);
    expect(res.body.available).toBe(false);
    expect(res.body.reason).toBe('ROBLOX_NOT_CONNECTED');

    await app.close();
  });
});

describe('POST /api/roblox/presence', () => {
  function buildApp(serviceOverrides: Record<string, unknown> = {}) {
    const app = Fastify({ logger: false });
    (app as any).config = { NODE_ENV: 'test' };

    void app.register(errorHandlerPlugin);
    void app.register(buildPresenceRoutes({
      authPreHandler: async (req) => {
        (req as any).user = { userId: 'test-user' };
      },
      presenceService: {
        getPresenceForUsers: jest.fn(async () => ({ available: true, statuses: [] })),
        getPresenceByRobloxIds: jest.fn(async (_uid: string, ids: number[]) => ({
          userPresences: ids.map((id) => ({
            userId: id,
            userPresenceType: 2,
            lastLocation: 'Jailbreak',
            placeId: 606849621,
            universeId: 219943895,
            gameId: 'abc-def',
            lastOnline: '2024-01-01T00:00:00.000Z',
          })),
        })),
        ...serviceOverrides,
      } as any,
    }));

    return app;
  }

  it('returns 200 with userPresences for valid request', async () => {
    const app = buildApp();
    await app.ready();

    const res = await request(app.server)
      .post('/api/roblox/presence')
      .send({ userIds: [111, 222] });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.userPresences).toHaveLength(2);
    expect(res.body.data.userPresences[0]).toMatchObject({
      userId: 111,
      userPresenceType: 2,
      lastLocation: 'Jailbreak',
    });

    await app.close();
  });

  it('returns 400 when more than 50 userIds are sent', async () => {
    const app = buildApp();
    await app.ready();

    const ids = Array.from({ length: 51 }, (_, i) => i + 1);
    const res = await request(app.server)
      .post('/api/roblox/presence')
      .send({ userIds: ids });

    expect(res.status).toBe(400);

    await app.close();
  });

  it('returns 400 when userIds is missing', async () => {
    const app = buildApp();
    await app.ready();

    const res = await request(app.server)
      .post('/api/roblox/presence')
      .send({});

    expect(res.status).toBe(400);

    await app.close();
  });

  it('returns 400 when userIds contains non-integers', async () => {
    const app = buildApp();
    await app.ready();

    const res = await request(app.server)
      .post('/api/roblox/presence')
      .send({ userIds: [1.5, 2] });

    expect(res.status).toBe(400);

    await app.close();
  });

  it('forwards 429 ROBLOX_RATE_LIMIT from service', async () => {
    const app = buildApp({
      getPresenceByRobloxIds: jest.fn(async () => {
        throw new AppError('ROBLOX_RATE_LIMIT', 'Rate limit exceeded', 429, {
          severity: 'warning',
          metadata: { retryAfterSec: 15 },
        });
      }),
    });
    await app.ready();

    const res = await request(app.server)
      .post('/api/roblox/presence')
      .send({ userIds: [111] });

    expect(res.status).toBe(429);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('ROBLOX_RATE_LIMIT');

    await app.close();
  });
});
