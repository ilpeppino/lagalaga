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

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';

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
    'Content-Type': 'application/json',
    'X-Correlation-ID': correlationId,
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers: {
        ...headers,
        ...(options.headers as Record<string, string>),
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
}

export const sessionsAPIStoreV2 = new SessionsAPIStoreV2();
