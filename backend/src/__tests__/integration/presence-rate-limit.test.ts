import Fastify from 'fastify';
import type { FastifyRequest } from 'fastify';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { buildPresenceRoutes } from '../../routes/presence.routes.js';
import { errorHandlerPlugin } from '../../plugins/errorHandler.js';
import { rateLimitPlugin } from '../../plugins/rate-limit.js';

describe('presence route rate limiting', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    app = Fastify({ logger: false, trustProxy: true });
    (app as any).config = {
      NODE_ENV: 'test',
      RATE_LIMIT_ENABLED: true,
      RATE_LIMIT_MAX: 600,
      RATE_LIMIT_TIME_WINDOW: '1 minute',
    };

    await app.register(rateLimitPlugin);
    await app.register(errorHandlerPlugin);
    await app.register(buildPresenceRoutes({
      authPreHandler: async (req) => {
        const userIdHeader = req.headers['x-user-id'];
        const userId = Array.isArray(userIdHeader) ? userIdHeader[0] : userIdHeader;
        (req as any).user = { userId: userId ?? 'user-default' };
      },
      presenceService: {
        getPresenceForUsers: jest.fn(async () => ({ available: true, statuses: [] })),
        getPresenceByRobloxIds: jest.fn(async (_requesterId: string, userIds: number[]) => ({
          userPresences: userIds.map((userId) => ({
            userId,
            userPresenceType: 0,
            lastLocation: null,
            placeId: null,
            universeId: null,
            gameId: null,
            lastOnline: null,
          })),
        })),
      } as any,
    }));

    app.get('/public-ping', {
      config: {
        rateLimit: {
          max: 2,
          timeWindow: '1 minute',
        },
      },
    }, async (req: FastifyRequest) => ({ ip: req.ip }));

    await app.ready();
  });

  function makeBearer(userId: string): string {
    const payload = Buffer.from(JSON.stringify({ userId }), 'utf8').toString('base64url');
    return `Bearer header.${payload}.sig`;
  }

  afterEach(async () => {
    await app.close();
  });

  it('rate limits /api/roblox/presence per authenticated user id, not shared IP', async () => {
    for (let i = 0; i < 120; i += 1) {
      const okRes = await request(app.server)
        .post('/api/roblox/presence')
        .set('x-user-id', 'user-A')
        .set('authorization', makeBearer('user-A'))
        .set('x-forwarded-for', '198.51.100.10')
        .send({ userIds: [123] });
      expect(okRes.status).toBe(200);
      expect(okRes.headers['x-ratelimit-keytype']).toBe('user');
    }

    const limited = await request(app.server)
      .post('/api/roblox/presence')
      .set('x-user-id', 'user-A')
      .set('authorization', makeBearer('user-A'))
      .set('x-forwarded-for', '198.51.100.10')
      .send({ userIds: [123] });

    expect(limited.status).toBe(429);
    expect(limited.headers['x-ratelimit-source']).toBe('backend');
    expect(limited.headers['x-ratelimit-keytype']).toBe('user');
    expect(limited.headers['x-ratelimit-limit']).toBe('120');

    const otherUser = await request(app.server)
      .post('/api/roblox/presence')
      .set('x-user-id', 'user-B')
      .set('authorization', makeBearer('user-B'))
      .set('x-forwarded-for', '198.51.100.10')
      .send({ userIds: [123] });

    expect(otherUser.status).toBe(200);
    expect(otherUser.headers['x-ratelimit-keytype']).toBe('user');
  });

  it('uses forwarded client IP for unauthenticated limiter keys', async () => {
    const first = await request(app.server)
      .get('/public-ping')
      .set('x-forwarded-for', '203.0.113.11');
    expect(first.status).toBe(200);
    expect(first.body.ip).toBe('203.0.113.11');
    expect(first.headers['x-ratelimit-keytype']).toBe('ip');

    const second = await request(app.server)
      .get('/public-ping')
      .set('x-forwarded-for', '203.0.113.11');
    expect(second.status).toBe(200);

    const third = await request(app.server)
      .get('/public-ping')
      .set('x-forwarded-for', '203.0.113.11');
    expect(third.status).toBe(429);
    expect(third.headers['x-ratelimit-source']).toBe('backend');
  });
});
