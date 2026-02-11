# SECURITY: OAuth State Parameter Stored Insecurely

## Severity
🔴 **HIGH**

## Category
Security / Authentication / CSRF

## Description
OAuth state parameters are stored in AsyncStorage (unencrypted on Android) instead of secure storage, weakening CSRF protection and exposing authentication flow to potential attacks.

## Affected Files
- `app/auth/roblox.tsx` (lines 35-51)
- `src/lib/pkce.ts` (PKCE generation)

## Current Implementation
```typescript
// OAuth state stored in AsyncStorage
const codeVerifier = await AsyncStorage.getItem('pkce_code_verifier');
const storedState = await AsyncStorage.getItem('pkce_state');

if (state !== storedState) {
  logger.error('State mismatch - possible CSRF attack', {
    receivedState: state,  // ← Logs the state value (security issue)
  });
  router.replace('/auth/sign-in');
  return;
}
```

## Problems

### 1. AsyncStorage is Not Encrypted
- **Android**: AsyncStorage is stored in plain text in app's data directory
- **iOS**: Better security with keychain integration, but not guaranteed
- **Rooted/Jailbroken devices**: AsyncStorage easily readable
- **App uninstall/reinstall**: Data persists (privacy issue)

### 2. State Value Logged
```typescript
logger.error('State mismatch - possible CSRF attack', {
  receivedState: state,  // ← Exposes state in logs
});
```
State parameters should NEVER be logged, as they're security tokens.

### 3. PKCE Values Persist
- Code verifier and state remain in storage after OAuth completes
- No cleanup after successful authentication
- Increases attack surface if device is compromised

### 4. Weak State Generation (Separate Issue)
State is generated client-side and validated only in app (not server-validated).

## Impact
- **Weak CSRF protection** on mobile devices
- **Token theft** if device is rooted/compromised
- **Replay attacks** if state values are exposed
- **Privacy risk** - auth tokens persisting after use

## Recommended Fix

### 1. Use Expo SecureStore (Already Available!)
```typescript
// Replace AsyncStorage with SecureStore
import * as SecureStore from 'expo-secure-store';

// Store PKCE verifier and state securely
await SecureStore.setItemAsync('pkce_code_verifier', codeVerifier);
await SecureStore.setItemAsync('pkce_state', state);

// Retrieve
const codeVerifier = await SecureStore.getItemAsync('pkce_code_verifier');
const storedState = await SecureStore.getItemAsync('pkce_state');

// IMPORTANT: Clear immediately after use
await SecureStore.deleteItemAsync('pkce_code_verifier');
await SecureStore.deleteItemAsync('pkce_state');
```

### 2. Clear Values After Use
```typescript
// In roblox.tsx OAuth callback
try {
  // Validate state
  if (state !== storedState) {
    throw new Error('State mismatch');
  }

  // Exchange code for tokens
  const tokens = await exchangeCode(code, codeVerifier);

  // ✅ CRITICAL: Clear sensitive values
  await SecureStore.deleteItemAsync('pkce_code_verifier');
  await SecureStore.deleteItemAsync('pkce_state');

  // Continue with token storage
  await tokenStorage.setTokens(tokens);
} catch (error) {
  // Clear even on error
  await SecureStore.deleteItemAsync('pkce_code_verifier');
  await SecureStore.deleteItemAsync('pkce_state');
  throw error;
}
```

### 3. Never Log State Values
```typescript
// ❌ BAD
logger.error('State mismatch - possible CSRF attack', {
  receivedState: state,  // ← Exposes secret
  storedState: storedState,
});

// ✅ GOOD
logger.error('State mismatch - possible CSRF attack', {
  stateMatches: false,
  // Don't log actual values
});
monitoring.addBreadcrumb({
  category: 'auth',
  message: 'OAuth state validation failed',
  level: 'error',
});
```

### 4. Add TTL to State Storage
```typescript
// Store state with timestamp
const stateData = {
  state: generatedState,
  timestamp: Date.now(),
};
await SecureStore.setItemAsync('pkce_state', JSON.stringify(stateData));

// Validate state AND expiry
const storedData = await SecureStore.getItemAsync('pkce_state');
if (!storedData) {
  throw new Error('State not found');
}

const { state: storedState, timestamp } = JSON.parse(storedData);
const STATE_TTL = 10 * 60 * 1000;  // 10 minutes

if (Date.now() - timestamp > STATE_TTL) {
  throw new Error('State expired');
}

if (state !== storedState) {
  throw new Error('State mismatch');
}
```

