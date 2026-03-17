import type { SupabaseClient } from '@supabase/supabase-js';
import type { Pool } from 'pg';
import { getSupabase } from '../../config/supabase.js';
import { mapPgError } from '../errors.js';
import type { DbResult } from '../types.js';

export interface LeaderboardRow {
  rank: number;
  user_id: string;
  rating: number;
  wins: number;
  losses: number;
  display_name: string | null;
}

export interface LeaderboardRepository {
  getWeekly(limit?: number): Promise<DbResult<LeaderboardRow[]>>;
}

export class SupabaseLeaderboardRepository implements LeaderboardRepository {
  constructor(private readonly supabase: SupabaseClient = getSupabase()) {}

  async getWeekly(limit = 10): Promise<DbResult<LeaderboardRow[]>> {
    const { data, error } = await this.supabase.rpc('get_weekly_leaderboard', {
      p_limit: limit,
    });

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

    return { data: (data ?? []) as LeaderboardRow[], error: null };
  }
}

export class PgLeaderboardRepository implements LeaderboardRepository {
  constructor(private readonly pool: Pool) {}

  async getWeekly(limit = 10): Promise<DbResult<LeaderboardRow[]>> {
    try {
      const { rows } = await this.pool.query<LeaderboardRow>(
        `WITH bounds AS (
          SELECT
            (date_trunc('week', NOW() AT TIME ZONE 'Europe/Amsterdam') AT TIME ZONE 'Europe/Amsterdam') AS week_start
        ),
        ranked AS (
          SELECT
            ur.user_id::text AS user_id,
            ur.rating,
            ur.wins,
            ur.losses,
            COALESCE(NULLIF(au.roblox_display_name, ''), NULLIF(au.roblox_username, '')) AS display_name
          FROM user_rankings ur
          LEFT JOIN app_users au ON au.id = ur.user_id
          CROSS JOIN bounds b
          WHERE ur.last_ranked_match_at IS NOT NULL
            AND ur.last_ranked_match_at >= b.week_start
        )
        SELECT
          ROW_NUMBER() OVER (ORDER BY rating DESC, user_id)::INT AS rank,
          user_id,
          rating,
          wins,
          losses,
          display_name
        FROM ranked
        ORDER BY rating DESC, user_id
        LIMIT LEAST(GREATEST(COALESCE($1, 10), 1), 100)`,
        [limit]
      );

      return { data: rows, error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }
}
