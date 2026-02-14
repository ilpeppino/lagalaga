import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabase } from '../config/supabase.js';
import { fetchWithTimeoutAndRetry } from '../lib/http.js';
import { logger } from '../lib/logger.js';
import { AppError, ErrorCodes } from '../utils/errors.js';

const ROBLOX_PLATFORM_ID = 'roblox';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const ROBLOX_BATCH_SIZE = 50;

interface ServiceDeps {
  supabase?: SupabaseClient;
  fetchFn?: typeof fetch;
}

interface CacheRow {
  user_id: string;
  roblox_user_id: number;
  fetched_at: string;
  expires_at: string;
  friends_json: unknown;
}

interface RobloxFriendBasic {
  id: number;
  name: string;
  displayName: string;
}

interface RobloxUserDetail {
  id: number;
  name: string;
  displayName: string;
}

export interface RobloxFriend {
  id: number;
  name: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface RobloxFriendsResult {
  robloxUserId: string;
  source: 'cache' | 'refreshed';
  fetchedAt: string;
  expiresAt: string;
  friends: RobloxFriend[];
}

export class RobloxFriendsCacheService {
  private readonly supabase: SupabaseClient;
  private readonly fetchFn: typeof fetch;

  constructor(deps: ServiceDeps = {}) {
    this.supabase = deps.supabase ?? getSupabase();
    this.fetchFn = deps.fetchFn ?? fetch;
  }

  async getFriendsForUser(userId: string, options: { forceRefresh?: boolean } = {}): Promise<RobloxFriendsResult> {
    const forceRefresh = options.forceRefresh ?? false;
    const robloxUserId = await this.getRobloxUserId(userId);
    const cache = await this.getCacheRow(userId);

    if (!forceRefresh && cache && new Date(cache.expires_at).getTime() > Date.now()) {
      return this.toResult(robloxUserId, 'cache', cache.fetched_at, cache.expires_at, cache.friends_json);
    }

    try {
      const refreshedFriends = await this.fetchRobloxFriends(robloxUserId);
      const fetchedAt = new Date();
      const expiresAt = new Date(fetchedAt.getTime() + CACHE_TTL_MS);

      await this.upsertCache(userId, robloxUserId, refreshedFriends, fetchedAt, expiresAt);

      return {
        robloxUserId,
        source: 'refreshed',
        fetchedAt: fetchedAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        friends: refreshedFriends,
      };
    } catch (error) {
      if (cache && error instanceof AppError && error.statusCode === 429) {
        const retryAfterMs = Number(error.metadata?.retryAfterMs ?? 1000);
        await sleep(Math.min(Math.max(retryAfterMs, 250), 5000));
        return this.toResult(robloxUserId, 'cache', cache.fetched_at, cache.expires_at, cache.friends_json);
      }
      throw error;
    }
  }

  private async getRobloxUserId(userId: string): Promise<string> {
    const { data, error } = await this.supabase
      .from('user_platforms')
      .select('platform_user_id')
      .eq('user_id', userId)
      .eq('platform_id', ROBLOX_PLATFORM_ID)
      .maybeSingle<{ platform_user_id: string | null }>();

    if (error) {
      throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to load Roblox link: ${error.message}`, 500);
    }

    const platformRobloxUserId = data?.platform_user_id?.trim();
    if (platformRobloxUserId) {
      return platformRobloxUserId;
    }

    const { data: appUserData, error: appUserError } = await this.supabase
      .from('app_users')
      .select('roblox_user_id')
      .eq('id', userId)
      .maybeSingle<{ roblox_user_id: string | null }>();

    if (appUserError) {
      throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to load Roblox link: ${appUserError.message}`, 500);
    }

    const appUserRobloxUserId = appUserData?.roblox_user_id?.trim();
    if (appUserRobloxUserId) {
      return appUserRobloxUserId;
    }

    throw new AppError('ROBLOX_NOT_CONNECTED', 'Roblox account is not connected', 409, {
      severity: 'warning',
    });
  }

