import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { apiClient } from '@/src/lib/api';
import { logger } from '@/src/lib/logger';

export type RobloxConnectResult =
  | { status: 'connected'; robloxUserId?: string; verifiedAt?: string }
  | { status: 'cancelled' };

function getSingleParam(
  value: string | string[] | undefined
): string | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function resolveRobloxRedirectUri(): string {
  return process.env.EXPO_PUBLIC_ROBLOX_REDIRECT_URI?.trim() || Linking.createURL('/auth/roblox');
}

class RobloxConnectionService {
  async connect(): Promise<RobloxConnectResult> {
    const { authorizationUrl } = await apiClient.roblox.startConnect();
    const redirectUri = resolveRobloxRedirectUri();

    logger.info('Starting Roblox connect auth session', {
      redirectUri,
      authUrlPreview: authorizationUrl.slice(0, 120),
    });

    const result = await WebBrowser.openAuthSessionAsync(authorizationUrl, redirectUri);

    if (result.type === 'cancel' || result.type === 'dismiss') {
      logger.info('Roblox connect auth session cancelled', { type: result.type });
      return { status: 'cancelled' };
    }

    if (result.type !== 'success' || !('url' in result)) {
      logger.warn('Roblox connect auth session did not complete successfully', { type: result.type });
      return { status: 'cancelled' };
    }

    const parsed = Linking.parse(result.url);
    const code = getSingleParam(parsed.queryParams?.code as string | string[] | undefined);
    const state = getSingleParam(parsed.queryParams?.state as string | string[] | undefined);
    const oauthError = getSingleParam(parsed.queryParams?.error as string | string[] | undefined);

    if (oauthError) {
      logger.warn('Roblox OAuth provider returned error', { oauthError });
      return { status: 'cancelled' };
    }

    if (!code || !state) {
      throw new Error('Missing code or state in Roblox OAuth redirect');
    }

    const exchange = await apiClient.roblox.exchangeConnect(code, state);

    logger.info('Roblox account connected', {
      connected: exchange.connected,
      robloxUserId: exchange.robloxUserId ?? null,
      verifiedAt: exchange.verifiedAt ?? null,
    });

    return {
      status: 'connected',
      robloxUserId: exchange.robloxUserId,
      verifiedAt: exchange.verifiedAt,
    };
  }
}

export const robloxConnectionService = new RobloxConnectionService();
