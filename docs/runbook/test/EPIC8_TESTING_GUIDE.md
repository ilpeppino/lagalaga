# Epic 8: Testing & Observability - Guide

## Overview
Epic 8 implements comprehensive testing infrastructure and observability features to ensure code quality, catch bugs early, and provide visibility into production systems.

## Components

### 1. Unit Tests (Story 8.1) ✅
Comprehensive unit tests for business logic and utilities.

### 2. Integration Tests (Story 8.2) ✅
End-to-end tests for session workflows.

### 3. Logging & Metrics (Story 8.3) ✅
Structured logging with Pino for observability.

---

## Unit Tests

### Roblox Link Normalizer Tests

**File:** `backend/src/services/__tests__/roblox-link-normalizer.test.ts`

**Coverage:** 100% (28 tests)

**Test Categories:**
1. **Web Games URL** (3 tests)
   - With slug
   - Without slug
   - Without www

2. **Web Start URL** (2 tests)
   - Standard format
   - With additional query parameters

3. **Protocol Deep Link** (7 tests)
   - Basic placeId format
   - Experiences format
   - Game instance format
   - Private server format
   - Various permutations

4. **Roblox Shortlinks** (5 tests)
   - With af_web_dp parameter
   - Redirect following
   - Nested parameters

5. **Edge Cases** (6 tests)
   - Case insensitivity
   - Whitespace handling
   - Special characters
   - Mixed formats

6. **Error Cases** (5 tests)
   - Invalid URL format
   - Non-Roblox URLs
   - Missing placeId
   - Malformed parameters
   - Network failures

### Running Unit Tests

```bash
cd backend

# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- roblox-link-normalizer.test.ts
```

### Coverage Requirements

- **Branches:** 90%+
- **Functions:** 90%+
- **Lines:** 90%+
- **Statements:** 90%+

### Coverage Report

```bash
npm run test:coverage

# View HTML coverage report
open coverage/lcov-report/index.html
```

---

## Integration Tests

### Session Flow Integration Tests

**File:** `backend/src/__tests__/integration/session-flow.test.ts`

**Test Suites:**

#### 1. Session Creation
- ✅ Create session with valid data
- ✅ Add host as participant automatically
- ✅ Generate invite code

**Purpose:** Verify session creation end-to-end

#### 2. Session Joining
- ✅ Allow user to join public session
- ✅ Update current participant count
- ✅ Prevent joining when already a participant

**Purpose:** Verify join flow and duplicate prevention

#### 3. Session Capacity Enforcement
- ✅ Track current participant count correctly
- ✅ Allow joining if under capacity
- ✅ Session full behavior (tested in application logic)

**Purpose:** Verify capacity limits are enforced

#### 4. Invite Code Validation
- ✅ Find session by valid invite code
- ✅ Not find session with invalid invite code
- ✅ Allow joining via valid invite code

**Purpose:** Verify invite link functionality

#### 5. Session Visibility
- ✅ List public sessions
- ✅ Not list private sessions in public query

**Purpose:** Verify visibility rules

### Test Helpers

**TestUserManager**
- Creates test users
- Manages authentication tokens
- Auto-cleanup after tests

**TestSessionManager**
- Creates test sessions
- Manages session lifecycle
- Auto-cleanup after tests

### Running Integration Tests

```bash
cd backend

# Run all tests (includes integration)
npm test

# Run only integration tests
npm test -- integration

# Run specific integration test file
npm test -- session-flow.test.ts

# Run with verbose output
npm test -- --verbose
```

### Integration Test Setup

**Prerequisites:**
- Supabase project configured
- Environment variables set in `.env`
- Database schema applied (Epic 1)
- RLS policies applied (Epic 7)

**Environment Setup:**
```bash
# Copy .env.example to .env
cp .env.example .env

# Add your Supabase credentials
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

**Before Running:**
- Tests use service role to bypass RLS
- Tests create real database entries
- Tests clean up after themselves
- Safe to run on dev/staging databases

**Warning:** Do NOT run integration tests on production databases!

---

## Logging & Observability

### Structured Logging with Pino

**File:** `backend/src/lib/logger.ts`

**Features:**
- Structured JSON logging
- Multiple log levels
- Pretty printing in development
- Performance metrics
- Error tracking
- Request tracing

### Log Levels

| Level | Value | Use Case |
|-------|-------|----------|
| **fatal** | 60 | Application crash (process exit) |
| **error** | 50 | Error conditions requiring attention |
| **warn** | 40 | Warning conditions (potential issues) |
| **info** | 30 | Informational messages (default) |
| **debug** | 20 | Debug information (development) |
| **trace** | 10 | Detailed trace information |

### Configuration

**Environment Variable:**
```bash
LOG_LEVEL=debug  # Options: trace, debug, info, warn, error, fatal
```

**Production:** `info` or `warn`
**Development:** `debug` or `trace`

### Logger Usage

**Basic Logging:**
```typescript
import { logger } from '@/lib/logger';

