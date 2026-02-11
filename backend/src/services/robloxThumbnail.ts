import { AppError, ErrorCodes } from '../utils/errors.js';

interface RobloxThumbnailResponse {
  data: Array<{
    targetId: number;
    state: string;
    imageUrl: string | null;
  }>;
}

export class RobloxThumbnailService {
  private readonly THUMBNAIL_API_BASE = 'https://thumbnails.roblox.com';
  private readonly REQUEST_TIMEOUT = 4000; // 4 seconds

  /**
   * Fetch user avatar headshot from Roblox thumbnails API
   * @param robloxUserId - Roblox user ID
   * @param size - Image size (default: 150x150)
   * @returns Avatar URL or null if unavailable
   */
  async getUserAvatarHeadshot(
    robloxUserId: string,
    size: '48x48' | '60x60' | '150x150' | '352x352' = '150x150'
  ): Promise<string | null> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.REQUEST_TIMEOUT);

    try {
      const url = `${this.THUMBNAIL_API_BASE}/v1/users/avatar-headshot?userIds=${robloxUserId}&size=${size}&format=Png&isCircular=false`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new AppError(
          ErrorCodes.INTERNAL_EXTERNAL_SERVICE,
          `Roblox thumbnails API returned ${response.status}`
        );
      }

      const data = await response.json() as RobloxThumbnailResponse;

      if (!data.data || data.data.length === 0) {
        return null;
      }

      const thumbnail = data.data[0];

      // Roblox returns state: "Completed" when image is available
      if (thumbnail.state === 'Completed' && thumbnail.imageUrl) {
        return thumbnail.imageUrl;
      }

      return null;
    } catch (error) {
      // If request was aborted due to timeout
      if (error instanceof Error && error.name === 'AbortError') {
        throw new AppError(
          ErrorCodes.INTERNAL_EXTERNAL_SERVICE,
          'Roblox thumbnails API request timed out'
        );
      }

      // Re-throw AppErrors
      if (error instanceof AppError) {
        throw error;
      }

      // Wrap other errors
      throw new AppError(
        ErrorCodes.INTERNAL_EXTERNAL_SERVICE,
        `Failed to fetch Roblox avatar: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
