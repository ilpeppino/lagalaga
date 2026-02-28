import { beforeEach, describe, expect, it } from '@jest/globals';
import { PlatformIdentityService } from '../platform-identity.service.js';

interface PlatformRow {
  user_id: string;
  platform_id: 'google' | 'roblox';
  platform_user_id: string;
  platform_username: string | null;
  platform_display_name: string | null;
  platform_avatar_url: string | null;
}

function createSupabaseMock() {
  const appUsers = new Map<string, Record<string, unknown>>();
  const userPlatforms = new Map<string, PlatformRow>();

  function platformKey(platformId: string, platformUserId: string): string {
    return `${platformId}:${platformUserId}`;
  }

  function userPlatformKey(userId: string, platformId: string): string {
    return `${userId}:${platformId}`;
  }

  return {
    state: { appUsers, userPlatforms },
    rpc: async () => ({ data: null, error: { code: 'PGRST202', message: 'fn missing' } }),
    from: (table: string) => {
      if (table === 'user_platforms') {
        return {
          select: () => {
            const filters: Record<string, string> = {};
            return {
              eq: (column: string, value: string) => {
                filters[column] = value;
                return {
                  eq: (column2: string, value2: string) => {
                    filters[column2] = value2;
                    return {
                      maybeSingle: async () => {
                        if (filters.user_id && filters.platform_id) {
                          const row = Array.from(userPlatforms.values()).find((r) =>
                            r.user_id === filters.user_id && r.platform_id === filters.platform_id
                          );
                          return { data: row ?? null, error: row ? null : { code: 'PGRST116' } };
                        }
                        if (filters.platform_id && filters.platform_user_id) {
                          const row = userPlatforms.get(platformKey(filters.platform_id, filters.platform_user_id));
                          return { data: row ? { user_id: row.user_id } : null, error: row ? null : { code: 'PGRST116' } };
                        }
                        return { data: null, error: { code: 'PGRST116' } };
                      },
                    };
                  },
                  maybeSingle: async () => {
                    const row = Array.from(userPlatforms.values()).find((r) =>
                      r.user_id === filters.user_id && r.platform_id === filters.platform_id
                    );
                    return { data: row ?? null, error: row ? null : { code: 'PGRST116' } };
                  },
                };
              },
            };
          },
          upsert: async (payload: any) => {
            const conflictExisting = userPlatforms.get(platformKey(payload.platform_id, payload.platform_user_id));
            if (conflictExisting && conflictExisting.user_id !== payload.user_id) {
              return { error: { code: '23505', message: 'duplicate key' } };
            }

            const row: PlatformRow = {
              user_id: payload.user_id,
              platform_id: payload.platform_id,
              platform_user_id: payload.platform_user_id,
              platform_username: payload.platform_username ?? null,
              platform_display_name: payload.platform_display_name ?? null,
              platform_avatar_url: payload.platform_avatar_url ?? null,
            };
            userPlatforms.set(platformKey(row.platform_id, row.platform_user_id), row);
            userPlatforms.set(userPlatformKey(row.user_id, row.platform_id), row);
            return { error: null };
          },
          update: (payload: any) => ({
            eq: (column: string, value: string) => ({
              eq: async (column2: string, value2: string) => {
                const row = Array.from(userPlatforms.values()).find((r) =>
                  r.user_id === (column === 'user_id' ? value : value2) &&
                  r.platform_id === (column2 === 'platform_id' ? value2 : value)
                );
                if (!row) return { error: null };
                row.platform_username = payload.platform_username ?? row.platform_username;
                row.platform_display_name = payload.platform_display_name ?? row.platform_display_name;
                row.platform_avatar_url = payload.platform_avatar_url ?? row.platform_avatar_url;
                return { error: null };
              },
            }),
          }),
          delete: () => ({
            eq: (column: string, value: string) => ({
              eq: async (_column2: string, value2: string) => {
                for (const [key, row] of userPlatforms.entries()) {
                  if ((column === 'user_id' ? row.user_id === value : true) &&
                    row.platform_id === value2 &&
                    key.includes(':')) {
                    userPlatforms.delete(key);
                  }
                }
                return { error: null };
              },
            }),
          }),
        };
      }

      if (table === 'app_users') {
        return {
          update: (payload: any) => ({
            eq: async (_column: string, userId: string) => {
              const current = appUsers.get(userId) ?? {};
              appUsers.set(userId, { ...current, ...payload });
              return { error: null };
            },
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };
}

describe('PlatformIdentityService', () => {
  let supabase: ReturnType<typeof createSupabaseMock>;
  let service: PlatformIdentityService;

  beforeEach(() => {
    supabase = createSupabaseMock();
    service = new PlatformIdentityService({ supabase: supabase as any });
    supabase.state.appUsers.set('user-google', { id: 'user-google' });
    supabase.state.appUsers.set('user-a', { id: 'user-a' });
    supabase.state.appUsers.set('user-b', { id: 'user-b' });
  });

  it('links google-first user to roblox and keeps same app user id', async () => {
    await service.linkPlatformToUser({
      userId: 'user-google',
      platformId: 'google',
      platformUserId: 'google-sub-1',
      platformUsername: 'g@example.com',
    });

    await service.linkPlatformToUser({
      userId: 'user-google',
      platformId: 'roblox',
      platformUserId: 'roblox-777',
      platformUsername: 'Roblox777',
    });

    const linkedRobloxUser = await service.findUserIdByPlatform('roblox', 'roblox-777');
    expect(linkedRobloxUser).toBe('user-google');
  });

  it('returns CONFLICT_ACCOUNT_PROVIDER when roblox identity is already linked to another user', async () => {
    await service.linkPlatformToUser({
      userId: 'user-a',
      platformId: 'roblox',
      platformUserId: 'roblox-111',
      platformUsername: 'UserA',
    });

    await expect(
      service.linkPlatformToUser({
        userId: 'user-b',
        platformId: 'roblox',
        platformUserId: 'roblox-111',
        platformUsername: 'UserB',
      })
    ).rejects.toMatchObject({ code: 'CONFLICT_ACCOUNT_PROVIDER', statusCode: 409 });
  });

  it('returns CONFLICT_ACCOUNT_PROVIDER when google identity is already linked to another user', async () => {
    await service.linkPlatformToUser({
      userId: 'user-a',
      platformId: 'google',
      platformUserId: 'google-sub-a',
      platformUsername: 'a@example.com',
    });

    await expect(
      service.linkPlatformToUser({
        userId: 'user-b',
        platformId: 'google',
        platformUserId: 'google-sub-a',
        platformUsername: 'b@example.com',
      })
    ).rejects.toMatchObject({ code: 'CONFLICT_ACCOUNT_PROVIDER', statusCode: 409 });
  });

  it('allows only one concurrent link for same identity under race', async () => {
    const [first, second] = await Promise.allSettled([
      service.linkPlatformToUser({
        userId: 'user-a',
        platformId: 'roblox',
        platformUserId: 'roblox-race',
        platformUsername: 'UserA',
      }),
      service.linkPlatformToUser({
        userId: 'user-b',
        platformId: 'roblox',
        platformUserId: 'roblox-race',
        platformUsername: 'UserB',
      }),
    ]);

    const statuses = [first.status, second.status];
    expect(statuses.filter((s) => s === 'fulfilled')).toHaveLength(1);
    expect(statuses.filter((s) => s === 'rejected')).toHaveLength(1);
  });
});