logger.info('Server started on port 3001');
logger.error('Database connection failed');
logger.warn('High memory usage detected');
logger.debug('Processing request', { userId: '123' });
```

**Structured Logging:**
```typescript
import { logger } from '@/lib/logger';

logger.info(
  {
    userId: '123',
    sessionId: 'abc',
    action: 'join_session',
  },
  'User joined session'
);
```

**Child Loggers:**
```typescript
import { createLogger } from '@/lib/logger';

const sessionLogger = createLogger({ module: 'session-service' });
sessionLogger.info({ sessionId: '123' }, 'Session created');
```

**Error Logging:**
```typescript
import { logError } from '@/lib/logger';

try {
  await doSomething();
} catch (error) {
  logError(
    error as Error,
    { userId: '123', operation: 'create_session' },
    'Failed to create session'
  );
}
```

**Specialized Loggers:**
```typescript
import {
  logSessionEvent,
  logAuthEvent,
  logInviteEvent,
  logMetric,
} from '@/lib/logger';

// Session events
logSessionEvent('created', sessionId, userId, { title: 'Test Session' });
logSessionEvent('joined', sessionId, userId);
logSessionEvent('full', sessionId);

// Auth events
logAuthEvent('login', userId, { provider: 'roblox' });
logAuthEvent('auth_failed', undefined, { reason: 'invalid_token' });

// Invite events
logInviteEvent('created', inviteCode, sessionId);
logInviteEvent('used', inviteCode, sessionId, { userId });

// Performance metrics
logMetric('session_creation_time', 145, 'ms');
logMetric('db_query_time', 23, 'ms', { table: 'sessions' });
```

### Request Logging Middleware

**File:** `backend/src/middleware/logging.middleware.ts`

**Features:**
- Automatic request ID generation
- Request start logging
- Request completion logging
- Response time tracking
- Error logging

**Logs:**
```
INFO → POST /api/sessions (requestId: uuid-1234)
INFO ← POST /api/sessions 201 (145ms) (requestId: uuid-1234)
```

**Integration:**
```typescript
// In server.ts
import { requestLoggingPlugin } from '@/middleware/logging.middleware';

await fastify.register(requestLoggingPlugin);
```

### Log Output

**Development (Pretty Print):**
```
[19:45:23.123] INFO: → POST /api/sessions
    requestId: "uuid-1234"
    method: "POST"
    url: "/api/sessions"
    type: "request_start"

[19:45:23.268] INFO: ← POST /api/sessions 201 (145ms)
    requestId: "uuid-1234"
    method: "POST"
    url: "/api/sessions"
    statusCode: 201
    duration: 145
    type: "request_end"
```

**Production (JSON):**
```json
{"level":"INFO","time":1707332723123,"requestId":"uuid-1234","method":"POST","url":"/api/sessions","type":"request_start","msg":"→ POST /api/sessions"}
{"level":"INFO","time":1707332723268,"requestId":"uuid-1234","method":"POST","url":"/api/sessions","statusCode":201,"duration":145,"type":"request_end","msg":"← POST /api/sessions 201 (145ms)"}
```

### Querying Logs

**Filter by type:**
```bash
# Request logs only
cat logs/app.log | grep '"type":"request_end"'

# Error logs only
cat logs/app.log | grep '"level":"ERROR"'

# Session events
cat logs/app.log | grep '"type":"session"'
```

**Using jq:**
```bash
# Slow requests (> 1000ms)
cat logs/app.log | jq 'select(.duration > 1000)'

# Errors with stack traces
cat logs/app.log | jq 'select(.level == "ERROR") | .err'

