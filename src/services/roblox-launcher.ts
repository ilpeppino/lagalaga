import { Linking } from 'react-native';
import { logger } from '../lib/logger';

export interface RobloxLaunchResult {
  openedVia: 'deep_link' | 'fallback_url';
  deepLinkUrl?: string;
  fallbackUrl: string;
}

function getFallbackUrl(placeId: number, canonicalStartUrl?: string): string {
  if (!Number.isFinite(placeId) || placeId <= 0) {
    return canonicalStartUrl || 'https://www.roblox.com/home';
  }

  const url = new URL('https://www.roblox.com/games/start');
  url.searchParams.set('placeId', String(placeId));
  url.searchParams.set('launchData', 'lagalaga');
  return url.toString();
}

export async function launchRobloxGame(
  placeId: number,
  canonicalStartUrl?: string
): Promise<RobloxLaunchResult> {
  const fallbackUrl = getFallbackUrl(placeId, canonicalStartUrl);

  if (!Number.isFinite(placeId) || placeId <= 0) {
    await Linking.openURL(fallbackUrl);
    return { openedVia: 'fallback_url', fallbackUrl };
  }

  const deepLinkUrl = `roblox://experiences/start?placeId=${placeId}`;

  try {
    // Intentionally do not gate on canOpenURL() because that can false-negative.
    await Linking.openURL(deepLinkUrl);
    return { openedVia: 'deep_link', deepLinkUrl, fallbackUrl };
  } catch (error) {
    logger.warn('Roblox deep link failed; opening fallback URL', {
      placeId,
      deepLinkUrl,
      fallbackUrl,
      error: error instanceof Error ? error.message : String(error),
    });
    await Linking.openURL(fallbackUrl);
    return { openedVia: 'fallback_url', deepLinkUrl, fallbackUrl };
  }
}
