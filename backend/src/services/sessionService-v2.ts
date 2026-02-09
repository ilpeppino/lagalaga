import { getSupabase } from '../config/supabase.js';
import { SessionError, ErrorCodes, AppError, ValidationError } from '../utils/errors.js';
import { RobloxLinkNormalizer } from './roblox-link-normalizer.js';

export type SessionVisibility = 'public' | 'friends' | 'invite_only';
export type SessionStatus = 'scheduled' | 'active' | 'completed' | 'cancelled';
export type ParticipantRole = 'host' | 'member';
export type ParticipantState = 'invited' | 'joined' | 'left' | 'kicked';

export interface CreateSessionInput {
  hostUserId: string;
  robloxUrl: string;
  title: string;
  description?: string;
  visibility?: SessionVisibility;
  maxParticipants?: number;
  scheduledStart?: string; // ISO 8601 timestamp
}

export interface SessionWithInvite {
  session: {
    id: string;
    placeId: number;
    hostId: string;
    title: string;
    description?: string;
    visibility: SessionVisibility;
    status: SessionStatus;
    maxParticipants: number;
    currentParticipants: number;
    scheduledStart?: string;
    game: {
      placeId: number;
      canonicalWebUrl: string;
      canonicalStartUrl: string;
      gameName?: string;
    };
    createdAt: string;
  };
  inviteLink: string;
}

/**
 * Generate a random 9-character alphanumeric invite code
 * Excludes ambiguous characters (0, O, I, l)
 */
