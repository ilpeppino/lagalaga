import { tokenStorage } from './tokenStorage';
import type { Session, CreateSessionInput, SessionParticipant } from '../features/sessions/types';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';

interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    robloxUserId: string;
    robloxUsername: string;
    robloxDisplayName?: string;
    robloxProfileUrl?: string;
  };
}

interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
}

interface ErrorResponse {
  error: {
    code: string;
    message: string;
    statusCode: number;
  };
}

class ApiClient {
  private isRefreshing = false;
  private refreshPromise: Promise<string> | null = null;

  private async getAuthHeaders(): Promise<HeadersInit> {
    const token = await tokenStorage.getToken();
    if (!token) {
      return {};
    }
    return {
      Authorization: `Bearer ${token}`,
    };
  }

  private async refreshAccessToken(): Promise<string> {
    // If already refreshing, wait for the existing promise
    if (this.isRefreshing && this.refreshPromise) {
      return this.refreshPromise;
    }

    this.isRefreshing = true;
    this.refreshPromise = (async () => {
      try {
        const refreshToken = await tokenStorage.getRefreshToken();
        if (!refreshToken) {
          throw new Error('No refresh token available');
        }

        const response = await fetch(`${API_URL}/auth/refresh`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ refreshToken }),
        });

        if (!response.ok) {
          throw new Error('Failed to refresh token');
        }

        const data: RefreshResponse = await response.json();
        await tokenStorage.setToken(data.accessToken);
        await tokenStorage.setRefreshToken(data.refreshToken);

        return data.accessToken;
      } finally {
        this.isRefreshing = false;
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
      ...(await this.getAuthHeaders()),
    };

    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers,
    });

    // Handle 401 - try to refresh token
    if (response.status === 401 && !endpoint.includes('/auth/refresh')) {
      try {
        await this.refreshAccessToken();
        // Retry the request with new token
        const newHeaders = {
          'Content-Type': 'application/json',
          ...options.headers,
          ...(await this.getAuthHeaders()),
        };
        const retryResponse = await fetch(`${API_URL}${endpoint}`, {
          ...options,
          headers: newHeaders,
        });

        if (!retryResponse.ok) {
          const error: ErrorResponse = await retryResponse.json();
          throw new Error(error.error.message);
        }

        return await retryResponse.json();
      } catch (error) {
        // Refresh failed, clear tokens
        await tokenStorage.clearTokens();
        throw error;
      }
    }

    if (!response.ok) {
      const error: ErrorResponse = await response.json();
      throw new Error(error.error.message);
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return undefined as T;
    }

    return await response.json();
  }

  // Auth endpoints
  auth = {
    startRobloxAuth: async (codeChallenge: string): Promise<{ authorizationUrl: string; state: string }> => {
      return this.request('/auth/roblox/start', {
        method: 'POST',
        body: JSON.stringify({ codeChallenge }),
      });
    },

    completeRobloxAuth: async (
      code: string,
      state: string,
      codeVerifier: string
    ): Promise<AuthResponse> => {
      return this.request('/auth/roblox/callback', {
        method: 'POST',
        body: JSON.stringify({ code, state, codeVerifier }),
      });
    },

    refresh: async (): Promise<RefreshResponse> => {
      const refreshToken = await tokenStorage.getRefreshToken();
      if (!refreshToken) {
        throw new Error('No refresh token available');
      }
      return this.request('/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      });
    },

    revoke: async (): Promise<void> => {
      return this.request('/auth/revoke', {
        method: 'POST',
      });
    },

    me: async (): Promise<{ user: AuthResponse['user'] }> => {
      return this.request('/auth/me', {
        method: 'GET',
      });
    },
  };

  // Sessions endpoints
  sessions = {
    list: async (params?: { limit?: number; offset?: number }): Promise<{ sessions: Session[]; total: number }> => {
      const query = new URLSearchParams();
      if (params?.limit) query.set('limit', params.limit.toString());
      if (params?.offset) query.set('offset', params.offset.toString());
      const queryString = query.toString();
      return this.request(`/sessions${queryString ? `?${queryString}` : ''}`);
    },

    create: async (input: CreateSessionInput): Promise<{ session: Session }> => {
      return this.request('/sessions', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },

    getById: async (id: string): Promise<{ session: Session; participants: SessionParticipant[] }> => {
      return this.request(`/sessions/${id}`);
    },

    join: async (id: string): Promise<{ participant: SessionParticipant }> => {
      return this.request(`/sessions/${id}/join`, {
        method: 'POST',
      });
    },

    leave: async (id: string): Promise<void> => {
      return this.request(`/sessions/${id}/leave`, {
        method: 'POST',
      });
    },
  };
}

export const apiClient = new ApiClient();
