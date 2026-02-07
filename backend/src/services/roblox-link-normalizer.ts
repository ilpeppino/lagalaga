/**
 * Roblox Link Normalizer Service
 *
 * Parses various Roblox link formats and extracts canonical placeId + URLs.
 * Supports:
 * - https://www.roblox.com/games/<placeId>/<slug>
 * - https://www.roblox.com/games/start?placeId=<placeId>
 * - roblox://placeId=<placeId>
 * - https://ro.blox.com/* (with af_web_dp parameter or redirect following)
 */

export enum NormalizedFrom {
  WEB_GAMES = 'web_games',
  WEB_START = 'web_start',
  PROTOCOL = 'protocol',
  ROBLOX_SHORTLINK_PARAM = 'roblox_shortlink_param',
  ROBLOX_SHORTLINK_REDIRECT = 'roblox_shortlink_redirect',
}

export interface NormalizedRobloxLink {
  placeId: number;
  canonicalWebUrl: string;
  canonicalStartUrl: string;
  originalInputUrl: string;
  normalizedFrom: NormalizedFrom;
}

export class RobloxLinkNormalizer {
  /**
   * Main normalization method
   * Accepts any Roblox link format and returns normalized data
   */
  async normalize(url: string): Promise<NormalizedRobloxLink> {
    const originalUrl = url.trim();

    // Try protocol scheme first (roblox://)
    if (originalUrl.startsWith('roblox://')) {
      const placeId = this.extractFromProtocol(originalUrl);
      if (placeId) {
        const { web, start } = this.buildCanonicalUrls(placeId);
        return {
          placeId,
          canonicalWebUrl: web,
          canonicalStartUrl: start,
          originalInputUrl: originalUrl,
          normalizedFrom: NormalizedFrom.PROTOCOL,
        };
      }
    }

    // Parse as URL
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(originalUrl);
    } catch (error) {
      throw new Error('Invalid URL format');
    }

    // Check for ro.blox.com shortlink
    if (parsedUrl.hostname === 'ro.blox.com') {
      const placeId = await this.extractFromShortlink(parsedUrl);
      if (placeId) {
        const { web, start } = this.buildCanonicalUrls(placeId);
        const normalizedFrom = parsedUrl.searchParams.has('af_web_dp')
          ? NormalizedFrom.ROBLOX_SHORTLINK_PARAM
          : NormalizedFrom.ROBLOX_SHORTLINK_REDIRECT;

        return {
          placeId,
          canonicalWebUrl: web,
          canonicalStartUrl: start,
          originalInputUrl: originalUrl,
          normalizedFrom,
        };
      }
    }

    // Check for www.roblox.com/games/<placeId>
    if (parsedUrl.hostname === 'www.roblox.com' || parsedUrl.hostname === 'roblox.com') {
      const placeIdFromGames = this.extractFromWebGamesUrl(parsedUrl);
      if (placeIdFromGames) {
        const { web, start } = this.buildCanonicalUrls(placeIdFromGames);
        return {
          placeId: placeIdFromGames,
          canonicalWebUrl: web,
          canonicalStartUrl: start,
          originalInputUrl: originalUrl,
          normalizedFrom: NormalizedFrom.WEB_GAMES,
        };
      }

      // Check for www.roblox.com/games/start?placeId=...
      const placeIdFromStart = this.extractFromWebStartUrl(parsedUrl);
      if (placeIdFromStart) {
        const { web, start } = this.buildCanonicalUrls(placeIdFromStart);
        return {
          placeId: placeIdFromStart,
          canonicalWebUrl: web,
          canonicalStartUrl: start,
          originalInputUrl: originalUrl,
          normalizedFrom: NormalizedFrom.WEB_START,
        };
      }
    }

    throw new Error('Unable to extract placeId from URL');
  }

  /**
   * Extract placeId from web games URL
   * Format: https://www.roblox.com/games/<placeId>/<slug>
   */
  private extractFromWebGamesUrl(url: URL): number | null {
    const match = url.pathname.match(/^\/games\/(\d+)/);
    if (match) {
      return parseInt(match[1], 10);
    }
    return null;
  }

  /**
   * Extract placeId from web start URL
   * Format: https://www.roblox.com/games/start?placeId=<placeId>
   */
  private extractFromWebStartUrl(url: URL): number | null {
    const placeId = url.searchParams.get('placeId');
    return placeId ? parseInt(placeId, 10) : null;
  }

  /**
   * Extract placeId from protocol deep link
   * Format: roblox://placeId=<placeId> or roblox://experiences/start?placeId=<placeId>
   */
  private extractFromProtocol(url: string): number | null {
    const match = url.match(/placeId=(\d+)/);
    if (match) {
      return parseInt(match[1], 10);
    }
    return null;
  }

  /**
   * Extract placeId from ro.blox.com shortlink
   * Handles: https://ro.blox.com/<code> with optional af_web_dp parameter
   */
  private async extractFromShortlink(url: URL): Promise<number | null> {
    // First check for af_web_dp parameter (contains encoded destination URL)
    const afWebDp = url.searchParams.get('af_web_dp');
    if (afWebDp) {
      try {
        const decodedUrl = decodeURIComponent(afWebDp);
        const parsedUrl = new URL(decodedUrl);

        // Try to extract from the decoded URL
        return (
          this.extractFromWebGamesUrl(parsedUrl) ||
          this.extractFromWebStartUrl(parsedUrl)
        );
      } catch (e) {
        // Fall through to redirect following
      }
    }

    // Follow redirects to get final URL
    try {
      const finalUrl = await this.followRedirects(url.toString());
      const finalParsed = new URL(finalUrl);

      return (
        this.extractFromWebGamesUrl(finalParsed) ||
        this.extractFromWebStartUrl(finalParsed)
      );
    } catch (error) {
      return null;
    }
  }

  /**
   * Follow HTTP redirects to get final destination URL
   */
  private async followRedirects(url: string): Promise<string> {
    try {
      const response = await fetch(url, {
        method: 'HEAD',
        redirect: 'follow',
      });
      return response.url;
    } catch (error) {
      throw new Error('Failed to follow redirect');
    }
  }

  /**
   * Build canonical URLs from placeId
   */
  private buildCanonicalUrls(placeId: number): { web: string; start: string } {
    return {
      web: `https://www.roblox.com/games/${placeId}`,
      start: `https://www.roblox.com/games/start?placeId=${placeId}`,
    };
  }
}
