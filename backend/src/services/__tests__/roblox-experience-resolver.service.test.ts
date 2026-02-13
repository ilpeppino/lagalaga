import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  RobloxExperienceResolverService,
  type ResolvedExperience,
} from '../roblox-experience-resolver.service.js';

type GamesRow = {
  place_id: number;
  canonical_web_url?: string | null;
  canonical_start_url?: string | null;
  game_name?: string | null;
  thumbnail_url?: string | null;
  game_description?: string | null;
};

interface SupabaseMockContext {
  client: any;
  maybeSingle: any;
  upsert: any;
}

function createSupabaseMock(cacheRow: GamesRow | null): SupabaseMockContext {
  const maybeSingle = (jest.fn() as any).mockResolvedValue({
    data: cacheRow,
    error: cacheRow ? null : { code: 'PGRST116' },
  });

  const upsert = (jest.fn() as any).mockResolvedValue({ error: null });

  const client = {
    from: jest.fn((_table: string) => ({
      select: jest.fn((_cols: string) => ({
        eq: jest.fn((_col: string, _val: number) => ({
          maybeSingle,
        })),
      })),
      upsert,
    })),
  };

  return { client, maybeSingle, upsert };
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe('RobloxExperienceResolverService', () => {
  let fetchMock: any;

  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock = jest.fn() as any;
  });

  it('full success path', async () => {
    const supabase = createSupabaseMock(null);

    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { universeId: 245683 }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          data: [{
            id: 245683,
            name: 'Jailbreak',
            description: 'Crime and police roleplay.',
            creator: { id: 1, name: 'Badimo' },
            maxPlayers: 30,
            visits: 1000000,
            playing: 15000,
          }],
        })
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          data: [{ targetId: 245683, state: 'Completed', imageUrl: 'https://tr.rbxcdn.com/icon.png' }],
        })
      );

    const service = new RobloxExperienceResolverService({
      fetchFn: fetchMock,
      supabase: supabase.client,
    });

    const result = await service.resolveExperienceByPlaceId(606849621);

    const expected: ResolvedExperience = {
      placeId: 606849621,
      universeId: 245683,
      name: 'Jailbreak',
      description: 'Crime and police roleplay.',
      creatorId: 1,
      creatorName: 'Badimo',
      maxPlayers: 30,
      visits: 1000000,
      playing: 15000,
      iconUrl: 'https://tr.rbxcdn.com/icon.png',
      canonicalWebUrl: 'https://www.roblox.com/games/606849621',
      canonicalStartUrl: 'https://www.roblox.com/games/start?placeId=606849621',
    };

    expect(result).toEqual(expected);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(supabase.upsert).toHaveBeenCalled();
  });

  it('universe lookup fails -> returns canonical-only metadata', async () => {
    const supabase = createSupabaseMock(null);
    fetchMock.mockResolvedValueOnce(jsonResponse(500, { message: 'fail' }));

    const service = new RobloxExperienceResolverService({
      fetchFn: fetchMock,
      supabase: supabase.client,
    });

    const result = await service.resolveExperienceByPlaceId(606849621);

    expect(result).toEqual({
      placeId: 606849621,
      universeId: null,
      name: null,
      description: null,
      creatorId: null,
      creatorName: null,
      maxPlayers: null,
      visits: null,
      playing: null,
      iconUrl: null,
      canonicalWebUrl: 'https://www.roblox.com/games/606849621',
      canonicalStartUrl: 'https://www.roblox.com/games/start?placeId=606849621',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('games endpoint fails but icon still resolves', async () => {
    const supabase = createSupabaseMock(null);

    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { universeId: 245683 }))
      .mockResolvedValueOnce(jsonResponse(500, { message: 'games fail' }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          data: [{ targetId: 245683, state: 'Completed', imageUrl: 'https://tr.rbxcdn.com/icon.png' }],
        })
      );

    const service = new RobloxExperienceResolverService({
      fetchFn: fetchMock,
      supabase: supabase.client,
    });

    const result = await service.resolveExperienceByPlaceId(606849621);

    expect(result.universeId).toBe(245683);
    expect(result.name).toBeNull();
    expect(result.iconUrl).toBe('https://tr.rbxcdn.com/icon.png');
  });

  it('thumbnails endpoint fails but details still resolve', async () => {
    const supabase = createSupabaseMock(null);

    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { universeId: 245683 }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          data: [{ id: 245683, name: 'Jailbreak', description: 'Desc', creator: { id: 1, name: 'Badimo' } }],
        })
      )
      .mockResolvedValueOnce(jsonResponse(500, { message: 'thumb fail' }));

    const service = new RobloxExperienceResolverService({
      fetchFn: fetchMock,
      supabase: supabase.client,
    });

    const result = await service.resolveExperienceByPlaceId(606849621);

    expect(result.universeId).toBe(245683);
    expect(result.name).toBe('Jailbreak');
    expect(result.description).toBe('Desc');
    expect(result.iconUrl).toBeNull();
  });

  it('timeout then retry success', async () => {
    const supabase = createSupabaseMock(null);

    fetchMock
      .mockRejectedValueOnce(Object.assign(new Error('aborted'), { name: 'AbortError' }))
      .mockResolvedValueOnce(jsonResponse(200, { universeId: 245683 }))
      .mockResolvedValueOnce(jsonResponse(200, { data: [{ id: 245683, name: 'Jailbreak' }] }))
      .mockResolvedValueOnce(jsonResponse(200, { data: [{ targetId: 245683, state: 'Completed', imageUrl: 'https://tr.rbxcdn.com/icon.png' }] }));

    const service = new RobloxExperienceResolverService({
      fetchFn: fetchMock,
      supabase: supabase.client,
    });

    const result = await service.resolveExperienceByPlaceId(606849621);

    expect(result.universeId).toBe(245683);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('cache hit returns immediately with no external calls', async () => {
    const supabase = createSupabaseMock({
      place_id: 606849621,
      game_name: 'Cached Game',
      game_description: 'Cached Description',
      thumbnail_url: 'https://tr.rbxcdn.com/cached.png',
      canonical_web_url: 'https://www.roblox.com/games/606849621',
      canonical_start_url: 'https://www.roblox.com/games/start?placeId=606849621',
    });

    const service = new RobloxExperienceResolverService({
      fetchFn: fetchMock,
      supabase: supabase.client,
    });

    const result = await service.resolveExperienceByPlaceId(606849621);

    expect(result.name).toBe('Cached Game');
    expect(result.description).toBe('Cached Description');
    expect(result.iconUrl).toBe('https://tr.rbxcdn.com/cached.png');
    expect(result.universeId).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(supabase.upsert).not.toHaveBeenCalled();
  });
});
