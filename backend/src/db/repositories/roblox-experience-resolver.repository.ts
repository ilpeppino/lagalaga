import type { SupabaseClient } from '@supabase/supabase-js';
import type { Pool } from 'pg';
import { getSupabase } from '../../config/supabase.js';
import { mapPgError } from '../errors.js';
import type { DbError, DbResult } from '../types.js';

export interface GamesRow {
  place_id: number;
  canonical_web_url?: string | null;
  canonical_start_url?: string | null;
  game_name?: string | null;
  thumbnail_url?: string | null;
  game_description?: string | null;
}

export interface RobloxExperienceResolverRepository {
  findByPlaceId(placeId: number): Promise<DbResult<GamesRow | null>>;
  upsertGame(
    payload: Record<string, unknown>,
    options: { onConflict: string; ignoreDuplicates: boolean }
  ): Promise<DbResult<void>>;
}

function toSupabaseError(error: { code?: string; message: string; details?: string }): DbError {
  return {
    code: error.code ?? 'SUPABASE_QUERY_ERROR',
    message: error.message,
    ...(error.details ? { details: error.details } : {}),
  };
}

export class SupabaseRobloxExperienceResolverRepository implements RobloxExperienceResolverRepository {
  constructor(private readonly supabase: SupabaseClient = getSupabase()) {}

  async findByPlaceId(placeId: number): Promise<DbResult<GamesRow | null>> {
    const { data, error } = await this.supabase
      .from('games')
      .select('*')
      .eq('place_id', placeId)
      .maybeSingle<GamesRow>();

    if (error) return { data: null, error: toSupabaseError(error) };
    return { data: data ?? null, error: null };
  }

  async upsertGame(
    payload: Record<string, unknown>,
    options: { onConflict: string; ignoreDuplicates: boolean }
  ): Promise<DbResult<void>> {
    const { error } = await this.supabase.from('games').upsert(payload, options);
    if (error) return { data: null, error: toSupabaseError(error) };
    return { data: undefined, error: null };
  }
}

export class PgRobloxExperienceResolverRepository implements RobloxExperienceResolverRepository {
  constructor(private readonly pool: Pool) {}

  async findByPlaceId(placeId: number): Promise<DbResult<GamesRow | null>> {
    try {
      const result = await this.pool.query<GamesRow>(
        `SELECT
          place_id,
          canonical_web_url,
          canonical_start_url,
          game_name,
          thumbnail_url,
          game_description
         FROM games
         WHERE place_id = $1
         LIMIT 1`,
        [placeId]
      );
      return { data: result.rows[0] ?? null, error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }

  async upsertGame(
    payload: Record<string, unknown>,
    _options: { onConflict: string; ignoreDuplicates: boolean }
  ): Promise<DbResult<void>> {
    try {
      const placeId = Number(payload.place_id);
      if (!Number.isInteger(placeId) || placeId <= 0) {
        return { data: null, error: { code: 'VALIDATION_ERROR', message: 'Invalid place_id for games upsert' } };
      }

      const canonicalWebUrl = payload.canonical_web_url as string | null | undefined;
      const canonicalStartUrl = payload.canonical_start_url as string | null | undefined;
      const gameName = payload.game_name as string | null | undefined;
      const thumbnailUrl = payload.thumbnail_url as string | null | undefined;
      const gameDescription = payload.game_description as string | null | undefined;
      const maxPlayers = payload.max_players as number | null | undefined;
      const creatorId = payload.creator_id as number | null | undefined;
      const creatorName = payload.creator_name as string | null | undefined;
      const updatedAt = payload.updated_at as string | null | undefined;

      await this.pool.query(
        `INSERT INTO games (
          place_id,
          canonical_web_url,
          canonical_start_url,
          game_name,
          thumbnail_url,
          game_description,
          max_players,
          creator_id,
          creator_name,
          updated_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,COALESCE($10::timestamptz, NOW()))
        ON CONFLICT (place_id) DO UPDATE SET
          canonical_web_url = EXCLUDED.canonical_web_url,
          canonical_start_url = EXCLUDED.canonical_start_url,
          game_name = EXCLUDED.game_name,
          thumbnail_url = EXCLUDED.thumbnail_url,
          game_description = EXCLUDED.game_description,
          max_players = EXCLUDED.max_players,
          creator_id = EXCLUDED.creator_id,
          creator_name = EXCLUDED.creator_name,
          updated_at = EXCLUDED.updated_at`,
        [
          placeId,
          canonicalWebUrl ?? null,
          canonicalStartUrl ?? null,
          gameName ?? null,
          thumbnailUrl ?? null,
          gameDescription ?? null,
          maxPlayers ?? null,
          creatorId ?? null,
          creatorName ?? null,
          updatedAt ?? null,
        ]
      );

      return { data: undefined, error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }
}
