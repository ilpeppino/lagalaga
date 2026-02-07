# Epic 9: Roblox OAuth Integration - Testing Guide

## Overview

Epic 9 implements secure Roblox OAuth 2.0 authentication with PKCE (Proof Key for Code Exchange) flow. This allows users to connect their Roblox accounts to LagaLaga for verified identity and enhanced features.

**Status:** ✅ Already Implemented (completed in earlier phases)

---

## Implementation Summary

### What's Implemented

**Backend (Fastify):**
- ✅ Roblox OAuth service with PKCE support
- ✅ Token exchange and validation
- ✅ User info retrieval from Roblox
- ✅ JWT token generation (access + refresh)
- ✅ State parameter for CSRF protection
- ✅ Secure user storage in database

**Frontend (React Native/Expo):**
- ✅ PKCE code generation (verifier + challenge)
- ✅ Secure token storage (SecureStore)
- ✅ OAuth callback handler
- ✅ Auth context provider
- ✅ Auto token refresh on 401
- ✅ Sign in with Roblox button

---

## OAuth Flow Architecture

```
┌─────────────┐         ┌──────────────┐         ┌───────────┐
│             │         │              │         │           │
│  Expo App   │────────▶│   Backend    │────────▶│ Supabase  │
│  (Client)   │         │   (Fastify)  │         │ Database  │
│             │         │              │         │           │
└─────────────┘         └──────────────┘         └───────────┘
       │                       │
       │                       │
       │                       ▼
       │                ┌──────────────┐
       └───────────────▶│   Roblox     │
                        │   OAuth      │
                        └──────────────┘
```

---

## OAuth Flow Sequence

### Complete Authentication Flow

1. **User Initiates Sign In**
   - User taps "Sign in with Roblox" button
   - App generates PKCE parameters

2. **PKCE Generation (Client)**
   - Generate `code_verifier` (random 43-128 chars)
   - Generate `code_challenge` = SHA256(code_verifier)
   - Generate `state` (random 32 bytes for CSRF)
   - Store verifier and state in AsyncStorage

3. **Authorization Request**
   - App calls `POST /auth/roblox/start` with code_challenge
   - Backend generates state parameter
   - Backend returns Roblox authorization URL

4. **User Authorization**
   - App opens WebBrowser with authorization URL
   - User approves on Roblox website
   - Roblox redirects to `lagalaga://auth/roblox?code=...&state=...`

5. **Callback Handling**
   - App receives callback with `code` and `state`
   - App retrieves stored `code_verifier` and `state`
   - App validates state matches (CSRF protection)

6. **Token Exchange**
   - App calls `POST /auth/roblox/callback` with:
     - `code`
     - `state`
     - `code_verifier`
   - Backend validates state
   - Backend exchanges code with Roblox (sends code_verifier)
   - Roblox validates PKCE and returns tokens

7. **User Creation**
   - Backend gets user info from Roblox
   - Backend upserts user in `app_users` table
   - Backend generates Lagalaga JWT tokens

8. **Session Establishment**
   - App stores tokens in SecureStore
   - App loads user profile
   - App redirects to `/sessions`

---

## Testing Scenarios

### Test 1: Sign In with Roblox (Happy Path)

**Prerequisites:**
- Backend running on localhost:3001
- Roblox OAuth app configured
- Valid Roblox account

**Steps:**
1. Open LagaLaga app
2. Navigate to sign-in screen
3. Tap "Sign in with Roblox"
4. Browser opens with Roblox authorization page
5. Sign in to Roblox (if not already)
6. Tap "Authorize" to approve app access
7. Browser redirects to `lagalaga://auth/roblox`
8. App processes callback

**Expected Result:**
- ✅ User successfully signed in
- ✅ Redirected to `/sessions` screen
- ✅ User profile loaded
- ✅ Tokens stored in SecureStore
- ✅ User record created in database

**Verification:**
```bash
# Check backend logs
# Should see:
# - Authorization URL generated
# - Token exchange successful
# - User upserted
# - JWT tokens generated

# Check database
# Query app_users table for new user
```

---

### Test 2: CSRF Protection (State Validation)

**Prerequisites:**
- Backend running
- OAuth flow initiated

**Steps:**
1. Start OAuth flow
2. Note the `state` parameter in URL
3. Modify `state` parameter manually
4. Complete callback with modified state