### 5. Server-Side State Validation (Backend Enhancement)
```typescript
// backend/src/routes/auth.ts
// Store state server-side, validate in callback
const validStates = new Map<string, { timestamp: number, userId?: string }>();

fastify.post('/auth/roblox/start', async (request, reply) => {
  const state = crypto.randomUUID();

  // Store server-side with TTL
  validStates.set(state, {
    timestamp: Date.now(),
    userId: request.user?.userId,  // If authenticated
  });

  // Clean up expired states
  setTimeout(() => validStates.delete(state), 10 * 60 * 1000);

  return { authorizationUrl, state };
});

fastify.post('/auth/roblox/callback', async (request, reply) => {
  const { state } = request.body;

  const stateData = validStates.get(state);
  if (!stateData) {
    throw new UnauthorizedError('Invalid or expired state');
  }

  // Validate TTL
  if (Date.now() - stateData.timestamp > 10 * 60 * 1000) {
    validStates.delete(state);
    throw new UnauthorizedError('State expired');
  }

  // Delete immediately after use (one-time use)
  validStates.delete(state);

  // Continue with token exchange
  // ...
});
```

## Complete Fixed Implementation

### Frontend (app/auth/roblox.tsx)
```typescript
import * as SecureStore from 'expo-secure-store';

// OAuth callback
const handleOAuthCallback = async (url: string) => {
  try {
    const { queryParams } = Linking.parse(url);
    const code = queryParams?.code as string;
    const state = queryParams?.state as string;

    // Retrieve from secure storage
    const storedStateData = await SecureStore.getItemAsync('pkce_state');
    const codeVerifier = await SecureStore.getItemAsync('pkce_code_verifier');

    // Clear immediately (fail or success)
    await Promise.all([
      SecureStore.deleteItemAsync('pkce_state'),
      SecureStore.deleteItemAsync('pkce_code_verifier'),
    ]);

    if (!storedStateData || !codeVerifier) {
      throw new Error('Missing OAuth state');
    }

    const { state: storedState, timestamp } = JSON.parse(storedStateData);

    // Validate TTL
    if (Date.now() - timestamp > 10 * 60 * 1000) {
      throw new Error('OAuth state expired');
    }

    // Validate state
    if (state !== storedState) {
      logger.error('OAuth state mismatch', { stateMatches: false });
      throw new Error('State validation failed');
    }

    // Exchange code for tokens
    await signInWithRoblox(code, codeVerifier, state);

    router.replace('/');
  } catch (error) {
    handleError(error, {
      fallbackMessage: 'Authentication failed',
    });
    router.replace('/auth/sign-in');
  }
};
```

## Storage Comparison

| Storage | Encryption | Platform Support | Best For |
|---------|-----------|------------------|----------|
| AsyncStorage | ❌ None | iOS, Android, Web | Non-sensitive data only |
| SecureStore | ✅ OS-level | iOS (Keychain), Android (EncryptedSharedPreferences) | Tokens, passwords, OAuth state |
| Keychain (iOS) | ✅ Hardware-backed | iOS only | Maximum security |

## Implementation Checklist
- [ ] Replace AsyncStorage with SecureStore for PKCE state/verifier
- [ ] Add TTL validation for state (10 min expiry)
- [ ] Clear values immediately after OAuth completion
- [ ] Remove state logging from error messages
- [ ] Add server-side state validation (backend)
- [ ] Test OAuth flow with new implementation
- [ ] Test state expiry handling
- [ ] Test cleanup on error paths
- [ ] Document secure storage usage in auth docs

## Testing
```typescript
describe('OAuth State Security', () => {
  test('clears state after successful OAuth', async () => {
    await handleOAuthCallback('myapp://auth?code=123&state=abc');

    const state = await SecureStore.getItemAsync('pkce_state');
    const verifier = await SecureStore.getItemAsync('pkce_code_verifier');

    expect(state).toBeNull();
    expect(verifier).toBeNull();
  });

  test('rejects expired state', async () => {
    const expiredState = JSON.stringify({
      state: 'abc',
      timestamp: Date.now() - 20 * 60 * 1000,  // 20 min ago
    });
    await SecureStore.setItemAsync('pkce_state', expiredState);

    await expect(
      handleOAuthCallback('myapp://auth?code=123&state=abc')
    ).rejects.toThrow('expired');
  });

  test('never logs state values', () => {
    const spy = jest.spyOn(logger, 'error');

    handleOAuthCallback('myapp://auth?code=123&state=WRONG');

    expect(spy).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ receivedState: expect.anything() })
    );
  });
});
```

## References
- [OAuth 2.0 Security Best Practices](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-security-topics)
- [Expo SecureStore API](https://docs.expo.dev/versions/latest/sdk/securestore/)
- [OWASP Mobile Top 10: Insecure Data Storage](https://owasp.org/www-project-mobile-top-10/)

## Priority
**P1 - High** - Authentication security vulnerability

## Estimated Effort
3-4 hours (implementation + testing + documentation)
