import { describe, expect, it } from '@jest/globals';
import type { FastifyRequest } from 'fastify';
import { isHealthCheckRequest, resolveRateLimitIdentity } from '../../plugins/rate-limit.js';

function makeRequest(overrides: Partial<FastifyRequest>): FastifyRequest {
  return {
    method: 'GET',
    url: '/any',
    raw: { url: '/any' } as FastifyRequest['raw'],
    ip: '203.0.113.10',
    headers: {},
    ...overrides,
  } as FastifyRequest;
}

describe('rate-limit utils', () => {
  it('health exclusion predicate returns true for health endpoints', () => {
    const paths = ['/health', '/healthz', '/live', '/ready', '/health/detailed'];

    for (const path of paths) {
      const req = makeRequest({ method: 'GET', url: path, raw: { url: path } as FastifyRequest['raw'] });
      expect(isHealthCheckRequest(req)).toBe(true);
    }
  });

  it('health exclusion predicate returns false for non-health endpoints', () => {
    const req = makeRequest({ method: 'GET', url: '/api/me', raw: { url: '/api/me' } as FastifyRequest['raw'] });
    expect(isHealthCheckRequest(req)).toBe(false);
  });

  it('key generator uses user id when request.user.id is present', () => {
    const req = makeRequest({
      user: { id: 'user-42' } as any,
      ip: '198.51.100.9',
    });

    expect(resolveRateLimitIdentity(req)).toEqual({
      key: 'user:user-42',
      keyType: 'user',
    });
  });
});
