import { getSupabase } from '../config/supabase.js';
import { SessionError, ErrorCodes, AppError } from '../utils/errors.js';

export type SessionType = 'casual' | 'ranked' | 'tournament' | 'practice';
export type SessionVisibility = 'public' | 'friends' | 'private';
export type SessionStatus = 'scheduled' | 'active' | 'completed' | 'cancelled';
export type ParticipantRole = 'host' | 'player';
export type ParticipantState = 'invited' | 'joined' | 'left';

export interface Game {
  id: string;
  platformKey: string;
  name: string;
  url: string;
  genre?: string;
}

export interface Session {
  id: string;
  hostUserId: string;
  game: Game;
  title?: string;
  startTimeUtc: string;
  durationMinutes?: number;
  maxPlayers: number;
  sessionType: SessionType;
  visibility: SessionVisibility;
  status: SessionStatus;
}

export interface SessionParticipant {
  userId: string;
  sessionId: string;
  role: ParticipantRole;
  state: ParticipantState;
}

export interface CreateSessionInput {
  hostUserId: string;
  gameName: string;
  gameUrl: string;
  title?: string;
  startTimeUtc: string;
  durationMinutes?: number;
  maxPlayers: number;
  sessionType: SessionType;
  visibility?: SessionVisibility;
}

export interface ListSessionsParams {
  limit?: number;
  offset?: number;
}

export class SessionService {
  async listUpcoming(params: ListSessionsParams = {}): Promise<{ sessions: Session[]; total: number }> {
    const supabase = getSupabase();
    const limit = params.limit || 20;
    const offset = params.offset || 0;

    const { data, error, count } = await supabase
      .from('sessions')
      .select('*, game:games(*)', { count: 'exact' })
      .eq('status', 'scheduled')
      .order('start_time_utc', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, `Failed to list sessions: ${error.message}`);
    }

    const sessions: Session[] = (data || []).map((row: any) => ({
      id: row.id,
      hostUserId: row.host_user_id,
      game: {
        id: row.game.id,
        platformKey: row.game.platform_key,
        name: row.game.name,
        url: row.game.url,
        genre: row.game.genre,
      },
      title: row.title,
      startTimeUtc: row.start_time_utc,
      durationMinutes: row.duration_minutes,
      maxPlayers: row.max_players,
      sessionType: row.session_type,
      visibility: row.visibility,
      status: row.status,
    }));

    return { sessions, total: count || 0 };
  }

  async getSessionById(id: string): Promise<{ session: Session; participants: SessionParticipant[] } | null> {
    const supabase = getSupabase();

    const { data: sessionData, error: sessionError } = await supabase
      .from('sessions')
      .select('*, game:games(*)')
      .eq('id', id)
      .single();

    if (sessionError) {
      if (sessionError.code === 'PGRST116') {
        return null;
      }
      throw new AppError(ErrorCodes.INTERNAL_ERROR, `Failed to get session: ${sessionError.message}`);
    }

    const session: Session = {
      id: sessionData.id,
      hostUserId: sessionData.host_user_id,
      game: {
        id: sessionData.game.id,
        platformKey: sessionData.game.platform_key,
        name: sessionData.game.name,
        url: sessionData.game.url,
        genre: sessionData.game.genre,
      },
      title: sessionData.title,
      startTimeUtc: sessionData.start_time_utc,
      durationMinutes: sessionData.duration_minutes,
      maxPlayers: sessionData.max_players,
      sessionType: sessionData.session_type,
      visibility: sessionData.visibility,
      status: sessionData.status,
    };

    // Get participants
    const { data: participantsData, error: participantsError } = await supabase
      .from('session_participants')
      .select('*')
      .eq('session_id', id);

    if (participantsError) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, `Failed to get participants: ${participantsError.message}`);
    }

    const participants: SessionParticipant[] = (participantsData || []).map((row: any) => ({
      userId: row.user_id,
      sessionId: row.session_id,
      role: row.role,
      state: row.state,
    }));

    return { session, participants };
  }

  async createSession(input: CreateSessionInput): Promise<Session> {
    const supabase = getSupabase();

    // Upsert game record
    const { data: gameData, error: gameError } = await supabase
      .from('games')
      .upsert(
        {
          platform_key: 'roblox',
          name: input.gameName,
          url: input.gameUrl,
        },
        {
          onConflict: 'url',
        }
      )
      .select()
      .single();

    if (gameError) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, `Failed to upsert game: ${gameError.message}`);
    }

    // Insert session
    const { data: sessionData, error: sessionError } = await supabase
      .from('sessions')
      .insert({
        host_user_id: input.hostUserId,
        game_id: gameData.id,
        title: input.title,
        start_time_utc: input.startTimeUtc,
        duration_minutes: input.durationMinutes,
        max_players: input.maxPlayers,
        session_type: input.sessionType,
        visibility: input.visibility || 'public',
        status: 'scheduled',
      })
      .select('*, game:games(*)')
      .single();

    if (sessionError) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, `Failed to create session: ${sessionError.message}`);
    }

    // Add host as participant
    await supabase.from('session_participants').insert({
      user_id: input.hostUserId,
      session_id: sessionData.id,
      role: 'host',
      state: 'joined',
    });

    return {
      id: sessionData.id,
      hostUserId: sessionData.host_user_id,
      game: {
        id: sessionData.game.id,
        platformKey: sessionData.game.platform_key,
        name: sessionData.game.name,
        url: sessionData.game.url,
        genre: sessionData.game.genre,
      },
      title: sessionData.title,
      startTimeUtc: sessionData.start_time_utc,
      durationMinutes: sessionData.duration_minutes,
      maxPlayers: sessionData.max_players,
      sessionType: sessionData.session_type,
      visibility: sessionData.visibility,
      status: sessionData.status,
    };
  }

  async joinSession(sessionId: string, userId: string): Promise<SessionParticipant> {
    const supabase = getSupabase();

    // Check if session exists and has capacity
    const sessionResult = await this.getSessionById(sessionId);
    if (!sessionResult) {
      throw new SessionError(ErrorCodes.SESSION_NOT_FOUND, 'Session not found', 404);
    }

    const { session, participants } = sessionResult;

    // Count current participants (not left)
    const currentParticipants = participants.filter((p) => p.state !== 'left');
    if (currentParticipants.length >= session.maxPlayers) {
      throw new SessionError(ErrorCodes.SESSION_FULL, 'Session is full', 400);
    }

    // Check if user already joined
    const existingParticipant = participants.find((p) => p.userId === userId);
    if (existingParticipant && existingParticipant.state === 'joined') {
      return existingParticipant;
    }

    // Upsert participant
    const { data, error } = await supabase
      .from('session_participants')
      .upsert(
        {
          user_id: userId,
          session_id: sessionId,
          role: 'player',
          state: 'joined',
        },
        {
          onConflict: 'user_id,session_id',
        }
      )
      .select()
      .single();

    if (error) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, `Failed to join session: ${error.message}`);
    }

    return {
      userId: data.user_id,
      sessionId: data.session_id,
      role: data.role,
      state: data.state,
    };
  }

  async leaveSession(sessionId: string, userId: string): Promise<void> {
    const supabase = getSupabase();

    // Update participant state to 'left'
    const { error } = await supabase
      .from('session_participants')
      .update({ state: 'left' })
      .eq('session_id', sessionId)
      .eq('user_id', userId);

    if (error) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, `Failed to leave session: ${error.message}`);
    }
  }
}
