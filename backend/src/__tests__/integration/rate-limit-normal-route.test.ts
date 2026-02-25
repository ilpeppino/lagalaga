import Fastify from 'fastify';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import type { FastifyRequest } from 'fastify';
import { rateLimitPlugin } from '../../plugins/rate-limit.js';
import { errorHandlerPlugin } from '../../plugins/errorHandler.js';

describe('normal routes remain rate-limited', () => {
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

    app.get('/api/test-limited', {
      config: {
        rateLimit: {
          max: 3,
          timeWindow: '1 minute',
        },
      },
      preHandler: async (req: FastifyRequest) => {
        const userIdHeader = req.headers['x-user-id'];
        const userId = Array.isArray(userIdHeader) ? userIdHeader[0] : userIdHeader;
        (req as any).user = { id: userId ?? 'user-default' };
      },
    }, async () => ({ ok: true }));

    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  function makeBearer(userId: string): string {
    const payload = Buffer.from(JSON.stringify({ id: userId }), 'utf8').toString('base64url');
    return `Bearer h.${payload}.s`;
  }

  it('returns 429 after route limit is exceeded and includes backend rate-limit headers', async () => {
    for (let i = 0; i < 3; i += 1) {
      const res = await request(app.server)
        .get('/api/test-limited')
        .set('authorization', makeBearer('user-a'))
        .set('x-user-id', 'user-a')
        .set('x-forwarded-for', '198.51.100.10');

      expect(res.status).toBe(200);
      expect(res.headers['x-ratelimit-excluded']).toBe('false');
      expect(res.headers['x-ratelimit-keytype']).toBe('user');
    }

    const limited = await request(app.server)
      .get('/api/test-limited')
      .set('authorization', makeBearer('user-a'))
      .set('x-user-id', 'user-a')
      .set('x-forwarded-for', '198.51.100.10');

    expect(limited.status).toBe(429);
    expect(limited.headers['x-ratelimit-source']).toBe('backend');
    expect(limited.headers['x-ratelimit-excluded']).toBe('false');
    expect(limited.headers['x-ratelimit-keytype']).toBe('user');
  });
});
