# Epic 7: Row Level Security (RLS) - Testing Guide

## Overview
Epic 7 implements comprehensive Row Level Security (RLS) policies for all database tables to ensure data access is properly controlled at the database level.

## Security Model

### Key Principles
1. **Service Role Bypasses RLS** - Backend uses service role key for privileged operations
2. **Public Sessions Are Open** - Anyone can view public sessions
3. **Private Sessions Require Participation** - Users must be participants to view private sessions
4. **Hosts Control Their Sessions** - Only session hosts can modify their sessions
5. **Users Control Their Data** - Users can only modify their own data

### Client Types

**Service Role Client (Backend)**
- Uses `SUPABASE_SERVICE_ROLE_KEY`
- Bypasses all RLS policies
- Used for: Creating sessions, managing participants, generating invites
- **NEVER exposed to frontend clients**

**Anon Client (Frontend/User-Scoped Backend)**
- Uses `SUPABASE_ANON_KEY`
- Enforces all RLS policies
- Used for: User queries, permission-scoped operations
- Safe to expose to frontend

---

## Migration Details

**File:** `supabase/migrations/002_enable_rls_policies.sql`

**Tables Protected:**
- ✅ `games` - Roblox game information
- ✅ `sessions` - Gaming sessions
- ✅ `session_participants` - Session membership
- ✅ `session_invites` - Session invite codes
- ✅ `user_platforms` - User platform connections (Roblox)

---

## Policy Summary

### Games Table

| Action | Who Can Do It | Policy Name |
|--------|--------------|-------------|
| SELECT | Everyone | Games are viewable by everyone |
| INSERT | Service role only | Games can be created by service role only |
| UPDATE | Service role only | Games can be updated by service role only |
| DELETE | Service role only | Games can be deleted by service role only |

**Rationale:** Game data is public information, but only the backend should manage it to ensure consistency.

---

### Sessions Table

| Action | Who Can Do It | Policy Name |
|--------|--------------|-------------|
| SELECT (public) | Everyone | Public sessions are viewable by everyone |
| SELECT (participant) | Participants | Users can view sessions they participate in |
| SELECT (host) | Host | Users can view sessions they host |
| INSERT | Service role only | Sessions can be created by service role only |
| UPDATE | Host only | Hosts can update their own sessions |
| DELETE | Host only | Hosts can delete their own sessions |

**Rationale:**
- Public sessions should be discoverable
- Private sessions only visible to participants
- Hosts control their session lifecycle
- Backend validates all creates to ensure data integrity

---

### Session Participants Table

| Action | Who Can Do It | Policy Name |
|--------|--------------|-------------|
| SELECT (public) | Everyone | Users can view participants of public sessions |
| SELECT (participant) | Participants | Users can view participants of sessions they participate in |
| SELECT (host) | Host | Users can view participants of sessions they host |
| INSERT | Service role only | Participants can be created by service role only |
| UPDATE | Service role only | Participants can be updated by service role only |
| DELETE | Service role only | Participants can be deleted by service role only |

**Rationale:**
- Participant lists visible based on session visibility
- Backend ensures capacity limits and validation when adding participants

---

### Session Invites Table

| Action | Who Can Do It | Policy Name |
|--------|--------------|-------------|
| SELECT (by host) | Host | Users can view invites for their sessions |
| SELECT (by code) | Everyone | Anyone can view invites by code |
| INSERT | Service role only | Invites can be created by service role only |
| UPDATE | Service role only | Invites can be updated by service role only |
| DELETE | Service role only | Invites can be deleted by service role only |

**Rationale:**
- Invite codes meant to be shared, so anyone can read them
- Only hosts should see all invites for their sessions
- Backend manages invite lifecycle

---

### User Platforms Table

| Action | Who Can Do It | Policy Name |
|--------|--------------|-------------|
| SELECT (own) | User (self) | Users can view their own platforms |
| SELECT (public) | Everyone | Users can view other users' public platform info |
| INSERT | Service role only | User platforms can be created by service role only |
| UPDATE | Service role only | User platforms can be updated by service role only |
| DELETE | Service role only | User platforms can be deleted by service role only |

**Rationale:**
- Platform info (Roblox username) needs to be visible in participant lists
- Backend manages OAuth and platform connections

---

## Testing Scenarios

### Test 1: Public Session Visibility

**Setup:**
1. Create a public session using backend API
2. Note the session ID

**Test Cases:**

**[TEST-7.1.1] Unauthenticated User Can View Public Session**
```sql
-- Using anon key, no auth
SELECT * FROM sessions WHERE id = '<session-id>' AND visibility = 'public';
```
**Expected:** ✅ Returns the session

**[TEST-7.1.2] Unauthenticated User Cannot View Private Session**
```sql
-- Using anon key, no auth
SELECT * FROM sessions WHERE id = '<session-id>' AND visibility = 'invite_only';
```
**Expected:** ✅ Returns empty (no rows)

