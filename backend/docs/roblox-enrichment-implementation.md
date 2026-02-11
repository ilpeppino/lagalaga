# Roblox Game Enrichment Service Implementation

## Overview

Production-grade backend service for fetching and caching Roblox game metadata using only public, documented APIs.

## Architecture

### Service Layer
- **File**: `backend/src/services/roblox-enrichment.service.ts`
- **Class**: `RobloxEnrichmentService`
- **Method**: `enrichGame(placeId: number): Promise<EnrichedGame>`

### Data Flow

```
1. Cache Check
   ↓ (miss)
2. Fetch universeId from placeId
   ↓
3. Fetch game details (parallel) ← → 4. Fetch thumbnail
   ↓                                    ↓
5. Upsert to Supabase games table
   ↓
6. Return enriched data
```

## API Endpoints Used

### 1. Get Universe ID
```
GET https://apis.roblox.com/universes/v1/places/{placeId}/universe
Response: { universeId: number }
```

### 2. Get Game Details
```
GET https://games.roblox.com/v1/games?universeIds={universeId}
Response: {
  data: [{
    id: number,
    name: string,
    description: string,
    ...
  }]
}
```

### 3. Get Game Icon
```
GET https://thumbnails.roblox.com/v1/places/gameicons?placeIds={placeId}&size=256x256&format=Png&isCircular=false
Response: {
  data: [{
    targetId: number,
    state: "Completed" | "Pending",
    imageUrl: string | null
  }]
}
```

## Features

### ✅ Production Ready
- Dependency injection for testability
- Structured logging with correlation IDs
- Comprehensive error handling
- Timeout protection (5s per request)
- Exponential backoff retry (1 retry on network failures)
- Partial enrichment support (returns data even if some APIs fail)

### ✅ Performance Optimized
- Database caching (skips external calls if data exists)
- Parallel fetching for game name + thumbnail
- Smart cache invalidation (only caches complete data)

### ✅ Error Resilient
- Graceful degradation (returns partial data on failures)
- Does NOT retry 4xx errors (fast fail for invalid placeId)
- DOES retry 5xx errors and network failures
- Circuit breaker ready (can be added easily)

### ✅ Database Integration
- Uses Supabase service client (RLS bypass)
- Upserts to `games` table on `place_id` conflict
- Updates `updated_at` timestamp
- Atomic operations

## Database Schema

### Required Migration

Run `backend/migrations/003_add_thumbnail_to_games.sql` if `thumbnail_url` column doesn't exist:

```sql
ALTER TABLE games ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
```

### Games Table Structure
```sql
games (
  id UUID PRIMARY KEY,
  place_id BIGINT UNIQUE,
  canonical_web_url TEXT,
  canonical_start_url TEXT,
  game_name TEXT,
  thumbnail_url TEXT,  -- Added by migration
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
```

## Usage

### Basic Usage

```typescript
import { RobloxEnrichmentService } from './services/roblox-enrichment.service.js';

const service = new RobloxEnrichmentService();

// Enrich Jailbreak
const game = await service.enrichGame(606849621);
console.log(game);
// {
//   placeId: 606849621,
//   universeId: 245683,
//   name: 'Jailbreak',
//   thumbnailUrl: 'https://tr.rbxcdn.com/...'
// }
```

### Integration with Session Creation

```typescript
import { RobloxEnrichmentService } from './services/roblox-enrichment.service.js';
import { SessionServiceV2 } from './services/sessionService-v2.js';

async function createEnrichedSession(hostUserId: string, robloxUrl: string) {
  const sessionService = new SessionServiceV2();
  const enrichmentService = new RobloxEnrichmentService();

  // Create session (normalizes URL and creates DB records)
  const session = await sessionService.createSession({
    hostUserId,
    robloxUrl,
    title: 'Gaming Session',
    visibility: 'public',
  });

  // Enrich game data in background (async, doesn't block session creation)
  enrichmentService.enrichGame(session.session.placeId).catch((err) => {
    logger.warn({ placeId: session.session.placeId, error: err }, 'Game enrichment failed');
  });

  return session;
}
```

### With Custom Fetch (for testing/mocking)

```typescript
import { RobloxEnrichmentService } from './services/roblox-enrichment.service.js';

const mockFetch = jest.fn();
const service = new RobloxEnrichmentService(mockFetch);

await service.enrichGame(606849621);
```

## Testing

### Run Tests

```bash
cd backend
npm test -- roblox-enrichment.service.test.ts
```

### Test Coverage

