# TESTING: Critical Test Coverage Gaps

## Severity
🔴 **CRITICAL**

## Category
Testing / Quality Assurance

## Description
The codebase has only **2 test files** for **27+ backend modules** and **19+ frontend files**, resulting in ~2% test coverage. Critical authentication, session management, and API endpoints are completely untested.

## Current State
- **Backend**: Only `session-flow.test.ts` and `roblox-link-normalizer.test.ts`
- **Frontend**: Zero tests
- **Test coverage**: ~2% (far below 90% threshold in jest.config)
- **API endpoints**: 0% coverage (11+ routes untested)
- **Services**: 0% coverage (SessionServiceV2, UserService, RobloxOAuthService untested)

## Critical Untested Components

### Backend API Endpoints (Risk: CRITICAL)
- ❌ `/auth/roblox/start` - OAuth initialization
- ❌ `/auth/roblox/callback` - Token exchange, user creation
- ❌ `/auth/refresh` - JWT refresh logic
- ❌ `/auth/revoke` - Token blacklisting
- ❌ `/auth/me` - User profile
- ❌ `/api/sessions` (POST) - Session creation
- ❌ `/api/sessions` (GET) - List with filters
- ❌ `/api/sessions/:id` (GET) - Session detail
- ❌ `/api/sessions/:id/join` - Capacity/visibility validation
- ❌ `/api/invites/:code` - Invite lookup
- ❌ `/api/user/sessions` - User's sessions

### Backend Services (Risk: HIGH)
- ❌ `SessionServiceV2` - All methods untested
- ❌ `UserService` - User CRUD operations
- ❌ `RobloxOAuthService` - OAuth flow
- ❌ `TokenService` - JWT generation/verification

### Middleware (Risk: HIGH)
- ❌ `authenticate` - JWT verification
- ❌ `errorHandler` - Error response formatting
- ❌ CORS plugin
- ❌ Logging middleware

### Frontend Hooks (Risk: HIGH)
- ❌ `useAuth` - Authentication state
- ❌ `useSession` - Session management
- ❌ All session hooks

### Frontend Components (Risk: MEDIUM)
- ❌ `ErrorFallback`
- ❌ `AuthProvider`
- ❌ All Paper UI components
- ❌ Navigation components

## Impact Without Tests
- **No regression detection** - Changes can break existing features
- **No validation** of critical flows (auth, session join)
- **High risk** of production bugs
- **Slow development** - manual testing required
- **Poor code quality** - no enforcement
- **Difficult refactoring** - fear of breaking things

## Recommended Fix - Phased Approach

### Phase 1: Critical Auth & Session Tests (Week 1)
Priority: P0 - Must have before production

#### 1. Auth Routes Tests
```typescript
// backend/src/__tests__/routes/auth.test.ts
describe('POST /auth/roblox/start', () => {
  test('generates authorization URL with valid params', async () => {
    const response = await fastify.inject({
      method: 'POST',
      url: '/auth/roblox/start',
      payload: { codeChallenge: 'valid_challenge' }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveProperty('authorizationUrl');
    expect(response.json().authorizationUrl).toContain('authorize.roblox.com');
  });

  test('rejects invalid code challenge', async () => {
    const response = await fastify.inject({
      method: 'POST',
      url: '/auth/roblox/start',
      payload: { codeChallenge: '' }
    });

    expect(response.statusCode).toBe(400);
  });
});

describe('POST /auth/roblox/callback', () => {
  test('exchanges code for tokens and creates user', async () => {
    // Mock Roblox API responses
    nock('https://apis.roblox.com')
      .post('/oauth/v1/token')
      .reply(200, { access_token: 'mock_token', id_token: 'mock_id_token' });

    const response = await fastify.inject({
      method: 'POST',
      url: '/auth/roblox/callback',
      payload: {
        code: 'auth_code',
        state: 'valid_state',
        codeVerifier: 'valid_verifier'
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveProperty('accessToken');
    expect(response.json()).toHaveProperty('refreshToken');
  });

  test('rejects invalid state (CSRF protection)', async () => {
    const response = await fastify.inject({
      method: 'POST',
      url: '/auth/roblox/callback',
      payload: {
        code: 'auth_code',
        state: 'invalid_state',
        codeVerifier: 'valid_verifier'
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('INVALID_STATE');
  });
});
```