**Expected Result:**
- ❌ Sign in fails
- ✅ Error: "Invalid or expired state parameter"
- ✅ User NOT authenticated
- ✅ No tokens stored
- ✅ Redirected to sign-in screen

**Security Check:**
- State mismatch prevents CSRF attacks
- Expired states cleaned up automatically

---

### Test 3: PKCE Validation

**Prerequisites:**
- Backend running
- OAuth flow initiated

**Steps:**
1. Start OAuth flow with valid code_challenge
2. In callback, send incorrect code_verifier
3. Attempt to complete authentication

**Expected Result:**
- ❌ Token exchange fails at Roblox
- ✅ Error from Roblox OAuth server
- ✅ User NOT authenticated
- ✅ No tokens stored

**Security Check:**
- PKCE prevents authorization code interception
- Code verifier must match challenge

---

### Test 4: Token Refresh

**Prerequisites:**
- User signed in
- Access token expired (15 minutes old)

**Steps:**
1. Make authenticated API request after token expires
2. Observe auto-refresh behavior

**Expected Result:**
- ✅ Request returns 401 Unauthorized
- ✅ API client automatically calls `/auth/refresh`
- ✅ New access token obtained
- ✅ Original request retried with new token
- ✅ Request succeeds
- ✅ User unaware of refresh

**Verification:**
```typescript
// Check API client logs
// Should see:
// 1. Request fails with 401
// 2. Refresh token request
// 3. New tokens received
// 4. Original request retried
// 5. Success
```

---

### Test 5: Sign Out

**Prerequisites:**
- User signed in

**Steps:**
1. Tap sign out button
2. Observe cleanup behavior

**Expected Result:**
- ✅ Calls `/auth/revoke` endpoint
- ✅ Tokens cleared from SecureStore
- ✅ User state cleared
- ✅ Redirected to sign-in screen
- ✅ Cannot access protected routes

---

### Test 6: OAuth Cancellation

**Prerequisites:**
- OAuth flow initiated

**Steps:**
1. Tap "Sign in with Roblox"
2. Browser opens
3. Tap "Cancel" or close browser

**Expected Result:**
- ✅ Flow cancelled gracefully
- ✅ Temporary PKCE data cleaned up
- ✅ User returned to sign-in screen
- ✅ No partial auth state

---

### Test 7: Invalid/Expired Authorization Code

**Prerequisites:**
- OAuth flow initiated

**Steps:**
1. Complete OAuth flow
2. Try to use the same authorization code again

**Expected Result:**
- ❌ Token exchange fails
- ✅ Error: "Invalid authorization code"
- ✅ User NOT authenticated
- ✅ Redirected to sign-in screen

---

### Test 8: Network Error Handling

**Prerequisites:**
- Backend offline or unreachable

**Steps:**
1. Tap "Sign in with Roblox"
2. Backend unavailable

**Expected Result:**
- ❌ Sign in fails gracefully
- ✅ User-friendly error message
- ✅ No app crash
- ✅ Can retry sign in

---

## API Endpoints

### Backend OAuth Endpoints

#### 1. Start OAuth Flow

**Endpoint:** `POST /auth/roblox/start`

**Request:**
```json
{
  "codeChallenge": "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
}
```

**Response:**
```json
{
  "authorizationUrl": "https://apis.roblox.com/oauth/v1/authorize?client_id=...",
  "state": "abc123..."
}
```

---

#### 2. Complete OAuth Callback

**Endpoint:** `POST /auth/roblox/callback`

**Request:**
```json
{
  "code": "auth_code_from_roblox",
  "state": "abc123...",
  "codeVerifier": "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
}
```

**Response:**
```json
{
  "accessToken": "lagalaga_jwt_access_token",
  "refreshToken": "lagalaga_jwt_refresh_token",
  "expiresIn": 900,
  "user": {
    "id": "uuid",
    "robloxUserId": "123456789",
    "robloxUsername": "PlayerName",
    "robloxDisplayName": "Display Name",
    "robloxProfileUrl": "https://www.roblox.com/users/123456789"
  }
}
```

---

#### 3. Refresh Access Token

**Endpoint:** `POST /auth/refresh`

**Request:**
```json
{
  "refreshToken": "lagalaga_jwt_refresh_token"
}
```

**Response:**
```json
{
  "accessToken": "new_lagalaga_jwt_access_token",
  "expiresIn": 900
}
```

---

