import { getSupabase } from '../config/supabase.js';
import { AppError, ErrorCodes } from '../utils/errors.js';

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

export interface MatchHistoryItem {
  sessionId: string;
  sessionTitle: string;
  playedAt: string;
  result: 'win' | 'loss';
  winnerId: string;
  ratingDelta: number;
  opponents: Array<{
    userId: string;
    displayName: string | null;
  }>;
}

export class MatchHistoryService {
  async getMyMatchHistory(userId: string, limit = 20): Promise<{
    timezone: 'Europe/Amsterdam';
    entries: MatchHistoryItem[];
  }> {
    const safeLimit = Math.min(Math.max(limit, 1), 50);
    const supabase = getSupabase();

    const { data: participantRows, error: participantError } = await supabase
      .from('session_participants')
      .select('session_id')
      .eq('user_id', userId)
      .eq('state', 'joined')
      .order('joined_at', { ascending: false })
      .limit(250);

    if (participantError) {
      throw new AppError(
        ErrorCodes.INTERNAL_DB_ERROR,
        `Failed to fetch participant sessions for match history: ${participantError.message}`,
        500
      );
    }

    const sessionIds = [...new Set((participantRows || []).map((row: { session_id: string }) => row.session_id))];
    if (sessionIds.length === 0) {
      return {
        timezone: 'Europe/Amsterdam',
        entries: [],
      };
    }

    const { data: matchRows, error: matchError } = await supabase
      .from('match_results')
      .select('session_id, winner_id, rating_delta, created_at')
      .in('session_id', sessionIds)
      .order('created_at', { ascending: false })
      .limit(safeLimit)
      .returns<MatchResultRow[]>();

    if (matchError) {
      throw new AppError(
        ErrorCodes.INTERNAL_DB_ERROR,
        `Failed to fetch match history results: ${matchError.message}`,
        500
      );
    }

    const historySessionIds = [...new Set((matchRows || []).map((row) => row.session_id))];
    if (historySessionIds.length === 0) {
      return {
        timezone: 'Europe/Amsterdam',
        entries: [],
      };
    }

    const [{ data: sessions, error: sessionsError }, { data: participants, error: participantsError }] =
      await Promise.all([
        supabase
          .from('sessions')
          .select('id, title')
          .in('id', historySessionIds)
          .returns<SessionRow[]>(),
        supabase
          .from('session_participants')
          .select('session_id, user_id')
          .in('session_id', historySessionIds)
          .eq('state', 'joined')
          .returns<SessionParticipantRow[]>(),
      ]);

    if (sessionsError) {
      throw new AppError(
        ErrorCodes.INTERNAL_DB_ERROR,
        `Failed to fetch session metadata for match history: ${sessionsError.message}`,
        500
      );
    }

    if (participantsError) {
      throw new AppError(
        ErrorCodes.INTERNAL_DB_ERROR,
        `Failed to fetch session participants for match history: ${participantsError.message}`,
        500
      );
    }

    const allUserIds = [...new Set((participants || []).map((row) => row.user_id))];
    const { data: users, error: usersError } = await supabase
      .from('app_users')
      .select('id, roblox_display_name, roblox_username')
      .in('id', allUserIds)
      .returns<AppUserRow[]>();

    if (usersError) {
      throw new AppError(
        ErrorCodes.INTERNAL_DB_ERROR,
        `Failed to fetch user display names for match history: ${usersError.message}`,
        500
      );
    }

    const sessionById = new Map((sessions || []).map((session) => [session.id, session]));
    const participantsBySession = new Map<string, string[]>();
    for (const row of participants || []) {
      if (!participantsBySession.has(row.session_id)) {
        participantsBySession.set(row.session_id, []);
      }
      participantsBySession.get(row.session_id)!.push(row.user_id);
    }

    const userDisplayNameById = new Map(
      (users || []).map((row) => [
        row.id,
        row.roblox_display_name || row.roblox_username || null,
      ])
    );

    const entries: MatchHistoryItem[] = (matchRows || []).map((row) => {
      const participantIds = participantsBySession.get(row.session_id) || [];
      const opponents = participantIds
        .filter((id) => id !== userId)
        .map((opponentId) => ({
          userId: opponentId,
          displayName: userDisplayNameById.get(opponentId) || null,
        }));

      const isWin = row.winner_id === userId;
      return {
        sessionId: row.session_id,
        sessionTitle: sessionById.get(row.session_id)?.title || 'Ranked session',
        playedAt: row.created_at,
        result: isWin ? 'win' : 'loss',
        winnerId: row.winner_id,
        ratingDelta: isWin ? row.rating_delta : -Math.abs(row.rating_delta),
        opponents,
      };
    });

    return {
      timezone: 'Europe/Amsterdam',
      entries,
    };
  }
}
