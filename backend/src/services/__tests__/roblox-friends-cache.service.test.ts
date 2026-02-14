import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { RobloxFriendsCacheService } from '../roblox-friends-cache.service.js';

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
  const upsertCache = jest.fn(async (payload: Record<string, unknown>) => {
    state.cacheRow = {
      user_id: String(payload.user_id),
      roblox_user_id: Number(payload.roblox_user_id),
      fetched_at: String(payload.fetched_at),
      expires_at: String(payload.expires_at),
      friends_json: payload.friends_json,
    };
    return { error: null };
  });

  const client = {
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
          upsert: upsertCache,
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
  };

  return { client, upsertCache };
}

describe('RobloxFriendsCacheService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('serves fresh cache without external calls', async () => {
    const now = Date.now();
    const { client } = createSupabaseMock({
      robloxUserId: '5072638985',
      appUsersRobloxUserId: null,
      cacheRow: {
        user_id: 'user-1',
        roblox_user_id: 5072638985,
        fetched_at: new Date(now - 60_000).toISOString(),
        expires_at: new Date(now + 60_000).toISOString(),
        friends_json: [
          { id: 1, name: 'alpha', displayName: 'Alpha', avatarUrl: 'https://cdn/a.png' },
        ],
      },
    });

    const fetchMock = jest.fn<typeof fetch>();
    const service = new RobloxFriendsCacheService({
      supabase: client as any,
      fetchFn: fetchMock,
    });

    const result = await service.getFriendsForUser('user-1');

    expect(result.source).toBe('cache');
    expect(result.friends).toHaveLength(1);
    expect(result.friends[0]?.id).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refreshes expired cache using Roblox bulk endpoints and updates cache', async () => {
    const now = Date.now();
    const { client, upsertCache } = createSupabaseMock({
      robloxUserId: '5072638985',
      appUsersRobloxUserId: null,
      cacheRow: {
        user_id: 'user-1',
        roblox_user_id: 5072638985,
        fetched_at: new Date(now - 30 * 60_000).toISOString(),
        expires_at: new Date(now - 1_000).toISOString(),
        friends_json: [],
      },
    });

    const fetchMock = jest
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        makeJsonResponse(200, {
          data: [
            { id: 101, name: 'basicOne', displayName: 'Basic One' },
            { id: 202, name: 'basicTwo', displayName: 'Basic Two' },
          ],
        })
      )
      .mockResolvedValueOnce(
        makeJsonResponse(200, {
          data: [
            { id: 101, name: 'userOne', displayName: 'User One' },
            { id: 202, name: 'userTwo', displayName: 'User Two' },
          ],
        })
      )
      .mockResolvedValueOnce(
        makeJsonResponse(200, {
          data: [
            { targetId: 101, imageUrl: 'https://cdn/101.png', state: 'Completed' },
            { targetId: 202, imageUrl: 'https://cdn/202.png', state: 'Completed' },
          ],
        })
      );

    const service = new RobloxFriendsCacheService({
      supabase: client as any,
      fetchFn: fetchMock,
    });

    const result = await service.getFriendsForUser('user-1');

    expect(result.source).toBe('refreshed');
    expect(result.friends).toEqual([
      { id: 101, name: 'userOne', displayName: 'User One', avatarUrl: 'https://cdn/101.png' },
      { id: 202, name: 'userTwo', displayName: 'User Two', avatarUrl: 'https://cdn/202.png' },
    ]);
    expect(upsertCache).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('serves stale cache on Roblox 429 responses', async () => {
    const now = Date.now();
    const { client } = createSupabaseMock({
      robloxUserId: '5072638985',
      appUsersRobloxUserId: null,
      cacheRow: {
        user_id: 'user-1',
        roblox_user_id: 5072638985,
        fetched_at: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
        expires_at: new Date(now - 24 * 60 * 60 * 1000).toISOString(),
        friends_json: [
          { id: 303, name: 'stale', displayName: 'Stale Friend', avatarUrl: null },
        ],
      },
    });

    const fetchMock = jest
      .fn<typeof fetch>()
      .mockResolvedValueOnce(makeJsonResponse(429, {}, { 'retry-after': '0' }));

    const service = new RobloxFriendsCacheService({
      supabase: client as any,
      fetchFn: fetchMock,
    });

    const result = await service.getFriendsForUser('user-1');

    expect(result.source).toBe('cache');
    expect(result.friends).toHaveLength(1);
    expect(result.friends[0]?.id).toBe(303);
  });
});