---

### Test 2: Session Participation

**Setup:**
1. Create two users: Alice and Bob
2. Alice creates a session (becomes host)
3. Bob joins the session (becomes participant)
4. Create a third user Charlie (not in session)

**Test Cases:**

**[TEST-7.1.3] User Can View Sessions They've Joined**
```sql
-- Authenticated as Bob
SELECT * FROM sessions WHERE id = '<session-id>';
```
**Expected:** ✅ Returns the session (Bob is a participant)

**[TEST-7.1.4] User Cannot View Sessions They Haven't Joined**
```sql
-- Authenticated as Charlie
SELECT * FROM sessions WHERE id = '<session-id>' AND visibility = 'invite_only';
```
**Expected:** ✅ Returns empty (Charlie not a participant)

---

### Test 3: Session Modification

**Setup:**
1. Alice creates and hosts a session
2. Bob joins the session

**Test Cases:**

**[TEST-7.1.5] User Can Update Their Own Hosted Session**
```sql
-- Authenticated as Alice (host)
UPDATE sessions
SET title = 'Updated Title'
WHERE id = '<session-id>';
```
**Expected:** ✅ Update succeeds (Alice is the host)

**[TEST-7.1.6] User Cannot Update Sessions They Don't Host**
```sql
-- Authenticated as Bob (participant, not host)
UPDATE sessions
SET title = 'Hacked Title'
WHERE id = '<session-id>';
```
**Expected:** ✅ Update fails (Bob is not the host)

---

### Test 4: Service Role Operations

**Test Cases:**

**[TEST-7.1.7] Service Role Can Create Sessions**
```sql
-- Using service role key
INSERT INTO sessions (id, place_id, host_id, title, visibility, status, max_participants)
VALUES (gen_random_uuid(), 606849621, '<user-id>', 'Test', 'public', 'scheduled', 10);
```
**Expected:** ✅ Insert succeeds (service role bypasses RLS)

**[TEST-7.1.8] Anon Key Cannot Create Sessions**
```sql
-- Using anon key
INSERT INTO sessions (id, place_id, host_id, title, visibility, status, max_participants)
VALUES (gen_random_uuid(), 606849621, '<user-id>', 'Test', 'public', 'scheduled', 10);
```
**Expected:** ✅ Insert fails (RLS blocks direct inserts from anon key)

---

### Test 5: Participant List Access

**Setup:**
1. Alice hosts a public session
2. Bob joins the session
3. Charlie is not in the session

**Test Cases:**

**[TEST-7.1.9] Anyone Can View Participants of Public Sessions**
```sql
-- Unauthenticated or any user
SELECT * FROM session_participants WHERE session_id = '<public-session-id>';
```
**Expected:** ✅ Returns all participants (public session)

**[TEST-7.1.10] Only Participants Can View Private Session Participants**
```sql
-- Authenticated as Charlie (not in session)
SELECT * FROM session_participants WHERE session_id = '<private-session-id>';
```
**Expected:** ✅ Returns empty (Charlie not a participant)

---

### Test 6: Invite Code Access

**Test Cases:**

**[TEST-7.1.11] Anyone Can Read Invite by Code**
```sql
-- Unauthenticated
SELECT * FROM session_invites WHERE code = 'ABC123XYZ';
```
**Expected:** ✅ Returns the invite (codes are meant to be shared)

**[TEST-7.1.12] Only Host Can View All Invites for Their Session**
```sql
-- Authenticated as Alice (host)
SELECT * FROM session_invites WHERE session_id = '<session-id>';
```
**Expected:** ✅ Returns all invites for the session

```sql
-- Authenticated as Bob (participant, not host)
SELECT * FROM session_invites WHERE session_id = '<session-id>';
```
**Expected:** ✅ Returns empty or only public invites (Bob is not the host)

---

## Manual Testing with Supabase Dashboard

### Step 1: Enable RLS
1. Go to Supabase Dashboard → SQL Editor
2. Run the migration file: `supabase/migrations/002_enable_rls_policies.sql`
3. Verify RLS is enabled:
```sql
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('games', 'sessions', 'session_participants', 'session_invites', 'user_platforms');
```
**Expected:** All tables should have `rowsecurity = true`

### Step 2: Verify Policies Exist
```sql
SELECT tablename, policyname, permissive, cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```
**Expected:** Should see policies for all tables

### Step 3: Test with Table Editor
1. Go to Table Editor → Sessions
2. Try to insert a row directly (should fail due to RLS)
3. Switch to "Service role" mode in the UI
4. Try to insert again (should succeed)

### Step 4: Test with SQL Editor
Use the SQL editor to run the test queries above, toggling between:
- **Unauthenticated** (no auth header)
- **User-authenticated** (use auth.uid())
- **Service role** (privileged access)

