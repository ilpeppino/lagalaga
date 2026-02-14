import Fastify from 'fastify';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { buildMeRoutes } from '../../routes/me.routes.js';
import { errorHandlerPlugin } from '../../plugins/errorHandler.js';
import type { FastifyInstance } from 'fastify';

interface MockDbState {
  appUser: {
    id: string;
    roblox_username: string;
    roblox_display_name: string | null;
  } | null;
  userPlatform: {
    user_id: string;
    platform_id: string;
    platform_user_id: string;
    platform_username: string | null;
    platform_display_name: string | null;
    platform_avatar_url: string | null;
    verified_at: string | null;
  } | null;
}

function createSupabaseMock(state: MockDbState) {
  return {
    from: jest.fn((table: string) => {
      if (table === 'app_users') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              maybeSingle: async () => ({
                data: state.appUser,
                error: null,
              }),
            })),
          })),
        };
      }

      if (table === 'user_platforms') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              eq: jest.fn(() => ({
                maybeSingle: async () => ({
                  data: state.userPlatform,
                  error: state.userPlatform ? null : { code: 'PGRST116' },
                }),
              })),
            })),
          })),
          update: jest.fn(() => ({
            eq: jest.fn(() => ({
              eq: jest.fn(async () => ({
                error: null,
              })),
            })),
          })),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
  };
}

describe('GET /api/me', () => {
  let app: FastifyInstance;
  let mockFetch: jest.Mock;

  beforeEach(async () => {
    jest.clearAllMocks();

    app = Fastify();
    await app.register(errorHandlerPlugin);

    // Mock auth prehandler
    const mockAuthPreHandler = async (request: any) => {
      request.user = {
        userId: 'test-user-id',
        robloxUserId: '123456789',
        robloxUsername: 'TestUser',
      };
    };

    // Register routes with mock auth
    await app.register(buildMeRoutes({ authPreHandler: mockAuthPreHandler }), {
      prefix: '/api/me',
    });

    // Mock fetch
    mockFetch = jest.fn() as jest.Mock;
    global.fetch = mockFetch as any;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should return connected=true with avatar headshot when user is connected', async () => {
    const mockDbState: MockDbState = {
      appUser: {
        id: 'test-user-id',
        roblox_username: 'TestUser',
        roblox_display_name: 'Test Display Name',
      },
      userPlatform: {
        user_id: 'test-user-id',
        platform_id: 'roblox',
        platform_user_id: '123456789',
        platform_username: 'TestUser',
        platform_display_name: 'Test Display Name',
        platform_avatar_url: 'https://cached-avatar-url.com/old.png',
        verified_at: '2024-01-01T00:00:00.000Z',
      },
    };

    // Mock Supabase
    const mockSupabase = createSupabaseMock(mockDbState);
    jest.mock('../../config/supabase.js', () => ({
      getSupabase: () => mockSupabase,
    }));

    // Mock successful Roblox thumbnail fetch
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          {
            targetId: 123456789,
            state: 'Completed',
            imageUrl: 'https://roblox-avatar.com/fresh.png',
          },
        ],
      }),
    });

    // Import service after mocking
    const { getMeData } = await import('../../services/me.service.js');
    const result = await getMeData('test-user-id', app);

    expect(result).toEqual({
      appUser: {
        id: 'test-user-id',
        email: null,
        displayName: 'Test Display Name',
      },
      roblox: {
        connected: true,
        robloxUserId: '123456789',
        username: 'TestUser',
        displayName: 'Test Display Name',
        avatarHeadshotUrl: 'https://roblox-avatar.com/fresh.png',
        verifiedAt: '2024-01-01T00:00:00.000Z',
      },
    });
  });

  it('should return connected=false when no user_platforms row exists', async () => {
    const mockDbState: MockDbState = {
      appUser: {
        id: 'test-user-id',
        roblox_username: 'TestUser',
        roblox_display_name: null,
      },
      userPlatform: null,
    };

    // Mock Supabase
    const mockSupabase = createSupabaseMock(mockDbState);
    jest.mock('../../config/supabase.js', () => ({
      getSupabase: () => mockSupabase,
    }));

    const { getMeData } = await import('../../services/me.service.js');
    const result = await getMeData('test-user-id', app);

    expect(result).toEqual({
      appUser: {
        id: 'test-user-id',
        email: null,
        displayName: 'TestUser', // Falls back to username
      },
      roblox: {
        connected: false,
        robloxUserId: null,
        username: null,
        displayName: null,
        avatarHeadshotUrl: null,
        verifiedAt: null,
      },
    });

    // Should not call thumbnail API
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should return connected=true with cached avatar when thumbnail API fails', async () => {
    const mockDbState: MockDbState = {
      appUser: {
        id: 'test-user-id',
        roblox_username: 'TestUser',
        roblox_display_name: 'Test Display Name',
      },
      userPlatform: {
        user_id: 'test-user-id',
        platform_id: 'roblox',
        platform_user_id: '123456789',
        platform_username: 'TestUser',
        platform_display_name: 'Test Display Name',
        platform_avatar_url: 'https://cached-avatar-url.com/cached.png',
        verified_at: '2024-01-01T00:00:00.000Z',
      },
    };

    // Mock Supabase
    const mockSupabase = createSupabaseMock(mockDbState);
    jest.mock('../../config/supabase.js', () => ({
      getSupabase: () => mockSupabase,
    }));

    // Mock failed Roblox thumbnail fetch (timeout)
    mockFetch.mockRejectedValueOnce(new Error('fetch failed'));

    const { getMeData } = await import('../../services/me.service.js');
    const result = await getMeData('test-user-id', app);

    expect(result).toEqual({
      appUser: {
        id: 'test-user-id',
        email: null,
        displayName: 'Test Display Name',
      },
      roblox: {
        connected: true,
        robloxUserId: '123456789',
        username: 'TestUser',
        displayName: 'Test Display Name',
        avatarHeadshotUrl: 'https://cached-avatar-url.com/cached.png', // Falls back to cached
        verifiedAt: '2024-01-01T00:00:00.000Z',
      },
    });
  });

  it('should handle GET /api/me endpoint with authentication', async () => {
    const mockDbState: MockDbState = {
      appUser: {
        id: 'test-user-id',
        roblox_username: 'TestUser',
        roblox_display_name: 'Test Display Name',
      },
      userPlatform: {
        user_id: 'test-user-id',
        platform_id: 'roblox',
        platform_user_id: '123456789',
        platform_username: 'TestUser',
        platform_display_name: 'Test Display Name',
        platform_avatar_url: null,
        verified_at: '2024-01-01T00:00:00.000Z',
      },
    };

    // Mock Supabase
    const mockSupabase = createSupabaseMock(mockDbState);
    jest.mock('../../config/supabase.js', () => ({
      getSupabase: () => mockSupabase,
    }));

    // Mock successful Roblox thumbnail fetch
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          {
            targetId: 123456789,
            state: 'Completed',
            imageUrl: 'https://roblox-avatar.com/avatar.png',
          },
        ],
      }),
    });

    const response = await request(app.server)
      .get('/api/me')
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.appUser.id).toBe('test-user-id');
    expect(response.body.data.roblox.connected).toBe(true);
  });
});
