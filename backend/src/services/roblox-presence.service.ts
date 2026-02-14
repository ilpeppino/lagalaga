import type { SupabaseClient } from '@supabase/supabase-js';
import { request } from 'undici';
import { getSupabase } from '../config/supabase.js';
import { AppError } from '../utils/errors.js';
import { RobloxConnectionService } from './roblox-connection.service.js';

export type PresenceStatus = 'offline' | 'online' | 'in_game' | 'in_studio' | 'unknown';

export interface RobloxPresenceResult {
  available: boolean;
  reason?: string;
  statuses?: Array<{
    userId: string;
    status: PresenceStatus;
    lastOnline?: string | null;
    placeId?: number | null;
  }>;
}

interface PresenceCacheEntry {
  expiresAt: number;
  statusesByRobloxId: Map<string, { status: PresenceStatus; lastOnline?: string | null; placeId?: number | null }>;
}

interface PresenceDeps {
  supabase?: SupabaseClient;
  connectionService?: Pick<RobloxConnectionService, 'getAccessToken'>;
  requestFn?: typeof request;
  cacheTtlMs?: number;
}

const defaultCacheTtlMs = 20_000;
const presenceCache = new Map<string, PresenceCacheEntry>();

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
  private readonly supabase: SupabaseClient;
  private readonly connectionService: Pick<RobloxConnectionService, 'getAccessToken'>;
  private readonly requestFn: typeof request;
  private readonly cacheTtlMs: number;

  constructor(deps: PresenceDeps = {}) {
    this.supabase = deps.supabase ?? getSupabase();
    if (!deps.connectionService) {
      throw new Error('RobloxPresenceService requires connectionService dependency');
    }
    this.connectionService = deps.connectionService;
    this.requestFn = deps.requestFn ?? request;
    this.cacheTtlMs = deps.cacheTtlMs ?? defaultCacheTtlMs;
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

    const statusesByRobloxId = robloxIds.length > 0
      ? await this.fetchPresenceStatuses(tokenResult.token, robloxIds)
      : new Map<string, { status: PresenceStatus; lastOnline?: string | null; placeId?: number | null }>();

    return {
      available: true,
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

  private async fetchPresenceStatuses(
    accessToken: string,
    robloxUserIds: string[]
  ): Promise<Map<string, { status: PresenceStatus; lastOnline?: string | null; placeId?: number | null }>> {
    const cacheKey = robloxUserIds.slice().sort().join(',');
    const cached = presenceCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.statusesByRobloxId;
    }

    const numericIds = robloxUserIds
      .map((id) => Number.parseInt(id, 10))
      .filter((id) => Number.isFinite(id) && id > 0);

    if (numericIds.length === 0) {
      return new Map();
    }

    const response = await this.requestFn('https://presence.roblox.com/v1/presence/users', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userIds: numericIds }),
    });

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new AppError('ROBLOX_UPSTREAM_FAILED', 'Failed to fetch Roblox presence', 502, {
        severity: 'warning',
        metadata: { statusCode: response.statusCode },
      });
    }

    const payload = await response.body.json() as {
      userPresences?: Array<{
        userId?: number;
        userPresenceType?: number;
        lastOnline?: string;
        placeId?: number;
        rootPlaceId?: number;
      }>;
    };

    const statusesByRobloxId = new Map<string, { status: PresenceStatus; lastOnline?: string | null; placeId?: number | null }>();

    (payload.userPresences || []).forEach((presence) => {
      const userId = presence.userId ? String(presence.userId) : null;
      if (!userId) return;

      statusesByRobloxId.set(userId, {
        status: normalizePresenceType(presence.userPresenceType),
        lastOnline: presence.lastOnline || null,
        placeId: presence.placeId ?? presence.rootPlaceId ?? null,
      });
    });

    presenceCache.set(cacheKey, {
      expiresAt: Date.now() + this.cacheTtlMs,
      statusesByRobloxId,
    });

    return statusesByRobloxId;
  }
}
