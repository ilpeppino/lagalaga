/**
 * Epic 5: Deep Link Utilities
 *
 * Handles deep links for the LagaLaga app:
 * - lagalaga://invite/:code - Join session via invite
 * - lagalaga://sessions/:id - View session detail
 * - lagalaga://auth/callback - OAuth callback
 */

import * as Linking from 'expo-linking';

export const DeepLinkScheme = 'lagalaga';

/**
 * Deep link routes
 */
export const DeepLinks = {
  // Session invite link
  invite: (code: string) => `${DeepLinkScheme}://invite/${code}`,

  // Session detail link
  session: (id: string) => `${DeepLinkScheme}://sessions/${id}`,

  // Auth callback
  authCallback: (provider: string) => `${DeepLinkScheme}://auth/${provider}`,
};

/**
 * Parse a deep link URL
 */
export function parseDeepLink(url: string): {
  route: string;
  params: Record<string, string>;
} | null {
  try {
    const parsed = Linking.parse(url);

    return {
      route: parsed.path || '',
      params: parsed.queryParams || {},
    };
  } catch (error) {
    console.error('Failed to parse deep link:', error);
    return null;
  }
}

/**
 * Check if a URL is a valid app deep link
 */
export function isAppDeepLink(url: string): boolean {
  return url.startsWith(`${DeepLinkScheme}://`);
}

/**
 * Extract invite code from deep link
 */
export function extractInviteCode(url: string): string | null {
  const match = url.match(/invite\/([A-Z0-9]+)/i);
  return match ? match[1] : null;
}

/**
 * Extract session ID from deep link
 */
export function extractSessionId(url: string): string | null {
  const match = url.match(/sessions\/([a-f0-9-]+)/i);
  return match ? match[1] : null;
}

/**
 * Get the initial deep link URL (if app was opened via deep link)
 */
export async function getInitialURL(): Promise<string | null> {
  try {
    return await Linking.getInitialURL();
  } catch (error) {
    console.error('Failed to get initial URL:', error);
    return null;
  }
}

/**
 * Subscribe to deep link events
 */
export function addDeepLinkListener(
  callback: (url: string) => void
): { remove: () => void } {
  const subscription = Linking.addEventListener('url', (event) => {
    callback(event.url);
  });

  return {
    remove: () => subscription.remove(),
  };
}