# Top slow endpoints
cat logs/app.log | jq -s 'group_by(.url) | map({url: .[0].url, avg: (map(.duration) | add / length)}) | sort_by(.avg) | reverse'
```

---

## Metrics & Performance

### Tracked Metrics

1. **Request Metrics**
   - Request count by endpoint
   - Response time by endpoint
   - Status code distribution
   - Error rate

2. **Session Metrics**
   - Session creation time
   - Join latency
   - Active session count
   - Participant count distribution

3. **Database Metrics**
   - Query duration
   - Connection pool usage
   - Query count by table

4. **Auth Metrics**
   - Login success/failure rate
   - Token refresh rate
   - Active user count

### Performance Monitoring

**Response Time Targets:**
- **P50:** < 100ms
- **P95:** < 500ms
- **P99:** < 1000ms

**Error Rate Targets:**
- **4xx errors:** < 5%
- **5xx errors:** < 1%

**Database Query Targets:**
- **Simple queries:** < 10ms
- **Complex queries:** < 50ms
- **Joins:** < 100ms

---

## Testing Best Practices

### Unit Tests

**✅ Do:**
- Test one thing per test
- Use descriptive test names
- Test edge cases
- Test error conditions
- Mock external dependencies
- Keep tests fast (< 100ms per test)

**❌ Don't:**
- Test implementation details
- Depend on test order
- Use real external services
- Skip error cases
- Use hard-coded values without explanation

### Integration Tests

**✅ Do:**
- Test complete workflows
- Use realistic data
- Clean up after tests
- Test error scenarios
- Verify database state
- Use transaction rollback where possible

**❌ Don't:**
- Depend on external APIs
- Run on production database
- Leave test data behind
- Skip cleanup
- Make tests dependent on order

### Logging Best Practices

**✅ Do:**
- Use appropriate log levels
- Include context (userId, sessionId, etc.)
- Log errors with stack traces
- Log performance metrics
- Use structured logging (JSON)
- Log request/response for debugging

**❌ Don't:**
- Log sensitive data (passwords, tokens)
- Log at too high volume (trace in production)
- Use console.log (use logger instead)
- Log without context
- Duplicate logs across layers

---

## Continuous Integration

### GitHub Actions (Example)

```yaml
# .github/workflows/test.yml

name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: |
          cd backend
          npm ci

      - name: Run tests
        run: |
          cd backend
          npm test

      - name: Run tests with coverage
        run: |
          cd backend
          npm run test:coverage

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./backend/coverage/lcov.info
```

---

## Troubleshooting

### Tests Failing

**Issue:** Jest can't find modules
**Solution:**
```bash
# Clear Jest cache
npm test -- --clearCache

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

**Issue:** Integration tests timeout
**Solution:**
- Increase Jest timeout in test file
- Check database connection
- Verify Supabase credentials in .env

**Issue:** Coverage below threshold
**Solution:**
- Run coverage report: `npm run test:coverage`
- Identify uncovered lines
- Add tests for uncovered code paths

### Logging Issues

**Issue:** No logs appearing
**Solution:**
- Check LOG_LEVEL environment variable
- Verify logger is imported correctly
- Check if logs are being written to file vs stdout

**Issue:** Logs too verbose in production
**Solution:**
- Set LOG_LEVEL=info or LOG_LEVEL=warn
- Remove trace/debug logs from hot paths
- Use conditional logging for expensive operations

**Issue:** Can't query JSON logs
**Solution:**
- Install jq: `brew install jq` (Mac) or `apt-get install jq` (Linux)
- Use structured logging format
- Ensure logs are valid JSON

---

## Next Steps

### After Epic 8

- **Monitor test coverage** - Keep above 90%
- **Add more integration tests** - Cover edge cases
- **Set up CI/CD** - Automated testing on every commit
- **Production monitoring** - Set up log aggregation (e.g., Datadog, LogDNA)
- **Alerting** - Set up alerts for errors and performance issues
- **Dashboards** - Create dashboards for key metrics

### Future Enhancements

- **E2E tests** - Frontend + backend integration tests
- **Load testing** - Performance testing with k6 or Artillery
- **Security testing** - OWASP ZAP or similar
- **Database tests** - Test RLS policies directly
- **API documentation** - Auto-generated from tests

---

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Pino Documentation](https://getpino.io/)
- [Testing Best Practices](https://testingjavascript.com/)
- [Martin Fowler: Testing](https://martinfowler.com/testing/)
