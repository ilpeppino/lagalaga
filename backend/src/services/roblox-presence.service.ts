import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabase } from '../config/supabase.js';
import { AppError, ExternalServiceError } from '../utils/errors.js';
import { RobloxConnectionService } from './roblox-connection.service.js';
import { TtlCache } from '../lib/ttlCache.js';
import type { FetchLike } from '../lib/http.js';
import { fetchUpstream } from '../lib/http.js';
import { metrics } from '../plugins/metrics.js';

export type PresenceStatus = 'offline' | 'online' | 'in_game' | 'in_studio' | 'unknown';

export interface RobloxPresenceResult {
  available: boolean;
  reason?: string;
  warning?: {
    code: 'ROBLOX_RATE_LIMIT';
    retryAfterSec: number | null;
  };
  statuses?: Array<{
    userId: string;
    status: PresenceStatus;
    lastOnline?: string | null;
    placeId?: number | null;
  }>;
}

export interface FriendPresenceItem {
  userId: number;
  userPresenceType: 0 | 1 | 2 | 3;
  lastLocation: string | null;
  placeId: number | null;
  universeId: number | null;
  gameId: string | null;
  lastOnline: string | null;
}

interface PresenceDeps {
  supabase?: SupabaseClient;
  connectionService?: Pick<RobloxConnectionService, 'getAccessToken'>;
  fetchFn?: FetchLike;
  friendPresenceCache?: TtlCache<string, FriendPresenceItem[]>;
  friendPresenceCacheTtlMs?: number;
}

export const ROBLOX_PRESENCE_CACHE_TTL_MS = 30_000;
const PRESENCE_MAX_BATCH_SIZE = 50;

function normalizePresenceType(value: number | undefined): PresenceStatus {
  switch (value) {
    case 0:
      return 'offline';
    case 1:
      return 'online';
    case 2:
      return 'in_game';
    case 3:
      return 'in_studio';
    default:
      return 'unknown';
  }
}

export class RobloxPresenceService {
  private readonly _supabase?: SupabaseClient;
  private readonly connectionService: Pick<RobloxConnectionService, 'getAccessToken'>;
  private readonly fetchFn: FetchLike;
  private readonly friendPresenceCache: TtlCache<string, FriendPresenceItem[]>;

  private get supabase(): SupabaseClient {
    return this._supabase ?? getSupabase();
  }

  constructor(deps: PresenceDeps = {}) {
    this._supabase = deps.supabase;
    if (!deps.connectionService) {
      throw new Error('RobloxPresenceService requires connectionService dependency');
    }
    this.connectionService = deps.connectionService;
    this.fetchFn = deps.fetchFn ?? fetch;
    this.friendPresenceCache = deps.friendPresenceCache ??
      new TtlCache<string, FriendPresenceItem[]>(deps.friendPresenceCacheTtlMs ?? ROBLOX_PRESENCE_CACHE_TTL_MS);
  }

  async getPresenceForUsers(requesterUserId: string, appUserIds: string[]): Promise<RobloxPresenceResult> {
    const tokenResult = await this.connectionService.getAccessToken(requesterUserId);

    if ('unavailable' in tokenResult) {
      return {
        available: false,
        reason: tokenResult.reason,
      };
    }

    const mapping = await this.resolveRobloxUserIds(appUserIds);
    const robloxIds = Array.from(new Set(mapping.map((entry) => entry.robloxUserId).filter(Boolean))) as string[];
    const numericRobloxIds = robloxIds
      .map((id) => Number.parseInt(id, 10))
      .filter((id) => Number.isFinite(id) && id > 0);

    const statusesByRobloxId = new Map<string, { status: PresenceStatus; lastOnline?: string | null; placeId?: number | null }>();
    let warning: RobloxPresenceResult['warning'];
    if (numericRobloxIds.length > 0) {
      try {
        const userPresences = await this.fetchFriendPresence(
          tokenResult.token,
          numericRobloxIds,
          'app_users'
        );
        for (const presence of userPresences) {
          statusesByRobloxId.set(String(presence.userId), {
            status: normalizePresenceType(presence.userPresenceType),
            lastOnline: presence.lastOnline ?? null,
            placeId: presence.placeId ?? null,
          });
        }
      } catch (error) {
        if (error instanceof AppError && error.code === 'ROBLOX_RATE_LIMIT') {
          warning = {
            code: 'ROBLOX_RATE_LIMIT',
            retryAfterSec: typeof error.metadata.retryAfterSec === 'number'
              ? error.metadata.retryAfterSec
              : null,
          };
        } else {
          throw error;
        }
      }
    }

    return {
      available: true,
      ...(warning ? { warning } : {}),
      statuses: mapping.map(({ userId, robloxUserId }) => {
        if (!robloxUserId) {
          return { userId, status: 'unknown' as PresenceStatus };
        }

        const status = statusesByRobloxId.get(robloxUserId);
        return {
          userId,
          status: status?.status ?? 'unknown',
          lastOnline: status?.lastOnline ?? null,
          placeId: status?.placeId ?? null,
        };
      }),
    };
  }

