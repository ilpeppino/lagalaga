import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { metricsPlugin, metrics } from '../metrics.js';

describe('metricsPlugin', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    metrics.reset();
  });

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

  describe('error counter routing by status code', () => {
    async function buildAppWithRoute(
      config: { NODE_ENV: string; METRICS_BEARER_TOKEN: string },
      statusCode: number
    ) {
      app = Fastify();
      (app as any).config = config;
      await app.register(metricsPlugin);
      app.get('/test-error', async (_req, reply) => {
        return reply.code(statusCode).send({ error: 'test' });
      });
      await app.ready();
    }

    it('increments http_auth_failures_total for 401', async () => {
      await buildAppWithRoute({ NODE_ENV: 'development', METRICS_BEARER_TOKEN: '' }, 401);
      await app.inject({ method: 'GET', url: '/test-error' });

      const metricsRes = await app.inject({ method: 'GET', url: '/metrics/json' });
      const body = metricsRes.json();
      expect(body.http_auth_failures_total).toBeDefined();
      expect(body.http_authz_failures_total).toBeUndefined();
      expect(body.http_client_errors_total).toBeUndefined();
    });

    it('increments http_authz_failures_total for 403', async () => {
      await buildAppWithRoute({ NODE_ENV: 'development', METRICS_BEARER_TOKEN: '' }, 403);
      await app.inject({ method: 'GET', url: '/test-error' });

      const metricsRes = await app.inject({ method: 'GET', url: '/metrics/json' });
      const body = metricsRes.json();
      expect(body.http_authz_failures_total).toBeDefined();
      expect(body.http_auth_failures_total).toBeUndefined();
      expect(body.http_client_errors_total).toBeUndefined();
    });

    it('increments http_client_errors_total for 400', async () => {
      await buildAppWithRoute({ NODE_ENV: 'development', METRICS_BEARER_TOKEN: '' }, 400);
      await app.inject({ method: 'GET', url: '/test-error' });

      const metricsRes = await app.inject({ method: 'GET', url: '/metrics/json' });
      const body = metricsRes.json();
      expect(body.http_client_errors_total).toBeDefined();
      expect(body.http_auth_failures_total).toBeUndefined();
      expect(body.http_authz_failures_total).toBeUndefined();
    });
  });
});
