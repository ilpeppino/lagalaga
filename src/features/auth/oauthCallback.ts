import { getPostLoginRoute } from './robloxConnectionGate';

export type OAuthProvider = 'roblox' | 'google';

export interface GoogleCallbackPayload {
  code?: string;
  state?: string;
  accessToken?: string;
  refreshToken?: string;
  error?: string;
  errorCode?: string;
  requestId?: string;
}

export function parseOAuthCallbackUrl(
  url: string,
  provider: OAuthProvider
): { code: string; state: string } | null {
  try {
    const parsed = new URL(url);
    const normalizedPath = parsed.pathname.replace(/^\/+/, '');
    const validHostPath = parsed.hostname === 'auth' && normalizedPath === provider;
    const validPath = normalizedPath === `auth/${provider}`;

    if (!validHostPath && !validPath) {
      return null;
    }

    const code = parsed.searchParams.get('code');
    const state = parsed.searchParams.get('state');

    if (!code || !state) {
      return null;
    }

    return { code, state };
  } catch {
    return null;
  }
}

export function parseGoogleCallbackPayload(url: string): GoogleCallbackPayload | null {
  try {
    const parsed = new URL(url);
    const normalizedPath = parsed.pathname.replace(/^\/+|\/+$/g, '');
    const validHostPath = parsed.hostname === 'auth' && (normalizedPath === 'google' || normalizedPath === 'auth/google');
    const validPath = normalizedPath === 'auth/google' || normalizedPath === 'google';

    if (!validHostPath && !validPath) {
      return null;
    }

    const hashParams = new URLSearchParams(parsed.hash.startsWith('#') ? parsed.hash.slice(1) : parsed.hash);
    const getParam = (name: string): string | undefined => {
      return parsed.searchParams.get(name) ?? hashParams.get(name) ?? undefined;
    };

    const payload: GoogleCallbackPayload = {
      code: getParam('code'),
      state: getParam('state'),
      accessToken: getParam('accessToken'),
      refreshToken: getParam('refreshToken'),
      error: getParam('error'),
      errorCode: getParam('errorCode'),
      requestId: getParam('requestId'),
    };

    if (payload.accessToken && payload.refreshToken) {
      return payload;
    }

    if (payload.code && payload.state) {
      return payload;
    }

    if (payload.error || payload.errorCode) {
      return payload;
    }

    return null;
  } catch {
    return null;
  }
}

export { getPostLoginRoute };
