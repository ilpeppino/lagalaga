import Fastify from 'fastify';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { buildMeRoutes } from '../../routes/me.routes.js';
import { errorHandlerPlugin } from '../../plugins/errorHandler.js';
import { RobloxFavoritesService } from '../../services/roblox-favorites.service.js';

interface MockDbState {
  robloxUserId: string | null;
  appUsersRobloxUserId: string | null;
  gamesByPlaceId: Map<number, {
    game_name: string | null;
    thumbnail_url: string | null;
    canonical_web_url: string | null;
    canonical_start_url: string | null;
  }>;
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

      if (table === 'games') {
        let placeId = 0;
        return {
          select: jest.fn(() => ({
            eq: jest.fn((_: string, value: number) => {
              placeId = value;
              return {
                maybeSingle: async () => ({
                  data: state.gamesByPlaceId.get(placeId) ?? null,
                  error: null,
                }),
              };
            }),
          })),
          upsert: jest.fn(async (payload: { place_id: number; canonical_web_url: string; canonical_start_url: string }) => {
            const existing = state.gamesByPlaceId.get(payload.place_id);
            state.gamesByPlaceId.set(payload.place_id, {
              game_name: existing?.game_name ?? null,
              thumbnail_url: existing?.thumbnail_url ?? null,
              canonical_web_url: payload.canonical_web_url,
              canonical_start_url: payload.canonical_start_url,
            });
            return { error: null };
          }),
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

      throw new Error(`Unexpected table: ${table}`);
    }),
  };
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

describe('GET /api/me/roblox/favorites', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  async function buildTestApp(service: RobloxFavoritesService) {
    const app = Fastify({ logger: false });
    (app as any).config = { NODE_ENV: 'test' };

    await app.register(errorHandlerPlugin);
    await app.register(
      buildMeRoutes({
        favoritesService: service,
        friendsCacheService: { getFriendsForUser: jest.fn() } as any,
        authPreHandler: async (req) => {
          (req as any).user = { userId: 'user-1' };
        },
      }),
      { prefix: '/api/me' }
    );
    await app.ready();
    return app;
  }

  it('returns favorites for connected user', async () => {
    const fetchMock = jest
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        makeJsonResponse(200, {
          data: [{ universeId: 1001 }],
          nextPageCursor: null,
          previousPageCursor: null,
        })
      )
      .mockResolvedValueOnce(makeJsonResponse(200, { rootPlaceId: 2002 }));
    const enrichGame = jest.fn<any>().mockResolvedValue({
      placeId: 2002,
      universeId: 1001,
      name: 'My Favorite Game',
      thumbnailUrl: 'https://tr.rbxcdn.com/favorite.png',
    });

    const service = new RobloxFavoritesService({
      supabase: createSupabaseMock({
        robloxUserId: '123',
        appUsersRobloxUserId: null,
        gamesByPlaceId: new Map(),
      }) as any,
      fetchFn: fetchMock,
      enrichmentService: { enrichGame } as any,
    });

    const app = await buildTestApp(service);
    const res = await request(app.server).get('/api/me/roblox/favorites?limit=10');
    await app.close();

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.robloxUserId).toBe('123');
    expect(res.body.data.favorites[0]).toMatchObject({
      universeId: 1001,
      placeId: 2002,
      name: 'My Favorite Game',
      thumbnailUrl: 'https://tr.rbxcdn.com/favorite.png',
      canonicalWebUrl: 'https://www.roblox.com/games/2002',
      canonicalStartUrl: 'https://www.roblox.com/games/start?placeId=2002',
    });
  });

  it('returns 409 when user is not connected to Roblox', async () => {
    const service = new RobloxFavoritesService({
      supabase: createSupabaseMock({
        robloxUserId: null,
        appUsersRobloxUserId: null,
        gamesByPlaceId: new Map(),
      }) as any,
      fetchFn: jest.fn<typeof fetch>(),
      enrichmentService: { enrichGame: jest.fn() } as any,
    });

    const app = await buildTestApp(service);
    const res = await request(app.server).get('/api/me/roblox/favorites');
    await app.close();

    expect(res.status).toBe(409);
    expect(res.body.error?.code ?? res.body.code).toBe('ROBLOX_NOT_CONNECTED');
  });

  it('returns 502 when favorites upstream fails', async () => {
    const fetchMock = jest
      .fn<typeof fetch>()
      .mockResolvedValueOnce(makeJsonResponse(503, { errors: [] }));

    const service = new RobloxFavoritesService({
      supabase: createSupabaseMock({
        robloxUserId: '123',
        appUsersRobloxUserId: null,
        gamesByPlaceId: new Map(),
      }) as any,
      fetchFn: fetchMock,
      enrichmentService: { enrichGame: jest.fn() } as any,
    });

    const app = await buildTestApp(service);
    const res = await request(app.server).get('/api/me/roblox/favorites');
    await app.close();

    expect(res.status).toBe(502);
    expect(res.body.error?.code ?? res.body.code).toBe('ROBLOX_UPSTREAM_FAILED');
  });

  it('uses cached game and does not call enrichGame', async () => {
    const fetchMock = jest
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        makeJsonResponse(200, {
          data: [{ universeId: 1001 }],
          nextPageCursor: null,
          previousPageCursor: null,
        })
      )
      .mockResolvedValueOnce(makeJsonResponse(200, { rootPlaceId: 2002 }));

    const enrichGame = jest.fn();
    const service = new RobloxFavoritesService({
      supabase: createSupabaseMock({
        robloxUserId: '123',
        appUsersRobloxUserId: null,
        gamesByPlaceId: new Map([
          [2002, {
            game_name: 'Cached Favorite',
            thumbnail_url: 'https://tr.rbxcdn.com/cached.png',
            canonical_web_url: 'https://www.roblox.com/games/2002',
            canonical_start_url: 'https://www.roblox.com/games/start?placeId=2002',
          }],
        ]),
      }) as any,
      fetchFn: fetchMock,
      enrichmentService: { enrichGame } as any,
    });

    const app = await buildTestApp(service);
    const res = await request(app.server).get('/api/me/roblox/favorites');
    await app.close();

    expect(res.status).toBe(200);
    expect(res.body.data.favorites[0]).toMatchObject({
      name: 'Cached Favorite',
      thumbnailUrl: 'https://tr.rbxcdn.com/cached.png',
    });
    expect(enrichGame).not.toHaveBeenCalled();
  });

  it('falls back to app_users.roblox_user_id for connected users', async () => {
    const fetchMock = jest
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        makeJsonResponse(200, {
          data: [],
          nextPageCursor: null,
          previousPageCursor: null,
        })
      );

    const service = new RobloxFavoritesService({
      supabase: createSupabaseMock({
        robloxUserId: null,
        appUsersRobloxUserId: '999',
        gamesByPlaceId: new Map(),
      }) as any,
      fetchFn: fetchMock,
      enrichmentService: { enrichGame: jest.fn() } as any,
    });

    const app = await buildTestApp(service);
    const res = await request(app.server).get('/api/me/roblox/favorites');
    await app.close();

    expect(res.status).toBe(200);
    expect(res.body.data.robloxUserId).toBe('999');
  });
});
