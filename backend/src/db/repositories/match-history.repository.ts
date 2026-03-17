import type { SupabaseClient } from '@supabase/supabase-js';
import type { Pool } from 'pg';
import { getSupabase } from '../../config/supabase.js';
import { mapPgError } from '../errors.js';
import type { DbError, DbResult } from '../types.js';

interface SessionParticipantRow {
  session_id: string;
  user_id: string;
}

interface MatchResultRow {
  session_id: string;
  winner_id: string;
  rating_delta: number;
  created_at: string;
}

interface SessionRow {
  id: string;
  title: string;
}

interface AppUserRow {
  id: string;
  roblox_display_name: string | null;
  roblox_username: string | null;
}

export interface MatchHistoryRepositoryRow {
  session_id: string;
  winner_id: string;
  rating_delta: number;
  created_at: string;
  session_title: string | null;
  participant_user_id: string | null;
  participant_display_name: string | null;
}

export interface MatchHistoryRepository {
  listHistoryRowsForUser(userId: string, limit: number): Promise<DbResult<MatchHistoryRepositoryRow[]>>;
}

function toSupabaseError(error: { code?: string; message: string; details?: string }): DbError {
  return {
    code: error.code ?? 'SUPABASE_QUERY_ERROR',
    message: error.message,
    ...(error.details ? { details: error.details } : {}),
  };
}

export class SupabaseMatchHistoryRepository implements MatchHistoryRepository {
  constructor(private readonly supabase: SupabaseClient = getSupabase()) {}

  async listHistoryRowsForUser(userId: string, limit: number): Promise<DbResult<MatchHistoryRepositoryRow[]>> {
    const { data: participantRows, error: participantError } = await this.supabase
      .from('session_participants')
      .select('session_id')
      .eq('user_id', userId)
      .eq('state', 'joined')
      .order('joined_at', { ascending: false })
      .limit(250);

    if (participantError) {
      return { data: null, error: toSupabaseError(participantError) };
    }

    const sessionIds = [...new Set((participantRows || []).map((row: { session_id: string }) => row.session_id))];
    if (sessionIds.length === 0) {
      return { data: [], error: null };
    }

    const { data: matchRows, error: matchError } = await this.supabase
      .from('match_results')
      .select('session_id, winner_id, rating_delta, created_at')
      .in('session_id', sessionIds)
      .order('created_at', { ascending: false })
      .limit(limit)
      .returns<MatchResultRow[]>();

    if (matchError) {
      return { data: null, error: toSupabaseError(matchError) };
    }

    const historySessionIds = [...new Set((matchRows || []).map((row) => row.session_id))];
    if (historySessionIds.length === 0) {
      return { data: [], error: null };
    }

    const [{ data: sessions, error: sessionsError }, { data: participants, error: participantsError }] =
      await Promise.all([
        this.supabase
          .from('sessions')
          .select('id, title')
          .in('id', historySessionIds)
          .returns<SessionRow[]>(),
        this.supabase
          .from('session_participants')
          .select('session_id, user_id')
          .in('session_id', historySessionIds)
          .eq('state', 'joined')
          .returns<SessionParticipantRow[]>(),
      ]);

    if (sessionsError) {
      return { data: null, error: toSupabaseError(sessionsError) };
    }
    if (participantsError) {
      return { data: null, error: toSupabaseError(participantsError) };
    }

    const allUserIds = [...new Set((participants || []).map((row) => row.user_id))];
    let users: AppUserRow[] = [];
    if (allUserIds.length > 0) {
      const { data: userRows, error: usersError } = await this.supabase
        .from('app_users')
        .select('id, roblox_display_name, roblox_username')
        .in('id', allUserIds)
        .returns<AppUserRow[]>();
      if (usersError) {
        return { data: null, error: toSupabaseError(usersError) };
      }
      users = userRows ?? [];
    }

    const sessionById = new Map((sessions || []).map((session) => [session.id, session]));
    const participantsBySession = new Map<string, string[]>();
    for (const row of participants || []) {
      if (!participantsBySession.has(row.session_id)) {
        participantsBySession.set(row.session_id, []);
      }
      participantsBySession.get(row.session_id)!.push(row.user_id);
    }

    const userDisplayById = new Map(
      users.map((row) => [row.id, row.roblox_display_name || row.roblox_username || null])
    );

    const flatRows: MatchHistoryRepositoryRow[] = [];
    for (const row of matchRows || []) {
      const participantIds = participantsBySession.get(row.session_id) || [];
      if (participantIds.length === 0) {
        flatRows.push({
          session_id: row.session_id,
          winner_id: row.winner_id,
          rating_delta: row.rating_delta,
          created_at: row.created_at,
          session_title: sessionById.get(row.session_id)?.title || null,
          participant_user_id: null,
          participant_display_name: null,
        });
        continue;
      }

      for (const participantId of participantIds) {
        flatRows.push({
          session_id: row.session_id,
          winner_id: row.winner_id,
          rating_delta: row.rating_delta,
          created_at: row.created_at,
          session_title: sessionById.get(row.session_id)?.title || null,
          participant_user_id: participantId,
          participant_display_name: userDisplayById.get(participantId) || null,
        });
      }
    }

    return { data: flatRows, error: null };
  }
}

export class PgMatchHistoryRepository implements MatchHistoryRepository {
  constructor(private readonly pool: Pool) {}

  async listHistoryRowsForUser(userId: string, limit: number): Promise<DbResult<MatchHistoryRepositoryRow[]>> {
    try {
      const result = await this.pool.query<MatchHistoryRepositoryRow>(
        `WITH joined_sessions AS (
          SELECT DISTINCT sp.session_id
          FROM session_participants sp
          WHERE sp.user_id = $1::uuid
            AND sp.state = 'joined'
          ORDER BY sp.session_id
          LIMIT 250
        ),
        recent_matches AS (
          SELECT mr.session_id, mr.winner_id, mr.rating_delta, mr.created_at
          FROM match_results mr
          INNER JOIN joined_sessions js ON js.session_id = mr.session_id
          ORDER BY mr.created_at DESC
          LIMIT $2
        )
        SELECT
          rm.session_id::text AS session_id,
          rm.winner_id::text AS winner_id,
          rm.rating_delta,
          rm.created_at::text AS created_at,
          s.title AS session_title,
          sp.user_id::text AS participant_user_id,
          COALESCE(au.roblox_display_name, au.roblox_username) AS participant_display_name
        FROM recent_matches rm
        LEFT JOIN sessions s ON s.id = rm.session_id
        LEFT JOIN session_participants sp
          ON sp.session_id = rm.session_id
         AND sp.state = 'joined'
        LEFT JOIN app_users au ON au.id = sp.user_id
        ORDER BY rm.created_at DESC`,
        [userId, limit]
      );

      return { data: result.rows, error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }
}
