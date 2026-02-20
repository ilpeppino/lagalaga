# ERROR HANDLING: console.error() Used Instead of Logger

## Severity
🔴 **HIGH**

## Category
Error Handling / Monitoring

## Description
Multiple files use `console.error()` instead of the structured logger, bypassing PII sanitization and preventing errors from being captured in production logs.

## Affected Files
- `src/lib/deepLinking.ts` (lines 43, 78)
- `src/features/sessions/apiStore.ts` (line 8)
- `app/(tabs)/_layout.tsx` (lines 18, 21)

## Current Implementation

### src/lib/deepLinking.ts
```typescript
export function parseDeepLink(url: string): ... {
  try {
    const parsed = Linking.parse(url);
    return { route: parsed.path || '', params: parsed.queryParams || {} };
  } catch (error) {
    console.error('Failed to parse deep link:', error);  // ❌ WRONG
    return null;
  }
}

export async function getInitialURL(): Promise<string | null> {
  try {
    return await Linking.getInitialURL();
  } catch (error) {
    console.error('Failed to get initial URL:', error);  // ❌ WRONG
    return null;
  }
}
```

### src/features/sessions/apiStore.ts
```typescript
async getSessionById(id: string): Promise<Session | null> {
  try {
    const { session } = await apiClient.sessions.getById(id);
    return session;
  } catch (error) {
    console.error('Failed to get session:', error);  // ❌ WRONG
    return null;
  }
}
```

### app/(tabs)/_layout.tsx
```typescript
useEffect(() => {
  const sub = Linking.addEventListener("url", ({ url }) => {
    console.log("[LINKING] url event:", url);  // ❌ Should use logger.debug
  });

  Linking.getInitialURL().then((url) => {
    console.log("[LINKING] initial url:", url);  // ❌ Should use logger.debug
  });

  return () => sub.remove();
}, []);
```

## Problems with console.error()
1. **Not captured in production logs** - `console.*` output is lost in production
2. **Bypasses PII sanitization** - Error objects logged without redaction
3. **No structured logging** - Can't search/filter by error type
4. **No correlation IDs** - Can't trace errors across requests
5. **No monitoring integration** - Errors don't appear in Sentry/monitoring
6. **Stack traces exposed** - Could leak sensitive information

## Impact
- **Lost error visibility** in production
- **Security risk** - PII/sensitive data in logs
- **Debugging difficulty** - No way to trace errors
- **No alerting** - Critical errors go unnoticed

## Recommended Fix

### Replace console.error() with logger.error()

#### src/lib/deepLinking.ts
```typescript
import { logger } from './logger';

export function parseDeepLink(url: string): ... {
  try {
    const parsed = Linking.parse(url);
    return { route: parsed.path || '', params: parsed.queryParams || {} };
  } catch (error) {
    logger.error('Failed to parse deep link', {
      error: error instanceof Error ? error.message : String(error),
      // Don't log the full URL - could contain sensitive query params
    });
    monitoring.addBreadcrumb({
      category: 'error',
      message: 'Deep link parse failed',
      level: 'warning',
    });
    return null;
  }
}

export async function getInitialURL(): Promise<string | null> {
  try {
    return await Linking.getInitialURL();
  } catch (error) {
    logger.error('Failed to get initial URL', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
```

#### src/features/sessions/apiStore.ts
```typescript
import { logger } from '../../lib/logger';
import { monitoring } from '../../lib/monitoring';
import { isApiError } from '../../lib/errors';

async getSessionById(id: string): Promise<Session | null> {
  try {
    const { session } = await apiClient.sessions.getById(id);
    return session;
  } catch (error) {
    // Distinguish between 404 (expected) and other errors
    if (isApiError(error) && error.statusCode === 404) {
      logger.warn('Session not found', { sessionId: id });
      return null;
    }

    // Log unexpected errors
    logger.error('Failed to load session', {
      error: error instanceof Error ? error.message : String(error),
      sessionId: id,
    });

    // Capture in monitoring
    monitoring.captureError(
      error instanceof Error ? error : new Error(String(error))
    );

    // Re-throw so caller knows it failed (not just missing)
    throw error;
  }
}
```

#### app/(tabs)/_layout.tsx
```typescript
import { logger } from '../../src/lib/logger';

useEffect(() => {
  const sub = Linking.addEventListener("url", ({ url }) => {
    logger.debug('Deep link event received', { url });
  });

  Linking.getInitialURL()
    .then((url) => {
      if (url) logger.info('App opened with initial URL', { url });
    })
    .catch((error) => {
      logger.error('Failed to get initial URL', {
        error: error instanceof Error ? error.message : String(error)
      });
    });

  return () => sub.remove();
}, []);
```

## Search for All Instances
```bash
# Find all console.error usage
grep -r "console\.error" --include="*.ts" --include="*.tsx" src/ app/

# Find all console.log usage (should be logger.debug)
grep -r "console\.log" --include="*.ts" --include="*.tsx" src/ app/

# Find all console.warn usage
grep -r "console\.warn" --include="*.ts" --include="*.tsx" src/ app/
```

## ESLint Rule
```json
// Add to .eslintrc.js
{
  "rules": {
    "no-console": ["error", {
      "allow": []  // Disallow all console methods
    }]
  }
}
```

Or more lenient during development:
```json
{
  "rules": {
    "no-console": ["warn", {
      "allow": ["debug"]  // Allow console.debug only
    }]
  }
}
```

## Migration Strategy

### Step 1: Add Logger Import
```typescript
import { logger } from '@/lib/logger';  // or relative path
```

### Step 2: Replace console Methods
| Old | New |
|-----|-----|
| `console.error()` | `logger.error()` |
| `console.warn()` | `logger.warn()` |
| `console.info()` | `logger.info()` |
| `console.log()` | `logger.debug()` |
| `console.debug()` | `logger.debug()` |

### Step 3: Structure Error Objects
```typescript
// ❌ BAD
logger.error('Error:', error);

// ✅ GOOD
logger.error('Failed to load data', {
  error: error instanceof Error ? error.message : String(error),
  userId: userId,
  context: 'additional context',
});
```

## Implementation Checklist
- [ ] Find all console.error/warn/log instances
- [ ] Replace with appropriate logger method
- [ ] Add structured context to each log
- [ ] Import logger in affected files
- [ ] Remove full error object logging (just message/stack)
- [ ] Add ESLint rule to prevent future console usage
- [ ] Test that errors appear in logs
- [ ] Verify PII sanitization is working

## Benefits After Fix
- ✅ All errors captured in production logs
- ✅ PII automatically sanitized
- ✅ Structured logging for better searchability
- ✅ Correlation IDs for request tracing
- ✅ Integration with monitoring (Sentry, etc.)
- ✅ Consistent log format across app

## References
- Project logger implementation: `src/lib/logger.ts`
- PII sanitizer: `backend/src/lib/sanitizer.ts`
- [Pino Best Practices](https://github.com/pinojs/pino/blob/master/docs/help.md)

## Priority
**P1 - High** - Affects production observability

## Estimated Effort
2-3 hours (search and replace, testing)
