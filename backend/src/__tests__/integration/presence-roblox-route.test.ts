import Fastify from 'fastify';
import request from 'supertest';
import { describe, expect, it, jest } from '@jest/globals';
import { buildPresenceRoutes } from '../../routes/presence.routes.js';
import { errorHandlerPlugin } from '../../plugins/errorHandler.js';

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
