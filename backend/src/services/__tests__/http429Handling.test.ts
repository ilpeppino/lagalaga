import { describe, expect, it, jest } from '@jest/globals';
import { fetchUpstream, parseRetryAfterSec } from '../../lib/http.js';

describe('parseRetryAfterSec', () => {
  it('parses delta-seconds Retry-After values', () => {
    expect(parseRetryAfterSec('15')).toBe(15);
    expect(parseRetryAfterSec('0')).toBe(0);
  });

  it('parses http-date Retry-After values', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-02-25T00:00:00.000Z'));

    try {
      expect(parseRetryAfterSec('Wed, 25 Feb 2026 00:00:10 GMT')).toBe(10);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('fetchUpstream', () => {
  it('returns rate_limited result for 429 with Retry-After', async () => {
    const fetchFn = jest.fn(async () => ({
      ok: false,
      status: 429,
      headers: new Headers({ 'Retry-After': '12' }),
      json: async () => ({}),
    })) as any;

    const result = await fetchUpstream('https://presence.roblox.com/v1/presence/users', {
      method: 'POST',
    }, {
      fetchFn,
      timeoutMs: 5000,
      retries: 1,
      source: 'Roblox Presence',
      upstream: 'roblox',
      endpoint: 'presence',
      requestId: 'req-429',
    });

    expect(result.kind).toBe('rate_limited');
    if (result.kind === 'rate_limited') {
      expect(result.retryAfterSec).toBe(12);
      expect(result.response.status).toBe(429);
    }
  });

  it('retries once for retryable network errors and then succeeds', async () => {
    const firstError = new Error('connect ETIMEDOUT');
    (firstError as Error & { code?: string }).code = 'ETIMEDOUT';

    const fetchFn = jest.fn<any>()
      .mockRejectedValueOnce(firstError)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ ok: true }),
      });

    const result = await fetchUpstream('https://friends.roblox.com/v1/users/1/friends', {
      method: 'GET',
    }, {
      fetchFn,
      timeoutMs: 5000,
      retries: 1,
      source: 'Roblox API',
      upstream: 'roblox',
      endpoint: 'friends',
      requestId: 'req-retry',
    });

    expect(result.kind).toBe('ok');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});
