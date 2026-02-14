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

function makeJsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
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

describe('GET /api/me/roblox/friends', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  async function buildTestApp(service: RobloxFriendsCacheService) {
    const app = Fastify({ logger: false });
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
    return app;
  }

  it('returns 409 when roblox is not connected', async () => {
    const service = new RobloxFriendsCacheService({
      supabase: createSupabaseMock({
        robloxUserId: null,
        appUsersRobloxUserId: null,
        cacheRow: null,
      }) as any,
      fetchFn: jest.fn<typeof fetch>(),
    });

    const app = await buildTestApp(service);
    const res = await request(app.server).get('/api/me/roblox/friends');
    await app.close();

    expect(res.status).toBe(409);
    expect(res.body.error?.code ?? res.body.code).toBe('ROBLOX_NOT_CONNECTED');
  });

  it('returns cached friends with source=cache', async () => {
    const now = Date.now();
    const service = new RobloxFriendsCacheService({
      supabase: createSupabaseMock({
        robloxUserId: '5072638985',
        appUsersRobloxUserId: null,
        cacheRow: {
          user_id: 'user-1',
          roblox_user_id: 5072638985,
          fetched_at: new Date(now - 60_000).toISOString(),
          expires_at: new Date(now + 60_000).toISOString(),
          friends_json: [
            { id: 1, name: 'cached', displayName: 'Cached Friend', avatarUrl: 'https://cdn/cached.png' },
          ],
        },
      }) as any,
      fetchFn: jest.fn<typeof fetch>(),
    });

    const app = await buildTestApp(service);
    const res = await request(app.server).get('/api/me/roblox/friends');
    await app.close();

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.source).toBe('cache');
    expect(res.body.data.friends).toHaveLength(1);
  });

  it('refreshes expired cache with source=refreshed', async () => {
    const now = Date.now();
    const fetchMock = jest
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        makeJsonResponse(200, {
          data: [{ id: 11, name: 'basic', displayName: 'Basic' }],
        })
      )
      .mockResolvedValueOnce(
        makeJsonResponse(200, {
          data: [{ id: 11, name: 'refreshed-name', displayName: 'Refreshed Name' }],
        })
      )
      .mockResolvedValueOnce(
        makeJsonResponse(200, {
          data: [{ targetId: 11, imageUrl: 'https://cdn/11.png', state: 'Completed' }],
        })
      );

    const service = new RobloxFriendsCacheService({
      supabase: createSupabaseMock({
        robloxUserId: '5072638985',
        appUsersRobloxUserId: null,
        cacheRow: {
          user_id: 'user-1',
          roblox_user_id: 5072638985,
          fetched_at: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
          expires_at: new Date(now - 24 * 60 * 60 * 1000).toISOString(),
          friends_json: [],
        },
      }) as any,
      fetchFn: fetchMock,
    });

    const app = await buildTestApp(service);
    const res = await request(app.server).get('/api/me/roblox/friends');
    await app.close();

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.source).toBe('refreshed');
    expect(res.body.data.friends[0]).toMatchObject({
      id: 11,
      name: 'refreshed-name',
      displayName: 'Refreshed Name',
      avatarUrl: 'https://cdn/11.png',
    });
  });
});
