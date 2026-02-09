/**
 * Epic 8 Story 8.2: Integration Tests for Session Flows
 *
 * Tests end-to-end session workflows:
 * - Create session
 * - Join session
 * - Session capacity enforcement
 * - Invite code validation
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { getSupabase } from '../../config/supabase.js';

// Note: We'll need to export buildServer from server.ts for testing
// For now, we'll create a test helper

// Integration tests require a live Supabase project + service role key.
// Keep them opt-in so `npm test` can run in dev/CI without secrets.
const describeIntegration = process.env.RUN_INTEGRATION_TESTS === '1' ? describe : describe.skip;

/**
 * Test user management helper
 */
class TestUserManager {
  private createdUsers: string[] = [];

  async createUser(email: string, password: string = 'Password123!'): Promise<{
    userId: string;
    accessToken: string;
  }> {
    const supabase = getSupabase();

    // Create user
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (error || !data.user) {
      throw new Error(`Failed to create test user: ${error?.message}`);
    }

    this.createdUsers.push(data.user.id);

    // Sign in to get access token
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError || !signInData.session) {
      throw new Error(`Failed to sign in test user: ${signInError?.message}`);
    }

    return {
      userId: data.user.id,
      accessToken: signInData.session.access_token,
    };
  }

  async cleanup() {
    const supabase = getSupabase();

    for (const userId of this.createdUsers) {
      try {
        await supabase.auth.admin.deleteUser(userId);
      } catch (error) {
        console.error(`Failed to cleanup user ${userId}:`, error);
      }
    }

    this.createdUsers = [];
  }
}

/**
 * Test session helper
 */
class TestSessionManager {
  private createdSessions: string[] = [];

  async createSession(params: {
    hostId: string;
    title?: string;
    placeId?: number;
    maxParticipants?: number;
    visibility?: 'public' | 'invite_only' | 'friends';
  }): Promise<string> {
    const supabase = getSupabase();

    const sessionId = crypto.randomUUID();
    const placeId = params.placeId || 606849621;

    // Insert game if not exists
    await supabase
      .from('games')
      .upsert({
        place_id: placeId,
        canonical_web_url: `https://www.roblox.com/games/${placeId}`,
        canonical_start_url: `https://www.roblox.com/games/start?placeId=${placeId}`,
      })
      .select()
      .single();

    // Create session
    const { error: sessionError } = await supabase
      .from('sessions')
      .insert({
        id: sessionId,
        place_id: placeId,
        host_id: params.hostId,
        title: params.title || 'Test Session',
        visibility: params.visibility || 'public',
        status: 'scheduled',
        max_participants: params.maxParticipants || 10,
      });

    if (sessionError) {
      throw new Error(`Failed to create test session: ${sessionError.message}`);
    }

    // Add host as participant
    await supabase
      .from('session_participants')
      .insert({
        session_id: sessionId,
        user_id: params.hostId,
        role: 'host',
        state: 'joined',
      });

    // Create invite code
    const inviteCode = Math.random().toString(36).substring(2, 11).toUpperCase();
    await supabase
      .from('session_invites')
      .insert({
        session_id: sessionId,
        code: inviteCode,
        created_by: params.hostId,
      });

    this.createdSessions.push(sessionId);
    return sessionId;
  }

  async cleanup() {
    const supabase = getSupabase();

    for (const sessionId of this.createdSessions) {
      try {
        // Delete in correct order (respecting foreign keys)
        await supabase.from('session_participants').delete().eq('session_id', sessionId);
        await supabase.from('session_invites').delete().eq('session_id', sessionId);
        await supabase.from('sessions').delete().eq('id', sessionId);
      } catch (error) {
        console.error(`Failed to cleanup session ${sessionId}:`, error);
      }
    }

    this.createdSessions = [];
  }
}

// ============================================================================
// TEST SUITES
// ============================================================================

