import type { SupabaseClient } from '@supabase/supabase-js';
import type { Pool } from 'pg';
import { getSupabase } from '../../config/supabase.js';
import { mapPgError } from '../errors.js';
import type { DbResult } from '../types.js';

export interface SessionListParams {
  status?: string;
  visibility?: string;
  placeId?: number;
  hostId?: string;
  requesterId?: string | null;
  limit: number;
  offset: number;
}

export interface SessionListRow {
  id: string;
  place_id: number | null;
  host_id: string;
  title: string;
  description: string | null;
  visibility: string;
  is_ranked?: boolean | null;
  status: string;
  max_participants: number;
  scheduled_start: string | null;
  created_at: string;
  original_input_url: string | null;
  game_place_id: number | null;
  game_name: string | null;
  canonical_web_url: string | null;
  canonical_start_url: string | null;
  thumbnail_url: string | null;
  participant_count: number | string | null;
  total_count: number | string | null;
}

export interface SessionRepository {
  listSessionsOptimized(params: SessionListParams): Promise<DbResult<SessionListRow[]>>;
  listUserPlannedSessionsOptimized(params: {
    userId: string;
    limit: number;
    offset: number;
  }): Promise<DbResult<SessionListRow[]>>;
}

export class SupabaseSessionRepository implements SessionRepository {
  constructor(private readonly supabase: SupabaseClient = getSupabase()) {}

  async listSessionsOptimized(params: SessionListParams): Promise<DbResult<SessionListRow[]>> {
    const rpcParams = {
      p_status: params.status || null,
      p_visibility: params.visibility || null,
      p_place_id: params.placeId || null,
      p_host_id: params.hostId || null,
      p_requester_id: params.requesterId || null,
      p_limit: params.limit,
      p_offset: params.offset,
    };

    let { data, error } = await this.supabase.rpc('list_sessions_optimized', rpcParams);
    if (error && /Could not find the function public\.list_sessions_optimized/i.test(error.message)) {
      const fallback = await this.supabase.rpc('list_sessions_optimized', {
        p_status: params.status || null,
        p_visibility: params.visibility || null,
        p_place_id: params.placeId || null,
        p_host_id: params.hostId || null,
        p_limit: params.limit,
        p_offset: params.offset,
      });
      data = fallback.data;
      error = fallback.error;
    }

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

    return { data: (data ?? []) as SessionListRow[], error: null };
  }

  async listUserPlannedSessionsOptimized(params: {
    userId: string;
    limit: number;
    offset: number;
  }): Promise<DbResult<SessionListRow[]>> {
    const { data, error } = await this.supabase.rpc('list_user_planned_sessions_optimized', {
      p_user_id: params.userId,
      p_limit: params.limit,
      p_offset: params.offset,
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

    return { data: (data ?? []) as SessionListRow[], error: null };
  }
}

export class PgSessionRepository implements SessionRepository {
  constructor(private readonly pool: Pool) {}

  async listSessionsOptimized(params: SessionListParams): Promise<DbResult<SessionListRow[]>> {
    try {
      const result = await this.pool.query<SessionListRow>(
        `SELECT
          s.id::text AS id,
          s.place_id,
          s.host_id::text AS host_id,
          s.title,
          s.description,
          s.visibility::text AS visibility,
          s.is_ranked,
          s.status::text AS status,
          s.max_participants,
          s.scheduled_start::text AS scheduled_start,
          s.created_at::text AS created_at,
          s.original_input_url,
          g.place_id AS game_place_id,
          g.game_name,
          g.canonical_web_url,
          g.canonical_start_url,
          g.thumbnail_url,
          COUNT(DISTINCT sp.user_id) FILTER (WHERE sp.state = 'joined') AS participant_count,
          COUNT(*) OVER() AS total_count
        FROM sessions s
        LEFT JOIN games g ON s.place_id = g.place_id
        LEFT JOIN session_participants sp ON s.id = sp.session_id
        WHERE s.archived_at IS NULL
          AND ($1::text IS NULL OR s.status::text = $1)
          AND ($2::text IS NULL OR s.visibility::text = $2)
          AND ($3::int IS NULL OR s.place_id = $3)
          AND ($4::uuid IS NULL OR s.host_id = $4)
          AND (
            s.visibility != 'friends'
            OR s.host_id = $5::uuid
            OR EXISTS (
              SELECT 1
              FROM friendships f
              WHERE f.status = 'accepted'
                AND f.user_id = LEAST($5::uuid, s.host_id)
                AND f.friend_id = GREATEST($5::uuid, s.host_id)
            )
            OR EXISTS (
              SELECT 1
              FROM session_participants sp2
              WHERE sp2.session_id = s.id
                AND sp2.user_id = $5::uuid
                AND sp2.state IN ('joined', 'invited')
            )
          )
        GROUP BY
          s.id,
          s.place_id,
          s.host_id,
          s.title,
          s.description,
          s.visibility,
          s.is_ranked,
          s.status,
          s.max_participants,
          s.scheduled_start,
          s.created_at,
          s.original_input_url,
          g.place_id,
          g.game_name,
          g.canonical_web_url,
          g.canonical_start_url,
          g.thumbnail_url
        ORDER BY s.scheduled_start DESC NULLS LAST, s.created_at DESC
        OFFSET $6
        LIMIT $7`,
        [
          params.status ?? null,
          params.visibility ?? null,
          params.placeId ?? null,
          params.hostId ?? null,
          params.requesterId ?? null,
          params.offset,
          params.limit,
        ]
      );

      return { data: result.rows, error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }

  async listUserPlannedSessionsOptimized(params: {
    userId: string;
    limit: number;
    offset: number;
  }): Promise<DbResult<SessionListRow[]>> {
    try {
      const result = await this.pool.query<SessionListRow>(
        `SELECT
          s.id::text AS id,
          s.place_id,
          s.host_id::text AS host_id,
          s.title,
          s.description,
          s.visibility::text AS visibility,
          s.is_ranked,
          s.status::text AS status,
          s.max_participants,
          s.scheduled_start::text AS scheduled_start,
          s.created_at::text AS created_at,
          s.original_input_url,
          g.place_id AS game_place_id,
          g.game_name,
          g.canonical_web_url,
          g.canonical_start_url,
          g.thumbnail_url,
          COUNT(DISTINCT sp.user_id) FILTER (WHERE sp.state = 'joined') AS participant_count,
          COUNT(*) OVER() AS total_count
        FROM sessions s
        LEFT JOIN games g ON s.place_id = g.place_id
        LEFT JOIN session_participants sp ON s.id = sp.session_id
        WHERE s.archived_at IS NULL
          AND s.host_id = $1::uuid
          AND s.status IN ('scheduled', 'active')
        GROUP BY
          s.id,
          s.place_id,
          s.host_id,
          s.title,
          s.description,
          s.visibility,
          s.is_ranked,
          s.status,
          s.max_participants,
          s.scheduled_start,
          s.created_at,
          s.original_input_url,
          g.place_id,
          g.game_name,
          g.canonical_web_url,
          g.canonical_start_url,
          g.thumbnail_url
        ORDER BY s.scheduled_start ASC NULLS LAST, s.created_at DESC
        OFFSET $2
        LIMIT $3`,
        [params.userId, params.offset, params.limit]
      );

      return { data: result.rows, error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }
}
