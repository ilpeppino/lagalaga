import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { ErrorCodes } from '../../../../shared/errors/codes.js';

const mockSupabase = {
  from: jest.fn(),
};

jest.unstable_mockModule('../../config/supabase.js', () => ({
  getSupabase: () => mockSupabase,
}));

const resolverModule = await import('../roblox-experience-resolver.js');

const { resolveRobloxShareUrl, RobloxExperienceResolverService } = resolverModule;

function responseWith(
  init: {
    status: number;
    headers?: Record<string, string>;
    json?: unknown;
    text?: string;
  }
): Response {
  const headers = new Headers(init.headers ?? {});

  return {
    ok: init.status >= 200 && init.status < 300,
    status: init.status,
    headers,
    json: async () => init.json,
    text: async () => init.text ?? '',
  } as Response;
}

function mockCacheMiss() {
  const chain = {
    eq: jest.fn(),
    order: jest.fn(),
    limit: jest.fn(),
  } as any;
  chain.eq.mockReturnValue(chain);
  chain.order.mockReturnValue(chain);
  chain.limit.mockReturnValue({
    maybeSingle: async () => ({ data: null, error: null }),
  });

  mockSupabase.from.mockReturnValue({
    select: jest.fn().mockReturnValue(chain),
  } as any);
}

describe('resolveRobloxShareUrl', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('resolves /share using manual redirect flow', async () => {
    const fetchMock = jest
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        responseWith({
          status: 302,
          headers: { location: 'https://www.roblox.com/games/606849621/Jailbreak' },
        })
      )
      .mockResolvedValueOnce(
        responseWith({
          status: 200,
          json: { universeId: 12345 },
        })
      )
      .mockResolvedValueOnce(
        responseWith({
          status: 200,
          json: {
            data: [
              {
                id: 12345,
                name: 'Jailbreak',
                rootPlaceId: 606849621,
                creator: { id: 1, name: 'Badimo' },
                description: 'A game',
              },
            ],
          },
        })
      );

    const result = await resolveRobloxShareUrl(
      'https://www.roblox.com/share?code=XYZ&type=ExperienceDetails&stamp=abc',
      { fetchFn: fetchMock }
    );

    expect(result.placeId).toBe(606849621);
    expect(result.universeId).toBe(12345);
    expect(result.gameName).toBe('Jailbreak');
    expect(result.canonicalUrl).toBe('https://www.roblox.com/games/606849621');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://www.roblox.com/share?code=XYZ&type=ExperienceDetails&stamp=abc',
      expect.objectContaining({ redirect: 'manual' })
    );
  });

  it('falls back from /share-links to /share when /share-links is rate limited', async () => {
    const fetchMock = jest
      .fn<typeof fetch>()
      .mockResolvedValueOnce(responseWith({ status: 429 }))
      .mockResolvedValueOnce(
        responseWith({
          status: 302,
          headers: { location: 'https://www.roblox.com/games/606849621/Jailbreak' },
        })
      )
      .mockResolvedValueOnce(responseWith({ status: 200, json: { universeId: 12345 } }))
      .mockResolvedValueOnce(
        responseWith({
          status: 200,
          json: {
            data: [{ id: 12345, name: 'Jailbreak' }],
          },
        })
      );

    const result = await resolveRobloxShareUrl(
      'https://www.roblox.com/share-links?code=XYZ&type=ExperienceDetails',
      { fetchFn: fetchMock }
    );

    expect(result.placeId).toBe(606849621);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://www.roblox.com/share-links?code=XYZ&type=ExperienceDetails',
      expect.objectContaining({ redirect: 'manual' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://www.roblox.com/share?code=XYZ&type=ExperienceDetails',
      expect.objectContaining({ redirect: 'manual' })
    );
  });

  it('resolves /share-links using HTML canonical extraction', async () => {
    const fetchMock = jest
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        responseWith({
          status: 200,
          text: `
            <html>
              <head>
                <link rel="canonical" href="https://www.roblox.com/games/920587237/Adopt-Me" />
              </head>
            </html>
          `,
        })
      )
      .mockResolvedValueOnce(
        responseWith({ status: 200, json: { universeId: 555 } })
      )
      .mockResolvedValueOnce(
        responseWith({
          status: 200,
          json: {
            data: [{ id: 555, name: 'Adopt Me!' }],
          },
        })
      );

    const result = await resolveRobloxShareUrl(
      'https://www.roblox.com/share-links?code=XYZ&type=ExperienceDetails',
      { fetchFn: fetchMock }
    );

    expect(result.placeId).toBe(920587237);
    expect(result.gameName).toBe('Adopt Me!');
  });

  it('resolves direct /games URL', async () => {
    const fetchMock = jest
      .fn<typeof fetch>()
      .mockResolvedValueOnce(responseWith({ status: 200, json: { universeId: 999 } }))
      .mockResolvedValueOnce(
        responseWith({
          status: 200,
          json: {
            data: [{ id: 999, name: 'Brookhaven RP' }],
          },
        })
      );

    const result = await resolveRobloxShareUrl('https://www.roblox.com/games/4924922222/Brookhaven', {
      fetchFn: fetchMock,
    });

    expect(result.placeId).toBe(4924922222);
    expect(result.universeId).toBe(999);
    expect(result.gameName).toBe('Brookhaven RP');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws for invalid share code when placeId cannot be extracted', async () => {
    const fetchMock = jest
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        responseWith({
          status: 200,
          text: '<html><head><title>Invalid</title></head><body>Not found</body></html>',
        })
      )
      .mockResolvedValueOnce(
        responseWith({
          status: 200,
          text: '<html><head><title>Invalid</title></head><body>Not found</body></html>',
        })
      );

    await expect(
      resolveRobloxShareUrl('https://www.roblox.com/share-links?code=INVALID&type=ExperienceDetails', {
        fetchFn: fetchMock,
      })
    ).rejects.toThrow('Could not extract placeId');
  });

  it('throws for unexpected redirect host (ro.blox.com)', async () => {
    const fetchMock = jest
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        responseWith({
          status: 302,
          headers: { location: 'https://ro.blox.com/Ebh5?af_web_dp=...' },
        })
      )
      .mockResolvedValueOnce(
        responseWith({
          status: 302,
          headers: { location: 'https://ro.blox.com/Ebh5?af_web_dp=...' },
        })
      );

    await expect(
      resolveRobloxShareUrl('https://www.roblox.com/share?code=XYZ&type=ExperienceDetails', {
        fetchFn: fetchMock,
      })
    ).rejects.toThrow('Unexpected redirect host');
  });
});

describe('RobloxExperienceResolverService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheMiss();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('throws AppError 404 when resolution fails and no cache exists', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      responseWith({
        status: 200,
        text: '<html><body>No game link</body></html>',
      })
    );

    const service = new RobloxExperienceResolverService();

    await expect(
      service.resolveExperienceFromUrl('https://www.roblox.com/share-links?code=BAD&type=ExperienceDetails')
    ).rejects.toMatchObject({
      code: 'NOT_FOUND_RESOURCE',
      statusCode: 404,
      message: 'Could not resolve Roblox share link',
    });
  });

  it('throws AppError 429 when Roblox share lookup is rate limited', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(responseWith({ status: 429 }));

    const service = new RobloxExperienceResolverService();

    await expect(
      service.resolveExperienceFromUrl('https://www.roblox.com/share-links?code=BAD&type=ExperienceDetails')
    ).rejects.toMatchObject({
      code: ErrorCodes.RATE_LIMIT_EXCEEDED,
      statusCode: 429,
    });
  });
});
