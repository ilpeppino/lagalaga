# SECURITY: CORS Configured to Accept All Origins

## Status
✅ **RESOLVED** (2026-02-24)

## Severity
🔴 **HIGH**

## Category
Security / API

## Description
CORS is configured to accept requests from ANY origin (`CORS_ORIGIN=*`) with credentials enabled, violating CORS specification and creating CSRF vulnerabilities.

## Affected Files
- `backend/src/plugins/cors.ts`
- `backend/.env` (line 27: `CORS_ORIGIN=*`)

## Previous Implementation
```typescript
export async function corsPlugin(fastify: FastifyInstance) {
  await fastify.register(cors, {
    origin: fastify.config.CORS_ORIGIN === '*' ? true : fastify.config.CORS_ORIGIN,
    credentials: true,  // ← DANGEROUS with wildcard
  });
}
```

## Impact
- Cross-site request forgery (CSRF) attacks possible
- Malicious sites can make authenticated requests on behalf of users
- Credentials (cookies, auth headers) sent to unauthorized origins
- Violates CORS spec (credentials: true incompatible with wildcard)

## Resolution Implemented

- `backend/src/config/env.ts`: `CORS_ORIGIN` default changed from `'*'` to `''`.
- `backend/src/plugins/cors.ts`: production startup now throws if `CORS_ORIGIN` is empty or contains `'*'`.
- `backend/src/plugins/cors.ts`: comma-separated explicit origins are supported.
- `render.yaml`: `CORS_ORIGIN` is no longer hardcoded to wildcard.
- `backend/.env.example` and deployment docs updated to explicit-origin examples.

## Current Implementation
```typescript
if (isProduction && (hasWildcardOrigin || configuredOrigins.length === 0)) {
  throw new Error(
    'Invalid CORS_ORIGIN for production. Set one or more explicit origins (comma-separated), never "*".'
  );
}
```

## Recommended Fix

### Update cors.ts
```typescript
export async function corsPlugin(fastify: FastifyInstance) {
  const allowedOrigins = [
    process.env.FRONTEND_URL || 'https://lagalaga.app',
    process.env.WEB_URL || 'https://www.lagalaga.app',
    // Add development origins
    'http://localhost:8081',  // Expo dev server
    'exp://localhost:8081',  // Expo Go
  ];

  await fastify.register(cors, {
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman)
      if (!origin) {
        callback(null, true);
        return;
      }

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-ID'],
    exposedHeaders: ['X-Request-ID'],
    maxAge: 600,  // 10 minutes
  });
}
```

### Update .env
```bash
# Remove CORS_ORIGIN=*
# Add specific origins
FRONTEND_URL=https://lagalaga.app
WEB_URL=https://www.lagalaga.app
```

### Add Security Headers
Install and configure helmet:
```bash
npm install @fastify/helmet
```

```typescript
// In server.ts
await fastify.register(require('@fastify/helmet'), {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  frameguard: { action: 'deny' },
  xssFilter: true,
  noSniff: true,
});
```

## Testing
After implementing, test with:
```bash
# Should succeed
curl -H "Origin: https://lagalaga.app" -I http://localhost:3000/health

# Should fail
curl -H "Origin: https://evil.com" -I http://localhost:3000/health
```

## References
- OWASP: CORS Misconfiguration
- CWE-346: Origin Validation Error
- [MDN CORS Documentation](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)

## Priority
**P1 - High** - Fix before production launch

## Estimated Effort
2-3 hours (including testing across all environments)
