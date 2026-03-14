# TESTING: Test Coverage

## Severity
✅ **RESOLVED**

## Category
Testing / Quality Assurance

## Description
This issue was originally filed when the project had only 2 test files. The test suite has since been substantially built out.

## Current State (as of 2026-03-14)

- **Test suites**: 40 passing, 1 skipped (session-flow integration — requires `RUN_INTEGRATION_TESTS=1`)
- **Tests**: 226 passing, 13 skipped
- **Coverage**:
  - Statements: **75.82%** (800/1055)
  - Branches: **61.8%** (555/898)
  - Functions: **84.09%** (148/176)
  - Lines: **76.15%** (789/1036)
- **Thresholds** (jest.config.js): 65% lines, 65% statements, 65% functions, 55% branches — **all passing**

## Test Files

### Integration Tests (`backend/src/__tests__/integration/`)
- `auth.routes.test.ts`
- `sessions-v2.routes.test.ts`
- `sessions-handoff-routes.test.ts`
- `session-flow.test.ts` (opt-in: `RUN_INTEGRATION_TESTS=1`)
- `me.test.ts`
- `me.match-history.routes.test.ts`
- `me-roblox-favorites.test.ts`
- `me-roblox-friends.test.ts`
- `account.routes.test.ts`
- `apple-auth.routes.test.ts`
- `google-auth.routes.test.ts`
- `google-auth-callback-shared.test.ts`
- `roblox-connect.routes.test.ts`
- `roblox-experience-by-place.test.ts`
- `presence-roblox-route.test.ts`
- `leaderboard.routes.test.ts`
- `reports.routes.test.ts`
- `safety-escalation-webhook.routes.test.ts`

### Unit Tests (`backend/src/__tests__/unit/`)
- `crypto-oauth-state.test.ts`
- `roblox-presence-service.test.ts`
- `supabase-ownership.test.ts`

### Service Tests (`backend/src/services/__tests__/`)
- `platform-identity.service.test.ts`
- `roblox-presence.service.test.ts`
- `achievementService.test.ts`
- `reporting.service.test.ts`
- `leaderboardService.test.ts`
- `cache-cleanup.service.test.ts`
- `google-auth.service.test.ts`
- `friendship.service.test.ts`
- `session-lifecycle.service.test.ts`

## Remaining Gaps

### Branch coverage (61.8%)
Branch coverage is the lowest metric and the furthest above threshold. Key untested branches likely include:
- Error/edge-case paths in services (DB errors, partial failures)
- Conditional logic in middleware (e.g. `requireRobloxConnected` fallback paths)

### Frontend
- Zero frontend tests (no jest-expo / @testing-library/react-native setup)
- Not yet blocking: no frontend coverage thresholds configured

## Running Tests

```bash
cd backend
npm test                         # run all tests
npm run test:coverage            # with coverage report
RUN_INTEGRATION_TESTS=1 npm test # include DB integration tests
```

## Priority
**P2 - Nice to have** — Branch coverage improvement and frontend test setup are worthwhile but not blocking launch given current metrics exceed all configured thresholds.
