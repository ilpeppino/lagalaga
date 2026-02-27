import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockCreateUser = jest.fn<any>();
const mockGetUserById = jest.fn<any>();
const mockTouchLastLogin = jest.fn<any>();
const mockFindUserIdByPlatform = jest.fn<any>();
const mockLinkPlatformToUser = jest.fn<any>();

jest.unstable_mockModule('../userService.js', () => ({
  UserService: class {
    createUser = mockCreateUser;
    getUserById = mockGetUserById;
    touchLastLogin = mockTouchLastLogin;
  },
}));

jest.unstable_mockModule('../platform-identity.service.js', () => ({
  PlatformIdentityService: class {
    findUserIdByPlatform = mockFindUserIdByPlatform;
    linkPlatformToUser = mockLinkPlatformToUser;
  },
}));

const { GoogleAuthService } = await import('../google-auth.service.js');

describe('GoogleAuthService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('logs in existing google-linked user', async () => {
    mockFindUserIdByPlatform.mockResolvedValue('existing-user');
    mockLinkPlatformToUser.mockResolvedValue(undefined);
    mockTouchLastLogin.mockResolvedValue(undefined);
    mockGetUserById.mockResolvedValue({
      id: 'existing-user',
      robloxUserId: null,
      robloxUsername: null,
      status: 'ACTIVE',
      tokenVersion: 0,
    });

    const service = new GoogleAuthService({} as any);
    const user = await service.resolveUserForGoogleLogin({
      sub: 'google-sub-existing',
      email: 'existing@example.com',
      email_verified: true,
      name: 'Existing User',
      picture: 'https://example.com/avatar.png',
      iss: 'https://accounts.google.com',
      aud: 'google-client-id',
    });

    expect(user.id).toBe('existing-user');
    expect(mockCreateUser).not.toHaveBeenCalled();
    expect(mockLinkPlatformToUser).toHaveBeenCalledTimes(1);
  });

  it('creates a google-first user when no link exists', async () => {
    mockFindUserIdByPlatform.mockResolvedValue(null);
    mockCreateUser.mockResolvedValue({ id: 'new-user' });
    mockLinkPlatformToUser.mockResolvedValue(undefined);
    mockTouchLastLogin.mockResolvedValue(undefined);
    mockGetUserById.mockResolvedValue({
      id: 'new-user',
      robloxUserId: null,
      robloxUsername: null,
      status: 'ACTIVE',
      tokenVersion: 0,
    });

    const service = new GoogleAuthService({} as any);
    const user = await service.resolveUserForGoogleLogin({
      sub: 'google-sub-new',
      email: 'new@example.com',
      email_verified: true,
      name: 'New User',
      picture: 'https://example.com/new-avatar.png',
      iss: 'https://accounts.google.com',
      aud: 'google-client-id',
    });

    expect(user.id).toBe('new-user');
    expect(mockCreateUser).toHaveBeenCalledTimes(1);
    expect(mockLinkPlatformToUser).toHaveBeenCalledTimes(1);
    expect(mockTouchLastLogin).toHaveBeenCalledWith('new-user');
  });
});
