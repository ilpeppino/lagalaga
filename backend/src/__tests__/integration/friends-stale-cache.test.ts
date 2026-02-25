import Fastify from 'fastify';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { buildMeRoutes } from '../../routes/me.routes.js';
import { errorHandlerPlugin } from '../../plugins/errorHandler.js';
import { RobloxFriendsCacheService } from '../../services/roblox-friends-cache.service.js';

interface MockCacheRow {
  user_id: string;
  roblox_user_id: number;
  fetched_at: string;
  expires_at: string;
  friends_json: unknown;
}

interface MockDbState {
  robloxUserId: string | null;
  appUsersRobloxUserId: string | null;
  cacheRow: MockCacheRow | null;
}

function makeJsonResponse(status: number, body: unknown, headers?: Record<string, string>): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers ?? {}),
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

function createSupabaseMock(state: MockDbState) {
  return {
    from: jest.fn((table: string) => {
      if (table === 'user_platforms') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              eq: jest.fn(() => ({
                maybeSingle: async () => ({
                  data: state.robloxUserId ? { platform_user_id: state.robloxUserId } : null,
                  error: null,
                }),
              })),
            })),
          })),
        };
      }

      if (table === 'app_users') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              maybeSingle: async () => ({
                data: state.appUsersRobloxUserId ? { roblox_user_id: state.appUsersRobloxUserId } : null,
                error: null,
              }),
            })),
          })),
        };
      }

      if (table === 'roblox_friends_cache') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              maybeSingle: async () => ({
                data: state.cacheRow,
                error: null,
              }),
            })),
          })),
          upsert: jest.fn(async (payload: Record<string, unknown>) => {
            state.cacheRow = {
              user_id: String(payload.user_id),
              roblox_user_id: Number(payload.roblox_user_id),
              fetched_at: String(payload.fetched_at),
              expires_at: String(payload.expires_at),
              friends_json: payload.friends_json,
            };
            return { error: null };
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
  };
}

describe('GET /api/me/roblox/friends stale-cache behavior', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  async function buildTestApp(service: RobloxFriendsCacheService) {
    app = Fastify({ logger: false });
    (app as any).config = { NODE_ENV: 'test' };

    await app.register(errorHandlerPlugin);
    await app.register(
      buildMeRoutes({
        favoritesService: {
          getFavoritesForUser: jest.fn(),
        } as any,
        friendsCacheService: service,
        authPreHandler: async (req) => {
          (req as any).user = { userId: 'user-1' };
        },
      }),
      { prefix: '/api/me' }
    );
    await app.ready();
  }

  it('returns stale_cache + warning and sets X-RateLimit-Source when Roblox returns 429', async () => {
    const now = Date.now();
    const fetchMock = jest
      .fn<typeof fetch>()
      .mockResolvedValueOnce(makeJsonResponse(429, {}, { 'retry-after': '7' }));

    const service = new RobloxFriendsCacheService({
      supabase: createSupabaseMock({
        robloxUserId: '5072638985',
        appUsersRobloxUserId: null,
        cacheRow: {
          user_id: 'user-1',
          roblox_user_id: 5072638985,
          fetched_at: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
          expires_at: new Date(now - 24 * 60 * 60 * 1000).toISOString(),
          friends_json: [
            { id: 42, name: 'stale', displayName: 'Stale Friend', avatarUrl: null },
          ],
        },
      }) as any,
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    await buildTestApp(service);

    const res = await request(app.server).get('/api/me/roblox/friends');

    expect(res.status).toBe(200);
    expect(res.headers['x-ratelimit-source']).toBe('roblox');
    expect(res.headers['retry-after']).toBe('7');
    expect(res.body.data.source).toBe('stale_cache');
    expect(res.body.data.warning).toEqual({
      code: 'ROBLOX_RATE_LIMIT',
      retryAfterSec: 7,
    });
    expect(res.body.data.friends).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns 503 with warning payload when Roblox 429 occurs and no cache exists', async () => {
    const fetchMock = jest
      .fn<typeof fetch>()
      .mockResolvedValueOnce(makeJsonResponse(429, {}, { 'retry-after': '11' }));

    const service = new RobloxFriendsCacheService({
      supabase: createSupabaseMock({
        robloxUserId: '5072638985',
        appUsersRobloxUserId: null,
        cacheRow: null,
      }) as any,
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    await buildTestApp(service);

    const res = await request(app.server).get('/api/me/roblox/friends');

    expect(res.status).toBe(503);
    expect(res.headers['x-ratelimit-source']).toBe('roblox');
    expect(res.headers['retry-after']).toBe('11');
    expect(res.body.error.code).toBe('ROBLOX_RATE_LIMIT');
    expect(res.body.error.details.warning).toEqual({
      code: 'ROBLOX_RATE_LIMIT',
      retryAfterSec: 11,
    });
  });
});