#### 2. SessionServiceV2 Tests
```typescript
// backend/src/__tests__/services/sessionService-v2.test.ts
describe('SessionServiceV2.joinSession', () => {
  test('allows user to join public session', async () => {
    const session = await createTestSession({ visibility: 'public' });
    const user = await createTestUser();

    const result = await sessionService.joinSession(
      session.id,
      user.id,
      null,
      mockContext
    );

    expect(result.success).toBe(true);
  });

  test('rejects join when at capacity', async () => {
    const session = await createTestSession({ maxParticipants: 2 });
    await addParticipants(session.id, 2);  // Fill to capacity
    const user = await createTestUser();

    await expect(
      sessionService.joinSession(session.id, user.id, null, mockContext)
    ).rejects.toThrow('Session is at capacity');
  });

  test('rejects invite_only session without valid code', async () => {
    const session = await createTestSession({ visibility: 'invite_only' });
    const user = await createTestUser();

    await expect(
      sessionService.joinSession(session.id, user.id, null, mockContext)
    ).rejects.toThrow('Invite code required');
  });

  test('allows join with valid invite code', async () => {
    const session = await createTestSession({ visibility: 'invite_only' });
    const invite = await createTestInvite(session.id);
    const user = await createTestUser();

    const result = await sessionService.joinSession(
      session.id,
      user.id,
      invite.inviteCode,
      mockContext
    );

    expect(result.success).toBe(true);
  });

  test('rejects if user already joined', async () => {
    const session = await createTestSession();
    const user = await createTestUser();
    await sessionService.joinSession(session.id, user.id, null, mockContext);

    await expect(
      sessionService.joinSession(session.id, user.id, null, mockContext)
    ).rejects.toThrow('Already joined');
  });
});

describe('SessionServiceV2.createSession', () => {
  test('creates session with game details', async () => {
    const input = {
      robloxUrl: 'https://www.roblox.com/games/12345/Game-Name',
      title: 'Test Session',
      visibility: 'public',
      maxParticipants: 10,
    };

    const result = await sessionService.createSession(input, mockContext);

    expect(result.session.title).toBe('Test Session');
    expect(result.session.placeId).toBe('12345');
    expect(result.inviteCode).toMatch(/^[A-Z2-9]{9}$/);
  });

  test('validates required fields', async () => {
    const input = { robloxUrl: '', title: '', visibility: 'public' };

    await expect(
      sessionService.createSession(input, mockContext)
    ).rejects.toThrow('Validation error');
  });
});
```

### Phase 2: Frontend Core Tests (Week 2)
Priority: P1 - High value

#### 3. useAuth Hook Tests
```typescript
// src/features/auth/__tests__/useAuth.test.tsx
import { renderHook, act } from '@testing-library/react-hooks';
import { useAuth } from '../useAuth';

describe('useAuth', () => {
  test('loads user from stored token', async () => {
    // Mock token storage
    tokenStorage.getToken.mockResolvedValue('mock_token');

    const { result, waitForNextUpdate } = renderHook(() => useAuth());

    expect(result.current.loading).toBe(true);
    await waitForNextUpdate();
    expect(result.current.user).toBeDefined();
    expect(result.current.loading).toBe(false);
  });

  test('clears user on sign out', async () => {
    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.signOut();
    });

    expect(result.current.user).toBeNull();
    expect(tokenStorage.clearTokens).toHaveBeenCalled();
  });
});
```

