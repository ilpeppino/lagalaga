/**
 * Epic 3 Sessions API Store - Uses v2 backend endpoints
 */

import {
  CreateSessionInput,
  Session,
  SessionDetail,
  SessionWithInvite,
  ListSessionsParams,
  ListSessionsResponse,
} from './types-v2';
import { tokenStorage } from '@/src/lib/tokenStorage';
import { ApiError, NetworkError, parseApiError } from '@/src/lib/errors';
import { logger } from '@/src/lib/logger';
import { API_URL } from '@/src/lib/runtimeConfig';

function generateCorrelationId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * HTTP client for v2 API endpoints with typed errors
 */
async function fetchWithAuth<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
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
      ...options,
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
    logger.error(`API error: ${apiError.code}`, {
      endpoint,
      statusCode: response.status,
      requestId: apiError.requestId,
    });
    throw apiError;
  }

  return await response.json();
}

class SessionsAPIStoreV2 {
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
}

export const sessionsAPIStoreV2 = new SessionsAPIStoreV2();
