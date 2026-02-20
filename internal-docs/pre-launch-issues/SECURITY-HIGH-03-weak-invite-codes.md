# SECURITY: Weak Randomness in Invite Code Generation

## Severity
🔴 **HIGH**

## Category
Security / Cryptography

## Description
Session invite codes are generated using `Math.random()` which is NOT cryptographically secure, making codes predictable and brute-forceable.

## Affected Files
- `backend/src/services/sessionService-v2.ts` (lines 47-54)

## Current Implementation
```typescript
function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 9; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}
```

## Problems
- Uses `Math.random()` which is NOT cryptographically secure
- Only 9 characters from 32-char alphabet = ~45 bits of entropy
- Predictable and brute-forceable (2^45 ≈ 35 trillion - feasible with distributed attack)
- No rate limiting on invite code validation (separate issue)

## Impact
- Attacker can brute-force invite codes
- Unauthorized access to private sessions
- 9-character code guessable in minutes with distributed attack
- Pattern prediction possible with Math.random()

## Recommended Fix

### Option 1: Cryptographically Secure Random (Recommended)
```typescript
import { randomBytes } from 'crypto';

function generateInviteCode(): string {
  // Generate 12 bytes (96 bits) of entropy
  const bytes = randomBytes(12);

  // Base64url encode (URL-safe, no padding)
  const base64url = bytes
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  // Take first 12 characters for consistency
  return base64url.slice(0, 12).toUpperCase();
}
```

### Option 2: Custom Alphabet with Crypto
```typescript
import { randomInt } from 'crypto';

function generateInviteCode(): string {
  // Remove ambiguous characters: O/0, I/1, L
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const codeLength = 12;  // Increased from 9
  let code = '';

  for (let i = 0; i < codeLength; i++) {
    // Use cryptographically secure random
    const randomIndex = randomInt(0, chars.length);
    code += chars[randomIndex];
  }

  return code;
}
```

### Option 3: UUID-based (Most Secure)
```typescript
import { randomUUID } from 'crypto';

function generateInviteCode(): string {
  // Generate UUID and take first 12 alphanumeric characters
  const uuid = randomUUID().replace(/-/g, '');
  return uuid.slice(0, 12).toUpperCase();
}
```

## Additional Security Measures

### Add Rate Limiting (addresses in separate issue)
```typescript
// In routes/sessions-v2.ts
fastify.get('/api/invites/:code', {
  config: {
    rateLimit: {
      max: 10,
      timeWindow: '1 minute'
    }
  }
}, handler);
```

### Log Failed Attempts
```typescript
// In sessionService-v2.ts joinSession()
if (error || !invite) {
  logger.warn('Invalid invite code attempted', {
    code: inviteCode,
    userId: userId,
    sessionId: sessionId,
  });
  throw new NotFoundError('Invite', inviteCode);
}
```

### Add Exponential Backoff
```typescript
// Track failed attempts per IP/user
const failedAttempts = new Map<string, number>();

fastify.addHook('preHandler', async (request, reply) => {
  const key = request.user?.userId || request.ip;
  const attempts = failedAttempts.get(key) || 0;

  if (attempts >= 5) {
    const backoffMs = Math.pow(2, attempts - 5) * 1000;  // Exponential
    await new Promise(resolve => setTimeout(resolve, backoffMs));
  }
});
```

## Testing
```typescript
// Test randomness
describe('generateInviteCode', () => {
  test('generates codes with sufficient entropy', () => {
    const codes = new Set();
    for (let i = 0; i < 10000; i++) {
      codes.add(generateInviteCode());
    }
    // All codes should be unique
    expect(codes.size).toBe(10000);
  });

  test('generates codes of correct length', () => {
    const code = generateInviteCode();
    expect(code).toHaveLength(12);
  });

  test('generates codes with allowed characters only', () => {
    const code = generateInviteCode();
    expect(code).toMatch(/^[A-Z0-9]+$/);
  });
});
```

## Comparison Table

| Method | Entropy | Brute Force Time* | Pros | Cons |
|--------|---------|-------------------|------|------|
| Current (Math.random, 9 chars) | 45 bits | ~15 minutes | Simple | Insecure |
| Crypto, 12 chars | 72 bits | ~18,000 years | Secure, readable | Slightly longer |
| UUID, 12 chars | 96 bits | 2^80 years | Most secure | Loses custom alphabet |

*Assuming 1 billion attempts/second distributed attack

## Implementation Checklist
- [ ] Replace `Math.random()` with `crypto.randomInt()` or `randomBytes()`
- [ ] Increase code length from 9 to 12 characters
- [ ] Add unit tests for code generation
- [ ] Add rate limiting on invite validation endpoint
- [ ] Log failed invite code attempts
- [ ] Update database migration if code length changes (unlikely needed - column is VARCHAR)
- [ ] Update frontend validation regex to accept 12 chars

## References
- CWE-338: Use of Cryptographically Weak Pseudo-Random Number Generator
- OWASP: Insecure Randomness
- [Node.js Crypto API](https://nodejs.org/api/crypto.html)

## Priority
**P1 - High** - Security vulnerability

## Estimated Effort
2-3 hours (including testing and validation)
