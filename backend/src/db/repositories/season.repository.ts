import type { SupabaseClient } from '@supabase/supabase-js';
import type { Pool } from 'pg';
import { getSupabase } from '../../config/supabase.js';
import { mapPgError } from '../errors.js';
import type { DbError, DbResult } from '../types.js';

export interface SeasonRow {
  id: string;
  season_number: number;
  start_date: string;
  end_date: string;
  is_active: boolean;
  created_at: string;
}

export interface SeasonRolloverResult {
  rolled_over: boolean;
  previous_season_number: number | null;
  new_active_season_number: number | null;
  snapshot_rows: number;
}

export interface SeasonRepository {
  getActiveSeason(): Promise<DbResult<SeasonRow | null>>;
  snapshotRankings(seasonId: string): Promise<DbResult<number>>;
  resetRatings(): Promise<DbResult<number>>;
  runSeasonRollover(nowIso: string): Promise<DbResult<SeasonRolloverResult>>;
}

function toSupabaseError(error: { code?: string; message: string; details?: string }): DbError {
  return {
    code: error.code ?? 'SUPABASE_QUERY_ERROR',
    message: error.message,
    ...(error.details ? { details: error.details } : {}),
  };
}

export class SupabaseSeasonRepository implements SeasonRepository {
  constructor(private readonly supabase: SupabaseClient = getSupabase()) {}

  async getActiveSeason(): Promise<DbResult<SeasonRow | null>> {
    const { data, error } = await this.supabase
      .from('seasons')
      .select('id, season_number, start_date, end_date, is_active, created_at')
      .eq('is_active', true)
      .maybeSingle<SeasonRow>();

    if (error) {
      return { data: null, error: toSupabaseError(error) };
    }

    return { data: data ?? null, error: null };
  }

  async snapshotRankings(seasonId: string): Promise<DbResult<number>> {
    const { data, error } = await this.supabase.rpc('snapshot_rankings_for_season', {
      p_season_id: seasonId,
    });

    if (error) {
      return { data: null, error: toSupabaseError(error) };
    }

    return { data: Number(data ?? 0), error: null };
  }

  async resetRatings(): Promise<DbResult<number>> {
    const { data, error } = await this.supabase.rpc('reset_all_rankings_for_new_season');

    if (error) {
      return { data: null, error: toSupabaseError(error) };
    }

    return { data: Number(data ?? 0), error: null };
  }

  async runSeasonRollover(nowIso: string): Promise<DbResult<SeasonRolloverResult>> {
    const { data, error } = await this.supabase.rpc('run_competitive_season_rollover', {
      p_now: nowIso,
    });

    if (error) {
      return { data: null, error: toSupabaseError(error) };
    }

    return {
      data: (data ?? {
        rolled_over: false,
        previous_season_number: null,
        new_active_season_number: null,
        snapshot_rows: 0,
      }) as SeasonRolloverResult,
      error: null,
    };
  }
}

export class PgSeasonRepository implements SeasonRepository {
  constructor(private readonly pool: Pool) {}

  async getActiveSeason(): Promise<DbResult<SeasonRow | null>> {
    try {
      const result = await this.pool.query<SeasonRow>(
        `SELECT id::text, season_number, start_date::text, end_date::text, is_active, created_at::text
         FROM seasons
         WHERE is_active = true
         ORDER BY season_number DESC
         LIMIT 1`
      );
      return { data: result.rows[0] ?? null, error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }

  async snapshotRankings(seasonId: string): Promise<DbResult<number>> {
    try {
      const result = await this.pool.query(
        `INSERT INTO season_rankings (season_id, user_id, final_rating, created_at)
         SELECT $1::uuid, ur.user_id, ur.rating, NOW()
         FROM user_rankings ur
         ON CONFLICT (season_id, user_id) DO NOTHING`,
        [seasonId]
      );
      return { data: result.rowCount ?? 0, error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }

  async resetRatings(): Promise<DbResult<number>> {
    try {
      const result = await this.pool.query(
        `UPDATE user_rankings
         SET rating = 1000,
             wins = 0,
             losses = 0,
             last_ranked_match_at = NULL,
             updated_at = NOW()`
      );
      return { data: result.rowCount ?? 0, error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }

  async runSeasonRollover(nowIso: string): Promise<DbResult<SeasonRolloverResult>> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const nowResult = await client.query<{ now_ams: string }>(
        `SELECT (($1::timestamptz AT TIME ZONE 'Europe/Amsterdam') AT TIME ZONE 'Europe/Amsterdam')::text AS now_ams`,
        [nowIso]
      );
      const nowAms = nowResult.rows[0]?.now_ams ?? nowIso;

      const activeResult = await client.query<SeasonRow>(
        `SELECT id::text, season_number, start_date::text, end_date::text, is_active, created_at::text
         FROM seasons
         WHERE is_active = true
         ORDER BY season_number DESC
         LIMIT 1
         FOR UPDATE`
      );
      const active = activeResult.rows[0] ?? null;

      if (!active) {
        const inserted = await client.query<SeasonRow>(
          `INSERT INTO seasons (season_number, start_date, end_date, is_active)
           VALUES (
             1,
             $1::timestamptz,
             ($1::timestamptz + INTERVAL '28 days'),
             true
           )
           RETURNING id::text, season_number, start_date::text, end_date::text, is_active, created_at::text`,
          [nowAms]
        );

        await client.query('COMMIT');
        return {
          data: {
            rolled_over: false,
            previous_season_number: null,
            new_active_season_number: inserted.rows[0]?.season_number ?? 1,
            snapshot_rows: 0,
          },
          error: null,
        };
      }

      if (active.end_date > nowAms) {
        await client.query('COMMIT');
        return {
          data: {
            rolled_over: false,
            previous_season_number: active.season_number,
            new_active_season_number: active.season_number,
            snapshot_rows: 0,
          },
          error: null,
        };
      }

      const snapshot = await client.query(
        `INSERT INTO season_rankings (season_id, user_id, final_rating, created_at)
         SELECT $1::uuid, ur.user_id, ur.rating, NOW()
         FROM user_rankings ur
         ON CONFLICT (season_id, user_id) DO NOTHING`,
        [active.id]
      );

      await client.query(
        `UPDATE user_rankings
         SET rating = 1000,
             wins = 0,
             losses = 0,
             last_ranked_match_at = NULL,
             updated_at = NOW()`
      );

      await client.query(
        `UPDATE seasons
         SET is_active = false
         WHERE id = $1::uuid
           AND is_active = true`,
        [active.id]
      );

      const nextSeasonNumber = active.season_number + 1;
      const nextSeason = await client.query<{ season_number: number }>(
        `INSERT INTO seasons (season_number, start_date, end_date, is_active)
         VALUES (
           $1,
           $2::timestamptz,
           ($2::timestamptz + INTERVAL '28 days'),
           true
         )
         ON CONFLICT (season_number)
         DO UPDATE SET is_active = EXCLUDED.is_active
         RETURNING season_number`,
        [nextSeasonNumber, active.end_date]
      );

      await client.query('COMMIT');
      return {
        data: {
          rolled_over: true,
          previous_season_number: active.season_number,
          new_active_season_number: nextSeason.rows[0]?.season_number ?? nextSeasonNumber,
          snapshot_rows: snapshot.rowCount ?? 0,
        },
        error: null,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      return { data: null, error: mapPgError(error) };
    } finally {
      client.release();
    }
  }
}
