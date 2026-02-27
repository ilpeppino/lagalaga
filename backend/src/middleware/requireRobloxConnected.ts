import type { FastifyReply, FastifyRequest } from 'fastify';
import { getSupabase } from '../config/supabase.js';
import { metrics } from '../plugins/metrics.js';
import { AppError, ErrorCodes } from '../utils/errors.js';

interface RobloxPlatformRow {
  platform_user_id: string;
  platform_username: string | null;
}

export interface RobloxConnectionContext {
  robloxUserId: string;
  robloxUsername: string | null;
}

export async function getRobloxConnectionForUser(userId: string): Promise<RobloxConnectionContext | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('user_platforms')
    .select('platform_user_id, platform_username')
    .eq('user_id', userId)
    .eq('platform_id', 'roblox')
    .maybeSingle<RobloxPlatformRow>();

  if (error && error.code !== 'PGRST116') {
    throw new AppError(
      ErrorCodes.INTERNAL_DB_ERROR,
      `Failed to load Roblox platform connection: ${error.message}`,
      500
    );
  }

  if (!data?.platform_user_id?.trim()) {
    return null;
  }

  return {
    robloxUserId: data.platform_user_id.trim(),
    robloxUsername: data.platform_username,
  };
}

export async function requireRobloxConnected(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const connection = await getRobloxConnectionForUser(request.user.userId);

  if (!connection) {
    metrics.incrementCounter('auth_roblox_gate_total', { status: 'blocked' });
    request.log.warn(
      {
        userId: request.user.userId,
        route: request.routeOptions?.url ?? request.url,
      },
      'Blocked Roblox-required endpoint for user without Roblox connection'
    );

    throw new AppError('ROBLOX_NOT_CONNECTED', 'Connect Roblox to continue', 409, {
      severity: 'warning',
      metadata: { action: 'connect_roblox' },
    });
  }

  request.robloxConnection = connection;
  metrics.incrementCounter('auth_roblox_gate_total', { status: 'allowed' });
}

declare module 'fastify' {
  interface FastifyRequest {
    robloxConnection?: RobloxConnectionContext;
  }
}
