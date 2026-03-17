import type { SupabaseClient } from '@supabase/supabase-js';
import type { Pool } from 'pg';
import { getSupabase } from '../../config/supabase.js';
import { mapPgError } from '../errors.js';
import type { DbResult } from '../types.js';

export interface PushTokenRow {
  expo_push_token: string;
  platform: string | null;
}

export interface PushTokenRepository {
  listByUserId(userId: string): Promise<DbResult<PushTokenRow[]>>;
}

export class SupabasePushTokenRepository implements PushTokenRepository {
  constructor(private readonly supabase: SupabaseClient = getSupabase()) {}

  async listByUserId(userId: string): Promise<DbResult<PushTokenRow[]>> {
    const { data, error } = await this.supabase
      .from('user_push_tokens')
      .select('expo_push_token, platform')
      .eq('user_id', userId);

    if (error) {
      return {
        data: null,
        error: {
          code: error.code ?? 'SUPABASE_QUERY_ERROR',
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
      };
    }

    return { data: (data ?? []) as PushTokenRow[], error: null };
  }
}

export class PgPushTokenRepository implements PushTokenRepository {
  constructor(private readonly pool: Pool) {}

  async listByUserId(userId: string): Promise<DbResult<PushTokenRow[]>> {
    try {
      const result = await this.pool.query<PushTokenRow>(
        'SELECT expo_push_token, platform FROM user_push_tokens WHERE user_id = $1',
        [userId]
      );
      return { data: result.rows, error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }
}