---

## Backend Testing

### Using Service Client (Default)
```typescript
import { getSupabase } from '@/config/supabase';

// This client bypasses RLS
const supabase = getSupabase();

// Can create sessions
const { data, error } = await supabase
  .from('sessions')
  .insert({ /* session data */ });
```

### Using User-Scoped Client (Optional)
```typescript
import { getUserScopedClient } from '@/config/supabase';

// This client enforces RLS for the user
const userClient = getUserScopedClient(req.user.accessToken);

// Can only view sessions user has access to
const { data, error } = await userClient
  .from('sessions')
  .select('*');
```

---

## Automated Testing (Future - Epic 8)

Create integration tests to verify RLS:

```typescript
// backend/src/__tests__/rls.test.ts

describe('RLS Policies', () => {
  test('Public sessions are visible to everyone', async () => {
    // Create public session
    // Query with anon client
    // Assert session is returned
  });

  test('Private sessions are not visible to non-participants', async () => {
    // Create private session
    // Query with different user
    // Assert session is not returned
  });

  // ... more tests
});
```

---

## Verification Checklist

Before deploying to production:

- [ ] **Migration Applied:** RLS migration executed on Supabase
- [ ] **RLS Enabled:** All tables have RLS enabled
- [ ] **Policies Created:** All policies exist and are active
- [ ] **Service Role Works:** Backend can create/modify all data
- [ ] **Anon Key Respects RLS:** Direct queries respect policies
- [ ] **Public Sessions Visible:** Unauthenticated users can view public sessions
- [ ] **Private Sessions Protected:** Private sessions only visible to participants
- [ ] **Hosts Can Modify:** Session hosts can update/delete their sessions
- [ ] **Non-Hosts Cannot Modify:** Participants cannot modify sessions they don't host
- [ ] **Invite Codes Work:** Anyone can read invites by code
- [ ] **No Data Leaks:** Tested cross-user access attempts fail
- [ ] **Performance OK:** RLS policies don't significantly slow queries
- [ ] **Error Handling:** App handles RLS errors gracefully

---

## Security Best Practices

### 1. Defense in Depth
RLS is a safety net, not the only security layer:
- ✅ Validate input in backend API
- ✅ Check business rules before database operations
- ✅ Use RLS as final enforcement layer

### 2. Key Management
- ✅ Service role key only in backend `.env`
- ✅ Never commit keys to git
- ✅ Rotate keys regularly
- ✅ Use different keys for dev/staging/prod

### 3. Testing
- ✅ Test with anon key to verify RLS works
- ✅ Test unauthenticated access
- ✅ Test cross-user access attempts
- ✅ Test service role operations

### 4. Monitoring
- ✅ Log RLS policy violations
- ✅ Monitor slow queries (RLS can add overhead)
- ✅ Alert on unexpected access patterns

---

## Troubleshooting

### Issue: "Row-level security is enabled but no policies exist"
**Solution:**
- Verify migration was applied correctly
- Check policy names don't conflict
- Ensure policies are created after RLS is enabled

### Issue: Backend can't create sessions
**Solution:**
- Verify using service role key, not anon key
- Check `SUPABASE_SERVICE_ROLE_KEY` in `.env`
- Verify service role policy exists

### Issue: Users can't view public sessions
**Solution:**
- Check session visibility is set to 'public'
- Verify "Public sessions are viewable by everyone" policy exists
- Test query directly in SQL editor

### Issue: RLS policies too slow
**Solution:**
- Add indexes on frequently queried columns
- Simplify complex policies
- Consider materialized views for expensive queries
- Cache results in backend when appropriate

---

## Performance Considerations

### Query Performance
RLS policies use subqueries which can impact performance:

```sql
-- This policy requires a subquery
CREATE POLICY "Users can view sessions they participate in"
  ON sessions FOR SELECT
  USING (
    id IN (
      SELECT session_id FROM session_participants
      WHERE user_id = auth.uid() AND state = 'joined'
    )
  );
```

### Optimizations
1. **Add Indexes:**
```sql
CREATE INDEX idx_session_participants_user_session
  ON session_participants(user_id, session_id, state);
```

2. **Use Backend Caching:**
- Cache session lists for public sessions
- Cache user's joined sessions
- Invalidate on mutations

3. **Monitor Slow Queries:**
```sql
-- Enable pg_stat_statements extension
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Find slow queries
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;
```

---

## Next Steps

After Epic 7 is complete:
- **Epic 8:** Testing & Observability
  - Automated RLS tests
  - Integration tests
  - Performance benchmarks
  - Logging and monitoring

---

## Resources

- [Supabase RLS Documentation](https://supabase.com/docs/guides/auth/row-level-security)
- [PostgreSQL RLS Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [Auth.uid() Helper](https://supabase.com/docs/guides/auth/row-level-security#helper-functions)
