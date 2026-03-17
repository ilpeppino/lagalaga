import type { SupabaseClient } from '@supabase/supabase-js';
import type { Pool } from 'pg';
import { getSupabase } from '../../config/supabase.js';
import { mapPgError } from '../errors.js';
import type { DbError, DbResult } from '../types.js';

export type ReportCategory =
  | 'CSAM'
  | 'GROOMING_OR_SEXUAL_EXPLOITATION'
  | 'HARASSMENT_OR_ABUSIVE_BEHAVIOR'
  | 'IMPERSONATION'
  | 'OTHER';

export type ReportTargetType = 'USER' | 'SESSION' | 'GENERAL';
export type ReportStatus = 'OPEN' | 'UNDER_REVIEW' | 'CLOSED' | 'ESCALATED';

export interface ReportInsertRow {
  id: string;
  status: ReportStatus;
  created_at: string;
}

export interface RecentReportRow {
  id: string;
  target_user_id: string | null;
  target_session_id: string | null;
  description: string | null;
}

export interface ReportRepository {
  findUserById(userId: string): Promise<DbResult<{ id: string } | null>>;
  findSessionById(sessionId: string): Promise<DbResult<{ id: string } | null>>;
  countRecentReportsByReporter(reporterId: string, sinceIso: string): Promise<DbResult<number>>;
  listRecentReportsForDuplicateCheck(
    reporterId: string,
    category: ReportCategory,
    sinceIso: string
  ): Promise<DbResult<RecentReportRow[]>>;
  insertReport(input: {
    reporterId: string;
    targetUserId: string | null;
    targetSessionId: string | null;
    category: ReportCategory;
    description: string;
    status: ReportStatus;
  }): Promise<DbResult<ReportInsertRow>>;
}

function toSupabaseError(error: { code?: string; message: string; details?: string }): DbError {
  return {
    code: error.code ?? 'SUPABASE_QUERY_ERROR',
    message: error.message,
    ...(error.details ? { details: error.details } : {}),
  };
}

export class SupabaseReportRepository implements ReportRepository {
  constructor(private readonly supabase: SupabaseClient = getSupabase()) {}

  async findUserById(userId: string): Promise<DbResult<{ id: string } | null>> {
    const { data, error } = await this.supabase
      .from('app_users')
      .select('id')
      .eq('id', userId)
      .maybeSingle<{ id: string }>();

    if (error) {
      return { data: null, error: toSupabaseError(error) };
    }
    return { data: data ?? null, error: null };
  }

  async findSessionById(sessionId: string): Promise<DbResult<{ id: string } | null>> {
    const { data, error } = await this.supabase
      .from('sessions')
      .select('id')
      .eq('id', sessionId)
      .maybeSingle<{ id: string }>();

    if (error) {
      return { data: null, error: toSupabaseError(error) };
    }
    return { data: data ?? null, error: null };
  }

  async countRecentReportsByReporter(reporterId: string, sinceIso: string): Promise<DbResult<number>> {
    const { count, error } = await this.supabase
      .from('reports')
      .select('id', { count: 'exact', head: true })
      .eq('reporter_id', reporterId)
      .gte('created_at', sinceIso);

    if (error) {
      return { data: null, error: toSupabaseError(error) };
    }

    return { data: count ?? 0, error: null };
  }

  async listRecentReportsForDuplicateCheck(
    reporterId: string,
    category: ReportCategory,
    sinceIso: string
  ): Promise<DbResult<RecentReportRow[]>> {
    const { data, error } = await this.supabase
      .from('reports')
      .select('id, target_user_id, target_session_id, description')
      .eq('reporter_id', reporterId)
      .eq('category', category)
      .gte('created_at', sinceIso);

    if (error) {
      return { data: null, error: toSupabaseError(error) };
    }
    return { data: (data ?? []) as RecentReportRow[], error: null };
  }

  async insertReport(input: {
    reporterId: string;
    targetUserId: string | null;
    targetSessionId: string | null;
    category: ReportCategory;
    description: string;
    status: ReportStatus;
  }): Promise<DbResult<ReportInsertRow>> {
    const { data, error } = await this.supabase
      .from('reports')
      .insert({
        reporter_id: input.reporterId,
        target_user_id: input.targetUserId,
        target_session_id: input.targetSessionId,
        category: input.category,
        description: input.description,
        status: input.status,
      })
      .select('id, status, created_at')
      .single<ReportInsertRow>();

    if (error || !data) {
      return {
        data: null,
        error: toSupabaseError({
          code: error?.code,
          message: error?.message ?? 'Insert report failed',
          details: error?.details,
        }),
      };
    }

    return { data, error: null };
  }
}

export class PgReportRepository implements ReportRepository {
  constructor(private readonly pool: Pool) {}

  async findUserById(userId: string): Promise<DbResult<{ id: string } | null>> {
    try {
      const result = await this.pool.query<{ id: string }>(
        `SELECT id::text AS id
         FROM app_users
         WHERE id = $1
         LIMIT 1`,
        [userId]
      );
      return { data: result.rows[0] ?? null, error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }

  async findSessionById(sessionId: string): Promise<DbResult<{ id: string } | null>> {
    try {
      const result = await this.pool.query<{ id: string }>(
        `SELECT id::text AS id
         FROM sessions
         WHERE id = $1
         LIMIT 1`,
        [sessionId]
      );
      return { data: result.rows[0] ?? null, error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }

  async countRecentReportsByReporter(reporterId: string, sinceIso: string): Promise<DbResult<number>> {
    try {
      const result = await this.pool.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count
         FROM reports
         WHERE reporter_id = $1
           AND created_at >= $2`,
        [reporterId, sinceIso]
      );
      return { data: result.rows[0]?.count ?? 0, error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }

  async listRecentReportsForDuplicateCheck(
    reporterId: string,
    category: ReportCategory,
    sinceIso: string
  ): Promise<DbResult<RecentReportRow[]>> {
    try {
      const result = await this.pool.query<RecentReportRow>(
        `SELECT
          id::text,
          target_user_id::text,
          target_session_id::text,
          description
         FROM reports
         WHERE reporter_id = $1
           AND category = $2
           AND created_at >= $3`,
        [reporterId, category, sinceIso]
      );
      return { data: result.rows, error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }

  async insertReport(input: {
    reporterId: string;
    targetUserId: string | null;
    targetSessionId: string | null;
    category: ReportCategory;
    description: string;
    status: ReportStatus;
  }): Promise<DbResult<ReportInsertRow>> {
    try {
      const result = await this.pool.query<ReportInsertRow>(
        `INSERT INTO reports (
          reporter_id,
          target_user_id,
          target_session_id,
          category,
          description,
          status
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id::text, status::text, created_at::text`,
        [
          input.reporterId,
          input.targetUserId,
          input.targetSessionId,
          input.category,
          input.description,
          input.status,
        ]
      );

      if (!result.rows[0]) {
        return {
          data: null,
          error: {
            code: 'INTERNAL_DB_ERROR',
            message: 'Insert report failed',
          },
        };
      }
      return { data: result.rows[0], error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }
}
