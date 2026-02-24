import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from '@jest/globals';
import { metricsPlugin } from '../metrics.js';

describe('metricsPlugin', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  async function buildApp(config: { NODE_ENV: string; METRICS_BEARER_TOKEN: string }) {
    app = Fastify();
    (app as any).config = config;
    await app.register(metricsPlugin);
    await app.ready();
  }

  it('returns 404 in production when token is not configured', async () => {
    await buildApp({ NODE_ENV: 'production', METRICS_BEARER_TOKEN: '' });

    const response = await app.inject({
      method: 'GET',
      url: '/metrics',
    });

    expect(response.statusCode).toBe(404);
  });

  it('returns 401 in production when token is missing', async () => {
    await buildApp({ NODE_ENV: 'production', METRICS_BEARER_TOKEN: 'secret-token' });

    const response = await app.inject({
      method: 'GET',
      url: '/metrics',
    });

    expect(response.statusCode).toBe(401);
  });

  it('returns 401 in production when token is invalid', async () => {
    await buildApp({ NODE_ENV: 'production', METRICS_BEARER_TOKEN: 'secret-token' });

    const response = await app.inject({
      method: 'GET',
      url: '/metrics/json',
      headers: {
        authorization: 'Bearer wrong-token',
      },
    });

    expect(response.statusCode).toBe(401);
  });

  it('returns metrics in production with valid token', async () => {
    await buildApp({ NODE_ENV: 'production', METRICS_BEARER_TOKEN: 'secret-token' });

    const response = await app.inject({
      method: 'GET',
      url: '/metrics',
      headers: {
        authorization: 'Bearer secret-token',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain');
  });

  it('returns metrics in development without token', async () => {
    await buildApp({ NODE_ENV: 'development', METRICS_BEARER_TOKEN: '' });

    const response = await app.inject({
      method: 'GET',
      url: '/metrics/json',
    });

    expect(response.statusCode).toBe(200);
  });
});