  private async getCacheRow(userId: string): Promise<CacheRow | null> {
    const { data, error } = await this.supabase
      .from('roblox_friends_cache')
      .select('user_id,roblox_user_id,fetched_at,expires_at,friends_json')
      .eq('user_id', userId)
      .maybeSingle<CacheRow>();

    if (error) {
      throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to load friends cache: ${error.message}`, 500);
    }

    return data ?? null;
  }

  private async upsertCache(
    userId: string,
    robloxUserId: string,
    friends: RobloxFriend[],
    fetchedAt: Date,
    expiresAt: Date
  ): Promise<void> {
    const numericRobloxId = Number.parseInt(robloxUserId, 10);
    const { error } = await this.supabase
      .from('roblox_friends_cache')
      .upsert({
        user_id: userId,
        roblox_user_id: Number.isFinite(numericRobloxId) ? numericRobloxId : 0,
        fetched_at: fetchedAt.toISOString(),
        expires_at: expiresAt.toISOString(),
        friends_json: friends,
        updated_at: new Date().toISOString(),
      });

    if (error) {
      throw new AppError(ErrorCodes.INTERNAL_DB_ERROR, `Failed to update friends cache: ${error.message}`, 500);
    }
  }

  private toResult(
    robloxUserId: string,
    source: 'cache' | 'refreshed',
    fetchedAt: string,
    expiresAt: string,
    friendsJson: unknown
  ): RobloxFriendsResult {
    const friends = parseFriendsJson(friendsJson);
    return {
      robloxUserId,
      source,
      fetchedAt,
      expiresAt,
      friends,
    };
  }

  private async fetchRobloxFriends(robloxUserId: string): Promise<RobloxFriend[]> {
    const basicFriends = await this.fetchFriendsList(robloxUserId);
    const friendIds = dedupePositiveNumbers(basicFriends.map((friend) => friend.id));

    if (friendIds.length === 0) {
      return [];
    }

    const [detailMap, avatarMap] = await Promise.all([
      this.fetchUserDetails(friendIds),
      this.fetchAvatarHeadshots(friendIds),
    ]);

    return basicFriends.map((basic) => {
      const details = detailMap.get(basic.id);
      const name = details?.name ?? basic.name;
      const displayName = details?.displayName ?? basic.displayName ?? name;

      return {
        id: basic.id,
        name,
        displayName,
        avatarUrl: avatarMap.get(basic.id) ?? null,
      };
    });
  }

  private async fetchFriendsList(robloxUserId: string): Promise<RobloxFriendBasic[]> {
    const url = `https://friends.roblox.com/v1/users/${encodeURIComponent(robloxUserId)}/friends`;
    const response = await this.robloxRequest(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'lagalaga-backend/1.0',
      },
    });

    const body = await response.json() as { data?: Array<{ id?: number; name?: string; displayName?: string }> };
    const rows = Array.isArray(body.data) ? body.data : [];

