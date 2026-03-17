import type { SupabaseClient } from '@supabase/supabase-js';
import type { Pool } from 'pg';
import { getSupabase } from '../../config/supabase.js';
import { mapPgError } from '../errors.js';
import type { DbResult, DbError } from '../types.js';

export type AchievementCode = 'FIRST_HOST' | 'FIRST_JOIN';
export type StatType = 'sessions_hosted' | 'sessions_joined';

export interface UserStatsRow {
  user_id: string;
  sessions_hosted: number;
  sessions_joined: number;
  streak_days: number;
  last_active_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface AchievementRow {
  id: string;
  user_id: string;
  code: string;
  unlocked_at: string;
}

export interface AchievementRepository {
  ensureUserStatsRow(userId: string, updatedAtIso: string): Promise<DbResult<void>>;
  incrementUserStat(userId: string, statType: StatType, updatedAtIso: string): Promise<DbResult<void>>;
  findUserStatsSummary(userId: string): Promise<DbResult<{ sessions_hosted: number; sessions_joined: number } | null>>;
  insertUserAchievement(userId: string, code: AchievementCode, unlockedAtIso: string): Promise<DbResult<void>>;
  findUserStats(userId: string): Promise<DbResult<UserStatsRow | null>>;
  listUserAchievements(userId: string): Promise<DbResult<AchievementRow[]>>;
}

function toSupabaseError(error: { code?: string; message: string; details?: string }): DbError {
  return {
    code: error.code ?? 'SUPABASE_QUERY_ERROR',
    message: error.message,
    ...(error.details ? { details: error.details } : {}),
  };
}

export class SupabaseAchievementRepository implements AchievementRepository {
  constructor(private readonly supabase: SupabaseClient = getSupabase()) {}

  async ensureUserStatsRow(userId: string, updatedAtIso: string): Promise<DbResult<void>> {
    const { error } = await this.supabase
      .from('user_stats')
      .upsert(
        {
          user_id: userId,
          sessions_hosted: 0,
          sessions_joined: 0,
          streak_days: 0,
          updated_at: updatedAtIso,
        },
        { onConflict: 'user_id', ignoreDuplicates: true }
      );

    if (error) {
      return { data: null, error: toSupabaseError(error) };
    }

    return { data: undefined, error: null };
  }

  async incrementUserStat(userId: string, statType: StatType, _updatedAtIso: string): Promise<DbResult<void>> {
    const column = statType === 'sessions_hosted' ? 'sessions_hosted' : 'sessions_joined';
    const { error } = await this.supabase.rpc('increment_user_stat', {
      p_user_id: userId,
      p_column: column,
    });

    if (error) {
      return { data: null, error: toSupabaseError(error) };
    }

    return { data: undefined, error: null };
  }

  async findUserStatsSummary(userId: string): Promise<DbResult<{ sessions_hosted: number; sessions_joined: number } | null>> {
    const { data, error } = await this.supabase
      .from('user_stats')
      .select('sessions_hosted, sessions_joined')
      .eq('user_id', userId)
      .maybeSingle<{ sessions_hosted: number; sessions_joined: number }>();

    if (error) {
      return { data: null, error: toSupabaseError(error) };
    }

    return { data: data ?? null, error: null };
  }

  async insertUserAchievement(userId: string, code: AchievementCode, unlockedAtIso: string): Promise<DbResult<void>> {
    const { error } = await this.supabase
      .from('user_achievements')
      .insert({
        user_id: userId,
        code,
        unlocked_at: unlockedAtIso,
      })
      .select()
      .maybeSingle();

    if (error) {
      return { data: null, error: toSupabaseError(error) };
    }

    return { data: undefined, error: null };
  }

  async findUserStats(userId: string): Promise<DbResult<UserStatsRow | null>> {
    const { data, error } = await this.supabase
      .from('user_stats')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle<UserStatsRow>();

    if (error) {
      return { data: null, error: toSupabaseError(error) };
    }

    return { data: data ?? null, error: null };
  }

  async listUserAchievements(userId: string): Promise<DbResult<AchievementRow[]>> {
    const { data, error } = await this.supabase
      .from('user_achievements')
      .select('*')
      .eq('user_id', userId)
      .order('unlocked_at', { ascending: false });

    if (error) {
      return { data: null, error: toSupabaseError(error) };
    }

    return { data: (data ?? []) as AchievementRow[], error: null };
  }
}

export class PgAchievementRepository implements AchievementRepository {
  constructor(private readonly pool: Pool) {}

  async ensureUserStatsRow(userId: string, updatedAtIso: string): Promise<DbResult<void>> {
    try {
      await this.pool.query(
        `INSERT INTO user_stats (user_id, sessions_hosted, sessions_joined, streak_days, updated_at)
         VALUES ($1, 0, 0, 0, $2)
         ON CONFLICT (user_id) DO NOTHING`,
        [userId, updatedAtIso]
      );
      return { data: undefined, error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }

  async incrementUserStat(userId: string, statType: StatType, updatedAtIso: string): Promise<DbResult<void>> {
    try {
      if (statType === 'sessions_hosted') {
        await this.pool.query(
          `UPDATE user_stats
           SET sessions_hosted = sessions_hosted + 1,
               updated_at = $2
           WHERE user_id = $1`,
          [userId, updatedAtIso]
        );
      } else {
        await this.pool.query(
          `UPDATE user_stats
           SET sessions_joined = sessions_joined + 1,
               updated_at = $2
           WHERE user_id = $1`,
          [userId, updatedAtIso]
        );
      }
      return { data: undefined, error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }

  async findUserStatsSummary(userId: string): Promise<DbResult<{ sessions_hosted: number; sessions_joined: number } | null>> {
    try {
      const result = await this.pool.query<{ sessions_hosted: number; sessions_joined: number }>(
        `SELECT sessions_hosted, sessions_joined
         FROM user_stats
         WHERE user_id = $1
         LIMIT 1`,
        [userId]
      );
      return { data: result.rows[0] ?? null, error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }

  async insertUserAchievement(userId: string, code: AchievementCode, unlockedAtIso: string): Promise<DbResult<void>> {
    try {
      await this.pool.query(
        `INSERT INTO user_achievements (user_id, code, unlocked_at)
         VALUES ($1, $2, $3)`,
        [userId, code, unlockedAtIso]
      );
      return { data: undefined, error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }

  async findUserStats(userId: string): Promise<DbResult<UserStatsRow | null>> {
    try {
      const result = await this.pool.query<UserStatsRow>(
        `SELECT
          user_id::text,
          sessions_hosted,
          sessions_joined,
          streak_days,
          last_active_date::text,
          created_at::text,
          updated_at::text
         FROM user_stats
         WHERE user_id = $1
         LIMIT 1`,
        [userId]
      );
      return { data: result.rows[0] ?? null, error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }

  async listUserAchievements(userId: string): Promise<DbResult<AchievementRow[]>> {
    try {
      const result = await this.pool.query<AchievementRow>(
        `SELECT id::text, user_id::text, code::text, unlocked_at::text
         FROM user_achievements
         WHERE user_id = $1
         ORDER BY unlocked_at DESC`,
        [userId]
      );
      return { data: result.rows, error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }
}
