import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { RobloxEnrichmentService, type FetchFunction } from '../roblox-enrichment.service.js';
import { AppError, ErrorCodes } from '../../utils/errors.js';

// Mock Supabase
const mockSupabase = {
  from: jest.fn(),
};

jest.unstable_mockModule('../../config/supabase.js', () => ({
  getSupabase: () => mockSupabase,
}));

describe('RobloxEnrichmentService', () => {
  let service: RobloxEnrichmentService;
  let mockFetch: jest.MockedFunction<FetchFunction>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch = jest.fn() as jest.MockedFunction<FetchFunction>;
    service = new RobloxEnrichmentService(mockFetch);
  });

  describe('enrichGame - success flow', () => {
    it('should successfully enrich a game with full data', async () => {
      const placeId = 606849621;
      const universeId = 245683;
      const gameName = 'Jailbreak';
      const thumbnailUrl = 'https://tr.rbxcdn.com/thumbnail.png';

      // Mock cache miss
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: null,
              error: { code: 'PGRST116' }, // Not found
            }),
          }),
        }),
      });

      // Mock universe API
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ universeId }),
      } as Response);

      // Mock games API
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              id: universeId,
              name: gameName,
              description: 'Test game',
              creator: { id: 1, name: 'Creator', type: 'User' },
              rootPlaceId: placeId,
              created: '2021-01-01T00:00:00Z',
              updated: '2021-01-01T00:00:00Z',
              placeVisits: 1000,
            },
          ],
        }),
      } as Response);

      // Mock thumbnails API
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              targetId: placeId,
              state: 'Completed',
              imageUrl: thumbnailUrl,
            },
          ],
        }),
      } as Response);

      // Mock database upsert
      mockSupabase.from.mockReturnValue({
        upsert: jest.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      });

      const result = await service.enrichGame(placeId);

      expect(result).toEqual({
        placeId,
        universeId,
        name: gameName,
        thumbnailUrl,
      });

      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should use cached data when available', async () => {
      const placeId = 606849621;
      const cachedName = 'Cached Game';
      const cachedThumbnail = 'https://cached.url/image.png';

      // Mock cache hit
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                place_id: placeId,
                game_name: cachedName,
                thumbnail_url: cachedThumbnail,
              },
              error: null,
            }),
          }),
        }),
      });

      const result = await service.enrichGame(placeId);

      expect(result).toEqual({
        placeId,
        universeId: 0, // Placeholder for cached data
        name: cachedName,
        thumbnailUrl: cachedThumbnail,
      });

      // Should not make any external API calls
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should not use cache if name or thumbnail is missing', async () => {
      const placeId = 606849621;
      const universeId = 245683;

      // Mock cache with incomplete data (no thumbnail)
      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                place_id: placeId,
                game_name: 'Incomplete',
                thumbnail_url: null,
              },
              error: null,
            }),
          }),
        }),
      });

      // Mock external APIs
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ universeId }),
      } as Response);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ id: universeId, name: 'New Name' }],
        }),
      } as Response);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ targetId: placeId, state: 'Completed', imageUrl: 'new.png' }],
        }),
      } as Response);

      // Mock upsert
      mockSupabase.from.mockReturnValueOnce({
        upsert: jest.fn().mockResolvedValue({ data: null, error: null }),
      });

      await service.enrichGame(placeId);

      // Should make external calls
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  describe('enrichGame - error handling', () => {
    beforeEach(() => {
      // Mock cache miss for error tests
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: null,
              error: { code: 'PGRST116' },
            }),
          }),
        }),
      });
    });

    it('should throw error for invalid placeId', async () => {
      await expect(service.enrichGame(0)).rejects.toThrow(AppError);
      await expect(service.enrichGame(-1)).rejects.toThrow(AppError);
      await expect(service.enrichGame(0)).rejects.toThrow('Invalid placeId');
    });

    it('should throw error when universe API returns 404', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      } as Response);

      await expect(service.enrichGame(606849621)).rejects.toThrow('Place 606849621 not found');
    });

    it('should throw error when universe API fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      } as Response);

      await expect(service.enrichGame(606849621)).rejects.toThrow('Roblox Universe API');
    });

    it('should return partial data if game name fetch fails', async () => {
      const placeId = 606849621;
      const universeId = 245683;
      const thumbnailUrl = 'https://thumbnail.url';

      // Universe API succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ universeId }),
      } as Response);

      // Games API fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      } as Response);

      // Thumbnails API succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ targetId: placeId, state: 'Completed', imageUrl: thumbnailUrl }],
        }),
      } as Response);

      // Mock upsert
      mockSupabase.from.mockReturnValue({
        upsert: jest.fn().mockResolvedValue({ data: null, error: null }),
      });

      const result = await service.enrichGame(placeId);

      expect(result).toEqual({
        placeId,
        universeId,
        name: `Place ${placeId}`, // Fallback name
        thumbnailUrl,
      });
    });

    it('should return partial data if thumbnail fetch fails', async () => {
      const placeId = 606849621;
      const universeId = 245683;
      const gameName = 'Test Game';

      // Universe API succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ universeId }),
      } as Response);

      // Games API succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ id: universeId, name: gameName }],
        }),
      } as Response);

      // Thumbnails API fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      } as Response);

      // Mock upsert
      mockSupabase.from.mockReturnValue({
        upsert: jest.fn().mockResolvedValue({ data: null, error: null }),
      });

      const result = await service.enrichGame(placeId);

      expect(result).toEqual({
        placeId,
        universeId,
        name: gameName,
        thumbnailUrl: null, // No thumbnail
      });
    });

    it('should handle thumbnail not ready (state !== Completed)', async () => {
      const placeId = 606849621;
      const universeId = 245683;
      const gameName = 'Test Game';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ universeId }),
      } as Response);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ id: universeId, name: gameName }],
        }),
      } as Response);

      // Thumbnail is pending
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ targetId: placeId, state: 'Pending', imageUrl: null }],
        }),
      } as Response);

      mockSupabase.from.mockReturnValue({
        upsert: jest.fn().mockResolvedValue({ data: null, error: null }),
      });

      const result = await service.enrichGame(placeId);

      expect(result.thumbnailUrl).toBeNull();
    });
  });

  describe('enrichGame - timeout handling', () => {
    beforeEach(() => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: null,
              error: { code: 'PGRST116' },
            }),
          }),
        }),
      });
    });

    it('should timeout on slow universe API', async () => {
      mockFetch.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10000)); // 10s
        return { ok: true } as Response;
      });

      await expect(service.enrichGame(606849621)).rejects.toThrow('timeout');
    }, 10000);

    it('should handle AbortError from timeout', async () => {
      mockFetch.mockImplementation(async (_url, init) => {
        // Simulate abort
        if (init?.signal) {
          const abortError = new Error('The operation was aborted');
          abortError.name = 'AbortError';
          throw abortError;
        }
        return { ok: true } as Response;
      });

      await expect(service.enrichGame(606849621)).rejects.toThrow('Roblox Universe API');
    });
  });

  describe('enrichGame - retry logic', () => {
    beforeEach(() => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: null,
              error: { code: 'PGRST116' },
            }),
          }),
        }),
      });
    });

    it('should retry once on network failure and succeed', async () => {
      const placeId = 606849621;
      const universeId = 245683;

      // First call fails, second succeeds
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ universeId }),
        } as Response);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ id: universeId, name: 'Test' }] }),
      } as Response);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ targetId: placeId, state: 'Completed', imageUrl: 'url' }] }),
      } as Response);

      mockSupabase.from.mockReturnValue({
        upsert: jest.fn().mockResolvedValue({ data: null, error: null }),
      });

      const result = await service.enrichGame(placeId);

      expect(result.universeId).toBe(universeId);
      // First endpoint called twice (initial + retry), others once
      expect(mockFetch).toHaveBeenCalledTimes(4); // 2 for universe + 1 games + 1 thumbnails
    });

    it('should not retry on 4xx errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      } as Response);

      await expect(service.enrichGame(606849621)).rejects.toThrow('Place 606849621 not found');

      // Should not retry 404
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should retry on 5xx errors', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 503 } as Response)
        .mockResolvedValueOnce({ ok: false, status: 503 } as Response);

      await expect(service.enrichGame(606849621)).rejects.toThrow('Roblox Universe API');

      // Should retry once (2 total attempts)
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('enrichGame - database operations', () => {
    beforeEach(() => {
      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: null,
              error: { code: 'PGRST116' },
            }),
          }),
        }),
      });
    });

    it('should upsert enriched data to database', async () => {
      const placeId = 606849621;
      const universeId = 245683;
      const gameName = 'Test Game';
      const thumbnailUrl = 'https://thumbnail.url';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ universeId }),
      } as Response);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ id: universeId, name: gameName }] }),
      } as Response);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ targetId: placeId, state: 'Completed', imageUrl: thumbnailUrl }],
        }),
      } as Response);

      const mockUpsert = jest.fn().mockResolvedValue({ data: null, error: null });
      mockSupabase.from.mockReturnValueOnce({
        upsert: mockUpsert,
      });

      await service.enrichGame(placeId);

      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          place_id: placeId,
          game_name: gameName,
          thumbnail_url: thumbnailUrl,
        }),
        { onConflict: 'place_id', ignoreDuplicates: false }
      );
    });

    it('should throw error on database failure', async () => {
      const placeId = 606849621;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ universeId: 123 }),
      } as Response);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ id: 123, name: 'Test' }] }),
      } as Response);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      } as Response);

      mockSupabase.from.mockReturnValueOnce({
        upsert: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'Database connection failed' },
        }),
      });

      await expect(service.enrichGame(placeId)).rejects.toThrow('Database error');
    });
  });
});
