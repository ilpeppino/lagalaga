import { describe, expect, it } from '@jest/globals';
import type { FastifyRequest } from 'fastify';
import { resolveRateLimitIdentity } from '../../plugins/rate-limit.js';

function makeRequest(overrides: Partial<FastifyRequest>): FastifyRequest {
  return {
    ip: '203.0.113.10',
    headers: {},
    ...overrides,
  } as FastifyRequest;
}

describe('resolveRateLimitIdentity', () => {
  it('uses request.user.userId when available', () => {
    const request = makeRequest({
      user: { userId: 'user-123' } as any,
      ip: '198.51.100.8',
    });

    const result = resolveRateLimitIdentity(request);

    expect(result).toEqual({
      key: 'user:user-123',
      keyType: 'user',
    });
  });

  it('uses request.user.id when available', () => {
    const request = makeRequest({
      user: { id: 'user-xyz' } as any,
    });

    const result = resolveRateLimitIdentity(request);

    expect(result).toEqual({
      key: 'user:user-xyz',
      keyType: 'user',
    });
  });

  it('falls back to Bearer token payload id when request.user is missing', () => {
    const payload = Buffer.from(JSON.stringify({ userId: 'jwt-user-1' }), 'utf8').toString('base64url');
    const token = `header.${payload}.signature`;

    const request = makeRequest({
      headers: {
        authorization: `Bearer ${token}`,
      } as any,
    });

    const result = resolveRateLimitIdentity(request);

    expect(result).toEqual({
      key: 'user:jwt-user-1',
      keyType: 'user',
    });
  });

  it('uses ip key when unauthenticated', () => {
    const request = makeRequest({ ip: '203.0.113.77' });

    const result = resolveRateLimitIdentity(request);

    expect(result).toEqual({
      key: 'ip:203.0.113.77',
      keyType: 'ip',
    });
  });
});
