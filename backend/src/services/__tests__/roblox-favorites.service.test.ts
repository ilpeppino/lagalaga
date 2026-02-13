import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { RobloxFavoritesService } from '../roblox-favorites.service.js';

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

describe('RobloxFavoritesService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('throws ROBLOX_NOT_CONNECTED when user has no linked roblox account', async () => {
    const supabase = createSupabaseMock({
      robloxUserId: null,
      appUsersRobloxUserId: null,
      gamesByPlaceId: new Map(),
    });

    const service = new RobloxFavoritesService({
      supabase: supabase as any,
      fetchFn: jest.fn<typeof fetch>(),
      enrichmentService: { enrichGame: jest.fn() } as any,
    });

    await expect(service.getFavoritesForUser('user-1')).rejects.toMatchObject({
      code: 'ROBLOX_NOT_CONNECTED',
      statusCode: 409,
    });
  });

  it('throws ROBLOX_UPSTREAM_FAILED when favorites endpoint fails', async () => {
    const fetchMock = jest
      .fn<typeof fetch>()
      .mockResolvedValueOnce(makeJsonResponse(500, { errors: [] }));

    const service = new RobloxFavoritesService({
      supabase: createSupabaseMock({
        robloxUserId: '123',
        appUsersRobloxUserId: null,
        gamesByPlaceId: new Map(),
      }) as any,
      fetchFn: fetchMock,
      enrichmentService: { enrichGame: jest.fn() } as any,
    });

    await expect(service.getFavoritesForUser('user-1')).rejects.toMatchObject({
      code: 'ROBLOX_UPSTREAM_FAILED',
      statusCode: 502,
    });
  });

  it('returns partial favorite when universe->place lookup fails', async () => {
    const fetchMock = jest
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        makeJsonResponse(200, {
          data: [{ universeId: 999 }],
          nextPageCursor: null,
          previousPageCursor: null,
        })
      )
      .mockResolvedValueOnce(makeJsonResponse(503, { message: 'unavailable' }));

    const service = new RobloxFavoritesService({
      supabase: createSupabaseMock({
        robloxUserId: '123',
        appUsersRobloxUserId: null,
        gamesByPlaceId: new Map(),
      }) as any,
      fetchFn: fetchMock,
      enrichmentService: { enrichGame: jest.fn() } as any,
    });

    const result = await service.getFavoritesForUser('user-1');
    expect(result.favorites).toEqual([
      {
        universeId: 999,
        placeId: null,
        name: null,
        thumbnailUrl: null,
        canonicalWebUrl: null,
        canonicalStartUrl: null,
      },
    ]);
  });

  it('uses favorites endpoint game name when place resolution fails', async () => {
    const fetchMock = jest
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        makeJsonResponse(200, {
          data: [{ universeId: 999, name: 'Natural Disaster Survival' }],
          nextPageCursor: null,
          previousPageCursor: null,
        })
      )
      .mockResolvedValueOnce(makeJsonResponse(503, { message: 'unavailable' }));

    const service = new RobloxFavoritesService({
      supabase: createSupabaseMock({
        robloxUserId: '123',
        appUsersRobloxUserId: null,
        gamesByPlaceId: new Map(),
      }) as any,
      fetchFn: fetchMock,
      enrichmentService: { enrichGame: jest.fn() } as any,
    });

    const result = await service.getFavoritesForUser('user-1');
    expect(result.favorites[0]?.name).toBe('Natural Disaster Survival');
  });

  it('uses cached game data and skips enrichment', async () => {
    const enrichGame = jest.fn();
    const fetchMock = jest
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        makeJsonResponse(200, {
          data: [{ universeId: 42 }],
          nextPageCursor: null,
          previousPageCursor: null,
        })
      )
      .mockResolvedValueOnce(makeJsonResponse(200, { rootPlaceId: 606849621 }));

    const service = new RobloxFavoritesService({
      supabase: createSupabaseMock({
        robloxUserId: '123',
        appUsersRobloxUserId: null,
        gamesByPlaceId: new Map([
          [606849621, {
            game_name: 'Jailbreak',
            thumbnail_url: 'https://tr.rbxcdn.com/cached.png',
            canonical_web_url: 'https://www.roblox.com/games/606849621',
            canonical_start_url: 'https://www.roblox.com/games/start?placeId=606849621',
          }],
        ]),
      }) as any,
      fetchFn: fetchMock,
      enrichmentService: { enrichGame } as any,
    });

    const result = await service.getFavoritesForUser('user-1');

    expect(result.favorites[0]).toMatchObject({
      universeId: 42,
      placeId: 606849621,
      name: 'Jailbreak',
      thumbnailUrl: 'https://tr.rbxcdn.com/cached.png',
    });
    expect(enrichGame).not.toHaveBeenCalled();
  });

  it('falls back to app_users.roblox_user_id when user_platforms has no row', async () => {
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
        appUsersRobloxUserId: '456789',
        gamesByPlaceId: new Map(),
      }) as any,
      fetchFn: fetchMock,
      enrichmentService: { enrichGame: jest.fn() } as any,
    });

    const result = await service.getFavoritesForUser('user-1');
    expect(result.robloxUserId).toBe('456789');
  });
});