#### 4. Revoke Tokens (Sign Out)

**Endpoint:** `POST /auth/revoke`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "success": true
}
```

---

#### 5. Get Current User

**Endpoint:** `GET /auth/me`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "user": {
    "id": "uuid",
    "robloxUserId": "123456789",
    "robloxUsername": "PlayerName",
    "robloxDisplayName": "Display Name"
  }
}
```

---

## Security Features

### 1. PKCE (Proof Key for Code Exchange)

**Purpose:** Prevents authorization code interception attacks

**How it works:**
- Client generates random `code_verifier`
- Client creates `code_challenge` = SHA256(verifier)
- Challenge sent to authorization endpoint
- Verifier sent to token endpoint
- Roblox validates verifier matches challenge

**Security Benefit:**
- Even if authorization code is intercepted, attacker cannot exchange it without the verifier

---

### 2. State Parameter (CSRF Protection)

**Purpose:** Prevents Cross-Site Request Forgery

**How it works:**
- Backend generates random state
- State sent to Roblox in authorization URL
- Roblox includes state in callback
- Backend validates state matches

**Security Benefit:**
- Prevents attackers from forging OAuth callbacks
- State expires after 10 minutes

---

### 3. JWT Tokens

**Access Token:**
- Lifespan: 15 minutes
- Used for API authentication
- Stored in SecureStore (encrypted)
- Auto-refreshed on expiration

**Refresh Token:**
- Lifespan: 7 days
- Used to obtain new access tokens
- Stored in SecureStore (encrypted)
- Revoked on sign out

**Security Benefit:**
- Short-lived access tokens minimize exposure
- Refresh tokens allow seamless reauthentication

---

### 4. Secure Storage

**Native (iOS/Android):**
- Uses expo-secure-store
- Encrypted keychain storage
- OS-level security

**Web:**
- Uses localStorage
- Not as secure as native
- Acceptable for web UX

**Security Benefit:**
- Tokens protected from unauthorized access
- Automatic cleanup on app uninstall

---

### 5. Backend Token Validation

**Every Protected Endpoint:**
- Validates JWT signature
- Checks token expiration
- Verifies user exists

**Security Benefit:**
- Invalid tokens rejected
- Expired tokens trigger refresh
- Deleted users cannot access

---

## File Structure

### Backend Files

```
backend/src/
├── routes/
│   └── auth.ts                    # OAuth endpoints
├── services/
│   ├── robloxOAuth.ts            # Roblox OAuth client
│   ├── tokenService.ts           # JWT management
│   └── userService.ts            # User CRUD
├── middleware/
│   └── authenticate.ts           # JWT verification
└── utils/
    └── crypto.ts                 # PKCE & state generation
```

### Frontend Files

```
src/
├── lib/
│   ├── pkce.ts                   # PKCE generation
│   ├── tokenStorage.ts           # Secure token storage
│   └── api.ts                    # API client with refresh
├── features/auth/
│   └── useAuth.tsx              # Auth context provider
└── app/auth/
    ├── sign-in.tsx              # Sign in screen
    └── roblox.tsx               # OAuth callback handler
```

---

## Environment Configuration

### Backend (.env)

```bash
# Roblox OAuth
ROBLOX_CLIENT_ID=your-client-id
ROBLOX_CLIENT_SECRET=your-client-secret
ROBLOX_REDIRECT_URI=lagalaga://auth/roblox

# JWT
JWT_SECRET=your-super-secret-jwt-key-min-32-chars
JWT_EXPIRY=15m
REFRESH_TOKEN_SECRET=different-secret-for-refresh
REFRESH_TOKEN_EXPIRY=7d
```

### Frontend (.env)

```bash
# Backend API
EXPO_PUBLIC_API_URL=http://localhost:3001

# OAuth Redirect
EXPO_PUBLIC_ROBLOX_REDIRECT_URI=lagalaga://auth/roblox
```

---

## Roblox OAuth App Setup

### 1. Create OAuth App

1. Go to https://create.roblox.com/credentials
2. Click "Create OAuth App"
3. Fill in details:
   - **Name:** LagaLaga
   - **Description:** Roblox-first LFG platform
   - **Redirect URI:** `lagalaga://auth/roblox`
   - **Scopes:** `openid`, `profile`

4. Save and note:
   - Client ID
   - Client Secret

### 2. Configure Backend

