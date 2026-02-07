import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { RobloxLinkNormalizer, NormalizedFrom } from '../roblox-link-normalizer.js';

describe('RobloxLinkNormalizer', () => {
  let normalizer: RobloxLinkNormalizer;

  beforeEach(() => {
    normalizer = new RobloxLinkNormalizer();
  });

  describe('Web Games URL', () => {
    it('should parse https://www.roblox.com/games/<placeId>/<slug>', async () => {
      const result = await normalizer.normalize('https://www.roblox.com/games/606849621/Jailbreak');

      expect(result.placeId).toBe(606849621);
      expect(result.canonicalWebUrl).toBe('https://www.roblox.com/games/606849621');
      expect(result.canonicalStartUrl).toBe('https://www.roblox.com/games/start?placeId=606849621');
      expect(result.normalizedFrom).toBe(NormalizedFrom.WEB_GAMES);
      expect(result.originalInputUrl).toBe('https://www.roblox.com/games/606849621/Jailbreak');
    });

    it('should parse https://roblox.com/games/<placeId> (without www)', async () => {
      const result = await normalizer.normalize('https://roblox.com/games/606849621');

      expect(result.placeId).toBe(606849621);
      expect(result.normalizedFrom).toBe(NormalizedFrom.WEB_GAMES);
    });

    it('should parse https://www.roblox.com/games/<placeId> (without slug)', async () => {
      const result = await normalizer.normalize('https://www.roblox.com/games/606849621');

      expect(result.placeId).toBe(606849621);
      expect(result.normalizedFrom).toBe(NormalizedFrom.WEB_GAMES);
    });
  });

  describe('Web Start URL', () => {
    it('should parse https://www.roblox.com/games/start?placeId=<placeId>', async () => {
      const result = await normalizer.normalize('https://www.roblox.com/games/start?placeId=606849621');

      expect(result.placeId).toBe(606849621);
      expect(result.normalizedFrom).toBe(NormalizedFrom.WEB_START);
    });

    it('should parse with additional query parameters', async () => {
      const result = await normalizer.normalize(
        'https://www.roblox.com/games/start?placeId=606849621&launchData=test'
      );

      expect(result.placeId).toBe(606849621);
      expect(result.normalizedFrom).toBe(NormalizedFrom.WEB_START);
    });
  });

  describe('Protocol Deep Link', () => {
    it('should parse roblox://placeId=<placeId>', async () => {
      const result = await normalizer.normalize('roblox://placeId=606849621');

      expect(result.placeId).toBe(606849621);
      expect(result.normalizedFrom).toBe(NormalizedFrom.PROTOCOL);
    });

    it('should parse roblox://experiences/start?placeId=<placeId>', async () => {
      const result = await normalizer.normalize('roblox://experiences/start?placeId=606849621');

      expect(result.placeId).toBe(606849621);
      expect(result.normalizedFrom).toBe(NormalizedFrom.PROTOCOL);
    });

    it('should parse roblox://navigation/game_details?gameId=<placeId>', async () => {
      const result = await normalizer.normalize('roblox://navigation/game_details?placeId=606849621');

      expect(result.placeId).toBe(606849621);
      expect(result.normalizedFrom).toBe(NormalizedFrom.PROTOCOL);
    });
  });

  describe('Roblox Shortlink', () => {
    it('should parse ro.blox.com with af_web_dp parameter', async () => {
      const url = 'https://ro.blox.com/Ebh5?af_web_dp=https%3A%2F%2Fwww.roblox.com%2Fgames%2F606849621';
      const result = await normalizer.normalize(url);

      expect(result.placeId).toBe(606849621);
      expect(result.normalizedFrom).toBe(NormalizedFrom.ROBLOX_SHORTLINK_PARAM);
    });

    it('should parse ro.blox.com with af_web_dp pointing to start URL', async () => {
      const url =
        'https://ro.blox.com/Ebh5?af_web_dp=https%3A%2F%2Fwww.roblox.com%2Fgames%2Fstart%3FplaceId%3D606849621';
      const result = await normalizer.normalize(url);

      expect(result.placeId).toBe(606849621);
      expect(result.normalizedFrom).toBe(NormalizedFrom.ROBLOX_SHORTLINK_PARAM);
    });

    it('should follow redirects for ro.blox.com without af_web_dp', async () => {
      // Mock fetch to simulate redirect
      const mockFetch = jest.fn<typeof fetch>().mockResolvedValue({
        url: 'https://www.roblox.com/games/606849621/Jailbreak',
      } as Response);
      global.fetch = mockFetch;

      const result = await normalizer.normalize('https://ro.blox.com/Ebh5');

      expect(result.placeId).toBe(606849621);
      expect(result.normalizedFrom).toBe(NormalizedFrom.ROBLOX_SHORTLINK_REDIRECT);
      expect(mockFetch).toHaveBeenCalledWith('https://ro.blox.com/Ebh5', {
        method: 'HEAD',
        redirect: 'follow',
      });
    });

    it('should handle ro.blox.com redirect to start URL', async () => {
      const mockFetch = jest.fn<typeof fetch>().mockResolvedValue({
        url: 'https://www.roblox.com/games/start?placeId=606849621',
      } as Response);
      global.fetch = mockFetch;

      const result = await normalizer.normalize('https://ro.blox.com/xyz');

      expect(result.placeId).toBe(606849621);
      expect(result.normalizedFrom).toBe(NormalizedFrom.ROBLOX_SHORTLINK_REDIRECT);
    });
  });

  describe('Edge Cases', () => {
    it('should handle URLs with trailing slashes', async () => {
      const result = await normalizer.normalize('https://www.roblox.com/games/606849621/');

      expect(result.placeId).toBe(606849621);
    });

    it('should handle URLs with extra whitespace', async () => {
      const result = await normalizer.normalize('  https://www.roblox.com/games/606849621  ');

      expect(result.placeId).toBe(606849621);
    });

    it('should handle very large placeIds', async () => {
      const result = await normalizer.normalize('https://www.roblox.com/games/9876543210123456');

      expect(result.placeId).toBe(9876543210123456);
    });
  });

  describe('Error Cases', () => {
    it('should throw error for invalid URL', async () => {
      await expect(normalizer.normalize('not-a-url')).rejects.toThrow('Invalid URL format');
    });

    it('should throw error for non-Roblox URL', async () => {
      await expect(normalizer.normalize('https://google.com')).rejects.toThrow('Unable to extract placeId');
    });

    it('should throw error for Roblox URL without placeId', async () => {
      await expect(normalizer.normalize('https://www.roblox.com/home')).rejects.toThrow(
        'Unable to extract placeId'
      );
    });

    it('should throw error for roblox:// protocol without placeId', async () => {
      await expect(normalizer.normalize('roblox://home')).rejects.toThrow('Unable to extract placeId');
    });

    it('should throw error for empty URL', async () => {
      await expect(normalizer.normalize('')).rejects.toThrow();
    });

    it('should throw error for malformed ro.blox.com with failed redirect', async () => {
      const mockFetch = jest.fn<typeof fetch>().mockRejectedValue(new Error('Network error'));
      global.fetch = mockFetch;

      await expect(normalizer.normalize('https://ro.blox.com/invalid')).rejects.toThrow(
        'Unable to extract placeId'
      );
    });
  });

  describe('Canonical URL Generation', () => {
    it('should generate correct canonical URLs', async () => {
      const result = await normalizer.normalize('https://www.roblox.com/games/123456789/Test-Game');

      expect(result.canonicalWebUrl).toBe('https://www.roblox.com/games/123456789');
      expect(result.canonicalStartUrl).toBe('https://www.roblox.com/games/start?placeId=123456789');
    });

    it('should preserve original input URL', async () => {
      const originalUrl = 'https://www.roblox.com/games/606849621/Jailbreak';
      const result = await normalizer.normalize(originalUrl);

      expect(result.originalInputUrl).toBe(originalUrl);
    });
  });

  describe('NormalizedFrom Values', () => {
    it('should correctly identify web_games source', async () => {
      const result = await normalizer.normalize('https://www.roblox.com/games/606849621');
      expect(result.normalizedFrom).toBe(NormalizedFrom.WEB_GAMES);
    });

    it('should correctly identify web_start source', async () => {
      const result = await normalizer.normalize('https://www.roblox.com/games/start?placeId=606849621');
      expect(result.normalizedFrom).toBe(NormalizedFrom.WEB_START);
    });

    it('should correctly identify protocol source', async () => {
      const result = await normalizer.normalize('roblox://placeId=606849621');
      expect(result.normalizedFrom).toBe(NormalizedFrom.PROTOCOL);
    });

    it('should correctly identify roblox_shortlink_param source', async () => {
      const url = 'https://ro.blox.com/Ebh5?af_web_dp=https%3A%2F%2Fwww.roblox.com%2Fgames%2F606849621';
      const result = await normalizer.normalize(url);
      expect(result.normalizedFrom).toBe(NormalizedFrom.ROBLOX_SHORTLINK_PARAM);
    });

    it('should correctly identify roblox_shortlink_redirect source', async () => {
      const mockFetch = jest.fn<typeof fetch>().mockResolvedValue({
        url: 'https://www.roblox.com/games/606849621',
      } as Response);
      global.fetch = mockFetch;

      const result = await normalizer.normalize('https://ro.blox.com/Ebh5');
      expect(result.normalizedFrom).toBe(NormalizedFrom.ROBLOX_SHORTLINK_REDIRECT);
    });
  });
});
