import type { SupabaseClient } from '@supabase/supabase-js';
import type { Pool, PoolClient } from 'pg';
import { getSupabase } from '../../config/supabase.js';
import { mapPgError } from '../errors.js';
import type { DbResult, DbError } from '../types.js';

export interface RankedSessionRow {
  id: string;
  is_ranked: boolean;
  status: string;
  created_at: string;
  host_id: string;
}

export interface RatingUpdateRow {
  user_id: string;
  rating: number;
  wins: number;
  losses: number;
  delta: number;
}

export interface RankingRepository {
  ensureRankingRow(userId: string, updatedAtIso: string): Promise<DbResult<void>>;
  listJoinedParticipantIds(sessionId: string): Promise<DbResult<string[]>>;
  countRecentRankedMatchesBetweenUsers(
    userA: string,
    userB: string,
    windowStartIso: string
  ): Promise<DbResult<number>>;
  findRankedSessionById(sessionId: string): Promise<DbResult<RankedSessionRow | null>>;
  submitRankedMatchResult(input: {
    sessionId: string;
    winnerId: string;
    submittedByUserId: string;
    ratingDelta: number;
    occurredAtIso: string;
  }): Promise<DbResult<RatingUpdateRow[]>>;
}

const DOMAIN_ERRORS = new Set([
  'SESSION_NOT_FOUND',
  'RANKING_FORBIDDEN',
  'RANKED_REQUIRED',
  'INVALID_STATUS',
  'MATCH_RESULT_EXISTS',
  'INSUFFICIENT_PARTICIPANTS',
  'INVALID_WINNER',
]);

function toSupabaseError(error: { code?: string; message: string; details?: string }): DbError {
  return {
    code: error.code ?? 'SUPABASE_QUERY_ERROR',
    message: error.message,
    ...(error.details ? { details: error.details } : {}),
  };
}

export class SupabaseRankingRepository implements RankingRepository {
  constructor(private readonly supabase: SupabaseClient = getSupabase()) {}

  async ensureRankingRow(userId: string, updatedAtIso: string): Promise<DbResult<void>> {
    const { error } = await this.supabase
      .from('user_rankings')
      .upsert(
        {
          user_id: userId,
          rating: 1000,
          wins: 0,
          losses: 0,
          updated_at: updatedAtIso,
        },
        { onConflict: 'user_id', ignoreDuplicates: true }
      );

    if (error) {
      return { data: null, error: toSupabaseError(error) };
    }

    return { data: undefined, error: null };
  }

  async listJoinedParticipantIds(sessionId: string): Promise<DbResult<string[]>> {
    const { data, error } = await this.supabase
      .from('session_participants')
      .select('user_id')
      .eq('session_id', sessionId)
      .eq('state', 'joined');

    if (error) {
      return { data: null, error: toSupabaseError(error) };
    }

    return {
      data: (data ?? []).map((row: { user_id: string }) => row.user_id),
      error: null,
    };
  }

  async countRecentRankedMatchesBetweenUsers(
    userA: string,
    userB: string,
    windowStartIso: string
  ): Promise<DbResult<number>> {
    const { data, error } = await this.supabase.rpc('count_recent_ranked_matches_between_users', {
      p_user_a: userA,
      p_user_b: userB,
      p_window_start: windowStartIso,
    });

    if (error) {
      return { data: null, error: toSupabaseError(error) };
    }

    return { data: Number(data ?? 0), error: null };
  }

  async findRankedSessionById(sessionId: string): Promise<DbResult<RankedSessionRow | null>> {
    const { data, error } = await this.supabase
      .from('sessions')
      .select('id, host_id, is_ranked, status, created_at')
      .eq('id', sessionId)
      .maybeSingle<RankedSessionRow>();

    if (error) {
      return { data: null, error: toSupabaseError(error) };
    }

    return { data: data ?? null, error: null };
  }