#### 4. API Client Tests
```typescript
// src/lib/__tests__/api.test.ts
describe('API Client', () => {
  test('adds Authorization header when authenticated', async () => {
    tokenStorage.getToken.mockResolvedValue('mock_token');

    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: 'test' })
    });
    global.fetch = mockFetch;

    await apiClient.get('/test');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'Authorization': 'Bearer mock_token'
        })
      })
    );
  });

  test('refreshes token on 401 response', async () => {
    tokenStorage.getToken.mockResolvedValue('old_token');
    tokenStorage.getRefreshToken.mockResolvedValue('refresh_token');

    const mockFetch = jest.fn()
      .mockResolvedValueOnce({  // First call: 401
        ok: false,
        status: 401,
        json: async () => ({ error: 'UNAUTHORIZED' })
      })
      .mockResolvedValueOnce({  // Refresh call
        ok: true,
        json: async () => ({ accessToken: 'new_token' })
      })
      .mockResolvedValueOnce({  // Retry call
        ok: true,
        json: async () => ({ data: 'success' })
      });

    global.fetch = mockFetch;

    const result = await apiClient.get('/test');

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ data: 'success' });
  });
});
```

### Phase 3: Integration & E2E Tests (Week 3-4)
Priority: P2 - Important for quality

#### 5. E2E Auth Flow
```typescript
// e2e/__tests__/auth-flow.e2e.ts
describe('Complete OAuth Flow', () => {
  test('user can sign in with Roblox', async () => {
    // Start app
    await device.launchApp();

    // Tap sign in button
    await element(by.id('sign-in-roblox')).tap();

    // Browser opens (mock OAuth callback)
    // ... handle OAuth flow ...

    // User should be redirected back to app
    await waitFor(element(by.id('home-screen')))
      .toBeVisible()
      .withTimeout(5000);

    // Verify user is authenticated
    await expect(element(by.id('user-profile'))).toBeVisible();
  });
});
```

## Test Infrastructure Setup

### Install Dependencies
```bash
# Backend
npm install --save-dev @testing-library/jest-dom jest-mock-extended nock

# Frontend
npm install --save-dev @testing-library/react-native @testing-library/jest-native jest-expo
```

### Create Test Utilities
```typescript
// backend/src/__tests__/helpers/test-utils.ts
export async function createTestUser(overrides = {}) {
  return await supabase.from('users').insert({
    roblox_user_id: `test_${Date.now()}`,
    roblox_username: 'testuser',
    ...overrides
  }).single();
}

export async function createTestSession(overrides = {}) {
  const user = await createTestUser();
  return await supabase.from('sessions').insert({
    title: 'Test Session',
    host_id: user.id,
    place_id: '12345',
    visibility: 'public',
    max_participants: 10,
    ...overrides
  }).single();
}
```

## Coverage Targets
- **Phase 1**: 60% coverage on auth + session routes/services
- **Phase 2**: 70% coverage with frontend hooks
- **Phase 3**: 80% overall coverage with E2E tests

## Implementation Checklist
- [ ] Phase 1: Auth + Session tests (1 week)
  - [ ] Auth routes tests
  - [ ] SessionServiceV2 tests
  - [ ] TokenService tests
  - [ ] Middleware tests
- [ ] Phase 2: Frontend core (1 week)
  - [ ] useAuth tests
  - [ ] API client tests
  - [ ] Error handling tests
- [ ] Phase 3: Integration + E2E (2 weeks)
  - [ ] Complete OAuth flow
  - [ ] Session creation → join flow
  - [ ] Invite flow
- [ ] Test infrastructure
  - [ ] Test utilities/factories
  - [ ] Database seeding
  - [ ] Mock strategies
- [ ] CI/CD integration
  - [ ] Run tests on PR
  - [ ] Coverage reporting
  - [ ] Block merge if coverage drops

## References
- [Testing Library](https://testing-library.com/)
- [Jest Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)
- [Fastify Testing](https://www.fastify.io/docs/latest/Guides/Testing/)

## Priority
**P0 - Critical** - Blocking production launch

## Estimated Effort
3-4 weeks for comprehensive test suite
- Week 1: Auth + Session tests (40 hours)
- Week 2: Frontend core tests (40 hours)
- Week 3-4: Integration + E2E tests (80 hours)

**Quick Win**: Focus on Phase 1 first (auth + sessions) = 1 week, 60% coverage