  private async resolveRobloxUserIds(appUserIds: string[]): Promise<Array<{ userId: string; robloxUserId: string | null }>> {
    if (appUserIds.length === 0) return [];

    const { data: platformRows, error: platformError } = await this.supabase
      .from('user_platforms')
      .select('user_id, platform_user_id')
      .eq('platform_id', 'roblox')
      .in('user_id', appUserIds);

    if (platformError) {
      throw new AppError('ROBLOX_CONNECTION_READ_FAILED', `Failed to load linked Roblox users: ${platformError.message}`);
    }

    const byUserId = new Map<string, string>();
    (platformRows || []).forEach((row: any) => {
      if (row.user_id && row.platform_user_id) {
        byUserId.set(row.user_id, String(row.platform_user_id));
      }
    });

    const missing = appUserIds.filter((userId) => !byUserId.has(userId));
    if (missing.length > 0) {
      const { data: appRows, error: appError } = await this.supabase
        .from('app_users')
        .select('id, roblox_user_id')
        .in('id', missing);

      if (appError) {
        throw new AppError('ROBLOX_CONNECTION_READ_FAILED', `Failed to load fallback Roblox users: ${appError.message}`);
      }

      (appRows || []).forEach((row: any) => {
        if (row.id && row.roblox_user_id) {
          byUserId.set(row.id, String(row.roblox_user_id));
        }
      });
    }

    return appUserIds.map((userId) => ({ userId, robloxUserId: byUserId.get(userId) ?? null }));
  }

  private async fetchFriendPresence(
    accessToken: string,
    robloxUserIds: number[],
    source: 'app_users' | 'bulk'
  ): Promise<FriendPresenceItem[]> {
    const numericIds = Array.from(new Set(
      robloxUserIds
        .map((id) => Number.parseInt(String(id), 10))
        .filter((id) => Number.isFinite(id) && id > 0)
    ));
    if (numericIds.length === 0) {
      return [];
    }

    const cacheKey = numericIds.slice().sort((a, b) => a - b).join(',');
    const cached = this.friendPresenceCache.get(cacheKey);
    if (cached !== undefined) {
      metrics.incrementCounter('roblox_presence_cache_total', { result: 'hit', source });
      return cached;
    }
    metrics.incrementCounter('roblox_presence_cache_total', { result: 'miss', source });

    return this.friendPresenceCache.getOrCreate(cacheKey, async () => {
      const chunkedResults: FriendPresenceItem[] = [];

      for (const chunk of chunkArray(numericIds, PRESENCE_MAX_BATCH_SIZE)) {
        const result = await fetchUpstream(
          'https://presence.roblox.com/v1/presence/users',
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ userIds: chunk }),
          },
          {
            fetchFn: this.fetchFn,
            timeoutMs: 5000,
            retries: 1,
            source: 'Roblox Presence',
            upstream: 'roblox',
            endpoint: 'presence',
          }
        );

        if (result.kind === 'network_error') {
          throw result.error;
        }

        if (result.kind === 'rate_limited') {
          throw new AppError('ROBLOX_RATE_LIMIT', 'Roblox presence rate limit exceeded', 429, {
            severity: 'warning',
            metadata: {
              retryAfterSec: result.retryAfterSec,
              rateLimitSource: 'roblox',
            },
          });
        }

        if (result.kind === 'http_error') {
          throw new ExternalServiceError('Roblox Presence', `HTTP ${result.response.status}`);
        }

        const payload = await result.response.json() as {
          userPresences?: Array<{
            userId?: number;
            userPresenceType?: number;
            lastLocation?: string;
            placeId?: number;
            rootPlaceId?: number;
            universeId?: number;
            gameId?: string;
            lastOnline?: string;
          }>;
        };

        const rows: FriendPresenceItem[] = (payload.userPresences ?? [])
          .filter((p) => p.userId != null)
          .map((p) => ({
            userId: p.userId as number,
            userPresenceType: Math.min(Math.max(p.userPresenceType ?? 0, 0), 3) as 0 | 1 | 2 | 3,
            lastLocation: p.lastLocation ?? null,
            placeId: p.placeId ?? p.rootPlaceId ?? null,
            universeId: p.universeId ?? null,
            gameId: p.gameId ?? null,
            lastOnline: p.lastOnline ?? null,
          }));

        chunkedResults.push(...rows);
      }

      return chunkedResults;
    });
  }

  /**
   * Fetch rich presence data for a list of Roblox user IDs directly.
   * Used by POST /api/roblox/presence.
   * Returns empty array if requester has no Roblox connection.
   * Results cached for 30 s (configurable via friendPresenceCacheTtlMs).
   */
  async getPresenceByRobloxIds(
    requesterUserId: string,
    robloxUserIds: number[]
  ): Promise<{
    userPresences: FriendPresenceItem[];
    warning?: { code: 'ROBLOX_RATE_LIMIT'; retryAfterSec: number | null };
  }> {
    if (robloxUserIds.length === 0) {
      return { userPresences: [] };
    }

    const tokenResult = await this.connectionService.getAccessToken(requesterUserId);
    if ('unavailable' in tokenResult) {
      return { userPresences: [] };
    }

    try {
      const userPresences = await this.fetchFriendPresence(tokenResult.token, robloxUserIds, 'bulk');
      return { userPresences };
    } catch (error) {
      if (error instanceof AppError && error.code === 'ROBLOX_RATE_LIMIT') {
        const retryAfterSec = typeof error.metadata.retryAfterSec === 'number'
          ? error.metadata.retryAfterSec
          : null;

        return {
          userPresences: buildUnavailablePresence(robloxUserIds),
          warning: {
            code: 'ROBLOX_RATE_LIMIT',
            retryAfterSec,
          },
        };
      }
      throw error;
    }
  }
}

function buildUnavailablePresence(robloxUserIds: number[]): FriendPresenceItem[] {
  return Array.from(new Set(robloxUserIds))
    .filter((userId) => Number.isFinite(userId) && userId > 0)
    .map((userId) => ({
      userId,
      userPresenceType: 0,
      lastLocation: null,
      placeId: null,
      universeId: null,
      gameId: null,
      lastOnline: null,
    }));
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
