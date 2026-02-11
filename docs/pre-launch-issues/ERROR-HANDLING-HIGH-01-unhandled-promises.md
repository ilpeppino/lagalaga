# ERROR HANDLING: Unhandled Promise Rejections

## Severity
🔴 **HIGH**

## Category
Error Handling / Reliability

## Description
Multiple critical promises are created without `.catch()` handlers, leading to unhandled promise rejections that can crash the app silently.

## Affected Files
- `app/index.tsx` (lines 13-15)
- `app/(tabs)/_layout.tsx` (lines 16-22)
- `app/_layout.tsx` (lines 41-45, 48-50)
- `src/features/auth/useSession.ts` (lines 11-14)

## Current Implementation

### app/index.tsx
```tsx
tokenStorage.getToken().then((token) => {
  setHasToken(!!token);
});  // ← NO .catch()!
```

### app/(tabs)/_layout.tsx
```tsx
Linking.getInitialURL().then((url) => {
  console.log("[LINKING] initial url:", url);
});  // ← NO .catch()!
```

### src/features/auth/useSession.ts
```tsx
supabase.auth.getSession().then(({ data: { session } }) => {
  setSession(session);
  setLoading(false);
});  // ← NO .catch()!
```

## Impact
- **Silent app crashes** during initialization
- **Undefined app state** if promises reject
- **No error reporting** to monitoring systems
- **Poor user experience** - blank screen with no feedback
- **Debugging nightmare** - errors don't appear in logs

## Recommended Fix

### Pattern 1: Async/Await with Try-Catch (Recommended)
```tsx
// app/index.tsx
useEffect(() => {
  const loadToken = async () => {
    try {
      const token = await tokenStorage.getToken();
      setHasToken(!!token);
    } catch (error) {
      logger.error('Failed to load token', {
        error: error instanceof Error ? error.message : String(error)
      });
      // Graceful fallback
      setHasToken(false);
    }
  };
  loadToken();
}, []);
```

### Pattern 2: Promise Chain with .catch()
```tsx
// app/(tabs)/_layout.tsx
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

### Pattern 3: Global Unhandled Rejection Handler
```tsx
// app/_layout.tsx - Add to root layout
useEffect(() => {
  // Handle unhandled promise rejections (web only)
  if (typeof window !== 'undefined') {
    const unhandledRejectionHandler = (event: PromiseRejectionEvent) => {
      logger.fatal('Unhandled promise rejection', {
        reason: event.reason instanceof Error ? {
          message: event.reason.message,
          stack: event.reason.stack,
        } : String(event.reason),
      });
      monitoring.captureError(
        event.reason instanceof Error
          ? event.reason
          : new Error(String(event.reason))
      );
      event.preventDefault();  // Prevent default console error
    };

    window.addEventListener('unhandledrejection', unhandledRejectionHandler);

    return () => {
      window.removeEventListener('unhandledrejection', unhandledRejectionHandler);
    };
  }
}, []);
```

### Fix useSession Hook
```tsx
// src/features/auth/useSession.ts
useEffect(() => {
  const loadSession = async () => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) {
        logger.error('Failed to load session', { error: error.message });
        setSession(null);
      } else {
        setSession(session);
      }
    } catch (error) {
      logger.error('Unexpected error loading session', {
        error: error instanceof Error ? error.message : String(error)
      });
      setSession(null);
    } finally {
      setLoading(false);
    }
  };

  loadSession();

  // ... auth state change listener ...
}, []);
```

## Implementation Checklist
- [ ] Fix `app/index.tsx` - add try-catch to token loading
- [ ] Fix `app/(tabs)/_layout.tsx` - add .catch() to Linking.getInitialURL()
- [ ] Fix `app/_layout.tsx` - add .catch() to Linking.getInitialURL()
- [ ] Fix `src/features/auth/useSession.ts` - wrap in async/await with try-catch
- [ ] Add global unhandledRejection handler in root layout
- [ ] Search for other promise chains: `grep -r "\.then(" --include="*.ts" --include="*.tsx" src/ app/`
- [ ] Audit all promise-based code for error handling
- [ ] Add ESLint rule: `@typescript-eslint/no-floating-promises`
- [ ] Test error scenarios (network failures, storage errors, etc.)

## ESLint Configuration
```json
// Add to .eslintrc.js or eslint config
{
  "rules": {
    "@typescript-eslint/no-floating-promises": "error",
    "@typescript-eslint/no-misused-promises": "error"
  }
}
```

## Testing
```tsx
// Test unhandled rejection handler
it('should handle unhandled promise rejections', async () => {
  const spy = jest.spyOn(logger, 'fatal');

  // Trigger unhandled rejection
  Promise.reject(new Error('Test error'));

  await new Promise(resolve => setTimeout(resolve, 100));

  expect(spy).toHaveBeenCalledWith(
    'Unhandled promise rejection',
    expect.objectContaining({
      reason: expect.objectContaining({
        message: 'Test error'
      })
    })
  );
});
```

## References
- [MDN: Promise Rejection Events](https://developer.mozilla.org/en-US/docs/Web/API/Window/unhandledrejection_event)
- [Node.js: unhandledRejection](https://nodejs.org/api/process.html#event-unhandledrejection)
- [TypeScript ESLint: no-floating-promises](https://typescript-eslint.io/rules/no-floating-promises/)

## Priority
**P1 - High** - Affects app stability

## Estimated Effort
3-4 hours (including search for all instances and testing)