    return rows
      .map((item) => ({
        id: Number(item.id),
        name: typeof item.name === 'string' && item.name.trim().length > 0
          ? item.name
          : `user_${item.id}`,
        displayName: typeof item.displayName === 'string' && item.displayName.trim().length > 0
          ? item.displayName
          : (typeof item.name === 'string' && item.name.trim().length > 0 ? item.name : `user_${item.id}`),
      }))
      .filter((item) => Number.isInteger(item.id) && item.id > 0);
  }

  private async fetchUserDetails(userIds: number[]): Promise<Map<number, RobloxUserDetail>> {
    const map = new Map<number, RobloxUserDetail>();

    for (const chunk of chunkArray(userIds, ROBLOX_BATCH_SIZE)) {
      const response = await this.robloxRequest('https://users.roblox.com/v1/users', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'lagalaga-backend/1.0',
        },
        body: JSON.stringify({ userIds: chunk }),
      });

      const body = await response.json() as { data?: Array<{ id?: number; name?: string; displayName?: string }> };
      const rows = Array.isArray(body.data) ? body.data : [];
      for (const row of rows) {
        const id = Number(row.id);
        if (!Number.isInteger(id) || id <= 0) {
          continue;
        }
        const name = typeof row.name === 'string' && row.name.trim().length > 0 ? row.name : `user_${id}`;
        const displayName =
          typeof row.displayName === 'string' && row.displayName.trim().length > 0
            ? row.displayName
            : name;

        map.set(id, { id, name, displayName });
      }
    }

    return map;
  }

  private async fetchAvatarHeadshots(userIds: number[]): Promise<Map<number, string>> {
    const map = new Map<number, string>();

    for (const chunk of chunkArray(userIds, ROBLOX_BATCH_SIZE)) {
      const query = new URLSearchParams({
        userIds: chunk.join(','),
        size: '150x150',
        format: 'Png',
        isCircular: 'false',
      });

      const response = await this.robloxRequest(
        `https://thumbnails.roblox.com/v1/users/avatar-headshot?${query.toString()}`,
        {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'User-Agent': 'lagalaga-backend/1.0',
          },
        }
      );

      const body = await response.json() as {
        data?: Array<{ targetId?: number; imageUrl?: string | null; state?: string }>;
      };
      const rows = Array.isArray(body.data) ? body.data : [];

      for (const row of rows) {
        const id = Number(row.targetId);
        if (!Number.isInteger(id) || id <= 0) {
          continue;
        }
        const imageUrl = typeof row.imageUrl === 'string' && row.imageUrl.trim().length > 0
          ? row.imageUrl
          : null;
        if (imageUrl) {
          map.set(id, imageUrl);
        }
      }
    }

    return map;
  }

  private async robloxRequest(url: string, init: RequestInit): Promise<Response> {
    let response: Response;

    try {
      response = await fetchWithTimeoutAndRetry(
        url,
        init,
        {
          fetchFn: this.fetchFn,
          timeoutMs: 5000,
          retries: 1,
          source: 'Roblox API',
        }
      );
    } catch (error) {
      throw new AppError('ROBLOX_UPSTREAM_FAILED', 'Failed to communicate with Roblox', 502, {
        severity: 'warning',
        metadata: {
          reason: error instanceof Error ? error.message : String(error),
        },
      });
    }

    if (response.status === 429) {
      const retryAfterRaw = response.headers.get('retry-after');
      const retryAfterMs = retryAfterRaw ? Number.parseInt(retryAfterRaw, 10) * 1000 : 1000;
      throw new AppError('ROBLOX_RATE_LIMITED', 'Roblox API rate limit reached', 429, {
        severity: 'warning',
        metadata: {
          retryAfterMs: Number.isFinite(retryAfterMs) ? retryAfterMs : 1000,
        },
      });
    }

    if (!response.ok) {
      logger.warn({ url, statusCode: response.status }, 'Roblox API request failed');
      throw new AppError('ROBLOX_UPSTREAM_FAILED', 'Roblox API request failed', 502, {
        severity: 'warning',
        metadata: {
          statusCode: response.status,
        },
      });
    }

    return response;
  }
}

function chunkArray<T>(values: T[], chunkSize: number): T[][] {
  if (values.length === 0) {
    return [];
  }

  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }
  return chunks;
}

function dedupePositiveNumbers(values: number[]): number[] {
  return [...new Set(values.filter((value) => Number.isInteger(value) && value > 0))];
}

function parseFriendsJson(value: unknown): RobloxFriend[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const row = item as {
        id?: unknown;
        name?: unknown;
        displayName?: unknown;
        avatarUrl?: unknown;
      };

      const id = Number(row.id);
      if (!Number.isInteger(id) || id <= 0) {
        return null;
      }

      const name = typeof row.name === 'string' && row.name.trim().length > 0
        ? row.name
        : `user_${id}`;
      const displayName = typeof row.displayName === 'string' && row.displayName.trim().length > 0
        ? row.displayName
        : name;
      const avatarUrl = typeof row.avatarUrl === 'string' && row.avatarUrl.trim().length > 0
        ? row.avatarUrl
        : null;

      return { id, name, displayName, avatarUrl };
    })
    .filter((row): row is RobloxFriend => row !== null);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
