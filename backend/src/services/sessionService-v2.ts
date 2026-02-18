import { getSupabase } from '../config/supabase.js';
import { SessionError, ErrorCodes, AppError, ValidationError } from '../utils/errors.js';
import { RobloxLinkNormalizer } from './roblox-link-normalizer.js';
import { RobloxEnrichmentService } from './roblox-enrichment.service.js';
import { PushNotificationService } from './pushNotificationService.js';
import { logger } from '../lib/logger.js';
import { sanitize } from '../lib/sanitizer.js';
import { request } from 'undici';
import { metrics } from '../plugins/metrics.js';

export type SessionVisibility = 'public' | 'friends' | 'invite_only';
export type SessionStatus = 'scheduled' | 'active' | 'completed' | 'cancelled';
export type ParticipantRole = 'host' | 'member';
export type ParticipantState = 'invited' | 'joined' | 'left' | 'kicked';
export type ParticipantHandoffState = 'rsvp_joined' | 'opened_roblox' | 'confirmed_in_game' | 'stuck';

export interface CreateSessionInput {
  hostUserId: string;
  robloxUrl: string;
  title: string;
  visibility?: SessionVisibility;
  isRanked?: boolean;
  maxParticipants?: number;
  scheduledStart?: string; // ISO 8601 timestamp
  invitedRobloxUserIds?: number[];
}

