# SECURITY: No Rate Limiting Implemented

## Severity
🔴 **HIGH**

## Category
Security / API / DoS Prevention

## Description
Backend API has no rate limiting middleware, making it vulnerable to brute force attacks, credential stuffing, invite code enumeration, and denial of service attacks.

## Affected Files
- `backend/src/server.ts` (no rate limiting plugin)
- All API routes in `backend/src/routes/`

## Impact
- **Brute force attacks** on invite codes (9-character codes = ~45 bits entropy, brute-forceable)
- **Credential stuffing** on auth endpoints
- **Denial of Service** via high request volume
- **API abuse** with no throttling
- **Invite enumeration** attacks on `/api/invites/:code`

## Recommended Fix

### 1. Install Rate Limiting Plugin
```bash
npm install @fastify/rate-limit
```

### 2. Configure Global Rate Limiting
```typescript
// backend/src/plugins/rate-limit.ts
import rateLimit from '@fastify/rate-limit';
import { FastifyInstance } from 'fastify';

export async function rateLimitPlugin(fastify: FastifyInstance) {
  await fastify.register(rateLimit, {
    global: true,
    max: 100,  // Max 100 requests
    timeWindow: '15 minutes',
    cache: 10000,  // Cache 10k users
    allowList: ['127.0.0.1'],  // Whitelist localhost
    redis: fastify.config.REDIS_URL
      ? require('redis').createClient({ url: fastify.config.REDIS_URL })
      : undefined,  // Use Redis if available, in-memory otherwise

    // Custom key generator (use IP + user ID if authenticated)
    keyGenerator: (request) => {
      return request.user?.userId
        ? `user:${request.user.userId}`
        : request.ip;
    },

    // Custom error response
    errorResponseBuilder: (request, context) => {
      return {
        error: 'TOO_MANY_REQUESTS',
        message: 'Rate limit exceeded. Please try again later.',
        retryAfter: context.after,
        requestId: String(request.id),
      };
    },
  });
}
```

### 3. Configure Per-Route Limits
```typescript
// Stricter limits for sensitive endpoints
fastify.register(rateLimitPlugin);

// Auth endpoints - very strict
fastify.post('/auth/roblox/start', {
  config: {
    rateLimit: {
      max: 5,
      timeWindow: '1 minute'
    }
  }
}, handler);

// Invite validation - strict to prevent enumeration
fastify.get('/api/invites/:code', {
  config: {
    rateLimit: {
      max: 10,
      timeWindow: '1 minute'
    }
  }
}, handler);

// Token refresh - moderate
fastify.post('/auth/refresh', {
  config: {
    rateLimit: {
      max: 20,
      timeWindow: '15 minutes'
    }
  }
}, handler);

// General API - more permissive
fastify.get('/api/sessions', {
  config: {
    rateLimit: {
      max: 60,
      timeWindow: '1 minute'
    }
  }
}, handler);
```

### 4. Add Rate Limit Headers
The plugin automatically adds:
- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Remaining requests
- `X-RateLimit-Reset`: Time when rate limit resets
- `Retry-After`: Seconds to wait (on 429 response)

### 5. Monitor Rate Limit Violations
```typescript
// Add to logging middleware
fastify.addHook('onResponse', (request, reply, done) => {
  if (reply.statusCode === 429) {
    logger.warn('Rate limit exceeded', {
      ip: request.ip,
      userId: request.user?.userId,
      endpoint: request.url,
      method: request.method,
    });
  }
  done();
});
```

### 6. Environment Configuration
```bash
# backend/.env
REDIS_URL=redis://localhost:6379  # Optional: for distributed rate limiting
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW=15m
```

## Testing
```bash
# Test rate limiting
for i in {1..150}; do
  curl -w "%{http_code}\n" http://localhost:3000/api/sessions
done

# Should see 429 after 100 requests
```

## Implementation Checklist
- [ ] Install `@fastify/rate-limit`
- [ ] Create `backend/src/plugins/rate-limit.ts`
- [ ] Register plugin in `server.ts`
- [ ] Configure per-route limits for sensitive endpoints
- [ ] Add rate limit monitoring/logging
- [ ] Test with curl/load testing tool
- [ ] Document rate limits in API docs
- [ ] Consider Redis for production (distributed instances)

## References
- OWASP: Rate Limiting
- CWE-770: Allocation of Resources Without Limits
- [@fastify/rate-limit docs](https://github.com/fastify/fastify-rate-limit)

## Priority
**P1 - High** - Critical for production security

## Estimated Effort
4-6 hours (including testing and per-route configuration)
