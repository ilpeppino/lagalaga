export type OAuthProvider = 'roblox' | 'google';

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

export function getPostLoginRoute(robloxConnected: boolean): '/me' | '/sessions' {
  return robloxConnected ? '/sessions' : '/me';
}