- ✅ Successful full enrichment
- ✅ Cache hit (no external calls)
- ✅ Cache miss (triggers enrichment)
- ✅ Incomplete cache (re-enriches)
- ✅ Universe API failure (throws error)
- ✅ Game name API failure (returns partial data)
- ✅ Thumbnail API failure (returns partial data)
- ✅ Thumbnail not ready (state !== 'Completed')
- ✅ Invalid placeId validation
- ✅ Timeout handling
- ✅ Retry logic (network failures)
- ✅ No retry on 4xx errors
- ✅ Retry on 5xx errors
- ✅ Database upsert
- ✅ Database error handling

### Test Output Example

```
 PASS  src/services/__tests__/roblox-enrichment.service.test.ts
  RobloxEnrichmentService
    enrichGame - success flow
      ✓ should successfully enrich a game with full data (5 ms)
      ✓ should use cached data when available (2 ms)
      ✓ should not use cache if name or thumbnail is missing (3 ms)
    enrichGame - error handling
      ✓ should throw error for invalid placeId (2 ms)
      ✓ should throw error when universe API returns 404 (2 ms)
      ✓ should return partial data if game name fetch fails (3 ms)
      ✓ should return partial data if thumbnail fetch fails (3 ms)
    ...
```

## Error Scenarios

### 1. Invalid Place ID
```typescript
await service.enrichGame(0); // Throws: "Invalid placeId: must be a positive integer"
```

### 2. Place Not Found (404)
```typescript
await service.enrichGame(999999999); // Throws: "Place 999999999 not found on Roblox"
```

### 3. Partial Enrichment (Name Failed)
```typescript
// Returns: { placeId: 123, universeId: 456, name: "Place 123", thumbnailUrl: "https://..." }
```

### 4. Partial Enrichment (Thumbnail Failed)
```typescript
// Returns: { placeId: 123, universeId: 456, name: "Game Name", thumbnailUrl: null }
```

### 5. Network Timeout
```typescript
// Retries once, then throws: "Roblox Universe API: Request timeout"
```

## Logging

### Log Entries

```
INFO: Starting game enrichment {placeId: 606849621}
INFO: Cache hit: game already enriched {placeId: 606849621}
WARN: Failed to fetch game name {placeId: 606849621, error: "..."}
INFO: Game enrichment complete {placeId: 606849621, hasName: true, hasThumbnail: true}
ERROR: Database error {placeId: 606849621, error: "..."}
```

## Performance Characteristics

- **Cache Hit**: ~10-20ms (database lookup only)
- **Cache Miss**: ~500-1500ms (3 external API calls)
- **Partial Failure**: ~500-1000ms (1-2 successful API calls)
- **Timeout**: 5000ms per endpoint (max 15s total)
- **Retry Delay**: 500ms base + exponential backoff

## Security

- ✅ No cookies required
- ✅ No authentication needed
- ✅ Only public Roblox APIs used
- ✅ Input validation (placeId must be positive integer)
- ✅ PII sanitization via logger
- ✅ Service role key never exposed to client

## Future Enhancements

### Phase 2 (Optional)
- [ ] Add circuit breaker for Roblox APIs
- [ ] Add metrics/monitoring hooks
- [ ] Add rate limiting for external APIs
- [ ] Add TTL for cache (auto-refresh stale data)
- [ ] Add game description enrichment
- [ ] Add creator info enrichment
- [ ] Add player count enrichment
- [ ] Add batch enrichment support

### Phase 3 (Advanced)
- [ ] WebSocket for real-time game updates
- [ ] Scheduled background enrichment job
- [ ] Game popularity scoring
- [ ] Trending games detection

## Troubleshooting

### Tests Fail on First Run
- Ensure `thumbnail_url` column exists in `games` table
- Run migration: `psql < backend/migrations/003_add_thumbnail_to_games.sql`

### "Supabase client not initialized" Error
- Ensure `initSupabase()` is called before using service
- Check Fastify plugin initialization order

### Timeouts in Production
- Check network connectivity to `roblox.com`
- Verify firewall rules allow outbound HTTPS
- Consider increasing `REQUEST_TIMEOUT` constant

### High Error Rates
- Check Roblox API status: https://status.roblox.com
- Verify rate limits not exceeded
- Add circuit breaker to prevent cascading failures

## References

- [Roblox Open Cloud API Docs](https://create.roblox.com/docs/cloud/open-cloud)
- [Roblox Games API](https://games.roblox.com/docs)
- [Roblox Thumbnails API](https://thumbnails.roblox.com/docs)