function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 9; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export class SessionServiceV2 {
  private normalizer: RobloxLinkNormalizer;

  constructor() {
    this.normalizer = new RobloxLinkNormalizer();
  }

  private parseShareLink(inputUrl: string): { canonicalUrl: string; normalizedFrom: string } | null {
    let url: URL;
    try {
      url = new URL(inputUrl);
    } catch {
      return null;
    }

    if (url.hostname !== 'www.roblox.com' && url.hostname !== 'roblox.com') {
      return null;
    }

    // Roblox mobile "Share" produces URLs like:
    // https://www.roblox.com/share?code=...&type=ExperienceDetails&stamp=...
    // These do not include a placeId. We keep them as canonical URLs and let the
    // client open them directly (Roblox app will resolve using user cookies).
    if (url.pathname !== '/share' && url.pathname !== '/share-links') {
      return null;
    }

    const code = url.searchParams.get('code');
    const type = url.searchParams.get('type');
    if (!code || !type) return null;

    const canonical = new URL('https://www.roblox.com/share-links');
    canonical.searchParams.set('code', code);
    canonical.searchParams.set('type', type);

    return { canonicalUrl: canonical.toString(), normalizedFrom: 'share_link' };
  }

  /**
   * Create a new session with host participant and invite link
   * This is an atomic operation that:
   * 1. Normalizes the Roblox URL
   * 2. Upserts the game record
   * 3. Creates the session
   * 4. Adds host as participant
   * 5. Generates invite code and link
   */
  async createSession(input: CreateSessionInput): Promise<SessionWithInvite> {
    const supabase = getSupabase();

    const share = this.parseShareLink(input.robloxUrl);

    // Step 1: Normalize Roblox link (placeId-based), unless this is a share link.
    let normalized:
      | (Awaited<ReturnType<RobloxLinkNormalizer['normalize']>> & { placeId: number })
      | null = null;
    if (!share) {
      try {
        normalized = await this.normalizer.normalize(input.robloxUrl);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Invalid Roblox URL';
        throw new ValidationError(message, { robloxUrl: input.robloxUrl });
      }

      // Step 2: Upsert game record (requires placeId)
      const { error: gameError } = await supabase
        .from('games')
        .upsert(
          {
            place_id: normalized.placeId,
            canonical_web_url: normalized.canonicalWebUrl,
            canonical_start_url: normalized.canonicalStartUrl,
          },
          {
            onConflict: 'place_id',
            ignoreDuplicates: false,
          }
        );

      if (gameError) {
        throw new AppError(ErrorCodes.INTERNAL_ERROR, `Failed to upsert game: ${gameError.message}`);
      }
    }

    // Step 3: Create session
    const { data: sessionData, error: sessionError } = await supabase
      .from('sessions')
      .insert({
        place_id: normalized?.placeId ?? null,
        host_id: input.hostUserId,
        title: input.title,
        description: input.description,
        visibility: input.visibility || 'public',
        max_participants: input.maxParticipants || 10,
        scheduled_start: input.scheduledStart,
        original_input_url: normalized?.originalInputUrl ?? share?.canonicalUrl ?? input.robloxUrl,
        normalized_from: normalized?.normalizedFrom ?? share?.normalizedFrom ?? 'unknown',
        status: input.scheduledStart ? 'scheduled' : 'active',
      })
      .select()
      .single();

    if (sessionError) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, `Failed to create session: ${sessionError.message}`);
    }

    // Step 4: Add host as participant
    const { error: participantError } = await supabase.from('session_participants').insert({
      session_id: sessionData.id,
      user_id: input.hostUserId,
      role: 'host',
      state: 'joined',
    });

    if (participantError) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, `Failed to add host participant: ${participantError.message}`);
    }

    // Step 5: Generate invite code and create invite record
    const inviteCode = generateInviteCode();
    const { error: inviteError } = await supabase
      .from('session_invites')
      .insert({
        session_id: sessionData.id,
        created_by: input.hostUserId,
        invite_code: inviteCode,
      })
      .select()
      .single();

    if (inviteError) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, `Failed to create invite: ${inviteError.message}`);
    }

    // Step 6: Get game data for response (if we have placeId)
    let gameData: any = null;
    if (normalized?.placeId) {
      const { data } = await supabase
        .from('games')
        .select('*')
        .eq('place_id', normalized.placeId)
        .single();
      gameData = data;
    }

    const canonicalUrl = normalized?.canonicalWebUrl ?? share?.canonicalUrl ?? input.robloxUrl;

    return {
      session: {
        id: sessionData.id,
        placeId: sessionData.place_id ?? 0,
        hostId: sessionData.host_id,
        title: sessionData.title,
        description: sessionData.description,
        visibility: sessionData.visibility,
        status: sessionData.status,
        maxParticipants: sessionData.max_participants,
        currentParticipants: 1, // Host is the first participant
        scheduledStart: sessionData.scheduled_start,
        game: {
          placeId: normalized?.placeId ?? 0,
          canonicalWebUrl: canonicalUrl,
          canonicalStartUrl: canonicalUrl,
          gameName: gameData?.game_name,
        },
        createdAt: sessionData.created_at,
      },
      inviteLink: `lagalaga://invite/${inviteCode}`,
    };
  }

  /**
   * List sessions with filtering and pagination
   */
  async listSessions(params: {
    status?: SessionStatus;
    visibility?: SessionVisibility;
    placeId?: number;
    hostId?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<{
    sessions: any[];
    pagination: {
      total: number;
      limit: number;
      offset: number;
      hasMore: boolean;
    };
  }> {
    const supabase = getSupabase();
    const limit = params.limit || 20;
    const offset = params.offset || 0;

    let query = supabase
      .from('sessions')
      .select(
        `
        *,
        games(*),
        session_participants(count)
      `,
        { count: 'exact' }
      )
      .eq('status', params.status || 'active');

    if (params.visibility) {
      query = query.eq('visibility', params.visibility);
    }
    if (params.placeId) {
      query = query.eq('place_id', params.placeId);
    }
    if (params.hostId) {
      query = query.eq('host_id', params.hostId);
    }

    const { data, error, count } = await query
      .order('scheduled_start', { ascending: true, nullsFirst: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, `Failed to list sessions: ${error.message}`);
    }

    const sessions = (data || []).map((row: any) => ({
      id: row.id,
      placeId: row.place_id ?? 0,
      hostId: row.host_id,
      title: row.title,
      description: row.description,
      visibility: row.visibility,
      status: row.status,
      maxParticipants: row.max_participants,
      currentParticipants: row.session_participants?.[0]?.count || 0,
      scheduledStart: row.scheduled_start,
      game: {
        placeId: row.games?.place_id ?? row.place_id ?? 0,
        gameName: row.games?.game_name,
        canonicalWebUrl: row.games?.canonical_web_url ?? row.original_input_url,
        canonicalStartUrl: row.games?.canonical_start_url ?? row.original_input_url,
      },
      createdAt: row.created_at,
    }));

    return {
      sessions,
      pagination: {
        total: count || 0,
        limit,
        offset,
        hasMore: offset + limit < (count || 0),
      },
    };
  }

  /**
   * Get session details with participants
   */
  async getSessionById(sessionId: string): Promise<any | null> {
    const supabase = getSupabase();

    const { data: sessionData, error: sessionError } = await supabase
      .from('sessions')
      .select(
        `
        *,
        games(*),
        session_participants(*),
        session_invites(invite_code)
      `
      )
      .eq('id', sessionId)
      .single() as { data: any; error: any };

    if (sessionError) {
      if (sessionError.code === 'PGRST116') {
        return null;
      }
      throw new AppError(ErrorCodes.INTERNAL_ERROR, `Failed to get session: ${sessionError.message}`);
    }

    return {
      id: sessionData.id,
      placeId: sessionData.place_id ?? 0,
      hostId: sessionData.host_id,
      title: sessionData.title,
      description: sessionData.description,
      visibility: sessionData.visibility,
      status: sessionData.status,
      maxParticipants: sessionData.max_participants,
      scheduledStart: sessionData.scheduled_start,
      game: {
        placeId: sessionData.games?.place_id ?? sessionData.place_id ?? 0,
        gameName: sessionData.games?.game_name,
        canonicalWebUrl: sessionData.games?.canonical_web_url ?? sessionData.original_input_url,
        canonicalStartUrl: sessionData.games?.canonical_start_url ?? sessionData.original_input_url,
      },
      participants: sessionData.session_participants.map((p: any) => ({
        userId: p.user_id,
        role: p.role,
        state: p.state,
        joinedAt: p.joined_at,
      })),
      inviteLink: sessionData.session_invites?.[0]?.invite_code
        ? `lagalaga://invite/${sessionData.session_invites[0].invite_code}`
        : null,
      createdAt: sessionData.created_at,
    };
  }

  /**
   * Join a session
   */
  async joinSession(
    sessionId: string,
    userId: string,
    inviteCode?: string
  ): Promise<{ session: any }> {
    const supabase = getSupabase();

    // Fetch session
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select(
        `
        *,
        session_participants(count)
      `
      )
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      throw new SessionError(ErrorCodes.SESSION_NOT_FOUND, 'Session not found', 404);
    }

    // Check capacity
    const currentCount = session.session_participants[0]?.count || 0;
    if (currentCount >= session.max_participants) {
      throw new SessionError(ErrorCodes.SESSION_FULL, 'This session is at maximum capacity', 400);
    }

    // Check visibility
    if (session.visibility === 'invite_only' && !inviteCode) {
      throw new SessionError(ErrorCodes.FORBIDDEN, 'This session requires an invite code', 403);
    }

    // Validate invite code if provided
    if (inviteCode) {
      const { data: invite, error: inviteError } = await supabase
        .from('session_invites')
        .select('*')
        .eq('invite_code', inviteCode)
        .eq('session_id', sessionId)
        .single();

      if (inviteError || !invite) {
        throw new SessionError(ErrorCodes.FORBIDDEN, 'Invalid invite code', 400);
      }

      // Check invite expiry
      if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
        throw new SessionError(ErrorCodes.FORBIDDEN, 'This invite has expired', 400);
      }

      // Check invite usage
      if (invite.max_uses && invite.uses_count >= invite.max_uses) {
        throw new SessionError(ErrorCodes.FORBIDDEN, 'This invite has been fully used', 400);
      }

      // Increment uses_count
      await supabase
        .from('session_invites')
        .update({ uses_count: invite.uses_count + 1 })
        .eq('id', invite.id);
    }

    // Check if already joined
    const { data: existing } = await supabase
      .from('session_participants')
      .select('*')
      .eq('session_id', sessionId)
      .eq('user_id', userId)
      .single();

    if (existing && existing.state === 'joined') {
      throw new SessionError(ErrorCodes.BAD_REQUEST, 'You have already joined this session', 400);
    }

    // Insert participant
    const { error: participantError } = await supabase.from('session_participants').upsert({
      session_id: sessionId,
      user_id: userId,
      role: 'member',
      state: 'joined',
      joined_at: new Date().toISOString(),
    });

    if (participantError) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, `Failed to join session: ${participantError.message}`);
    }

    // Return updated session
    const updatedSession = await this.getSessionById(sessionId);
    return { session: updatedSession };
  }
}