Add credentials to `backend/.env`:
```bash
ROBLOX_CLIENT_ID=<your-client-id>
ROBLOX_CLIENT_SECRET=<your-client-secret>
```

### 3. Configure App

Add to app.json:
```json
{
  "expo": {
    "scheme": "lagalaga"
  }
}
```

---

## Testing Checklist

### Functionality
- [ ] Sign in with Roblox works
- [ ] PKCE parameters generated correctly
- [ ] State parameter validated
- [ ] Tokens stored securely
- [ ] User profile loaded
- [ ] Auto token refresh works
- [ ] Sign out clears tokens
- [ ] OAuth cancellation handled

### Security
- [ ] State validation prevents CSRF
- [ ] PKCE prevents code interception
- [ ] Expired states cleaned up
- [ ] Invalid tokens rejected
- [ ] Refresh tokens work correctly
- [ ] Revoke clears all tokens

### Error Handling
- [ ] Network errors handled gracefully
- [ ] Invalid codes rejected
- [ ] Expired tokens trigger refresh
- [ ] User-friendly error messages
- [ ] No app crashes

### Edge Cases
- [ ] Multiple sign-in attempts
- [ ] Sign in during ongoing flow
- [ ] App backgrounded during flow
- [ ] Network interruption during flow
- [ ] Token refresh during request

---

## Troubleshooting

### Issue: OAuth redirect doesn't work

**Symptoms:**
- Browser opens but doesn't return to app
- Callback not triggered

**Solutions:**
1. Verify `scheme` in app.json is `lagalaga`
2. Rebuild app after changing scheme
3. Check redirect URI matches exactly
4. On iOS: Uninstall and reinstall app

---

### Issue: State validation fails

**Symptoms:**
- "Invalid or expired state" error
- Sign in fails after authorization

**Solutions:**
1. Check backend state storage (in-memory vs Redis)
2. Verify state not expired (10 minute limit)
3. Check for clock skew between client/server
4. Ensure state not being URL-encoded incorrectly

---

### Issue: Token exchange fails

**Symptoms:**
- "Failed to exchange code" error
- Authorization successful but no tokens

**Solutions:**
1. Verify Roblox client credentials correct
2. Check redirect URI matches exactly
3. Ensure code_verifier format correct (43-128 chars)
4. Check Roblox OAuth server status

---

### Issue: Tokens not stored

**Symptoms:**
- Sign in successful but user not persistent
- Logged out on app restart

**Solutions:**
1. Check SecureStore permissions
2. Verify tokenStorage implementation
3. Check for errors in storage layer
4. Test with logging to see storage calls

---

## Performance Metrics

### Expected Timings

**Authorization Flow:**
- PKCE generation: ~10-50ms
- Authorization URL generation: ~5-10ms
- User authorization (on Roblox): varies
- Callback processing: ~50-100ms

**Token Exchange:**
- Backend validation: ~5-10ms
- Roblox token exchange: ~200-500ms
- User upsert: ~50-100ms
- JWT generation: ~5-10ms
- **Total:** ~300-700ms

**Token Refresh:**
- Refresh request: ~50-100ms
- Token generation: ~5-10ms
- **Total:** ~60-150ms

---

## Next Steps

### Enhancements (Optional)

- [ ] **Biometric Authentication** - FaceID/TouchID for quick sign-in
- [ ] **Remember Me** - Longer refresh token expiry option
- [ ] **Multiple Accounts** - Support switching between Roblox accounts
- [ ] **OAuth Token Storage** - Store Roblox tokens for API calls
- [ ] **Profile Sync** - Auto-sync Roblox profile changes
- [ ] **Session Management** - View and revoke active sessions

### Production Readiness

- [ ] **Rate Limiting** - Limit OAuth attempts
- [ ] **Redis for State** - Use Redis instead of in-memory storage
- [ ] **Monitoring** - Track OAuth success/failure rates
- [ ] **Alerting** - Alert on OAuth failures
- [ ] **Analytics** - Track sign-in conversion

---

## Resources

- [Roblox OAuth Documentation](https://create.roblox.com/docs/cloud/reference/oauth2)
- [PKCE Specification (RFC 7636)](https://tools.ietf.org/html/rfc7636)
- [OAuth 2.0 Best Practices](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-security-topics)
- [Expo WebBrowser](https://docs.expo.dev/versions/latest/sdk/webbrowser/)
- [Expo SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/)