  async submitRankedMatchResult(input: {
    sessionId: string;
    winnerId: string;
    submittedByUserId: string;
    ratingDelta: number;
    occurredAtIso: string;
  }): Promise<DbResult<RatingUpdateRow[]>> {
    const { data, error } = await this.supabase.rpc('submit_ranked_match_result', {
      p_session_id: input.sessionId,
      p_winner_id: input.winnerId,
      p_submitted_by_user_id: input.submittedByUserId,
      p_rating_delta: input.ratingDelta,
      p_occurred_at: input.occurredAtIso,
    });

    if (error) {
      return { data: null, error: toSupabaseError(error) };
    }

    return { data: (data ?? []) as RatingUpdateRow[], error: null };
  }
}

class RankingDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RankingDomainError';
  }
}

function isRankingDomainError(error: unknown): error is RankingDomainError {
  return error instanceof RankingDomainError && DOMAIN_ERRORS.has(error.message);
}

export class PgRankingRepository implements RankingRepository {
  constructor(private readonly pool: Pool) {}

  async ensureRankingRow(userId: string, updatedAtIso: string): Promise<DbResult<void>> {
    try {
      await this.pool.query(
        `INSERT INTO user_rankings (user_id, rating, wins, losses, updated_at)
         VALUES ($1, 1000, 0, 0, $2)
         ON CONFLICT (user_id) DO NOTHING`,
        [userId, updatedAtIso]
      );
      return { data: undefined, error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }

  async listJoinedParticipantIds(sessionId: string): Promise<DbResult<string[]>> {
    try {
      const result = await this.pool.query<{ user_id: string }>(
        `SELECT user_id::text AS user_id
         FROM session_participants
         WHERE session_id = $1
           AND state = 'joined'`,
        [sessionId]
      );
      return { data: result.rows.map((row) => row.user_id), error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }

  async countRecentRankedMatchesBetweenUsers(
    userA: string,
    userB: string,
    windowStartIso: string
  ): Promise<DbResult<number>> {
    try {
      const result = await this.pool.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count
         FROM match_results mr
         INNER JOIN session_participants spa
           ON spa.session_id = mr.session_id
          AND spa.user_id = $1
          AND spa.state = 'joined'
         INNER JOIN session_participants spb
           ON spb.session_id = mr.session_id
          AND spb.user_id = $2
          AND spb.state = 'joined'
         WHERE mr.created_at >= $3`,
        [userA, userB, windowStartIso]
      );
      return { data: result.rows[0]?.count ?? 0, error: null };
    } catch (error) {
      return { data: null, error: mapPgError(error) };
    }
  }

  async findRankedSessionById(sessionId: string): Promise<DbResult<RankedSessionRow | null>> {
    try {
      const result = await this.pool.query<RankedSessionRow>(
        `SELECT id::text, host_id::text, is_ranked, status::text, created_at::text
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

  async submitRankedMatchResult(input: {
    sessionId: string;
    winnerId: string;
    submittedByUserId: string;
    ratingDelta: number;
    occurredAtIso: string;
  }): Promise<DbResult<RatingUpdateRow[]>> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const session = await this.loadAndLockSession(client, input.sessionId);
      this.validateSession(session, input.submittedByUserId);
      await this.ensureNoExistingMatchResult(client, input.sessionId);

      const participantIds = await this.getJoinedParticipantIdsForUpdate(client, input.sessionId);
      if (participantIds.length < 2) {
        throw new RankingDomainError('INSUFFICIENT_PARTICIPANTS');
      }
      if (!participantIds.includes(input.winnerId)) {
        throw new RankingDomainError('INVALID_WINNER');
      }

      await this.ensureParticipantRankingRows(client, participantIds);
      await this.lockParticipantRankingRows(client, participantIds);

      await client.query(
        `UPDATE user_rankings
         SET rating = rating + $2,
             wins = wins + 1,
             last_ranked_match_at = $3,
             updated_at = NOW()
         WHERE user_id = $1`,
        [input.winnerId, input.ratingDelta, input.occurredAtIso]
      );

      await client.query(
        `UPDATE user_rankings
         SET rating = rating - $2,
             losses = losses + 1,
             last_ranked_match_at = $3,
             updated_at = NOW()
         WHERE user_id = ANY($1::uuid[])
           AND user_id <> $4`,
        [participantIds, input.ratingDelta, input.occurredAtIso, input.winnerId]
      );

      await client.query(
        `INSERT INTO match_results (session_id, winner_id, rating_delta, created_at)
         VALUES ($1, $2, $3, $4)`,
        [input.sessionId, input.winnerId, input.ratingDelta, input.occurredAtIso]
      );

      await client.query('UPDATE sessions SET status = \'completed\' WHERE id = $1', [input.sessionId]);

      const updates = await client.query<RatingUpdateRow>(
        `SELECT
          ur.user_id::text AS user_id,
          ur.rating,
          ur.wins,
          ur.losses,
          CASE
            WHEN ur.user_id = $2 THEN $3
            ELSE -$3
          END AS delta
         FROM user_rankings ur
         WHERE ur.user_id = ANY($1::uuid[])
         ORDER BY ur.rating DESC, ur.user_id`,
        [participantIds, input.winnerId, input.ratingDelta]
      );

      await client.query('COMMIT');
      return { data: updates.rows, error: null };
    } catch (error) {
      await client.query('ROLLBACK');

      if (isRankingDomainError(error)) {
        return {
          data: null,
          error: {
            code: 'RANKING_DOMAIN_ERROR',
            message: error.message,
          },
        };
      }

      const pgError = error as { code?: string; message?: string };
      if (pgError.code === '23505') {
        return {
          data: null,
          error: {
            code: '23505',
            message: 'MATCH_RESULT_EXISTS',
          },
        };
      }

      return { data: null, error: mapPgError(error) };
    } finally {
      client.release();
    }
  }

  private async loadAndLockSession(client: PoolClient, sessionId: string): Promise<RankedSessionRow> {
    const result = await client.query<RankedSessionRow>(
      `SELECT id::text, host_id::text, is_ranked, status::text, created_at::text
       FROM sessions
       WHERE id = $1
       FOR UPDATE`,
      [sessionId]
    );

    if (!result.rows[0]) {
      throw new RankingDomainError('SESSION_NOT_FOUND');
    }

    return result.rows[0];
  }

  private validateSession(session: RankedSessionRow, submittedByUserId: string): void {
    if (session.host_id !== submittedByUserId) {
      throw new RankingDomainError('RANKING_FORBIDDEN');
    }
    if (session.is_ranked !== true) {
      throw new RankingDomainError('RANKED_REQUIRED');
    }
    if (session.status !== 'active' && session.status !== 'completed') {
      throw new RankingDomainError('INVALID_STATUS');
    }
  }

  private async ensureNoExistingMatchResult(client: PoolClient, sessionId: string): Promise<void> {
    const existing = await client.query<{ id: string }>(
      'SELECT session_id::text AS id FROM match_results WHERE session_id = $1 LIMIT 1',
      [sessionId]
    );
    if (existing.rows[0]) {
      throw new RankingDomainError('MATCH_RESULT_EXISTS');
    }
  }

  private async getJoinedParticipantIdsForUpdate(client: PoolClient, sessionId: string): Promise<string[]> {
    const participants = await client.query<{ user_id: string }>(
      `SELECT user_id::text AS user_id
       FROM session_participants
       WHERE session_id = $1
         AND state = 'joined'`,
      [sessionId]
    );
    return participants.rows.map((row) => row.user_id);
  }

  private async ensureParticipantRankingRows(client: PoolClient, participantIds: string[]): Promise<void> {
    await client.query(
      `INSERT INTO user_rankings (user_id)
       SELECT UNNEST($1::uuid[])
       ON CONFLICT (user_id) DO NOTHING`,
      [participantIds]
    );
  }

  private async lockParticipantRankingRows(client: PoolClient, participantIds: string[]): Promise<void> {
    await client.query(
      `SELECT user_id
       FROM user_rankings
       WHERE user_id = ANY($1::uuid[])
       FOR UPDATE`,
      [participantIds]
    );
  }
}
