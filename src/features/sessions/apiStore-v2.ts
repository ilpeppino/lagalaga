/**
 * Epic 3 Sessions API Store - Uses v2 backend endpoints
 */

import {
  CreateSessionInput,
  Session,
  SessionDetail,
  ParticipantHandoffState,
  SessionWithInvite,
  ListSessionsParams,
  ListSessionsResponse,
  RobloxFavoritesResponse,
  RobloxFriendsResponse,
  MatchResultResponse,
  LeaderboardResponse,
  MatchHistoryResponse,
} from './types-v2';
import { tokenStorage } from '@/src/lib/tokenStorage';
import { ApiError, NetworkError, isApiError, parseApiError } from '@/src/lib/errors';
import { logger } from '@/src/lib/logger';
import { API_URL } from '@/src/lib/runtimeConfig';

export interface RobloxExperienceResolution {
  placeId?: string;
  universeId?: string;
  name?: string;
}

export interface RobloxPresencePayload {
  available: boolean;
  reason?: string;
  statuses?: {
    userId: string;
    status: 'offline' | 'online' | 'in_game' | 'in_studio' | 'unknown';
    lastOnline?: string | null;
    placeId?: number | null;
  }[];
}

function generateCorrelationId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

type FetchWithAuthOptions = RequestInit & {
  suppressErrorStatusCodes?: number[];
};

/**
 * HTTP client for v2 API endpoints with typed errors
 */
