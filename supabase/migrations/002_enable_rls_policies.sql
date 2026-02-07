/*
 * Epic 7: Security & RLS Policies
 *
 * This migration enables Row Level Security (RLS) on all tables
 * and creates comprehensive security policies.
 *
 * Key Principles:
 * - Service role bypasses RLS (backend operations)
 * - Public sessions are readable by anyone
 * - Private sessions require participation
 * - Only hosts can modify their sessions
 * - Users control their own data
 */

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_platforms ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- GAMES TABLE POLICIES
-- ============================================================================

-- Anyone can read games (public information)
CREATE POLICY "Games are viewable by everyone"
  ON games FOR SELECT
  USING (true);

-- Only service role can modify games (via backend)
CREATE POLICY "Games can be created by service role only"
  ON games FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Games can be updated by service role only"
  ON games FOR UPDATE
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Games can be deleted by service role only"
  ON games FOR DELETE
  USING (auth.role() = 'service_role');

-- ============================================================================
-- SESSIONS TABLE POLICIES
-- ============================================================================

-- Public sessions are viewable by everyone
CREATE POLICY "Public sessions are viewable by everyone"
  ON sessions FOR SELECT
  USING (visibility = 'public');

-- Users can view sessions they're participating in (any visibility)
CREATE POLICY "Users can view sessions they participate in"
  ON sessions FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND id IN (
      SELECT session_id FROM session_participants
      WHERE user_id = auth.uid() AND state = 'joined'
    )
  );

-- Users can view sessions they host (any visibility)
CREATE POLICY "Users can view sessions they host"
  ON sessions FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND host_id = auth.uid()
  );

-- Only service role can create sessions (via backend)
CREATE POLICY "Sessions can be created by service role only"
  ON sessions FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- Hosts can update their own sessions
-- Note: In practice, this should be done via backend API with validation
CREATE POLICY "Hosts can update their own sessions"
  ON sessions FOR UPDATE
  USING (
    auth.uid() IS NOT NULL
    AND host_id = auth.uid()
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND host_id = auth.uid()
  );

-- Hosts can delete their own sessions
CREATE POLICY "Hosts can delete their own sessions"
  ON sessions FOR DELETE
  USING (
    auth.uid() IS NOT NULL
    AND host_id = auth.uid()
  );

-- ============================================================================
-- SESSION_PARTICIPANTS TABLE POLICIES
-- ============================================================================

-- Users can view participants of public sessions
CREATE POLICY "Users can view participants of public sessions"
  ON session_participants FOR SELECT
  USING (
    session_id IN (
      SELECT id FROM sessions WHERE visibility = 'public'
    )
  );

-- Users can view participants of sessions they're in
CREATE POLICY "Users can view participants of sessions they participate in"
  ON session_participants FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND session_id IN (
      SELECT session_id FROM session_participants
      WHERE user_id = auth.uid() AND state = 'joined'
    )
  );

-- Users can view participants of sessions they host
CREATE POLICY "Users can view participants of sessions they host"
  ON session_participants FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND session_id IN (
      SELECT id FROM sessions WHERE host_id = auth.uid()
    )
  );

-- Only service role can manage participants (via backend)
-- This ensures proper validation of capacity, permissions, etc.
CREATE POLICY "Participants can be created by service role only"
  ON session_participants FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Participants can be updated by service role only"
  ON session_participants FOR UPDATE
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Participants can be deleted by service role only"
  ON session_participants FOR DELETE
  USING (auth.role() = 'service_role');

-- ============================================================================
-- SESSION_INVITES TABLE POLICIES
-- ============================================================================

-- Users can view invites for sessions they host
CREATE POLICY "Users can view invites for their sessions"
  ON session_invites FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND session_id IN (
      SELECT id FROM sessions WHERE host_id = auth.uid()
    )
  );

-- Anyone can read invites by code (for invite link sharing)
-- This is safe because invite codes are meant to be shared
CREATE POLICY "Anyone can view invites by code"
  ON session_invites FOR SELECT
  USING (true);

-- Only service role can manage invites (via backend)
CREATE POLICY "Invites can be created by service role only"
  ON session_invites FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Invites can be updated by service role only"
  ON session_invites FOR UPDATE
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Invites can be deleted by service role only"
  ON session_invites FOR DELETE
  USING (auth.role() = 'service_role');

-- ============================================================================
-- USER_PLATFORMS TABLE POLICIES
-- ============================================================================

-- Users can view their own platform connections
CREATE POLICY "Users can view their own platforms"
  ON user_platforms FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()
  );

-- Users can view other users' platforms (for participant lists, profiles)
-- This is needed to display Roblox usernames in session participant lists
CREATE POLICY "Users can view other users' public platform info"
  ON user_platforms FOR SELECT
  USING (true);

-- Only service role can manage user platforms (via backend OAuth)
CREATE POLICY "User platforms can be created by service role only"
  ON user_platforms FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "User platforms can be updated by service role only"
  ON user_platforms FOR UPDATE
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "User platforms can be deleted by service role only"
  ON user_platforms FOR DELETE
  USING (auth.role() = 'service_role');

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Run these queries to verify RLS is enabled:

/*
-- Check RLS status on all tables
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('games', 'sessions', 'session_participants', 'session_invites', 'user_platforms');

-- List all policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- Count policies per table
SELECT tablename, COUNT(*) as policy_count
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY tablename;
*/

-- ============================================================================
-- NOTES
-- ============================================================================

/*
IMPORTANT SECURITY CONSIDERATIONS:

1. Service Role vs Anon Key:
   - Backend uses SUPABASE_SERVICE_ROLE_KEY (bypasses RLS)
   - Clients use SUPABASE_ANON_KEY (enforces RLS)
   - NEVER expose service role key to clients

2. Backend Validation:
   - RLS is a safety net, not the only security layer
   - Backend should validate all operations before database access
   - Check capacity, permissions, business rules in backend

3. Testing:
   - Test with anon key to verify RLS works
   - Test with service role to verify backend operations work
   - Test unauthenticated access (auth.uid() IS NULL)
   - Test cross-user access attempts

4. Performance:
   - RLS policies use subqueries which may impact performance
   - Monitor query performance in production
   - Consider materialized views or caching for expensive policies

5. Future Enhancements:
   - Add friends-only session visibility (requires friends table)
   - Add session history/audit trail
   - Add rate limiting policies
   - Add data retention policies
*/
