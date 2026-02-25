import Fastify from 'fastify';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { rateLimitPlugin } from '../../plugins/rate-limit.js';
import { healthCheckPlugin } from '../../plugins/healthCheck.js';

describe('health checks are excluded from rate limiting', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    app = Fastify({ logger: false, trustProxy: true });
    (app as any).config = {
      NODE_ENV: 'test',
      RATE_LIMIT_ENABLED: true,
      RATE_LIMIT_MAX: 1,
      RATE_LIMIT_TIME_WINDOW: '1 minute',
    };

    await app.register(rateLimitPlugin);
    await app.register(healthCheckPlugin);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('never returns 429 for /healthz under burst traffic', async () => {
    for (let i = 0; i < 200; i += 1) {
      const res = await request(app.server)
        .get('/healthz')
        .set('x-forwarded-for', `203.0.113.${(i % 20) + 1}`);

      expect(res.status).toBe(200);
      expect(res.headers['x-ratelimit-excluded']).toBe('true');
      expect(res.body.ok).toBe(true);
    }
  });
});