export interface SessionWithInvite {
  session: {
    id: string;
    placeId: number;
    hostId: string;
    title: string;
    description?: string;
    visibility: SessionVisibility;
    isRanked: boolean;
    status: SessionStatus;
    maxParticipants: number;
    currentParticipants: number;
    scheduledStart?: string;
    game: {
      placeId: number;
      canonicalWebUrl: string;
      canonicalStartUrl: string;
      gameName?: string;
      thumbnailUrl?: string;
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
  private enrichmentService: RobloxEnrichmentService;

  constructor() {
    this.normalizer = new RobloxLinkNormalizer();
    this.enrichmentService = new RobloxEnrichmentService();
  }

  private isMissingHandoffStateColumn(error: { message?: string } | null | undefined): boolean {
    const message = error?.message ?? '';
    return (
      /Could not find the 'handoff_state' column of 'session_participants' in the schema cache/i.test(message) ||
      /column .*handoff_state.* does not exist/i.test(message)
    );
  }

  private async insertParticipant(
    supabase: ReturnType<typeof getSupabase>,
    payload: {
      session_id: string;
      user_id: string;
      role: ParticipantRole;
      state: ParticipantState;
      handoff_state: ParticipantHandoffState;
      joined_at?: string;
    }
  ): Promise<{ message?: string } | null> {
    const primary = await supabase.from('session_participants').insert(payload);
    if (!primary.error) {
      return null;
    }

    if (!this.isMissingHandoffStateColumn(primary.error)) {
      return primary.error;
    }

    logger.warn(
      { error: primary.error.message },
      'session_participants.handoff_state missing; retrying participant insert without handoff_state'
    );

    const { handoff_state: _handoffState, ...fallbackPayload } = payload;
    const fallback = await supabase.from('session_participants').insert(fallbackPayload);
    return fallback.error;
  }

  private async upsertParticipant(
    supabase: ReturnType<typeof getSupabase>,
    payload: {
      session_id: string;
      user_id: string;
      role: ParticipantRole;
      state: ParticipantState;
      handoff_state: ParticipantHandoffState;
      joined_at?: string;
    }
  ): Promise<{ message?: string } | null> {
    const primary = await supabase.from('session_participants').upsert(payload);
    if (!primary.error) {
      return null;
    }

    if (!this.isMissingHandoffStateColumn(primary.error)) {
      return primary.error;
    }

    logger.warn(
      { error: primary.error.message },
      'session_participants.handoff_state missing; retrying participant upsert without handoff_state'
    );

    const { handoff_state: _handoffState, ...fallbackPayload } = payload;
    const fallback = await supabase.from('session_participants').upsert(fallbackPayload);
    return fallback.error;
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

  private async resolveShareLinkPlaceId(canonicalUrl: string): Promise<number | null> {
    try {
      const response = await request(canonicalUrl, {
        method: 'GET',
        headers: {
          'user-agent': 'lagalaga-backend/1.0',
          accept: 'text/html',
        },
      });

      if (response.statusCode >= 400) {
        logger.warn({ canonicalUrl, statusCode: response.statusCode }, 'Share link lookup returned non-2xx status');
        return null;
      }

      const html = await response.body.text();

      // Roblox share pages expose start place id in meta tags.
      const metaMatch = html.match(/name=["']roblox:start_place_id["']\s+content=["'](\d+)["']/i);
      if (metaMatch?.[1]) {
        const parsed = Number.parseInt(metaMatch[1], 10);
        return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
      }

      return null;
    } catch (error) {
      logger.warn(
        {
          canonicalUrl,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to resolve placeId from Roblox share link'
      );
      return null;
    }
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
    const invitedRobloxUserIds = normalizeInvitedRobloxUserIds(input.invitedRobloxUserIds);
    const computedMaxParticipants = Math.max(
      input.maxParticipants ?? (1 + invitedRobloxUserIds.length),
      1
    );

    const share = this.parseShareLink(input.robloxUrl);
    const sharePlaceholderPlaceId = 0;
    const shareResolvedPlaceId = share
      ? await this.resolveShareLinkPlaceId(share.canonicalUrl)
      : null;
    const placeIdForSession = share
      ? (shareResolvedPlaceId ?? sharePlaceholderPlaceId)
      : null;

    // Step 1: Normalize Roblox link (placeId-based), unless this is a share link.
    let normalized:
      | (Awaited<ReturnType<RobloxLinkNormalizer['normalize']>> & { placeId: number })
      | null = null;
    if (share) {
      // The current DB schema requires a non-null place_id (and typically a FK to games.place_id).
      // Roblox share links don't expose a placeId, so we use a reserved placeholder.
      const canonicalUrl = share.canonicalUrl;

      const { error: gameError } = await supabase
        .from('games')
        .upsert(
          {
            place_id: placeIdForSession,
            canonical_web_url: canonicalUrl,
            canonical_start_url: canonicalUrl,
          },
          {
            onConflict: 'place_id',
            ignoreDuplicates: false,
          }
        );

      if (gameError) {
        throw new AppError(ErrorCodes.INTERNAL_ERROR, `Failed to upsert share-link placeholder game: ${gameError.message}`);
      }
    } else {
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
        place_id: normalized?.placeId ?? placeIdForSession,
        host_id: input.hostUserId,
        title: input.title,
        visibility: input.visibility || 'public',
        is_ranked: input.isRanked ?? false,
        max_participants: computedMaxParticipants,
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

    if (input.isRanked) {
      metrics.rankedSessionsCreatedTotal.inc();
      logger.info(
        sanitize({
          sessionId: sessionData.id,
          hostUserId: input.hostUserId,
          visibility: input.visibility || 'public',
        }),
        'Ranked session created'
      );
    }

    // Step 4: Add host as participant
    const participantError = await this.insertParticipant(supabase, {
      session_id: sessionData.id,
      user_id: input.hostUserId,
      role: 'host',
      state: 'joined',
      handoff_state: 'rsvp_joined',
    });

    if (participantError) {
      // Structural consistency: do not leave orphan session if host participant insert fails.
      await supabase.from('sessions').delete().eq('id', sessionData.id);
      throw new AppError(ErrorCodes.INTERNAL_ERROR, `Failed to add host participant: ${participantError.message}`);
    }

    if (invitedRobloxUserIds.length > 0) {
      const { error: invitedError } = await supabase
        .from('session_invited_roblox')
        .insert(
          invitedRobloxUserIds.map((robloxUserId) => ({
            session_id: sessionData.id,
            roblox_user_id: robloxUserId,
          }))
        );

      if (invitedError) {
        await supabase.from('session_participants').delete().eq('session_id', sessionData.id);
        await supabase.from('sessions').delete().eq('id', sessionData.id);
        throw new AppError(ErrorCodes.INTERNAL_ERROR, `Failed to store invited Roblox users: ${invitedError.message}`);
      }

      const { data: resolvedUsers, error: resolveError } = await supabase
        .from('app_users')
        .select('id, roblox_user_id')
        .in('roblox_user_id', invitedRobloxUserIds);

      if (resolveError) {
        logger.warn(
          { error: resolveError.message, sessionId: sessionData.id },
          'Failed to resolve invited Roblox users to app_users'
        );
      }

      const appUsers = resolvedUsers ?? [];
      const pushService = new PushNotificationService();
      for (const appUser of appUsers) {
        if (appUser.id === input.hostUserId) {
          continue;
        }

        const invitedParticipantError = await this.insertParticipant(supabase, {
          session_id: sessionData.id,
          user_id: appUser.id,
          role: 'member',
          state: 'invited',
          handoff_state: 'rsvp_joined',
        });

        if (invitedParticipantError) {
          logger.warn(
            { userId: appUser.id, sessionId: sessionData.id, error: invitedParticipantError.message },
            'Failed to insert invited participant'
          );
        }

        void pushService
          .sendSessionInviteNotification(
            appUser.id,
            sessionData.id,
            input.title
          )
          .catch((err) => {
            logger.warn(
              {
                userId: appUser.id,
                sessionId: sessionData.id,
                error: err instanceof Error ? err.message : String(err),
              },
              'Push notification send failed'
            );
          });
      }
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
      // Structural consistency: rollback previous writes when invite creation fails.
      await supabase.from('session_participants').delete().eq('session_id', sessionData.id);
      await supabase.from('sessions').delete().eq('id', sessionData.id);
      throw new AppError(ErrorCodes.INTERNAL_ERROR, `Failed to create invite: ${inviteError.message}`);
    }

    // Step 6: Get game data for response (if we have placeId)
    let gameData: any = null;
    const placeIdForGame = normalized?.placeId ?? placeIdForSession;
    if (placeIdForGame !== null) {
      const { data } = await supabase
        .from('games')
        .select('*')
        .eq('place_id', placeIdForGame)
        .single();
      gameData = data;
    }

    const canonicalUrl = normalized?.canonicalWebUrl ?? share?.canonicalUrl ?? input.robloxUrl;

    // Enrich game data in background (non-blocking)
    if (placeIdForGame && placeIdForGame > 0) {
      this.enrichmentService
        .enrichGame(placeIdForGame)
        .catch((err) => {
          logger.warn(
            { placeId: placeIdForGame, sessionId: sessionData.id, error: err.message },
            'Game enrichment failed during session creation'
          );
        });
    }

    return {
      session: {
        id: sessionData.id,
        placeId: sessionData.place_id ?? 0,
        hostId: sessionData.host_id,
        title: sessionData.title,
        description: sessionData.description,
        visibility: sessionData.visibility,
        isRanked: Boolean(sessionData.is_ranked),
        status: sessionData.status,
        maxParticipants: sessionData.max_participants,
        currentParticipants: 1, // Host is the first participant
        scheduledStart: sessionData.scheduled_start,
        game: {
          placeId: placeIdForGame ?? 0,
          canonicalWebUrl: canonicalUrl,
          canonicalStartUrl: canonicalUrl,
          gameName: gameData?.game_name,
          thumbnailUrl: gameData?.thumbnail_url,
        },
        createdAt: sessionData.created_at,
      },
      inviteLink: `lagalaga://invite/${inviteCode}`,
    };
  }

  /**
   * List sessions with filtering and pagination
   * Uses optimized PostgreSQL function to eliminate N+1 query problem
   */
  async listSessions(params: {
    status?: SessionStatus;
    visibility?: SessionVisibility;
    placeId?: number;
    hostId?: string;
    requesterId?: string | null;
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

    const rpcParams = {
      p_status: params.status || null,
      p_visibility: params.visibility || null,
      p_place_id: params.placeId || null,
      p_host_id: params.hostId || null,
      p_requester_id: params.requesterId || null,
      p_limit: limit,
      p_offset: offset,
    };

    // Prefer requester-aware RPC signature; fall back to legacy signature if DB is not migrated yet.
    let { data, error } = await supabase.rpc('list_sessions_optimized', rpcParams);
    if (error && /Could not find the function public\.list_sessions_optimized/i.test(error.message)) {
      logger.warn(
        { error: error.message },
        'Falling back to legacy list_sessions_optimized signature without requester filtering'
      );
      const fallback = await supabase.rpc('list_sessions_optimized', {
        p_status: params.status || null,
        p_visibility: params.visibility || null,
        p_place_id: params.placeId || null,
        p_host_id: params.hostId || null,
        p_limit: limit,
        p_offset: offset,
      });
      data = fallback.data;
      error = fallback.error;
    }

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
      isRanked: Boolean(row.is_ranked),
      status: row.status,
      maxParticipants: row.max_participants,
      currentParticipants: Number(row.participant_count) || 0,
      scheduledStart: row.scheduled_start,
      game: {
        placeId: row.game_place_id ?? row.place_id ?? 0,
        gameName: row.game_name,
        thumbnailUrl: row.thumbnail_url,
        canonicalWebUrl: row.canonical_web_url ?? row.original_input_url,
        canonicalStartUrl: row.canonical_start_url ?? row.original_input_url,
      },
      createdAt: row.created_at,
    }));

    const total = data && data.length > 0 ? Number(data[0].total_count) : 0;

    return {
      sessions,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    };
  }

  /**
   * List user's planned sessions (scheduled or active sessions they are hosting)
   * Uses optimized PostgreSQL function to eliminate N+1 query problem
   */
  async listUserPlannedSessions(
    userId: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<{
    sessions: any[];
    pagination: {
      total: number;
      limit: number;
      offset: number;
      hasMore: boolean;
    };
  }> {
    const supabase = getSupabase();

    // Use optimized RPC function instead of nested selects
    // This eliminates N+1 query problem and uses composite index
    const { data, error } = await supabase.rpc('list_user_planned_sessions_optimized', {
      p_user_id: userId,
      p_limit: limit,
      p_offset: offset,
    });

    if (error) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, `Failed to list user sessions: ${error.message}`);
    }

    const sessions = (data || []).map((row: any) => ({
      id: row.id,
      placeId: row.place_id ?? 0,
      hostId: row.host_id,
      title: row.title,
      description: row.description,
      visibility: row.visibility,
      isRanked: Boolean(row.is_ranked),
      status: row.status,
      maxParticipants: row.max_participants,
      currentParticipants: Number(row.participant_count) || 0,
      scheduledStart: row.scheduled_start,
      game: {
        placeId: row.game_place_id ?? row.place_id ?? 0,
        gameName: row.game_name,
        thumbnailUrl: row.thumbnail_url,
        canonicalWebUrl: row.canonical_web_url ?? row.original_input_url,
        canonicalStartUrl: row.canonical_start_url ?? row.original_input_url,
      },
      createdAt: row.created_at,
    }));

    const total = data && data.length > 0 ? Number(data[0].total_count) : 0;

    return {
      sessions,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    };
  }

  /**
   * Delete a session (soft delete by setting status to 'cancelled')
   * Only the host can delete their session
   */
  async deleteSession(sessionId: string, userId: string): Promise<void> {
    const supabase = getSupabase();

    // Verify session exists and user is the host
    const { data: session, error: fetchError } = await supabase
      .from('sessions')
      .select('host_id')
      .eq('id', sessionId)
      .single();

    if (fetchError || !session) {
      throw new SessionError(ErrorCodes.SESSION_NOT_FOUND, 'Session not found', 404);
    }

    if (session.host_id !== userId) {
      throw new SessionError(ErrorCodes.FORBIDDEN, 'Only the host can delete this session', 403);
    }

    // Soft delete by updating status to 'cancelled'
    const { error: updateError } = await supabase
      .from('sessions')
      .update({ status: 'cancelled' })
      .eq('id', sessionId);

    if (updateError) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, `Failed to delete session: ${updateError.message}`);
    }
  }

  /**
   * Bulk delete sessions (soft delete by setting status to 'cancelled')
   * Only deletes sessions hosted by the requester
   */
  async bulkDeleteSessions(sessionIds: string[], userId: string): Promise<number> {
    const supabase = getSupabase();

    if (sessionIds.length === 0) {
      return 0;
    }

    // Fetch sessions to verify ownership
    const { data: sessions, error: fetchError } = await supabase
      .from('sessions')
      .select('id, host_id')
      .in('id', sessionIds);

    if (fetchError) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, `Failed to fetch sessions: ${fetchError.message}`);
    }

    // Filter to only sessions hosted by the user
    const validSessionIds = (sessions || [])
      .filter((session: any) => session.host_id === userId)
      .map((session: any) => session.id);

    if (validSessionIds.length === 0) {
      return 0;
    }

    // Soft delete by updating status to 'cancelled'
    const { error: updateError } = await supabase
      .from('sessions')
      .update({ status: 'cancelled' })
      .in('id', validSessionIds);

    if (updateError) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, `Failed to delete sessions: ${updateError.message}`);
    }

    return validSessionIds.length;
  }

  /**
   * Get session details with participants
   */
  async getSessionById(sessionId: string, requesterId?: string | null): Promise<any | null> {
    const supabase = getSupabase();

    const { data: sessionData, error: sessionError } = await supabase
      .from('sessions')
      .select(
        `
        *,
        games(*)
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

    if (sessionData.visibility === 'friends') {
      const allowed = await this.canAccessFriendsOnlySession(sessionData.id, sessionData.host_id, requesterId ?? null);
      metrics.incrementCounter('friends_session_filter_total', { result: allowed ? 'allowed' : 'denied' });
      if (!allowed) {
        return null;
      }
    }

    const { data: participantsData, error: participantsError } = await supabase
      .from('session_participants')
      .select('*')
      .eq('session_id', sessionId);

    if (participantsError) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, `Failed to get participants: ${participantsError.message}`);
    }

    const participantUserIds = Array.from(
      new Set((participantsData ?? []).map((participant: any) => participant.user_id).filter(Boolean))
    ) as string[];
    const { data: participantProfiles, error: participantProfilesError } = participantUserIds.length > 0
      ? await supabase
        .from('app_users')
        .select('id, roblox_display_name, roblox_username')
        .in('id', participantUserIds)
      : { data: [], error: null };

    if (participantProfilesError) {
      throw new AppError(
        ErrorCodes.INTERNAL_ERROR,
        `Failed to get participant profiles: ${participantProfilesError.message}`
      );
    }

    const { data: invitedRobloxRows, error: invitedRobloxError } = await supabase
      .from('session_invited_roblox')
      .select('roblox_user_id')
      .eq('session_id', sessionId);

    if (invitedRobloxError) {
      throw new AppError(
        ErrorCodes.INTERNAL_ERROR,
        `Failed to get invited Roblox users: ${invitedRobloxError.message}`
      );
    }

    const invitedRobloxUserIds = Array.from(
      new Set((invitedRobloxRows ?? []).map((row: any) => String(row.roblox_user_id)).filter(Boolean))
    );
    const { data: invitedAppUsers, error: invitedAppUsersError } = invitedRobloxUserIds.length > 0
      ? await supabase
        .from('app_users')
        .select('id, roblox_user_id, roblox_display_name, roblox_username')
        .in('roblox_user_id', invitedRobloxUserIds)
      : { data: [], error: null };

    if (invitedAppUsersError) {
      throw new AppError(
        ErrorCodes.INTERNAL_ERROR,
        `Failed to resolve invited Roblox users: ${invitedAppUsersError.message}`
      );
    }

    const { data: hostFriendsCache, error: hostFriendsCacheError } = invitedRobloxUserIds.length > 0
      ? await supabase
        .from('roblox_friends_cache')
        .select('friends_json')
        .eq('user_id', sessionData.host_id)
        .maybeSingle<{ friends_json: unknown }>()
      : { data: null, error: null };

    if (hostFriendsCacheError) {
      throw new AppError(
        ErrorCodes.INTERNAL_ERROR,
        `Failed to load host Roblox friends cache: ${hostFriendsCacheError.message}`
      );
    }

    const displayNameByUserId = new Map<string, string>();
    for (const profile of participantProfiles ?? []) {
      const displayName = profile.roblox_display_name?.trim() || profile.roblox_username?.trim() || '';
      if (displayName) {
        displayNameByUserId.set(profile.id, displayName);
      }
    }

    const invitedUserByRobloxId = new Map<string, { appUserId: string | null; displayName: string | null }>();
    for (const invitedUser of invitedAppUsers ?? []) {
      const robloxUserId = invitedUser.roblox_user_id?.trim();
      if (!robloxUserId) {
        continue;
      }
      const displayName = invitedUser.roblox_display_name?.trim() || invitedUser.roblox_username?.trim() || null;
      invitedUserByRobloxId.set(robloxUserId, {
        appUserId: invitedUser.id ?? null,
        displayName,
      });
    }

    const hostFriendDisplayNameByRobloxId = parseHostFriendDisplayNameMap(hostFriendsCache?.friends_json);
    const invitedRobloxUsers = invitedRobloxUserIds.map((robloxUserId) => {
      const invitedAppUser = invitedUserByRobloxId.get(robloxUserId);
      return {
        robloxUserId,
        displayName: invitedAppUser?.displayName ?? hostFriendDisplayNameByRobloxId.get(robloxUserId) ?? null,
        appUserId: invitedAppUser?.appUserId ?? null,
      };
    });

    const { data: inviteData, error: inviteError } = await supabase
      .from('session_invites')
      .select('invite_code')
      .eq('session_id', sessionId)
      .limit(1);

    if (inviteError) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, `Failed to get invites: ${inviteError.message}`);
    }

    const { data: hostProfile, error: hostProfileError } = await supabase
      .from('app_users')
      .select('id, roblox_username, roblox_display_name, avatar_headshot_url')
      .eq('id', sessionData.host_id)
      .maybeSingle();

    if (hostProfileError) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, `Failed to get host profile: ${hostProfileError.message}`);
    }

    return {
      id: sessionData.id,
      placeId: sessionData.place_id ?? 0,
      hostId: sessionData.host_id,
      title: sessionData.title,
      description: sessionData.description,
      visibility: sessionData.visibility,
      isRanked: Boolean(sessionData.is_ranked),
      status: sessionData.status,
      maxParticipants: sessionData.max_participants,
      scheduledStart: sessionData.scheduled_start,
      game: {
        placeId: sessionData.games?.place_id ?? sessionData.place_id ?? 0,
        gameName: sessionData.games?.game_name,
        thumbnailUrl: sessionData.games?.thumbnail_url,
        canonicalWebUrl: sessionData.games?.canonical_web_url ?? sessionData.original_input_url,
        canonicalStartUrl: sessionData.games?.canonical_start_url ?? sessionData.original_input_url,
      },
      participants: (participantsData ?? []).map((p: any) => ({
        userId: p.user_id,
        displayName: displayNameByUserId.get(p.user_id) ?? null,
        role: p.role,
        state: p.state,
        handoffState: p.handoff_state || 'rsvp_joined',
        joinedAt: p.joined_at,
      })),
      invitedRobloxUsers,
      host: {
        userId: sessionData.host_id,
        robloxUsername: hostProfile?.roblox_username ?? null,
        robloxDisplayName: hostProfile?.roblox_display_name ?? null,
        avatarHeadshotUrl: hostProfile?.avatar_headshot_url ?? null,
      },
      inviteLink: inviteData?.[0]?.invite_code
        ? `lagalaga://invite/${inviteData[0].invite_code}`
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
      .select('*')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      throw new SessionError(ErrorCodes.SESSION_NOT_FOUND, 'Session not found', 404);
    }

    if (session.visibility === 'friends') {
      const allowed = await this.canAccessFriendsOnlySession(sessionId, session.host_id, userId);
      metrics.incrementCounter('friends_session_filter_total', { result: allowed ? 'allowed' : 'denied' });
      if (!allowed) {
        throw new SessionError(ErrorCodes.FRIEND_NOT_AUTHORIZED, 'Friends-only session', 403);
      }
    }

    // Check capacity
    const { count: currentCount, error: countError } = await supabase
      .from('session_participants')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', sessionId)
      .eq('state', 'joined');

    if (countError) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, `Failed to count participants: ${countError.message}`);
    }

    if ((currentCount ?? 0) >= session.max_participants) {
      throw new SessionError(ErrorCodes.SESSION_FULL, 'This session is at maximum capacity', 400);
    }

    // Check visibility
    if (session.visibility === 'invite_only' && !inviteCode) {
      const { data: directInvite, error: directInviteError } = await supabase
        .from('session_participants')
        .select('state')
        .eq('session_id', sessionId)
        .eq('user_id', userId)
        .eq('state', 'invited')
        .maybeSingle();

      if (directInviteError) {
        throw new AppError(
          ErrorCodes.INTERNAL_ERROR,
          `Failed to verify direct invite for invite-only session: ${directInviteError.message}`
        );
      }

      if (!directInvite) {
        throw new SessionError(ErrorCodes.FORBIDDEN, 'This session requires an invite code', 403);
      }
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

    // Check if already joined (idempotent operation)
    const { data: existing } = await supabase
      .from('session_participants')
      .select('*')
      .eq('session_id', sessionId)
      .eq('user_id', userId)
      .single();

    if (existing && existing.state === 'joined') {
      // Already joined - return session without error (idempotent)
      logger.info({ sessionId, userId }, 'User already joined session - returning existing session');
      const existingSession = await this.getSessionById(sessionId, userId);
      return { session: existingSession };
    }

    // Insert participant (or update if they left previously)
    const participantError = await this.upsertParticipant(supabase, {
      session_id: sessionId,
      user_id: userId,
      role: 'member',
      state: 'joined',
      handoff_state: 'rsvp_joined',
      joined_at: existing?.joined_at || new Date().toISOString(), // Keep original join time if re-joining
    });

    if (participantError) {
      throw new AppError(ErrorCodes.INTERNAL_ERROR, `Failed to join session: ${participantError.message}`);
    }

    // Return updated session
    const updatedSession = await this.getSessionById(sessionId, userId);
    return { session: updatedSession };
  }

  private async canAccessFriendsOnlySession(
    sessionId: string,
    hostId: string,
    requesterId: string | null
  ): Promise<boolean> {
    if (!requesterId) return false;
    if (requesterId === hostId) return true;

    const supabase = getSupabase();

    const { data: participant } = await supabase
      .from('session_participants')
      .select('session_id')
      .eq('session_id', sessionId)
      .eq('user_id', requesterId)
      .in('state', ['joined', 'invited'])
      .maybeSingle();

    if (participant) {
      return true;
    }

    const ordered = requesterId < hostId
      ? { userId: requesterId, friendId: hostId }
      : { userId: hostId, friendId: requesterId };

    const { data: friendship } = await supabase
      .from('friendships')
      .select('id')
      .eq('user_id', ordered.userId)
      .eq('friend_id', ordered.friendId)
      .eq('status', 'accepted')
      .maybeSingle();

    return Boolean(friendship);
  }

  async updateHandoffState(
    sessionId: string,
    userId: string,
    handoffState: ParticipantHandoffState
  ): Promise<{ sessionId: string; userId: string; handoffState: ParticipantHandoffState }> {
    const supabase = getSupabase();

    const { data: participant, error: participantLookupError } = await supabase
      .from('session_participants')
      .select('session_id, user_id')
      .eq('session_id', sessionId)
      .eq('user_id', userId)
      .maybeSingle();

    if (participantLookupError) {
      throw new AppError(
        ErrorCodes.INTERNAL_ERROR,
        `Failed to load participant for handoff update: ${participantLookupError.message}`
      );
    }

    if (!participant) {
      throw new SessionError(
        ErrorCodes.SESSION_NOT_FOUND,
        'You must join this session before updating handoff state',
        404
      );
    }

    const { error: updateError } = await supabase
      .from('session_participants')
      .update({ handoff_state: handoffState })
      .eq('session_id', sessionId)
      .eq('user_id', userId);

    if (updateError) {
      if (this.isMissingHandoffStateColumn(updateError)) {
        logger.warn(
          { sessionId, userId, handoffState, error: updateError.message },
          'Skipping handoff_state update because session_participants.handoff_state is missing'
        );
        return { sessionId, userId, handoffState };
      }
      throw new AppError(ErrorCodes.INTERNAL_ERROR, `Failed to update handoff state: ${updateError.message}`);
    }

    return { sessionId, userId, handoffState };
  }

  /**
   * Resolve a Roblox user id from linked platform data.
   */
  private async getRobloxUserIdForQuickPlay(userId: string): Promise<string | undefined> {
    const supabase = getSupabase();

    // Query user_platforms to get roblox_user_id
    const { data: userPlatform } = await supabase
      .from('user_platforms')
      .select('platform_user_id')
      .eq('user_id', userId)
      .eq('platform_id', 'roblox')
      .maybeSingle<{ platform_user_id: string | null }>();

    const robloxUserId = userPlatform?.platform_user_id?.trim();
    if (robloxUserId) {
      return robloxUserId;
    }

    // Fallback: check app_users table
    const { data: appUser } = await supabase
      .from('app_users')
      .select('roblox_user_id')
      .eq('id', userId)
      .maybeSingle<{ roblox_user_id: string | null }>();

    const fallbackRobloxUserId = appUser?.roblox_user_id?.trim();
    if (!fallbackRobloxUserId) {
      logger.debug({ userId }, 'No Roblox connection found for quick play place_id resolution');
      return undefined;
    }

    return fallbackRobloxUserId;
  }

  private extractPlaceIdFromFavoriteEntry(entry: Record<string, unknown>): number | undefined {
    const idValue = entry.id;
    if (typeof idValue === 'number' && Number.isInteger(idValue) && idValue > 0) {
      return idValue;
    }
    if (typeof idValue === 'string') {
      const trimmed = idValue.trim();
      if (/^\d+$/.test(trimmed)) {
        const parsed = Number.parseInt(trimmed, 10);
        if (Number.isInteger(parsed) && parsed > 0) {
          return parsed;
        }
      }
    }

    const urlValue = entry.url;
    if (typeof urlValue === 'string' && urlValue.trim()) {
      const gamesMatch = urlValue.match(/\/games\/(\d+)/);
      if (gamesMatch?.[1]) {
        const parsed = Number.parseInt(gamesMatch[1], 10);
        if (Number.isInteger(parsed) && parsed > 0) {
          return parsed;
        }
      }

      const placeIdMatch = urlValue.match(/[?&]placeId=(\d+)/);
      if (placeIdMatch?.[1]) {
        const parsed = Number.parseInt(placeIdMatch[1], 10);
        if (Number.isInteger(parsed) && parsed > 0) {
          return parsed;
        }
      }
    }

    return undefined;
  }

  /**
   * Get a random place_id for quick play from cached favorites.
   */
  private async getRandomQuickPlayPlaceId(userId: string): Promise<number | undefined> {
    const supabase = getSupabase();

    // Preferred source: user_favorites_cache (stores favorites_json for app user)
    const { data: userFavoritesRow, error: userFavoritesError } = await supabase
      .from('user_favorites_cache')
      .select('favorites_json')
      .eq('user_id', userId)
      .maybeSingle<{ favorites_json: Array<Record<string, unknown>> | null }>();

    if (!userFavoritesError && Array.isArray(userFavoritesRow?.favorites_json)) {
      const placeIds = [...new Set(
        userFavoritesRow.favorites_json
          .map((favorite) => this.extractPlaceIdFromFavoriteEntry(favorite))
          .filter((placeId): placeId is number => typeof placeId === 'number' && Number.isInteger(placeId) && placeId > 0)
      )];

      if (placeIds.length > 0) {
        const index = Math.floor(Math.random() * placeIds.length);
        return placeIds[index];
      }
    } else if (userFavoritesError) {
      logger.debug({ userId, error: userFavoritesError.message }, 'Failed to query user_favorites_cache for quick play');
    }

    // Backward compatibility: fallback to legacy roblox_favorites_cache if present.
    const robloxUserId = await this.getRobloxUserIdForQuickPlay(userId);
    if (!robloxUserId) {
      return undefined;
    }

    const { data: favorites, error } = await supabase
      .from('roblox_favorites_cache')
      .select('place_id')
      .eq('roblox_user_id', robloxUserId)
      .order('cached_at', { ascending: false })
      .limit(200);

    if (error) {
      logger.debug({ userId, error: error.message }, 'Failed to query favorites cache for quick play');
      return undefined;
    }

    const placeIds = [...new Set(
      (favorites ?? [])
        .map((favorite: { place_id?: number }) => favorite.place_id)
        .filter((placeId): placeId is number => typeof placeId === 'number' && Number.isInteger(placeId) && placeId > 0)
    )];
    if (placeIds.length === 0) {
      return undefined;
    }

    const index = Math.floor(Math.random() * placeIds.length);
    return placeIds[index];
  }

  /**
   * Create a quick play session with sensible defaults
   */
  async createQuickSession(params: {
    userId: string;
  }): Promise<SessionWithInvite> {
    const { userId } = params;

    // Resolve place_id from favorites cache (random pick).
    const placeId = await this.getRandomQuickPlayPlaceId(userId);

    if (!placeId) {
      throw new ValidationError('No favorite game available for quick play. Connect Roblox and add favorite games first.');
    }

    const robloxUrl = `https://www.roblox.com/games/${placeId}`;

    logger.info(
      { userId, placeId },
      'Creating quick play session'
    );

    metrics.quickSessionsCreatedTotal.inc();

    // Use the standard createSession flow
    return this.createSession({
      hostUserId: userId,
      robloxUrl,
      title: 'Quick Play',
      visibility: 'friends',
      maxParticipants: 6,
      scheduledStart: new Date().toISOString(),
    });
  }

  /**
   * Get session summary for lobby UI
   */
  async getSessionSummary(
    sessionId: string,
    requesterId: string | null
  ): Promise<{
    participantCount: number;
    maxParticipants: number;
    countsByHandoffState: Record<string, number>;
  }> {
    const supabase = getSupabase();

    // Get session basic info
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('max_participants, visibility, host_id, status')
      .eq('id', sessionId)
      .maybeSingle<{
        max_participants: number;
        visibility: SessionVisibility;
        host_id: string;
        status: SessionStatus;
      }>();

    if (sessionError || !session) {
      throw new SessionError(ErrorCodes.SESSION_NOT_FOUND, 'Session not found', 404);
    }

    // Check access based on visibility
    if (session.visibility === 'invite_only' && requesterId !== session.host_id) {
      // Check if requester is a participant
      const { data: participant } = await supabase
        .from('session_participants')
        .select('user_id')
        .eq('session_id', sessionId)
        .eq('user_id', requesterId || '')
        .maybeSingle();

      if (!participant) {
        throw new SessionError(
          ErrorCodes.SESSION_ACCESS_DENIED,
          'You do not have access to this session',
          403
        );
      }
    } else if (session.visibility === 'friends' && requesterId && requesterId !== session.host_id) {
      const areFriends = await this.areFriends(requesterId, session.host_id);
      if (!areFriends) {
        const { data: participant } = await supabase
          .from('session_participants')
          .select('user_id')
          .eq('session_id', sessionId)
          .eq('user_id', requesterId)
          .maybeSingle();

        if (!participant) {
          throw new SessionError(
            ErrorCodes.SESSION_ACCESS_DENIED,
            'You do not have access to this session',
            403
          );
        }
      }
    }

    // Get participant counts
    const { data: participants, error: participantsError } = await supabase
      .from('session_participants')
      .select('handoff_state, state')
      .eq('session_id', sessionId)
      .neq('state', 'left')
      .neq('state', 'kicked');

    if (participantsError) {
      throw new AppError(
        ErrorCodes.INTERNAL_ERROR,
        `Failed to fetch participants: ${participantsError.message}`
      );
    }

    const participantCount = participants?.length ?? 0;

    // Group by handoff_state
    const countsByHandoffState: Record<string, number> = {
      rsvp_joined: 0,
      opened_roblox: 0,
      confirmed_in_game: 0,
      stuck: 0,
      null: 0,
    };

    for (const p of participants || []) {
      const state = p.handoff_state ?? 'null';
      countsByHandoffState[state] = (countsByHandoffState[state] || 0) + 1;
    }

    return {
      participantCount,
      maxParticipants: session.max_participants,
      countsByHandoffState,
    };
  }

  private async areFriends(userIdA: string, userIdB: string): Promise<boolean> {
    const supabase = getSupabase();

    const { data: userA } = await supabase
      .from('app_users')
      .select('roblox_user_id')
      .eq('id', userIdA)
      .single();

    const { data: userB } = await supabase
      .from('app_users')
      .select('roblox_user_id')
      .eq('id', userIdB)
      .single();

    if (!userA?.roblox_user_id || !userB?.roblox_user_id) {
      return false;
    }

    const { data } = await supabase
      .from('roblox_friends_cache')
      .select('roblox_friend_user_id')
      .eq('user_id', userIdA)
      .eq('roblox_friend_user_id', String(userB.roblox_user_id))
      .single();

    return !!data;
  }
}

function normalizeInvitedRobloxUserIds(input?: number[]): number[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return [...new Set(
    input
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0)
  )];
}

function parseHostFriendDisplayNameMap(friendsJson: unknown): Map<string, string> {
  const map = new Map<string, string>();
  if (!Array.isArray(friendsJson)) {
    return map;
  }

  for (const friend of friendsJson) {
    if (!friend || typeof friend !== 'object') {
      continue;
    }
    const idValue = (friend as { id?: unknown }).id;
    const displayNameValue = (friend as { displayName?: unknown }).displayName;
    const robloxUserId = typeof idValue === 'number' ? String(idValue) : typeof idValue === 'string' ? idValue : '';
    const displayName = typeof displayNameValue === 'string' ? displayNameValue.trim() : '';

    if (robloxUserId && displayName) {
      map.set(robloxUserId, displayName);
    }
  }

  return map;
}
