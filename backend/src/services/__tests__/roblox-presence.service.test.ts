import { describe, it, expect, jest } from '@jest/globals';
import { RobloxPresenceService } from '../roblox-presence.service.js';

function createSupabaseMock() {
  return {
    from: jest.fn((table: string) => {
      if (table === 'user_platforms') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              in: jest.fn(async () => ({
                data: [{ user_id: 'user-1', platform_user_id: '101' }],
                error: null,
              })),
            })),
          })),
        };
      }

      if (table === 'app_users') {
        return {
          select: jest.fn(() => ({
            in: jest.fn(async () => ({ data: [], error: null })),
          })),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
  };
}

describe('RobloxPresenceService', () => {
  it('returns ROBLOX_NOT_CONNECTED when requester has no token', async () => {
    const service = new RobloxPresenceService({
      supabase: createSupabaseMock() as any,
      connectionService: {
        getAccessToken: jest.fn(async () => ({ unavailable: true, reason: 'ROBLOX_NOT_CONNECTED' })),
      } as any,
    });

    const result = await service.getPresenceForUsers('viewer-1', ['user-1']);
    expect(result).toEqual({
      available: false,
      reason: 'ROBLOX_NOT_CONNECTED',
    });
  });

  it('returns token-expired unavailable response when token refresh failed upstream', async () => {
    const service = new RobloxPresenceService({
      supabase: createSupabaseMock() as any,
      connectionService: {
        getAccessToken: jest.fn(async () => ({ unavailable: true, reason: 'ROBLOX_TOKEN_EXPIRED' })),
      } as any,
    });

    const result = await service.getPresenceForUsers('viewer-1', ['user-1']);
    expect(result.available).toBe(false);
    expect(result.reason).toBe('ROBLOX_TOKEN_EXPIRED');
  });

  it('throws ROBLOX_UPSTREAM_FAILED when upstream presence request fails', async () => {
    const fetchFn = jest.fn(async () => ({
      ok: false,
      status: 503,
      headers: new Headers(),
      json: async () => ({}),
    }));

    const service = new RobloxPresenceService({
      supabase: createSupabaseMock() as any,
      connectionService: {
        getAccessToken: jest.fn(async () => ({ token: 'token-123' })),
      } as any,
      fetchFn: fetchFn as any,
    });

    await expect(service.getPresenceForUsers('viewer-1', ['user-1'])).rejects.toMatchObject({
      code: 'INT_003',
      statusCode: 502,
    });
  });

  it('returns mapped statuses on success', async () => {
    const fetchFn = jest.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        userPresences: [
          {
            userId: 101,
            userPresenceType: 2,
            placeId: 606849621,
            lastOnline: '2026-02-14T00:00:00.000Z',
          },
        ],
      }),
    }));

    const service = new RobloxPresenceService({
      supabase: createSupabaseMock() as any,
      connectionService: {
        getAccessToken: jest.fn(async () => ({ token: 'token-123' })),
      } as any,
      fetchFn: fetchFn as any,
    });

    const result = await service.getPresenceForUsers('viewer-1', ['user-1']);

    expect(result.available).toBe(true);
    expect(result.statuses).toEqual([
      {
        userId: 'user-1',
        status: 'in_game',
        placeId: 606849621,
        lastOnline: '2026-02-14T00:00:00.000Z',
      },
    ]);
  });
});