async function fetchWithAuth<T>(endpoint: string, options: FetchWithAuthOptions = {}): Promise<T> {
  const { suppressErrorStatusCodes, ...requestOptions } = options;
  const token = await tokenStorage.getToken();
  const correlationId = generateCorrelationId();

  const headers: Record<string, string> = {
    'X-Correlation-ID': correlationId,
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const incomingHeaders = (options.headers as Record<string, string> | undefined) ?? {};
  const hasContentTypeHeader = Object.keys(incomingHeaders).some(
    (k) => k.toLowerCase() === 'content-type'
  );
  if (options.body != null && !hasContentTypeHeader) {
    headers['Content-Type'] = 'application/json';
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}${endpoint}`, {
      ...requestOptions,
      headers: {
        ...headers,
        ...incomingHeaders,
      },
    });
  } catch (err) {
    throw new NetworkError(
      'Network request failed',
      err instanceof Error ? err : undefined
    );
  }

  if (!response.ok) {
    const apiError = await parseApiError(response);
    const shouldSuppressLog = Array.isArray(suppressErrorStatusCodes) &&
      suppressErrorStatusCodes.includes(response.status);

    if (!shouldSuppressLog) {
      logger.error(`API error: ${apiError.code}`, {
        endpoint,
        statusCode: response.status,
        requestId: apiError.requestId,
      });
    }
    throw apiError;
  }

  return await response.json();
}

class SessionsAPIStoreV2 {
  private async getSessionSummaryFallback(sessionId: string): Promise<{
    participantCount: number;
    maxParticipants: number;
    countsByHandoffState: Record<string, number>;
  }> {
    const session = await this.getSessionById(sessionId);
    const countsByHandoffState: Record<string, number> = {
      rsvp_joined: 0,
      opened_roblox: 0,
      confirmed_in_game: 0,
      stuck: 0,
      null: 0,
    };

    const activeParticipants = session.participants.filter(
      (participant) => participant.state !== 'left' && participant.state !== 'kicked'
    );

    for (const participant of activeParticipants) {
      const state = participant.handoffState ?? 'null';
      countsByHandoffState[state] = (countsByHandoffState[state] || 0) + 1;
    }

    return {
      participantCount: activeParticipants.length,
      maxParticipants: session.maxParticipants,
      countsByHandoffState,
    };
  }

  /**
   * Create a new session
   */
  async createSession(input: CreateSessionInput): Promise<SessionWithInvite> {
    const response = await fetchWithAuth<{ success: boolean; data: SessionWithInvite }>(
      '/api/sessions',
      {
        method: 'POST',
        body: JSON.stringify(input),
      }
    );

    if (!response.success) {
      throw new ApiError({
        code: 'SESSION_005',
        message: 'Failed to create session',
        statusCode: 500,
      });
    }

    return response.data;
  }

  /**
   * Resolve Roblox experience metadata from a pasted URL.
   */
  async resolveExperience(url: string): Promise<RobloxExperienceResolution> {
    return fetchWithAuth<RobloxExperienceResolution>(
      '/roblox/resolve-experience',
      {
        method: 'POST',
        body: JSON.stringify({ url }),
      }
    );
  }

  /**
   * List current user's Roblox favorite games.
   */
  async listMyRobloxFavorites(params: {
    limit?: number;
    cursor?: string;
  } = {}): Promise<RobloxFavoritesResponse> {
    const queryParams = new URLSearchParams();
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.cursor) queryParams.append('cursor', params.cursor);

    const query = queryParams.toString();
    const response = await fetchWithAuth<{ success: boolean; data: RobloxFavoritesResponse }>(
      `/api/me/roblox/favorites${query ? `?${query}` : ''}`
    );

    if (!response.success) {
      throw new ApiError({
        code: 'INT_001',
        message: 'Failed to load Roblox favorites',
        statusCode: 500,
      });
    }

    return response.data;
  }

  /**
   * List current user's Roblox friends (cached server-side).
   */
  async listMyRobloxFriends(): Promise<RobloxFriendsResponse> {
    const response = await fetchWithAuth<{ success: boolean; data: RobloxFriendsResponse }>(
      '/api/me/roblox/friends'
    );

    if (!response.success) {
      throw new ApiError({
        code: 'INT_001',
        message: 'Failed to load Roblox friends',
        statusCode: 500,
      });
    }

    return response.data;
  }

  /**
   * List sessions with filters and pagination
   */
  async listSessions(params: ListSessionsParams = {}): Promise<ListSessionsResponse> {
    const queryParams = new URLSearchParams();

    if (params.status) queryParams.append('status', params.status);
    if (params.visibility) queryParams.append('visibility', params.visibility);
    if (params.placeId) queryParams.append('placeId', params.placeId.toString());
    if (params.hostId) queryParams.append('hostId', params.hostId);
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.offset) queryParams.append('offset', params.offset.toString());

    const response = await fetchWithAuth<{ success: boolean; data: ListSessionsResponse }>(
      `/api/sessions?${queryParams.toString()}`
    );

    if (!response.success) {
      throw new ApiError({
        code: 'INT_001',
        message: 'Failed to list sessions',
        statusCode: 500,
      });
    }

    return response.data;
  }

  /**
   * Get session details by ID
   */
  async getSessionById(id: string): Promise<SessionDetail> {
    const response = await fetchWithAuth<{ success: boolean; data: { session: SessionDetail } }>(
      `/api/sessions/${id}`
    );

    if (!response.success) {
      throw new ApiError({
        code: 'SESSION_001',
        message: 'Failed to get session',
        statusCode: 404,
      });
    }

    return response.data.session;
  }

  /**
   * Join a session
   */
  async joinSession(sessionId: string, inviteCode?: string): Promise<SessionDetail> {
    const response = await fetchWithAuth<{ success: boolean; data: { session: SessionDetail } }>(
      `/api/sessions/${sessionId}/join`,
      {
        method: 'POST',
        body: JSON.stringify(inviteCode ? { inviteCode } : {}),
      }
    );

    if (!response.success) {
      throw new ApiError({
        code: 'SESSION_002',
        message: 'Failed to join session',
        statusCode: 400,
      });
    }

    return response.data.session;
  }

  async getInviteDetails(sessionId: string): Promise<{
    session: SessionDetail;
    participantState: string;
  }> {
    const response = await fetchWithAuth<{
      success: boolean;
      data: { session: SessionDetail; participantState: string };
    }>(`/api/sessions/${sessionId}/invite-details`);

    if (!response.success) {
      throw new ApiError({
        code: 'NOT_FOUND_002',
        message: 'Invite not found',
        statusCode: 404,
      });
    }

    return response.data;
  }

  async declineInvite(sessionId: string): Promise<void> {
    const response = await fetchWithAuth<{ success: boolean }>(
      `/api/sessions/${sessionId}/decline-invite`,
      { method: 'POST' }
    );

    if (!response.success) {
      throw new ApiError({
        code: 'SESSION_008',
        message: 'Failed to decline invite',
        statusCode: 400,
      });
    }
  }

  async updateHandoffState(
    sessionId: string,
    state: Exclude<ParticipantHandoffState, 'rsvp_joined'>
  ): Promise<void> {
    const path = state === 'opened_roblox'
      ? 'opened'
      : state === 'confirmed_in_game'
        ? 'confirmed'
        : 'stuck';

    await fetchWithAuth<{ success: boolean }>(
      `/api/sessions/${sessionId}/handoff/${path}`,
      { method: 'POST' }
    );
  }

  async getRobloxPresence(userIds: string[]): Promise<RobloxPresencePayload> {
    if (userIds.length === 0) {
      return { available: false, reason: 'NO_USERS' };
    }

    const params = new URLSearchParams();
    params.set('userIds', userIds.join(','));
    return fetchWithAuth<RobloxPresencePayload>(`/api/presence/roblox/users?${params.toString()}`);
  }

  async getRobloxConnectUrl(): Promise<{ authorizationUrl: string; state: string }> {
    return fetchWithAuth<{ authorizationUrl: string; state: string }>('/api/auth/roblox/start');
  }

  async completeRobloxConnect(code: string, state: string): Promise<{ connected: boolean }> {
    return fetchWithAuth<{ connected: boolean }>('/api/auth/roblox/callback', {
      method: 'POST',
      body: JSON.stringify({ code, state }),
    });
  }

  /**
   * Get session by invite code
   */
  async getSessionByInviteCode(code: string): Promise<{
    sessionId: string;
    session: Partial<Session>;
  }> {
    const response = await fetchWithAuth<{
      success: boolean;
      data: { sessionId: string; session: Partial<Session> };
    }>(`/api/invites/${code}`);

    if (!response.success) {
      throw new ApiError({
        code: 'NOT_FOUND_002',
        message: 'Invalid invite code',
        statusCode: 404,
      });
    }

    return response.data;
  }

  /**
   * List current user's planned sessions
   */
  async listMyPlannedSessions(params: {
    limit?: number;
    offset?: number;
  } = {}): Promise<ListSessionsResponse> {
    const queryParams = new URLSearchParams();

    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.offset) queryParams.append('offset', params.offset.toString());

    const response = await fetchWithAuth<{ success: boolean; data: ListSessionsResponse }>(
      `/api/user/sessions?${queryParams.toString()}`
    );

    if (!response.success) {
      throw new ApiError({
        code: 'INT_001',
        message: 'Failed to list planned sessions',
        statusCode: 500,
      });
    }

    return response.data;
  }

  /**
   * Delete a session
   */
  async deleteSession(id: string): Promise<void> {
    const response = await fetchWithAuth<{ success: boolean }>(
      `/api/sessions/${id}`,
      {
        method: 'DELETE',
      }
    );

    if (!response.success) {
      throw new ApiError({
        code: 'SESSION_006',
        message: 'Failed to delete session',
        statusCode: 500,
      });
    }
  }

  /**
   * Bulk delete sessions
   */
  async bulkDeleteSessions(ids: string[]): Promise<number> {
    const response = await fetchWithAuth<{ success: boolean; data: { deletedCount: number } }>(
      '/api/sessions/bulk-delete',
      {
        method: 'POST',
        body: JSON.stringify({ ids }),
      }
    );

    if (!response.success) {
      throw new ApiError({
        code: 'SESSION_007',
        message: 'Failed to bulk delete sessions',
        statusCode: 500,
      });
    }

    return response.data.deletedCount;
  }

  /**
   * Create a quick play session with sensible defaults
   */
  async createQuickSession(): Promise<SessionWithInvite> {
    const response = await fetchWithAuth<{ success: boolean; data: SessionWithInvite }>(
      '/api/sessions',
      {
        method: 'POST',
        body: JSON.stringify({ template: 'quick' }),
      }
    );

    if (!response.success) {
      throw new ApiError({
        code: 'SESSION_008',
        message: 'Failed to create quick play session',
        statusCode: 500,
      });
    }

    return response.data;
  }

  /**
   * Get session summary for lobby UI
   */
  async getSessionSummary(sessionId: string): Promise<{
    participantCount: number;
    maxParticipants: number;
    countsByHandoffState: Record<string, number>;
  }> {
    try {
      const response = await fetchWithAuth<{
        success: boolean;
        data: {
          participantCount: number;
          maxParticipants: number;
          countsByHandoffState: Record<string, number>;
        };
      }>(`/api/sessions/${sessionId}/summary`, {
        suppressErrorStatusCodes: [404],
      });

      if (!response.success) {
        throw new ApiError({
          code: 'SESSION_009',
          message: 'Failed to fetch session summary',
          statusCode: 500,
        });
      }

      return response.data;
    } catch (error) {
      if (isApiError(error) && error.statusCode === 404) {
        return this.getSessionSummaryFallback(sessionId);
      }
      throw error;
    }
  }

  /**
   * Get user stats and achievements
   */
  async getUserStats(): Promise<{
    stats: {
      userId: string;
      sessionsHosted: number;
      sessionsJoined: number;
      streakDays: number;
      lastActiveDate: string | null;
      createdAt: string;
      updatedAt: string;
    } | null;
    achievements: {
      id: string;
      userId: string;
      code: string;
      unlockedAt: string;
    }[];
  }> {
    const response = await fetchWithAuth<{
      success: boolean;
      data: {
        stats: {
          userId: string;
          sessionsHosted: number;
          sessionsJoined: number;
          streakDays: number;
          lastActiveDate: string | null;
          createdAt: string;
          updatedAt: string;
        } | null;
        achievements: {
          id: string;
          userId: string;
          code: string;
          unlockedAt: string;
        }[];
      };
    }>('/api/me/stats');

    if (!response.success) {
      throw new ApiError({
        code: 'USER_STATS_001',
        message: 'Failed to fetch user stats',
        statusCode: 500,
      });
    }

    return response.data;
  }

  async submitMatchResult(sessionId: string, winnerId: string): Promise<MatchResultResponse> {
    const response = await fetchWithAuth<{ success: boolean; data: MatchResultResponse }>(
      `/api/sessions/${sessionId}/result`,
      {
        method: 'POST',
        body: JSON.stringify({ winnerId }),
      }
    );

    if (!response.success) {
      throw new ApiError({
        code: 'SESSION_010',
        message: 'Failed to submit match result',
        statusCode: 500,
      });
    }

    return response.data;
  }

  async getLeaderboard(type: 'weekly' = 'weekly'): Promise<LeaderboardResponse> {
    const response = await fetchWithAuth<{ success: boolean; data: LeaderboardResponse }>(
      `/api/leaderboard?type=${encodeURIComponent(type)}`
    );

    if (!response.success) {
      throw new ApiError({
        code: 'INT_001',
        message: 'Failed to fetch leaderboard',
        statusCode: 500,
      });
    }

    return response.data;
  }

  async getMyMatchHistory(limit = 20): Promise<MatchHistoryResponse> {
    const query = new URLSearchParams();
    query.set('limit', String(Math.min(Math.max(limit, 1), 50)));

    const response = await fetchWithAuth<{ success: boolean; data: MatchHistoryResponse }>(
      `/api/me/match-history?${query.toString()}`
    );

    if (!response.success) {
      throw new ApiError({
        code: 'INT_001',
        message: 'Failed to fetch match history',
        statusCode: 500,
      });
    }

    return response.data;
  }
}

export const sessionsAPIStoreV2 = new SessionsAPIStoreV2();
