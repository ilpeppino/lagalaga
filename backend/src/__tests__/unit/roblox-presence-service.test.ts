import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { RobloxPresenceService, FriendPresenceItem } from '../../services/roblox-presence.service.js';
import { TtlCache } from '../../lib/ttlCache.js';

function makeTokenService(token: string | null) {
  return {
    getAccessToken: jest.fn(async () =>
      token == null
        ? { unavailable: true as const, reason: 'ROBLOX_NOT_CONNECTED' }
        : { token }
    ),
  };
}

function makePresence(userId: number, overrides: Partial<FriendPresenceItem> = {}): Record<string, unknown> {
  return {
    userId,
    userPresenceType: 2,
    lastLocation: 'Jailbreak',
    placeId: 606849621,
    rootPlaceId: 606849621,
    universeId: 219943895,
    gameId: 'abc-def-123',
    lastOnline: '2024-01-01T12:00:00.000Z',
    ...overrides,
  };
}

function makeFetchFn(status: number, body: unknown, headers: Record<string, string> = {}) {
  return jest.fn(async () => ({
    status,
    headers: { get: (key: string) => headers[key] ?? null },
    json: async () => body,
  })) as unknown as typeof fetch;
}

describe('RobloxPresenceService.getPresenceByRobloxIds', () => {
  let cache: TtlCache<string, FriendPresenceItem[]>;

  beforeEach(() => {
    cache = new TtlCache<string, FriendPresenceItem[]>(30_000);
  });

  it('returns empty array when no Roblox connection', async () => {
    const svc = new RobloxPresenceService({
      connectionService: makeTokenService(null),
      friendPresenceCache: cache,
    });

    const result = await svc.getPresenceByRobloxIds('user-1', [123, 456]);
    expect(result.userPresences).toHaveLength(0);
  });

  it('returns empty array for empty id list without calling Roblox', async () => {
    const fetchFn = makeFetchFn(200, { userPresences: [] });
    const svc = new RobloxPresenceService({
      connectionService: makeTokenService('token-abc'),
      fetchFn,
      friendPresenceCache: cache,
    });

    const result = await svc.getPresenceByRobloxIds('user-1', []);
    expect(result.userPresences).toHaveLength(0);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('maps Roblox response to FriendPresenceItem correctly', async () => {
    const fetchFn = makeFetchFn(200, {
      userPresences: [makePresence(111), makePresence(222, { userPresenceType: 0, lastLocation: undefined })],
    });
    const svc = new RobloxPresenceService({
      connectionService: makeTokenService('token-abc'),
      fetchFn,
      friendPresenceCache: cache,
    });

    const { userPresences } = await svc.getPresenceByRobloxIds('user-1', [111, 222]);
    expect(userPresences).toHaveLength(2);

    const p1 = userPresences.find((p) => p.userId === 111)!;
    expect(p1.userPresenceType).toBe(2);
    expect(p1.lastLocation).toBe('Jailbreak');
    expect(p1.placeId).toBe(606849621);
    expect(p1.universeId).toBe(219943895);
    expect(p1.gameId).toBe('abc-def-123');
    expect(p1.lastOnline).toBe('2024-01-01T12:00:00.000Z');

    const p2 = userPresences.find((p) => p.userId === 222)!;
    expect(p2.userPresenceType).toBe(0);
    expect(p2.lastLocation).toBeNull();
  });

  it('caches result and does not call Roblox on second request for same ids', async () => {
    const fetchFn = makeFetchFn(200, { userPresences: [makePresence(111)] });
    const svc = new RobloxPresenceService({
      connectionService: makeTokenService('token-abc'),
      fetchFn,
      friendPresenceCache: cache,
    });

    await svc.getPresenceByRobloxIds('user-1', [111]);
    await svc.getPresenceByRobloxIds('user-1', [111]);

    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('cache miss after TTL — calls Roblox again', async () => {
    const shortCache = new TtlCache<string, FriendPresenceItem[]>(1); // 1 ms TTL
    const fetchFn = makeFetchFn(200, { userPresences: [makePresence(111)] });
    const svc = new RobloxPresenceService({
      connectionService: makeTokenService('token-abc'),
      fetchFn,
      friendPresenceCache: shortCache,
    });

    await svc.getPresenceByRobloxIds('user-1', [111]);
    await new Promise((r) => setTimeout(r, 5)); // let TTL expire
    await svc.getPresenceByRobloxIds('user-1', [111]);

    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('throws ROBLOX_RATE_LIMIT on 429 from Roblox', async () => {
    const fetchFn = makeFetchFn(429, {}, { 'Retry-After': '10' });
    const svc = new RobloxPresenceService({
      connectionService: makeTokenService('token-abc'),
      fetchFn,
      friendPresenceCache: cache,
    });

    await expect(svc.getPresenceByRobloxIds('user-1', [111])).rejects.toMatchObject({
      code: 'ROBLOX_RATE_LIMIT',
      statusCode: 429,
      metadata: { retryAfterSec: 10 },
    });
  });

  it('cache key is order-independent (sorted ids)', async () => {
    const fetchFn = makeFetchFn(200, { userPresences: [makePresence(111), makePresence(222)] });
    const svc = new RobloxPresenceService({
      connectionService: makeTokenService('token-abc'),
      fetchFn,
      friendPresenceCache: cache,
    });

    await svc.getPresenceByRobloxIds('user-1', [222, 111]);
    await svc.getPresenceByRobloxIds('user-1', [111, 222]); // same ids, different order → cache hit

    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

describe('TtlCache', () => {
  it('returns undefined for expired entries', async () => {
    const c = new TtlCache<string, number>(1);
    c.set('k', 42);
    await new Promise((r) => setTimeout(r, 5));
    expect(c.get('k')).toBeUndefined();
  });

  it('returns value before expiry', () => {
    const c = new TtlCache<string, number>(30_000);
    c.set('k', 99);
    expect(c.get('k')).toBe(99);
  });
});
