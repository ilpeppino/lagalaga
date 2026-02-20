import { beforeEach, describe, expect, it, jest } from '@jest/globals';

let requestMock: any;

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

const { SessionServiceV2 } = await import('../sessionService-v2.js');

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
