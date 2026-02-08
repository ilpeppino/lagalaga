import { tokenStorage } from './tokenStorage';
import { ApiError, NetworkError, parseApiError } from './errors';
import { logger } from './logger';
import { monitoring } from './monitoring';
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

function generateCorrelationId(): string {
  // Use crypto.randomUUID if available, otherwise fall back
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function headersToRecord(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) return {};
  if (headers instanceof Headers) {
    const record: Record<string, string> = {};
    headers.forEach((value, key) => { record[key] = value; });
    return record;
  }
  if (Array.isArray(headers)) {
    const record: Record<string, string> = {};
    for (const [k, v] of headers) record[k] = v;
    return record;
  }
  return headers as Record<string, string>;
}

class ApiClient {
  private isRefreshing = false;
  private refreshPromise: Promise<string> | null = null;

  private hasHeader(headers: HeadersInit | undefined, name: string): boolean {
    if (!headers) return false;
    const lower = name.toLowerCase();
    if (headers instanceof Headers) {
      return headers.has(name);
    }
    if (Array.isArray(headers)) {
      return headers.some(([k]) => k.toLowerCase() === lower);
    }
    return Object.keys(headers).some((k) => k.toLowerCase() === lower);
  }

  private async getAuthHeaders(): Promise<Record<string, string>> {
    const token = await tokenStorage.getToken();
    if (!token) {
      return {};
    }
    return {
      Authorization: `Bearer ${token}`,
    };
  }

  private async refreshAccessToken(): Promise<string> {
    if (this.isRefreshing && this.refreshPromise) {
      return this.refreshPromise;
    }

    this.isRefreshing = true;
    this.refreshPromise = (async () => {
      try {
        const refreshToken = await tokenStorage.getRefreshToken();
        if (!refreshToken) {
          throw new ApiError({
            code: 'AUTH_005',
            message: 'No refresh token available',
            statusCode: 401,
          });
        }

        const response = await fetch(`${API_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });

        if (!response.ok) {
          throw await parseApiError(response);
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
    options: RequestInit = {},
    retryCount = 0
  ): Promise<T> {
    const correlationId = generateCorrelationId();

    const headers: Record<string, string> = {
      ...headersToRecord(options.headers),
      ...(await this.getAuthHeaders()),
      'X-Correlation-ID': correlationId,
    };
    if (options.body != null && !this.hasHeader(options.headers, 'content-type')) {
      headers['Content-Type'] = 'application/json';
    }

    let response: Response;
    try {
      response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers,
      });
    } catch (err) {
      const networkError = new NetworkError(
        'Network request failed',
        err instanceof Error ? err : undefined
      );
      logger.error('Network request failed', {
        endpoint,
        correlationId,
        error: (err as Error).message,
      });
      monitoring.trackHttpRequest(options.method || 'GET', endpoint);
      throw networkError;
    }

    const requestId = response.headers.get('X-Request-ID') || '';
    monitoring.trackHttpRequest(
      options.method || 'GET',
      endpoint,
      response.status
    );

    // Handle 401 - try to refresh token
    if (response.status === 401 && !endpoint.includes('/auth/refresh')) {
      try {
        await this.refreshAccessToken();
        // Retry the request with new token
        const newHeaders: Record<string, string> = {
          ...headersToRecord(options.headers),
          ...(await this.getAuthHeaders()),
          'X-Correlation-ID': correlationId,
        };
        if (options.body != null && !this.hasHeader(options.headers, 'content-type')) {
          newHeaders['Content-Type'] = 'application/json';
        }
        const retryResponse = await fetch(`${API_URL}${endpoint}`, {
          ...options,
          headers: newHeaders,
        });

        if (!retryResponse.ok) {
          const apiError = await parseApiError(retryResponse);
          logger.error(`API error after token refresh: ${apiError.code}`, {
            endpoint, statusCode: retryResponse.status, requestId,
          });
          throw apiError;
        }

        return await retryResponse.json();
      } catch (error) {
        await tokenStorage.clearTokens();
        throw error;
      }
    }

    if (!response.ok) {
      const apiError = await parseApiError(response);
      logger.error(`API error: ${apiError.code} - ${apiError.message}`, {
        endpoint,
        statusCode: response.status,
        requestId,
        correlationId,
      });

      // Retry transient errors (5xx) up to 2 times
      if (apiError.isRetryable && retryCount < 2) {
        const delay = Math.min(500 * Math.pow(2, retryCount), 4000);
        logger.warn(`Retrying ${endpoint} in ${delay}ms (attempt ${retryCount + 1})`, {
          correlationId,
        });
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.request<T>(endpoint, options, retryCount + 1);
      }

      throw apiError;
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
        throw new ApiError({
          code: 'AUTH_005',
          message: 'No refresh token available',
          statusCode: 401,
        });
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
