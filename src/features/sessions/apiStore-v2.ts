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

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';

/**
 * Simple HTTP client for v2 API endpoints
 */
async function fetchWithAuth<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = await tokenStorage.getToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: {
      ...headers,
      ...(options.headers as Record<string, string>),
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Request failed');
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
      throw new Error('Failed to create session');
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
      throw new Error('Failed to list sessions');
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
      throw new Error('Failed to get session');
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
      throw new Error('Failed to join session');
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
      throw new Error('Invalid invite code');
    }

    return response.data;
  }
}

export const sessionsAPIStoreV2 = new SessionsAPIStoreV2();
