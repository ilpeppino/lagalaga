import { beforeEach, describe, expect, it, jest } from '@jest/globals';

let requestMock: any;
let activeSupabaseMock: any;

jest.unstable_mockModule('undici', () => ({
  request: (...args: any[]) => requestMock(...args),
}));

jest.unstable_mockModule('../roblox-link-normalizer.js', () => ({
  RobloxLinkNormalizer: class {
    normalize = jest.fn();
  },
}));

jest.unstable_mockModule('../roblox-enrichment.service.js', () => ({
  RobloxEnrichmentService: class {},
}));

jest.unstable_mockModule('../pushNotificationService.js', () => ({
  PushNotificationService: class {
    sendSessionInviteNotification = jest.fn();
  },
}));

jest.unstable_mockModule('../../config/supabase.js', () => ({
  getSupabase: () => activeSupabaseMock,
}));

const { SessionServiceV2, generateInviteCode } = await import('../sessionService-v2.js');

describe('SessionServiceV2 handoff column helpers', () => {
  let service: InstanceType<typeof SessionServiceV2>;

  beforeEach(() => {
    service = new SessionServiceV2();
  });

  it('detects missing handoff_state column errors', () => {
    const matcher = (service as any).isMissingHandoffStateColumn.bind(service);
    expect(matcher({ message: "column 'handoff_state' does not exist" })).toBe(true);
    expect(matcher({ message: 'different error' })).toBe(false);
  });

  it('retries participant insert without handoff_state when column is missing', async () => {
    const insert = jest.fn() as any;
    insert.mockResolvedValueOnce({ error: { message: "column 'handoff_state' does not exist" } });
    insert.mockResolvedValueOnce({ error: null });

    const supabase = {
      from: jest.fn(() => ({ insert })),
    };

    const payload = {
      session_id: 's1',
      user_id: 'u1',
      role: 'host',
      state: 'joined',
      handoff_state: 'rsvp_joined',
    } as any;

    const error = await (service as any).insertParticipant(supabase, payload);

    expect(error).toBeNull();
    expect(insert).toHaveBeenCalledTimes(2);
    expect(insert.mock.calls[1][0]).not.toHaveProperty('handoff_state');
  });
});

describe('SessionServiceV2 share link helpers', () => {
  let service: InstanceType<typeof SessionServiceV2>;

  beforeEach(() => {
    service = new SessionServiceV2();
    requestMock = jest.fn();
  });

  it('parses Roblox share links and normalizes URL', () => {
    const result = (service as any).parseShareLink('https://www.roblox.com/share?code=ABC&type=ExperienceDetails&stamp=1');

    expect(result).toEqual({
      canonicalUrl: 'https://www.roblox.com/share-links?code=ABC&type=ExperienceDetails',
      normalizedFrom: 'share_link',
    });

    expect((service as any).parseShareLink('https://example.com/share?code=123')).toBeNull();
  });

  it('extracts placeId from share link HTML meta tag', async () => {
    requestMock.mockResolvedValue({
      statusCode: 200,
      body: {
        text: async () => '<meta name="roblox:start_place_id" content="98765" />',
      },
    });

    const placeId = await (service as any).resolveShareLinkPlaceId('https://www.roblox.com/share-links?code=abc&type=ExperienceDetails');
    expect(placeId).toBe(98765);
  });
});

describe('generateInviteCode', () => {
  it('generates a 12-character code with allowed characters only', () => {
    const code = generateInviteCode();
    expect(code).toHaveLength(12);
    expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{12}$/);
  });

  it('produces unique values across a large sample', () => {
    const sampleSize = 1000;
    const codes = new Set<string>();
    for (let i = 0; i < sampleSize; i += 1) {
      codes.add(generateInviteCode());
    }
    expect(codes.size).toBe(sampleSize);
  });
});

describe('SessionServiceV2.listSessions RPC optimization', () => {
  let service: InstanceType<typeof SessionServiceV2>;

  beforeEach(() => {
    service = new SessionServiceV2();
  });

  it('uses list_sessions_optimized RPC and maps response rows', async () => {
    const rpc: any = jest.fn(async (..._args: any[]) => ({
      data: [
        {
          id: 'session-1',
          place_id: 606849621,
          host_id: 'host-1',
          title: 'Test Session',
          description: null,
          visibility: 'public',
          is_ranked: false,
          status: 'active',
          max_participants: 10,
          participant_count: 3,
          scheduled_start: null,
          game_place_id: 606849621,
          game_name: 'Jailbreak',
          thumbnail_url: 'https://example.com/thumb.png',
          canonical_web_url: 'https://www.roblox.com/games/606849621',
          canonical_start_url: 'https://www.roblox.com/games/start?placeId=606849621',
          created_at: '2026-02-23T00:00:00.000Z',
          total_count: 1,
        },
      ],
      error: null,
    }));
    activeSupabaseMock = { rpc };

    const result = await service.listSessions({ status: 'active', limit: 20, offset: 0 });

    expect(rpc).toHaveBeenCalledWith('list_sessions_optimized', {
      p_status: 'active',
      p_visibility: null,
      p_place_id: null,
      p_host_id: null,
      p_requester_id: null,
      p_limit: 20,
      p_offset: 0,
    });
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]).toMatchObject({
      id: 'session-1',
      currentParticipants: 3,
      game: {
        gameName: 'Jailbreak',
      },
    });
    expect(result.pagination).toEqual({
      total: 1,
      limit: 20,
      offset: 0,
      hasMore: false,
    });
  });

  it('falls back to legacy RPC signature when requester-aware function is unavailable', async () => {
    const rpc: any = jest.fn();
    rpc.mockImplementationOnce(async () => ({
      data: null,
      error: { message: 'Could not find the function public.list_sessions_optimized(p_status, p_visibility, p_place_id, p_host_id, p_requester_id, p_limit, p_offset) in the schema cache' },
    }));
    rpc.mockImplementationOnce(async () => ({
      data: [],
      error: null,
    }));
    activeSupabaseMock = { rpc };

    const result = await service.listSessions({ requesterId: 'user-1', limit: 10, offset: 5 });

    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[1][0]).toBe('list_sessions_optimized');
    expect(rpc.mock.calls[1][1]).toEqual({
      p_status: null,
      p_visibility: null,
      p_place_id: null,
      p_host_id: null,
      p_limit: 10,
      p_offset: 5,
    });
    expect(result.sessions).toEqual([]);
    expect(result.pagination).toEqual({
      total: 0,
      limit: 10,
      offset: 5,
      hasMore: false,
    });
  });
});
