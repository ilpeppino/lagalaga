import type { SupabaseClient } from '@supabase/supabase-js';
import type { Pool } from 'pg';
import { getSupabase } from '../../config/supabase.js';
import { mapPgError } from '../errors.js';
import type { DbResult } from '../types.js';

export interface SessionLifecycleRepository {
  findStaleActiveSessionIds(cutoffIso: string, limit: number): Promise<DbResult<string[]>>;
  autoCompleteSessions(sessionIds: string[], nowIso: string): Promise<DbResult<number>>;
  hasArchivedAtColumn(): Promise<DbResult<boolean>>;
  findStaleCompletedSessionIds(
    cutoffIso: string,
    limit: number,
    useArchivedAtFilter: boolean
  ): Promise<DbResult<string[]>>;
  archiveCompletedSessions(
    sessionIds: string[],
    nowIso: string,
    useArchivedAtColumn: boolean
  ): Promise<DbResult<number>>;
}

export class SupabaseSessionLifecycleRepository implements SessionLifecycleRepository {
  constructor(private readonly supabase: SupabaseClient = getSupabase()) {}

  async findStaleActiveSessionIds(cutoffIso: string, limit: number): Promise<DbResult<string[]>> {
    const { data, error } = await this.supabase
      .from('sessions')
      .select('id')
      .eq('status', 'active')
      .or(`scheduled_start.lte.${cutoffIso},and(scheduled_start.is.null,created_at.lte.${cutoffIso})`)
      .limit(limit);

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

    return { data: (data ?? []).map((row: { id: string }) => row.id), error: null };
  }

  async autoCompleteSessions(sessionIds: string[], nowIso: string): Promise<DbResult<number>> {
    if (sessionIds.length === 0) return { data: 0, error: null };

    const { data, error } = await this.supabase
      .from('sessions')
      .update({
        status: 'completed',
        scheduled_end: nowIso,
        updated_at: nowIso,
      })
      .in('id', sessionIds)
      .eq('status', 'active')
      .select('id');

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

    return { data: Array.isArray(data) ? data.length : sessionIds.length, error: null };
  }

  async hasArchivedAtColumn(): Promise<DbResult<boolean>> {
    return { data: true, error: null };
  }

  async findStaleCompletedSessionIds(
    cutoffIso: string,
    limit: number,
    useArchivedAtFilter: boolean
  ): Promise<DbResult<string[]>> {
    let query = this.supabase
      .from('sessions')
      .select('id')
      .eq('status', 'completed');

    if (useArchivedAtFilter) {
      query = query.is('archived_at', null);
    }

    const { data, error } = await query
      .lte('updated_at', cutoffIso)
      .limit(limit);

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

    return { data: (data ?? []).map((row: { id: string }) => row.id), error: null };
  }

  async archiveCompletedSessions(
    sessionIds: string[],
    nowIso: string,
    useArchivedAtColumn: boolean
  ): Promise<DbResult<number>> {
    if (sessionIds.length === 0) return { data: 0, error: null };

    const payload = useArchivedAtColumn
      ? {
          archived_at: nowIso,
          updated_at: nowIso,
        }
      : {
          status: 'cancelled',
          updated_at: nowIso,
        };

    let query = this.supabase
      .from('sessions')
      .update(payload)
      .in('id', sessionIds)
      .eq('status', 'completed');

    if (useArchivedAtColumn) {
      query = query.is('archived_at', null);
    }

    const { data, error } = await query.select('id');

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

    return { data: Array.isArray(data) ? data.length : sessionIds.length, error: null };
  }
}

export class PgSessionLifecycleRepository implements SessionLifecycleRepository {
  constructor(private readonly pool: Pool) {}

  async findStaleActiveSessionIds(cutoffIso: string, limit: number): Promise<DbResult<string[]>> {
    try {
      const result = await this.pool.query<{ id: string }>(
        `SELECT id::text
         FROM sessions
         WHERE status = 'active'
           AND (scheduled_start <= $1 OR (scheduled_start IS NULL AND created_at <= $1))
         LIMIT $2`,
        [cutoffIso, limit]
      );
      return { data: result.rows.map((row) => row.id), error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }

  async autoCompleteSessions(sessionIds: string[], nowIso: string): Promise<DbResult<number>> {
    if (sessionIds.length === 0) return { data: 0, error: null };

    try {
      const result = await this.pool.query(
        `UPDATE sessions
         SET status = 'completed',
             scheduled_end = $2,
             updated_at = $2
         WHERE id = ANY($1::uuid[])
           AND status = 'active'`,
        [sessionIds, nowIso]
      );
      return { data: result.rowCount ?? 0, error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }

  async hasArchivedAtColumn(): Promise<DbResult<boolean>> {
    try {
      const result = await this.pool.query<{ exists: boolean }>(
        `SELECT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'sessions'
            AND column_name = 'archived_at'
        ) AS exists`
      );
      return { data: Boolean(result.rows[0]?.exists), error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }

  async findStaleCompletedSessionIds(
    cutoffIso: string,
    limit: number,
    useArchivedAtFilter: boolean
  ): Promise<DbResult<string[]>> {
    try {
      const query = useArchivedAtFilter
        ? `SELECT id::text
           FROM sessions
           WHERE status = 'completed'
             AND archived_at IS NULL
             AND updated_at <= $1
           LIMIT $2`
        : `SELECT id::text
           FROM sessions
           WHERE status = 'completed'
             AND updated_at <= $1
           LIMIT $2`;

      const result = await this.pool.query<{ id: string }>(query, [cutoffIso, limit]);
      return { data: result.rows.map((row) => row.id), error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }

  async archiveCompletedSessions(
    sessionIds: string[],
    nowIso: string,
    useArchivedAtColumn: boolean
  ): Promise<DbResult<number>> {
    if (sessionIds.length === 0) return { data: 0, error: null };

    try {
      const result = useArchivedAtColumn
        ? await this.pool.query(
            `UPDATE sessions
             SET archived_at = $2,
                 updated_at = $2
             WHERE id = ANY($1::uuid[])
               AND status = 'completed'
               AND archived_at IS NULL`,
            [sessionIds, nowIso]
          )
        : await this.pool.query(
            `UPDATE sessions
             SET status = 'cancelled',
                 updated_at = $2
             WHERE id = ANY($1::uuid[])
               AND status = 'completed'`,
            [sessionIds, nowIso]
          );

      return { data: result.rowCount ?? 0, error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }
}
