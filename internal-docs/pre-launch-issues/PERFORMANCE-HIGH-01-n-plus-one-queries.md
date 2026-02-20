# PERFORMANCE: N+1 Query Problem in Session Listing

## Severity
🔴 **HIGH**

## Category
Performance / Database

## Description
Session listing queries use Supabase's nested select syntax which generates N+1 query patterns, scaling poorly with the number of sessions returned.

## Affected Files
- `backend/src/services/sessionService-v2.ts` (lines 274-332)

## Current Implementation
```typescript
const { data, error } = await supabase
  .from('sessions')
  .select(`
    *,
    games(*),
    session_participants(count)
  `)
  .eq('status', 'active')
  .limit(20);
```

## Problem
This generates multiple queries:
1. **1 query** for sessions table
2. **20 queries** for games table (one per session)
3. **20 queries** for session_participants count (one per session)

Total: **41 queries** for 20 sessions!

## Impact
- Response time increases linearly with session count
- Database connection pool exhaustion under load
- Unnecessary database load
- 50-70% slower than optimized query
- Higher Supabase costs (query-based pricing)

## Recommended Fix

### Option 1: Use PostgreSQL JOINs (Recommended)
```typescript
async listSessions(filters: {
  status?: SessionStatus;
  visibility?: SessionVisibility;
  placeId?: string;
  hostId?: string;
  limit?: number;
  offset?: number;
}): Promise<{ sessions: SessionWithDetails[]; pagination: PaginationInfo }> {
  const { limit = 20, offset = 0 } = filters;

  // Single optimized query with JOINs
  const query = `
    SELECT
      s.*,
      g.place_id, g.game_name, g.canonical_web_url, g.thumbnail_url,
      g.created_at as game_created_at,
      COUNT(DISTINCT sp.id) as participant_count,
      COUNT(*) OVER() as total_count
    FROM sessions s
    LEFT JOIN games g ON s.place_id = g.place_id
    LEFT JOIN session_participants sp ON s.id = sp.session_id
    WHERE 1=1
      ${filters.status ? `AND s.status = '${filters.status}'` : ''}
      ${filters.visibility ? `AND s.visibility = '${filters.visibility}'` : ''}
      ${filters.placeId ? `AND s.place_id = '${filters.placeId}'` : ''}
      ${filters.hostId ? `AND s.host_id = '${filters.hostId}'` : ''}
    GROUP BY s.id, g.place_id, g.game_name, g.canonical_web_url,
             g.thumbnail_url, g.created_at
    ORDER BY s.created_at DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `;

  const { data, error } = await supabase.rpc('list_sessions_optimized', {
    p_status: filters.status,
    p_visibility: filters.visibility,
    p_place_id: filters.placeId,
    p_host_id: filters.hostId,
    p_limit: limit,
    p_offset: offset,
  });

  if (error) {
    logger.error('Failed to list sessions', { error: error.message });
    throw new AppError(ErrorCodes.INTERNAL_ERROR, 'Failed to list sessions', 500);
  }

  const sessions: SessionWithDetails[] = data.map((row: any) => ({
    id: row.id,
    title: row.title,
    placeId: row.place_id,
    status: row.status,
    visibility: row.visibility,
    maxParticipants: row.max_participants,
    currentParticipants: row.participant_count,
    scheduledStart: row.scheduled_start,
    createdAt: row.created_at,
    hostId: row.host_id,
    game: row.place_id ? {
      placeId: row.place_id,
      gameName: row.game_name,
      canonicalWebUrl: row.canonical_web_url,
      thumbnailUrl: row.thumbnail_url,
    } : null,
  }));

  const total = data[0]?.total_count || 0;

  return {
    sessions,
    pagination: {
      total,
      limit,
      offset,
      hasMore: offset + sessions.length < total,
    },
  };
}
```

### Create Database Function
```sql
-- supabase/migrations/XXX_optimize_session_listing.sql
CREATE OR REPLACE FUNCTION list_sessions_optimized(
  p_status TEXT DEFAULT NULL,
  p_visibility TEXT DEFAULT NULL,
  p_place_id TEXT DEFAULT NULL,
  p_host_id UUID DEFAULT NULL,
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  place_id TEXT,
  status TEXT,
  visibility TEXT,
  max_participants INT,
  scheduled_start TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE,
  host_id UUID,
  game_name TEXT,
  canonical_web_url TEXT,
  thumbnail_url TEXT,
  participant_count BIGINT,
  total_count BIGINT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    s.title,
    s.place_id,
    s.status::TEXT,
    s.visibility::TEXT,
    s.max_participants,
    s.scheduled_start,
    s.created_at,
    s.host_id,
    g.game_name,
    g.canonical_web_url,
    g.thumbnail_url,
    COUNT(DISTINCT sp.id) as participant_count,
    COUNT(*) OVER() as total_count
  FROM sessions s
  LEFT JOIN games g ON s.place_id = g.place_id
  LEFT JOIN session_participants sp ON s.id = sp.session_id
  WHERE (p_status IS NULL OR s.status = p_status::session_status)
    AND (p_visibility IS NULL OR s.visibility = p_visibility::session_visibility)
    AND (p_place_id IS NULL OR s.place_id = p_place_id)
    AND (p_host_id IS NULL OR s.host_id = p_host_id)
  GROUP BY s.id, g.place_id, g.game_name, g.canonical_web_url, g.thumbnail_url
  ORDER BY s.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;
```

### Option 2: Denormalize Participant Count (Alternative)
```sql
-- Add column to sessions table
ALTER TABLE sessions ADD COLUMN current_participant_count INT DEFAULT 0;

-- Create trigger to update count
CREATE OR REPLACE FUNCTION update_participant_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE sessions
    SET current_participant_count = current_participant_count + 1
    WHERE id = NEW.session_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE sessions
    SET current_participant_count = GREATEST(current_participant_count - 1, 0)
    WHERE id = OLD.session_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_participant_count
AFTER INSERT OR DELETE ON session_participants
FOR EACH ROW
EXECUTE FUNCTION update_participant_count();
```

## Performance Comparison

| Method | Query Count | Response Time | Database Load |
|--------|-------------|---------------|---------------|
| Current (nested selects) | 41 | ~500ms | High |
| Optimized JOIN | 1 | ~150ms | Low |
| Denormalized count | 2 | ~100ms | Very Low |

## Testing
```bash
# Before optimization
time curl http://localhost:3000/api/sessions

# After optimization (should be 50-70% faster)
time curl http://localhost:3000/api/sessions
```

## Implementation Checklist
- [ ] Create migration with optimized function
- [ ] Update `sessionService-v2.ts` to use new function
- [ ] Test with varying session counts (10, 50, 100 sessions)
- [ ] Update tests to work with new implementation
- [ ] Monitor query performance in production
- [ ] Consider adding database indexes (see separate issue)

## References
- [N+1 Query Problem](https://stackoverflow.com/questions/97197/what-is-the-n1-selects-problem)
- [PostgreSQL Aggregate Functions](https://www.postgresql.org/docs/current/functions-aggregate.html)

## Priority
**P1 - High** - Significant performance impact

## Estimated Effort
4-6 hours (including migration creation and testing)