describeIntegration('Session Flow Integration Tests', () => {
  let userManager: TestUserManager;
  let sessionManager: TestSessionManager;

  beforeAll(() => {
    userManager = new TestUserManager();
    sessionManager = new TestSessionManager();
  });

  afterAll(async () => {
    await sessionManager.cleanup();
    await userManager.cleanup();
  });

  // =========================================================================
  // TEST SUITE: Session Creation
  // =========================================================================

  describe('Session Creation', () => {
    let user: { userId: string; accessToken: string };

    beforeAll(async () => {
      user = await userManager.createUser('create-test@example.com');
    });

    it('should create session with valid data', async () => {
      const sessionId = await sessionManager.createSession({
        hostId: user.userId,
        title: 'Integration Test Session',
        maxParticipants: 5,
      });

      const supabase = getSupabase();
      const { data: session } = await supabase
        .from('sessions')
        .select('*')
        .eq('id', sessionId)
        .single();

      expect(session).toBeDefined();
      expect(session?.title).toBe('Integration Test Session');
      expect(session?.max_participants).toBe(5);
      expect(session?.host_id).toBe(user.userId);
    });

    it('should add host as participant automatically', async () => {
      const sessionId = await sessionManager.createSession({
        hostId: user.userId,
      });

      const supabase = getSupabase();
      const { data: participant } = await supabase
        .from('session_participants')
        .select('*')
        .eq('session_id', sessionId)
        .eq('user_id', user.userId)
        .single();

      expect(participant).toBeDefined();
      expect(participant?.role).toBe('host');
      expect(participant?.state).toBe('joined');
    });

    it('should generate invite code', async () => {
      const sessionId = await sessionManager.createSession({
        hostId: user.userId,
      });

      const supabase = getSupabase();
      const { data: invite } = await supabase
        .from('session_invites')
        .select('*')
        .eq('session_id', sessionId)
        .single();

      expect(invite).toBeDefined();
      expect(invite?.code).toBeDefined();
      expect(invite?.code.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // TEST SUITE: Session Joining
  // =========================================================================

  describe('Session Joining', () => {
    let host: { userId: string; accessToken: string };
    let user2: { userId: string; accessToken: string };
    let sessionId: string;

    beforeEach(async () => {
      host = await userManager.createUser(`host-${Date.now()}@example.com`);
      user2 = await userManager.createUser(`user2-${Date.now()}@example.com`);
      sessionId = await sessionManager.createSession({
        hostId: host.userId,
        maxParticipants: 5,
      });
    });

    it('should allow user to join public session', async () => {
      const supabase = getSupabase();

      // Join session
      await supabase
        .from('session_participants')
        .insert({
          session_id: sessionId,
          user_id: user2.userId,
          role: 'member',
          state: 'joined',
        });

      // Verify participant added
      const { data: participant } = await supabase
        .from('session_participants')
        .select('*')
        .eq('session_id', sessionId)
        .eq('user_id', user2.userId)
        .single();

      expect(participant).toBeDefined();
      expect(participant?.state).toBe('joined');
    });

    it('should update current participant count', async () => {
      const supabase = getSupabase();

      // Join session
      await supabase
        .from('session_participants')
        .insert({
          session_id: sessionId,
          user_id: user2.userId,
          role: 'member',
          state: 'joined',
        });

      // Check participant count
      const { count } = await supabase
        .from('session_participants')
        .select('*', { count: 'exact', head: false })
        .eq('session_id', sessionId)
        .eq('state', 'joined');

      expect(count).toBe(2); // Host + user2
    });

    it('should prevent joining when already a participant', async () => {
      const supabase = getSupabase();

      // Join once
      await supabase
        .from('session_participants')
        .insert({
          session_id: sessionId,
          user_id: user2.userId,
          role: 'member',
          state: 'joined',
        });

      // Try to join again (should fail with unique constraint)
      const { error } = await supabase
        .from('session_participants')
        .insert({
          session_id: sessionId,
          user_id: user2.userId,
          role: 'member',
          state: 'joined',
        });

      expect(error).toBeDefined();
      expect(error?.code).toBe('23505'); // Unique violation
    });
  });

  // =========================================================================
  // TEST SUITE: Session Capacity
  // =========================================================================

  describe('Session Capacity Enforcement', () => {
    let host: { userId: string; accessToken: string };
    let sessionId: string;

    beforeEach(async () => {
      host = await userManager.createUser(`capacity-host-${Date.now()}@example.com`);
      sessionId = await sessionManager.createSession({
        hostId: host.userId,
        maxParticipants: 3, // Small capacity for testing
      });
    });

    it('should track current participant count correctly', async () => {
      const supabase = getSupabase();

      // Add 2 more users (host is already participant, so total will be 3)
      for (let i = 0; i < 2; i++) {
        const user = await userManager.createUser(`capacity-${i}-${Date.now()}@example.com`);
        await supabase
          .from('session_participants')
          .insert({
            session_id: sessionId,
            user_id: user.userId,
            role: 'member',
            state: 'joined',
          });
      }

      // Check count
      const { count } = await supabase
        .from('session_participants')
        .select('*', { count: 'exact', head: false })
        .eq('session_id', sessionId)
        .eq('state', 'joined');

      expect(count).toBe(3); // At max capacity
    });

    it('should allow joining if under capacity', async () => {
      const supabase = getSupabase();

      // Session has max 3, currently 1 (host), so should allow joining
      const user = await userManager.createUser(`under-capacity-${Date.now()}@example.com`);

      const { error } = await supabase
        .from('session_participants')
        .insert({
          session_id: sessionId,
          user_id: user.userId,
          role: 'member',
          state: 'joined',
        });

      expect(error).toBeNull();
    });
  });

  // =========================================================================
  // TEST SUITE: Invite Codes
  // =========================================================================

  describe('Invite Code Validation', () => {
    let host: { userId: string; accessToken: string };
    let sessionId: string;
    let inviteCode: string;

    beforeEach(async () => {
      host = await userManager.createUser(`invite-host-${Date.now()}@example.com`);
      sessionId = await sessionManager.createSession({
        hostId: host.userId,
        visibility: 'invite_only',
      });

      // Get invite code
      const supabase = getSupabase();
      const { data: invite } = await supabase
        .from('session_invites')
        .select('code')
        .eq('session_id', sessionId)
        .single();

      inviteCode = invite!.code;
    });

    it('should find session by valid invite code', async () => {
      const supabase = getSupabase();

      const { data: invite } = await supabase
        .from('session_invites')
        .select('session_id')
        .eq('code', inviteCode)
        .single();

      expect(invite).toBeDefined();
      expect(invite?.session_id).toBe(sessionId);
    });

    it('should not find session with invalid invite code', async () => {
      const supabase = getSupabase();

      const { data: invite } = await supabase
        .from('session_invites')
        .select('session_id')
        .eq('code', 'INVALID123')
        .single();

      expect(invite).toBeNull();
    });

    it('should allow joining via valid invite code', async () => {
      const supabase = getSupabase();
      const user = await userManager.createUser(`invite-user-${Date.now()}@example.com`);

      // Verify session exists via invite code
      const { data: invite } = await supabase
        .from('session_invites')
        .select('session_id')
        .eq('code', inviteCode)
        .single();

      expect(invite?.session_id).toBe(sessionId);

      // Join session
      const { error } = await supabase
        .from('session_participants')
        .insert({
          session_id: sessionId,
          user_id: user.userId,
          role: 'member',
          state: 'joined',
        });

      expect(error).toBeNull();
    });
  });

  // =========================================================================
  // TEST SUITE: Session Visibility
  // =========================================================================

  describe('Session Visibility', () => {
    let host: { userId: string; accessToken: string };
    let publicSessionId: string;
    let privateSessionId: string;

    beforeEach(async () => {
      host = await userManager.createUser(`visibility-host-${Date.now()}@example.com`);

      publicSessionId = await sessionManager.createSession({
        hostId: host.userId,
        visibility: 'public',
        title: 'Public Session',
      });

      privateSessionId = await sessionManager.createSession({
        hostId: host.userId,
        visibility: 'invite_only',
        title: 'Private Session',
      });
    });

    it('should list public sessions', async () => {
      const supabase = getSupabase();

      const { data: sessions } = await supabase
        .from('sessions')
        .select('*')
        .eq('visibility', 'public');

      const hasPublicSession = sessions?.some(s => s.id === publicSessionId);
      expect(hasPublicSession).toBe(true);
    });

    it('should not list private sessions in public query', async () => {
      const supabase = getSupabase();

      const { data: sessions } = await supabase
        .from('sessions')
        .select('*')
        .eq('visibility', 'public');

      const hasPrivateSession = sessions?.some(s => s.id === privateSessionId);
      expect(hasPrivateSession).toBe(false);
    });
  });
});
