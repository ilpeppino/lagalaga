# LagaLaga Implementation Plan
**Roblox-First LFG/Session Platform**

*Generated: 2026-02-06*

---

## Table of Contents
1. [Milestone Roadmap](#milestone-roadmap)
2. [Dependency Graph](#dependency-graph)
3. [Activity Breakdown](#activity-breakdown)
4. [Definition of Done](#definition-of-done)

---

## Milestone Roadmap

### M0: Foundation (Core Infrastructure)
**Scope:** Database schema, link normalization service, basic API structure

**Deliverables:**
- Complete Supabase schema with tables: `games`, `sessions`, `session_participants`, `session_invites`
- Roblox link normalization service (backend)
- Migration scripts + seed data
- Basic backend API scaffolding

**Size Estimate:** ~8-12 engineering tasks

---

### M1: Session Lifecycle MVP
**Scope:** End-to-end session creation, browsing, and joining

**Deliverables:**
- Session creation UI (paste Roblox link)
- Session list + detail views
- Join session flow (capacity + visibility checks)
- Roblox deep linking (primary + fallback)
- Invite link generation + sharing

**Size Estimate:** ~15-20 engineering tasks

---

### M2: Production Readiness
**Scope:** Security hardening, RLS policies, testing, observability

**Deliverables:**
- Supabase RLS policies for all tables
- Unit tests for link normalization (90%+ coverage)
- Integration tests for session flows
- Basic logging/metrics infrastructure
- Error handling + user feedback
- Performance optimization

**Size Estimate:** ~10-15 engineering tasks

---

### M3: Enhanced Features (Future)
**Scope:** Roblox OAuth, profile caching, advanced features

**Deliverables:**
- Roblox OAuth PKCE + backend token exchange
- `roblox_profile_cache` table + sync jobs
- Activity feed
- Push notifications

**Size Estimate:** ~12-18 engineering tasks

---

## Dependency Graph

```
┌─────────────────────────────────────────────────────────────┐
│ M0: FOUNDATION                                              │
├─────────────────────────────────────────────────────────────┤
│ E1: Database Schema                                         │
│   └─> E2: Link Normalization Service                       │
│         └─> E3: Session Creation Flow ──┐                  │
│         └─> E4: Session Browse & Detail │                  │
│                   │                      │                  │
│                   └──────────────────────┴─> E5: Join Flow │
│                                               │             │
│                                               └─> E6: Roblox Deep Linking
│                                                                │
├────────────────────────────────────────────────────────────────┤
│ M2: PRODUCTION READINESS                                       │
├────────────────────────────────────────────────────────────────┤
│ E7: Security & RLS (parallel with E3-E6)                       │
│ E8: Testing & Observability (after E3-E6)                      │
└────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ M3: FUTURE (after M2 complete)                              │
├─────────────────────────────────────────────────────────────┤
│ E9: Roblox OAuth Integration                                │
└─────────────────────────────────────────────────────────────┘
```

**Key Dependencies:**
- `E2` (Link Normalization) depends on `E1` (Database Schema)
- `E3` (Session Creation) depends on `E2` (Link Normalization)
- `E4` (Browse) depends on `E1` (Database Schema)
- `E5` (Join Flow) depends on `E3` (Session Creation) and `E4` (Browse)
- `E6` (Deep Linking) depends on `E5` (Join Flow)
- `E7` (Security/RLS) can be developed in parallel with `E3-E6` but must be complete before production
- `E8` (Testing) requires `E3-E6` to be functionally complete
- `E9` (OAuth) is independent and can be scheduled after MVP

---

## Activity Breakdown

---

## Epic 1: Database Schema & Migrations

### Overview
Establish the complete Supabase Postgres schema with proper relationships, constraints, and indexes.

---

### Story 1.1: Core Session Tables
**As a developer, I need the core session data model so I can store and query sessions.**

**Acceptance Criteria:**
- [ ] `games` table exists with placeId as primary key
- [ ] `sessions` table exists with foreign key to games
- [ ] `session_participants` table exists with composite key (session_id, user_id)
- [ ] `session_invites` table exists with unique invite codes
- [ ] All timestamps use `timestamptz`
- [ ] Migration is reversible (up/down scripts)

**Engineering Tasks:**

**[DB-1.1.1] Create `games` table**
```sql
CREATE TABLE games (
  place_id BIGINT PRIMARY KEY,
  canonical_web_url TEXT NOT NULL,
  canonical_start_url TEXT NOT NULL,
  game_name TEXT,
  game_description TEXT,
  thumbnail_url TEXT,
  max_players INT,
  creator_id BIGINT,
  creator_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_games_creator ON games(creator_id);
CREATE INDEX idx_games_name ON games(game_name);
```

**[DB-1.1.2] Create `sessions` table**
```sql
CREATE TYPE session_visibility AS ENUM ('public', 'friends', 'invite_only');
CREATE TYPE session_status AS ENUM ('scheduled', 'active', 'completed', 'cancelled');

CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id BIGINT NOT NULL REFERENCES games(place_id) ON DELETE CASCADE,
  host_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  title TEXT NOT NULL,
  description TEXT,
  visibility session_visibility NOT NULL DEFAULT 'public',
  status session_status NOT NULL DEFAULT 'scheduled',

  max_participants INT NOT NULL DEFAULT 10 CHECK (max_participants > 0),
  scheduled_start TIMESTAMPTZ,
  scheduled_end TIMESTAMPTZ,

  original_input_url TEXT NOT NULL,
  normalized_from TEXT NOT NULL,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CHECK (scheduled_end IS NULL OR scheduled_end > scheduled_start)
);

CREATE INDEX idx_sessions_place ON sessions(place_id);
CREATE INDEX idx_sessions_host ON sessions(host_id);
CREATE INDEX idx_sessions_status ON sessions(status);
CREATE INDEX idx_sessions_visibility ON sessions(visibility);
CREATE INDEX idx_sessions_scheduled_start ON sessions(scheduled_start);
```

**[DB-1.1.3] Create `session_participants` table**
```sql
CREATE TYPE participant_role AS ENUM ('host', 'member');
CREATE TYPE participant_state AS ENUM ('invited', 'joined', 'left', 'kicked');

CREATE TABLE session_participants (
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  role participant_role NOT NULL DEFAULT 'member',
  state participant_state NOT NULL DEFAULT 'joined',

  joined_at TIMESTAMPTZ DEFAULT NOW(),
  left_at TIMESTAMPTZ,

  PRIMARY KEY (session_id, user_id)
);

CREATE INDEX idx_participants_user ON session_participants(user_id);
CREATE INDEX idx_participants_session_state ON session_participants(session_id, state);
```

**[DB-1.1.4] Create `session_invites` table**
```sql
CREATE TABLE session_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  invite_code TEXT NOT NULL UNIQUE,
  max_uses INT,
  uses_count INT DEFAULT 0,
  expires_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  CHECK (max_uses IS NULL OR max_uses > 0),
  CHECK (uses_count >= 0)
);

CREATE UNIQUE INDEX idx_invites_code ON session_invites(invite_code);
CREATE INDEX idx_invites_session ON session_invites(session_id);
CREATE INDEX idx_invites_expires ON session_invites(expires_at);
```

**[DB-1.1.5] Create migration scripts**
- Write `migrations/001_core_schema.sql` (up)
- Write `migrations/001_core_schema_down.sql` (down)
- Add migration runner to backend

**[DB-1.1.6] Create updated_at trigger**
```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_games_updated_at BEFORE UPDATE ON games
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sessions_updated_at BEFORE UPDATE ON sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

**Tests:**
- [ ] Migration runs successfully on empty database
- [ ] Rollback restores database to previous state
- [ ] Foreign key constraints work (cascade deletes)
- [ ] Check constraints prevent invalid data
- [ ] Indexes are created correctly

---

### Story 1.2: Platform User Association
**As a developer, I need to link Supabase users to their platform identities so I can support multi-platform sessions.**

**Acceptance Criteria:**
- [ ] `platforms` table exists with supported platforms (roblox, discord, steam)
- [ ] `user_platforms` table links users to their platform accounts
- [ ] Roblox platform is seeded
- [ ] Foreign keys enforce referential integrity

**Engineering Tasks:**

**[DB-1.2.1] Create `platforms` table**
```sql
CREATE TABLE platforms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon_url TEXT,
  deep_link_scheme TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO platforms (id, name, deep_link_scheme) VALUES
  ('roblox', 'Roblox', 'roblox://'),
  ('discord', 'Discord', 'discord://'),
  ('steam', 'Steam', 'steam://');
```

**[DB-1.2.2] Create `user_platforms` table**
```sql
CREATE TABLE user_platforms (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform_id TEXT NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,

  platform_user_id TEXT NOT NULL,
  platform_username TEXT,
  platform_display_name TEXT,
  platform_avatar_url TEXT,

  is_primary BOOLEAN DEFAULT FALSE,
  verified_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  PRIMARY KEY (user_id, platform_id),
  UNIQUE (platform_id, platform_user_id)
);

CREATE INDEX idx_user_platforms_platform_user ON user_platforms(platform_id, platform_user_id);
```

**Tests:**
- [ ] Can insert user-platform associations
- [ ] Unique constraint prevents duplicate platform accounts per user
- [ ] Cascade delete works when user is deleted

---

### Story 1.3: Roblox Profile Cache (Optional - M3)
**As a system, I need to cache Roblox profile data to reduce API calls and improve performance.**

**Acceptance Criteria:**
- [ ] `roblox_profile_cache` table exists
- [ ] TTL/expiry mechanism included
- [ ] Foreign key to user_platforms

**Engineering Tasks:**

**[DB-1.3.1] Create `roblox_profile_cache` table**
```sql
CREATE TABLE roblox_profile_cache (
  roblox_user_id BIGINT PRIMARY KEY,

  username TEXT NOT NULL,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  profile_url TEXT,

  follower_count INT,
  following_count INT,
  friend_count INT,

  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_roblox_cache_expires ON roblox_profile_cache(expires_at);
```

**Tests:**
- [ ] Cache entries can be inserted and queried
- [ ] Expiry logic works correctly

---

## Epic 2: Roblox Link Normalization Service

### Overview
Backend service that accepts ANY Roblox link and outputs canonical placeId + URLs.

---

### Story 2.1: Link Parser & Normalizer
**As a backend service, I need to parse various Roblox link formats and extract the canonical placeId.**

**Acceptance Criteria:**
- [ ] Accepts URLs: `https://www.roblox.com/games/<placeId>`, `https://www.roblox.com/games/start?placeId=<placeId>`, `roblox://placeId=<placeId>`, `https://ro.blox.com/*`
- [ ] Extracts placeId from all formats
- [ ] Returns canonical URLs: `canonical_web_url`, `canonical_start_url`
- [ ] Returns `normalized_from` enum value
- [ ] Handles errors gracefully (invalid URLs, non-existent games)

**Engineering Tasks:**

**[BE-2.1.1] Create link normalization utility**
```typescript
// backend/src/services/roblox-link-normalizer.ts

export enum NormalizedFrom {
  WEB_GAMES = 'web_games',
  WEB_START = 'web_start',
  PROTOCOL = 'protocol',
  ROBLOX_SHORTLINK_PARAM = 'roblox_shortlink_param',
  ROBLOX_SHORTLINK_REDIRECT = 'roblox_shortlink_redirect'
}

export interface NormalizedRobloxLink {
  placeId: number;
  canonicalWebUrl: string;
  canonicalStartUrl: string;
  originalInputUrl: string;
  normalizedFrom: NormalizedFrom;
}

export class RobloxLinkNormalizer {
  async normalize(url: string): Promise<NormalizedRobloxLink>;
  private extractFromWebGamesUrl(url: URL): number | null;
  private extractFromWebStartUrl(url: URL): number | null;
  private extractFromProtocol(url: string): number | null;
  private extractFromShortlink(url: URL): Promise<number | null>;
  private followRedirects(url: string): Promise<string>;
  private buildCanonicalUrls(placeId: number): { web: string; start: string };
}
```

**[BE-2.1.2] Implement web_games parser**
```typescript
// Matches: https://www.roblox.com/games/<placeId>/<slug>
private extractFromWebGamesUrl(url: URL): number | null {
  const match = url.pathname.match(/^\/games\/(\d+)/);
  if (match) {
    return parseInt(match[1], 10);
  }
  return null;
}
```

**[BE-2.1.3] Implement web_start parser**
```typescript
// Matches: https://www.roblox.com/games/start?placeId=<placeId>
private extractFromWebStartUrl(url: URL): number | null {
  const placeId = url.searchParams.get('placeId');
  return placeId ? parseInt(placeId, 10) : null;
}
```

**[BE-2.1.4] Implement protocol parser**
```typescript
// Matches: roblox://placeId=<placeId>
private extractFromProtocol(url: string): number | null {
  const match = url.match(/^roblox:\/\/.*placeId=(\d+)/);
  if (match) {
    return parseInt(match[1], 10);
  }
  return null;
}
```

**[BE-2.1.5] Implement ro.blox.com shortlink parser**
```typescript
// Handles: https://ro.blox.com/<code> with optional af_web_dp param
private async extractFromShortlink(url: URL): Promise<number | null> {
  // First check for af_web_dp parameter
  const afWebDp = url.searchParams.get('af_web_dp');
  if (afWebDp) {
    try {
      const decodedUrl = decodeURIComponent(afWebDp);
      const parsedUrl = new URL(decodedUrl);

      // Try to extract from the decoded URL
      return this.extractFromWebGamesUrl(parsedUrl)
        || this.extractFromWebStartUrl(parsedUrl);
    } catch (e) {
      // Fall through to redirect following
    }
  }

  // Follow redirects to get final URL
  const finalUrl = await this.followRedirects(url.toString());
  const finalParsed = new URL(finalUrl);

  return this.extractFromWebGamesUrl(finalParsed)
    || this.extractFromWebStartUrl(finalParsed);
}

private async followRedirects(url: string): Promise<string> {
  const response = await fetch(url, {
    redirect: 'follow',
    method: 'HEAD'
  });
  return response.url;
}
```

**[BE-2.1.6] Implement main normalize method**
```typescript
async normalize(url: string): Promise<NormalizedRobloxLink> {
  const originalUrl = url.trim();

  // Try protocol scheme first
  if (originalUrl.startsWith('roblox://')) {
    const placeId = this.extractFromProtocol(originalUrl);
    if (placeId) {
      const { web, start } = this.buildCanonicalUrls(placeId);
      return {
        placeId,
        canonicalWebUrl: web,
        canonicalStartUrl: start,
        originalInputUrl: originalUrl,
        normalizedFrom: NormalizedFrom.PROTOCOL
      };
    }
  }

  // Parse as URL
  const parsedUrl = new URL(originalUrl);

  // Check for ro.blox.com shortlink
  if (parsedUrl.hostname === 'ro.blox.com') {
    const placeId = await this.extractFromShortlink(parsedUrl);
    if (placeId) {
      const { web, start } = this.buildCanonicalUrls(placeId);
      const normalizedFrom = parsedUrl.searchParams.has('af_web_dp')
        ? NormalizedFrom.ROBLOX_SHORTLINK_PARAM
        : NormalizedFrom.ROBLOX_SHORTLINK_REDIRECT;

      return {
        placeId,
        canonicalWebUrl: web,
        canonicalStartUrl: start,
        originalInputUrl: originalUrl,
        normalizedFrom
      };
    }
  }

  // Check for www.roblox.com/games/<placeId>
  if (parsedUrl.hostname === 'www.roblox.com' || parsedUrl.hostname === 'roblox.com') {
    const placeIdFromGames = this.extractFromWebGamesUrl(parsedUrl);
    if (placeIdFromGames) {
      const { web, start } = this.buildCanonicalUrls(placeIdFromGames);
      return {
        placeId: placeIdFromGames,
        canonicalWebUrl: web,
        canonicalStartUrl: start,
        originalInputUrl: originalUrl,
        normalizedFrom: NormalizedFrom.WEB_GAMES
      };
    }

    // Check for www.roblox.com/games/start?placeId=...
    const placeIdFromStart = this.extractFromWebStartUrl(parsedUrl);
    if (placeIdFromStart) {
      const { web, start } = this.buildCanonicalUrls(placeIdFromStart);
      return {
        placeId: placeIdFromStart,
        canonicalWebUrl: web,
        canonicalStartUrl: start,
        originalInputUrl: originalUrl,
        normalizedFrom: NormalizedFrom.WEB_START
      };
    }
  }

  throw new Error('Unable to extract placeId from URL');
}

private buildCanonicalUrls(placeId: number): { web: string; start: string } {
  return {
    web: `https://www.roblox.com/games/${placeId}`,
    start: `https://www.roblox.com/games/start?placeId=${placeId}`
  };
}
```

**Tests:**
- [ ] **[TEST-2.1.1]** Parse `https://www.roblox.com/games/606849621/Jailbreak` → placeId 606849621
- [ ] **[TEST-2.1.2]** Parse `https://www.roblox.com/games/start?placeId=606849621` → placeId 606849621
- [ ] **[TEST-2.1.3]** Parse `roblox://placeId=606849621` → placeId 606849621
- [ ] **[TEST-2.1.4]** Parse `https://ro.blox.com/Ebh5?af_web_dp=https%3A%2F%2Fwww.roblox.com%2Fgames%2F606849621` → placeId 606849621
- [ ] **[TEST-2.1.5]** Parse `https://ro.blox.com/Ebh5` (no af_web_dp) → follows redirect → placeId
- [ ] **[TEST-2.1.6]** Invalid URL throws appropriate error
- [ ] **[TEST-2.1.7]** Canonical URLs are correctly formatted

---

### Story 2.2: API Endpoint for Link Normalization
**As a frontend developer, I need an API endpoint to normalize Roblox links.**

**Acceptance Criteria:**
- [ ] `POST /api/roblox/normalize-link` endpoint exists
- [ ] Accepts `{ url: string }` in request body
- [ ] Returns normalized result or error
- [ ] Includes proper error codes (400 for invalid input, 404 for non-existent game)

**API Specification:**

**Endpoint:** `POST /api/roblox/normalize-link`

**Request:**
```json
{
  "url": "https://ro.blox.com/Ebh5?af_web_dp=https%3A%2F%2Fwww.roblox.com%2Fgames%2F606849621"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "placeId": 606849621,
    "canonicalWebUrl": "https://www.roblox.com/games/606849621",
    "canonicalStartUrl": "https://www.roblox.com/games/start?placeId=606849621",
    "originalInputUrl": "https://ro.blox.com/Ebh5?af_web_dp=https%3A%2F%2Fwww.roblox.com%2Fgames%2F606849621",
    "normalizedFrom": "roblox_shortlink_param"
  }
}
```

**Response (400 - Invalid URL):**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_URL",
    "message": "Unable to extract placeId from URL"
  }
}
```

**Engineering Tasks:**

**[BE-2.2.1] Create POST /api/roblox/normalize-link endpoint**
```typescript
// backend/src/routes/roblox.routes.ts

router.post('/normalize-link', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url || typeof url !== 'string') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'URL is required and must be a string'
        }
      });
    }

    const normalizer = new RobloxLinkNormalizer();
    const result = await normalizer.normalize(url);

    return res.json({
      success: true,
      data: result
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_URL',
        message: error.message
      }
    });
  }
});
```

**Tests:**
- [ ] Endpoint returns 200 for valid URLs
- [ ] Endpoint returns 400 for invalid URLs
- [ ] Endpoint returns 400 for missing URL parameter

---

## Epic 3: Session Creation Flow

### Overview
User pastes a Roblox link, backend normalizes it, creates session + game record (if needed), and inserts host as participant.

---

### Story 3.1: Create Session API Endpoint
**As a user, I need to create a session by pasting a Roblox link so I can organize group play.**

**Acceptance Criteria:**
- [ ] `POST /api/sessions` endpoint exists
- [ ] Accepts Roblox link + session metadata
- [ ] Normalizes link using Epic 2 service
- [ ] Creates/updates game record in `games` table
- [ ] Creates session record atomically with host participant
- [ ] Returns session ID + invite link
- [ ] Validates user is authenticated

**API Specification:**

**Endpoint:** `POST /api/sessions`

**Request:**
```json
{
  "robloxUrl": "https://www.roblox.com/games/606849621/Jailbreak",
  "title": "Late night Jailbreak",
  "description": "Let's rob some banks!",
  "visibility": "public",
  "maxParticipants": 8,
  "scheduledStart": "2026-02-07T20:00:00Z"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "session": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "placeId": 606849621,
      "hostId": "user-uuid",
      "title": "Late night Jailbreak",
      "description": "Let's rob some banks!",
      "visibility": "public",
      "status": "scheduled",
      "maxParticipants": 8,
      "currentParticipants": 1,
      "scheduledStart": "2026-02-07T20:00:00Z",
      "game": {
        "placeId": 606849621,
        "canonicalWebUrl": "https://www.roblox.com/games/606849621",
        "canonicalStartUrl": "https://www.roblox.com/games/start?placeId=606849621",
        "gameName": "Jailbreak"
      },
      "createdAt": "2026-02-06T18:00:00Z"
    },
    "inviteLink": "lagalaga://invite/ABC123XYZ"
  }
}
```

**Engineering Tasks:**

**[BE-3.1.1] Create POST /api/sessions endpoint**
```typescript
// backend/src/routes/sessions.routes.ts

router.post('/', authenticateUser, async (req, res) => {
  const {
    robloxUrl,
    title,
    description,
    visibility = 'public',
    maxParticipants = 10,
    scheduledStart
  } = req.body;

  const userId = req.user.id; // From auth middleware

  try {
    // Validate inputs
    if (!robloxUrl || !title) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_FIELDS', message: 'robloxUrl and title are required' }
      });
    }

    // Normalize Roblox link
    const normalizer = new RobloxLinkNormalizer();
    const normalized = await normalizer.normalize(robloxUrl);

    // Start transaction
    const session = await createSessionWithHost({
      placeId: normalized.placeId,
      hostId: userId,
      title,
      description,
      visibility,
      maxParticipants,
      scheduledStart,
      originalInputUrl: normalized.originalInputUrl,
      normalizedFrom: normalized.normalizedFrom,
      canonicalWebUrl: normalized.canonicalWebUrl,
      canonicalStartUrl: normalized.canonicalStartUrl
    });

    return res.status(201).json({
      success: true,
      data: session
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: { code: 'CREATE_FAILED', message: error.message }
    });
  }
});
```

**[BE-3.1.2] Create session service with atomic transaction**
```typescript
// backend/src/services/session.service.ts

export async function createSessionWithHost(data: CreateSessionInput): Promise<SessionWithInvite> {
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Upsert game record
  const { error: gameError } = await supabaseAdmin
    .from('games')
    .upsert({
      place_id: data.placeId,
      canonical_web_url: data.canonicalWebUrl,
      canonical_start_url: data.canonicalStartUrl
    }, {
      onConflict: 'place_id',
      ignoreDuplicates: false
    });

  if (gameError) throw new Error(`Failed to upsert game: ${gameError.message}`);

  // Create session
  const { data: session, error: sessionError } = await supabaseAdmin
    .from('sessions')
    .insert({
      place_id: data.placeId,
      host_id: data.hostId,
      title: data.title,
      description: data.description,
      visibility: data.visibility,
      max_participants: data.maxParticipants,
      scheduled_start: data.scheduledStart,
      original_input_url: data.originalInputUrl,
      normalized_from: data.normalizedFrom,
      status: data.scheduledStart ? 'scheduled' : 'active'
    })
    .select()
    .single();

  if (sessionError) throw new Error(`Failed to create session: ${sessionError.message}`);

  // Insert host as participant
  const { error: participantError } = await supabaseAdmin
    .from('session_participants')
    .insert({
      session_id: session.id,
      user_id: data.hostId,
      role: 'host',
      state: 'joined'
    });

  if (participantError) throw new Error(`Failed to add host participant: ${participantError.message}`);

  // Generate invite link
  const inviteCode = generateInviteCode();
  const { data: invite, error: inviteError } = await supabaseAdmin
    .from('session_invites')
    .insert({
      session_id: session.id,
      created_by: data.hostId,
      invite_code: inviteCode
    })
    .select()
    .single();

  if (inviteError) throw new Error(`Failed to create invite: ${inviteError.message}`);

  return {
    session: {
      ...session,
      currentParticipants: 1,
      game: {
        placeId: data.placeId,
        canonicalWebUrl: data.canonicalWebUrl,
        canonicalStartUrl: data.canonicalStartUrl
      }
    },
    inviteLink: `lagalaga://invite/${inviteCode}`
  };
}

function generateInviteCode(): string {
  // Generate 9-character alphanumeric code (e.g., ABC123XYZ)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude ambiguous chars
  let code = '';
  for (let i = 0; i < 9; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}
```

**[BE-3.1.3] Add authentication middleware**
```typescript
// backend/src/middleware/auth.middleware.ts

export async function authenticateUser(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Missing or invalid authorization header' }
    });
  }

  const token = authHeader.substring(7);

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return res.status(401).json({
      success: false,
      error: { code: 'INVALID_TOKEN', message: 'Invalid or expired token' }
    });
  }

  req.user = user;
  next();
}
```

**Tests:**
- [ ] **[TEST-3.1.1]** Authenticated user can create session
- [ ] **[TEST-3.1.2]** Session is created with correct metadata
- [ ] **[TEST-3.1.3]** Game record is upserted (created if new, updated if exists)
- [ ] **[TEST-3.1.4]** Host is added to session_participants with role=host, state=joined
- [ ] **[TEST-3.1.5]** Invite code is generated and unique
- [ ] **[TEST-3.1.6]** Unauthenticated request returns 401
- [ ] **[TEST-3.1.7]** Missing required fields returns 400
- [ ] **[TEST-3.1.8]** Transaction rolls back on failure

---

### Story 3.2: Session Creation UI
**As a user, I want a simple interface to paste a Roblox link and create a session.**

**Acceptance Criteria:**
- [ ] Create Session screen exists
- [ ] URL input field with paste button
- [ ] Title and description inputs
- [ ] Visibility selector (public/friends/invite_only)
- [ ] Max participants slider (2-50)
- [ ] Optional scheduled start date/time picker
- [ ] Loading state during creation
- [ ] Success: navigate to session detail with share options
- [ ] Error: display user-friendly message

**Engineering Tasks:**

**[FE-3.2.1] Create CreateSessionScreen component**
```typescript
// app/screens/CreateSessionScreen.tsx

export function CreateSessionScreen() {
  const [robloxUrl, setRobloxUrl] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'friends' | 'invite_only'>('public');
  const [maxParticipants, setMaxParticipants] = useState(10);
  const [scheduledStart, setScheduledStart] = useState<Date | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const navigation = useNavigation();

  const handleCreate = async () => {
    setIsCreating(true);
    setError(null);

    try {
      const response = await api.post('/sessions', {
        robloxUrl,
        title,
        description,
        visibility,
        maxParticipants,
        scheduledStart: scheduledStart?.toISOString()
      });

      // Navigate to session detail
      navigation.navigate('SessionDetail', {
        sessionId: response.data.session.id,
        inviteLink: response.data.inviteLink
      });
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to create session');
    } finally {
      setIsCreating(false);
    }
  };

  const handlePaste = async () => {
    const text = await Clipboard.getStringAsync();
    setRobloxUrl(text);
  };

  return (
    <Screen>
      <Input
        label="Roblox Game Link"
        value={robloxUrl}
        onChangeText={setRobloxUrl}
        placeholder="Paste any Roblox link"
        rightElement={<Button onPress={handlePaste}>Paste</Button>}
      />

      <Input
        label="Session Title"
        value={title}
        onChangeText={setTitle}
        placeholder="e.g., Late night Jailbreak"
      />

      <TextArea
        label="Description (optional)"
        value={description}
        onChangeText={setDescription}
        placeholder="What are you planning?"
      />

      <Select
        label="Visibility"
        value={visibility}
        onChange={setVisibility}
        options={[
          { label: 'Public', value: 'public' },
          { label: 'Friends Only', value: 'friends' },
          { label: 'Invite Only', value: 'invite_only' }
        ]}
      />

      <Slider
        label={`Max Participants: ${maxParticipants}`}
        value={maxParticipants}
        onValueChange={setMaxParticipants}
        minimumValue={2}
        maximumValue={50}
        step={1}
      />

      <DateTimePicker
        label="Scheduled Start (optional)"
        value={scheduledStart}
        onChange={setScheduledStart}
      />

      {error && <ErrorMessage>{error}</ErrorMessage>}

      <Button
        onPress={handleCreate}
        loading={isCreating}
        disabled={!robloxUrl || !title}
      >
        Create Session
      </Button>
    </Screen>
  );
}
```

**[FE-3.2.2] Add API client method**
```typescript
// app/services/api.ts

export const api = {
  async post(endpoint: string, data: any) {
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const error = await response.json();
      throw { response: { data: error } };
    }

    return await response.json();
  }
};
```

**[FE-3.2.3] Add navigation route**
```typescript
// app/navigation/AppNavigator.tsx

<Stack.Screen
  name="CreateSession"
  component={CreateSessionScreen}
  options={{ title: 'Create Session' }}
/>
```

**Tests:**
- [ ] Form validates required fields
- [ ] Paste button works
- [ ] Loading state displays during API call
- [ ] Success navigates to session detail
- [ ] Error message displays on failure

---

## Epic 4: Session Browse & Detail

### Overview
Users can browse public sessions and view session details.

---

### Story 4.1: Browse Sessions API
**As a user, I want to see a list of available sessions so I can find games to join.**

**Acceptance Criteria:**
- [ ] `GET /api/sessions` endpoint returns paginated list
- [ ] Filters: status, visibility, placeId, hostId
- [ ] Includes participant count and game info
- [ ] Ordered by scheduled_start (upcoming first) or created_at (newest first)

**API Specification:**

**Endpoint:** `GET /api/sessions?status=active&visibility=public&limit=20&offset=0`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "sessions": [
      {
        "id": "session-uuid",
        "placeId": 606849621,
        "hostId": "user-uuid",
        "host": {
          "id": "user-uuid",
          "username": "player123",
          "avatarUrl": "https://..."
        },
        "title": "Late night Jailbreak",
        "description": "Let's rob some banks!",
        "visibility": "public",
        "status": "active",
        "maxParticipants": 8,
        "currentParticipants": 3,
        "scheduledStart": "2026-02-07T20:00:00Z",
        "game": {
          "placeId": 606849621,
          "gameName": "Jailbreak",
          "thumbnailUrl": "https://...",
          "canonicalWebUrl": "https://www.roblox.com/games/606849621"
        },
        "createdAt": "2026-02-06T18:00:00Z"
      }
    ],
    "pagination": {
      "total": 42,
      "limit": 20,
      "offset": 0,
      "hasMore": true
    }
  }
}
```

**Engineering Tasks:**

**[BE-4.1.1] Create GET /api/sessions endpoint**
```typescript
router.get('/', optionalAuth, async (req, res) => {
  const {
    status = 'active',
    visibility,
    placeId,
    hostId,
    limit = 20,
    offset = 0
  } = req.query;

  try {
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    let query = supabaseAdmin
      .from('sessions')
      .select(`
        *,
        games (*),
        host:auth.users!sessions_host_id_fkey (id, email),
        participants:session_participants (count)
      `)
      .eq('status', status);

    if (visibility) query = query.eq('visibility', visibility);
    if (placeId) query = query.eq('place_id', placeId);
    if (hostId) query = query.eq('host_id', hostId);

    // Apply RLS-compatible filters for non-service queries
    if (!req.user) {
      query = query.eq('visibility', 'public');
    }

    const { data: sessions, error, count } = await query
      .order('scheduled_start', { ascending: true, nullsFirst: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return res.json({
      success: true,
      data: {
        sessions: sessions.map(formatSession),
        pagination: {
          total: count,
          limit,
          offset,
          hasMore: offset + limit < count
        }
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: { code: 'FETCH_FAILED', message: error.message }
    });
  }
});
```

**[BE-4.1.2] Add session formatter utility**
```typescript
function formatSession(session: any) {
  return {
    id: session.id,
    placeId: session.place_id,
    hostId: session.host_id,
    host: {
      id: session.host.id,
      username: session.host.email?.split('@')[0] || 'Unknown'
    },
    title: session.title,
    description: session.description,
    visibility: session.visibility,
    status: session.status,
    maxParticipants: session.max_participants,
    currentParticipants: session.participants?.[0]?.count || 0,
    scheduledStart: session.scheduled_start,
    game: {
      placeId: session.games.place_id,
      gameName: session.games.game_name,
      thumbnailUrl: session.games.thumbnail_url,
      canonicalWebUrl: session.games.canonical_web_url
    },
    createdAt: session.created_at
  };
}
```

**Tests:**
- [ ] Endpoint returns sessions with correct filters
- [ ] Pagination works correctly
- [ ] Public sessions visible to unauthenticated users
- [ ] Private sessions hidden from non-friends

---

### Story 4.2: Session Detail API
**As a user, I want to see full session details including participants.**

**Acceptance Criteria:**
- [ ] `GET /api/sessions/:id` returns session with participants
- [ ] Includes game details
- [ ] Includes participant list with roles
- [ ] Returns 404 if session not found or user lacks permission

**API Specification:**

**Endpoint:** `GET /api/sessions/:sessionId`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "session": {
      "id": "session-uuid",
      "placeId": 606849621,
      "hostId": "user-uuid",
      "title": "Late night Jailbreak",
      "description": "Let's rob some banks!",
      "visibility": "public",
      "status": "active",
      "maxParticipants": 8,
      "scheduledStart": "2026-02-07T20:00:00Z",
      "game": {
        "placeId": 606849621,
        "gameName": "Jailbreak",
        "thumbnailUrl": "https://...",
        "canonicalWebUrl": "https://www.roblox.com/games/606849621",
        "canonicalStartUrl": "https://www.roblox.com/games/start?placeId=606849621"
      },
      "participants": [
        {
          "userId": "user-uuid",
          "username": "player123",
          "avatarUrl": "https://...",
          "role": "host",
          "state": "joined",
          "joinedAt": "2026-02-06T18:00:00Z"
        },
        {
          "userId": "user2-uuid",
          "username": "gamer456",
          "avatarUrl": "https://...",
          "role": "member",
          "state": "joined",
          "joinedAt": "2026-02-06T18:15:00Z"
        }
      ],
      "inviteLink": "lagalaga://invite/ABC123XYZ",
      "createdAt": "2026-02-06T18:00:00Z"
    }
  }
}
```

**Engineering Tasks:**

**[BE-4.2.1] Create GET /api/sessions/:id endpoint**
```typescript
router.get('/:id', optionalAuth, async (req, res) => {
  const { id } = req.params;

  try {
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: session, error } = await supabaseAdmin
      .from('sessions')
      .select(`
        *,
        games (*),
        participants:session_participants (
          *,
          user:auth.users (id, email)
        ),
        invites:session_invites (invite_code)
      `)
      .eq('id', id)
      .single();

    if (error || !session) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Session not found' }
      });
    }

    // Check visibility permissions
    if (session.visibility !== 'public' && !req.user) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'This session is not public' }
      });
    }

    return res.json({
      success: true,
      data: {
        session: formatSessionDetail(session)
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: { code: 'FETCH_FAILED', message: error.message }
    });
  }
});
```

**Tests:**
- [ ] Returns full session details for authorized user
- [ ] Returns 404 for non-existent session
- [ ] Returns 403 for private session + unauthenticated user
- [ ] Includes all participants with correct roles

---

### Story 4.3: Browse Sessions UI
**As a user, I want to scroll through available sessions.**

**Acceptance Criteria:**
- [ ] Session list screen with infinite scroll
- [ ] Session cards show: game thumbnail, title, host, participant count, scheduled time
- [ ] Filter by game (if user has browsed multiple games)
- [ ] Pull to refresh
- [ ] Empty state when no sessions

**Engineering Tasks:**

**[FE-4.3.1] Create SessionListScreen component**
```typescript
// app/screens/SessionListScreen.tsx

export function SessionListScreen() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const loadSessions = async (refresh = false) => {
    const currentOffset = refresh ? 0 : offset;

    try {
      const response = await api.get(`/sessions?limit=20&offset=${currentOffset}`);
      const newSessions = response.data.sessions;

      setSessions(refresh ? newSessions : [...sessions, ...newSessions]);
      setHasMore(response.data.pagination.hasMore);
      setOffset(currentOffset + newSessions.length);
    } catch (error) {
      console.error('Failed to load sessions', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadSessions();
  }, []);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadSessions(true);
  };

  const handleLoadMore = () => {
    if (!isLoading && hasMore) {
      loadSessions();
    }
  };

  return (
    <FlatList
      data={sessions}
      renderItem={({ item }) => <SessionCard session={item} />}
      keyExtractor={(item) => item.id}
      onRefresh={handleRefresh}
      refreshing={isRefreshing}
      onEndReached={handleLoadMore}
      onEndReachedThreshold={0.5}
      ListEmptyComponent={<EmptyState />}
    />
  );
}
```

**[FE-4.3.2] Create SessionCard component**
```typescript
export function SessionCard({ session }: { session: Session }) {
  const navigation = useNavigation();

  return (
    <TouchableOpacity
      onPress={() => navigation.navigate('SessionDetail', { sessionId: session.id })}
    >
      <Card>
        <Image source={{ uri: session.game.thumbnailUrl }} style={styles.thumbnail} />
        <View>
          <Text style={styles.title}>{session.title}</Text>
          <Text style={styles.game}>{session.game.gameName}</Text>
          <Text style={styles.host}>Hosted by {session.host.username}</Text>
          <Text style={styles.participants}>
            {session.currentParticipants}/{session.maxParticipants} players
          </Text>
          {session.scheduledStart && (
            <Text style={styles.time}>
              {formatRelativeTime(session.scheduledStart)}
            </Text>
          )}
        </View>
      </Card>
    </TouchableOpacity>
  );
}
```

**Tests:**
- [ ] List renders sessions correctly
- [ ] Pull to refresh works
- [ ] Infinite scroll loads more sessions
- [ ] Tapping card navigates to detail

---

### Story 4.4: Session Detail UI
**As a user, I want to view full session details and see who has joined.**

**Acceptance Criteria:**
- [ ] Session detail screen shows all session info
- [ ] Participant list with avatars and roles
- [ ] Share button (opens native share sheet with invite link)
- [ ] Join button (if not already joined)
- [ ] Launch Roblox button (if already joined)

**Engineering Tasks:**

**[FE-4.4.1] Create SessionDetailScreen component**
```typescript
export function SessionDetailScreen({ route }) {
  const { sessionId } = route.params;
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadSession();
  }, [sessionId]);

  const loadSession = async () => {
    try {
      const response = await api.get(`/sessions/${sessionId}`);
      setSession(response.data.session);
    } catch (error) {
      console.error('Failed to load session', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleShare = async () => {
    await Share.share({
      message: `Join my ${session.game.gameName} session: ${session.inviteLink}`
    });
  };

  if (isLoading) return <LoadingSpinner />;
  if (!session) return <ErrorState />;

  return (
    <ScrollView>
      <Image source={{ uri: session.game.thumbnailUrl }} style={styles.banner} />

      <View style={styles.content}>
        <Text style={styles.title}>{session.title}</Text>
        <Text style={styles.game}>{session.game.gameName}</Text>
        <Text style={styles.description}>{session.description}</Text>

        <InfoRow label="Hosted by" value={session.host.username} />
        <InfoRow label="Players" value={`${session.participants.length}/${session.maxParticipants}`} />
        <InfoRow label="Visibility" value={session.visibility} />
        {session.scheduledStart && (
          <InfoRow label="Starts" value={formatDateTime(session.scheduledStart)} />
        )}

        <SectionTitle>Participants</SectionTitle>
        {session.participants.map(p => (
          <ParticipantRow key={p.userId} participant={p} />
        ))}

        <Button onPress={handleShare} variant="secondary">
          Share Invite
        </Button>

        <Button onPress={() => {/* Navigate to join flow */}}>
          Join Session
        </Button>
      </View>
    </ScrollView>
  );
}
```

**Tests:**
- [ ] Screen loads and displays session data
- [ ] Share button opens native share sheet
- [ ] Participant list renders correctly

---

## Epic 5: Session Join Flow

### Overview
Users can join sessions with capacity and visibility checks.

---

### Story 5.1: Join Session API
**As a user, I want to join a session so I can play with others.**

**Acceptance Criteria:**
- [ ] `POST /api/sessions/:id/join` endpoint
- [ ] Validates session capacity (not full)
- [ ] Validates visibility (user has permission)
- [ ] Validates user not already joined
- [ ] Inserts participant record with role=member, state=joined
- [ ] Returns updated session with participant list

**API Specification:**

**Endpoint:** `POST /api/sessions/:sessionId/join`

**Request:** (empty body or optional invite code)
```json
{
  "inviteCode": "ABC123XYZ" // Optional, required for invite_only sessions
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "session": {
      "id": "session-uuid",
      "currentParticipants": 4,
      "participants": [...]
    }
  }
}
```

**Response (400 - Session Full):**
```json
{
  "success": false,
  "error": {
    "code": "SESSION_FULL",
    "message": "This session is at maximum capacity"
  }
}
```

**Engineering Tasks:**

**[BE-5.1.1] Create POST /api/sessions/:id/join endpoint**
```typescript
router.post('/:id/join', authenticateUser, async (req, res) => {
  const { id } = req.params;
  const { inviteCode } = req.body;
  const userId = req.user.id;

  try {
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Fetch session
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('sessions')
      .select(`
        *,
        participants:session_participants(count)
      `)
      .eq('id', id)
      .single();

    if (sessionError || !session) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Session not found' }
      });
    }

    // Check capacity
    const currentCount = session.participants[0]?.count || 0;
    if (currentCount >= session.max_participants) {
      return res.status(400).json({
        success: false,
        error: { code: 'SESSION_FULL', message: 'This session is at maximum capacity' }
      });
    }

    // Check visibility
    if (session.visibility === 'invite_only' && !inviteCode) {
      return res.status(403).json({
        success: false,
        error: { code: 'INVITE_REQUIRED', message: 'This session requires an invite code' }
      });
    }

    if (inviteCode) {
      // Validate invite code
      const { data: invite, error: inviteError } = await supabaseAdmin
        .from('session_invites')
        .select('*')
        .eq('invite_code', inviteCode)
        .eq('session_id', id)
        .single();

      if (inviteError || !invite) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_INVITE', message: 'Invalid invite code' }
        });
      }

      // Check invite expiry and usage
      if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVITE_EXPIRED', message: 'This invite has expired' }
        });
      }

      if (invite.max_uses && invite.uses_count >= invite.max_uses) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVITE_EXHAUSTED', message: 'This invite has been fully used' }
        });
      }

      // Increment uses_count
      await supabaseAdmin
        .from('session_invites')
        .update({ uses_count: invite.uses_count + 1 })
        .eq('id', invite.id);
    }

    // Check if already joined
    const { data: existing } = await supabaseAdmin
      .from('session_participants')
      .select('*')
      .eq('session_id', id)
      .eq('user_id', userId)
      .single();

    if (existing && existing.state === 'joined') {
      return res.status(400).json({
        success: false,
        error: { code: 'ALREADY_JOINED', message: 'You have already joined this session' }
      });
    }

    // Insert participant
    const { error: participantError } = await supabaseAdmin
      .from('session_participants')
      .upsert({
        session_id: id,
        user_id: userId,
        role: 'member',
        state: 'joined',
        joined_at: new Date().toISOString()
      });

    if (participantError) throw participantError;

    // Return updated session
    const { data: updatedSession } = await supabaseAdmin
      .from('sessions')
      .select(`
        *,
        participants:session_participants (
          *,
          user:auth.users (id, email)
        )
      `)
      .eq('id', id)
      .single();

    return res.json({
      success: true,
      data: {
        session: formatSessionDetail(updatedSession)
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: { code: 'JOIN_FAILED', message: error.message }
    });
  }
});
```

**Tests:**
- [ ] User can join session with available space
- [ ] Returns SESSION_FULL when at capacity
- [ ] Returns INVITE_REQUIRED for invite_only sessions without code
- [ ] Returns INVALID_INVITE for wrong invite code
- [ ] Returns ALREADY_JOINED if user already in session
- [ ] Increments participant count correctly

---

### Story 5.2: Join via Invite Link
**As a user, I want to join a session by clicking an invite link.**

**Acceptance Criteria:**
- [ ] App handles `lagalaga://invite/:code` deep links
- [ ] Fetches session by invite code
- [ ] Auto-joins if authenticated
- [ ] Prompts login if unauthenticated

**API Specification:**

**Endpoint:** `GET /api/invites/:code`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "sessionId": "session-uuid",
    "session": {
      "id": "session-uuid",
      "title": "Late night Jailbreak",
      "game": {...},
      "currentParticipants": 3,
      "maxParticipants": 8
    }
  }
}
```

**Engineering Tasks:**

**[BE-5.2.1] Create GET /api/invites/:code endpoint**
```typescript
router.get('/:code', async (req, res) => {
  const { code } = req.params;

  try {
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: invite, error } = await supabaseAdmin
      .from('session_invites')
      .select(`
        *,
        session:sessions (
          *,
          game:games (*),
          participants:session_participants (count)
        )
      `)
      .eq('invite_code', code)
      .single();

    if (error || !invite) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Invite not found' }
      });
    }

    return res.json({
      success: true,
      data: {
        sessionId: invite.session_id,
        session: formatSession(invite.session)
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: { code: 'FETCH_FAILED', message: error.message }
    });
  }
});
```

**[FE-5.2.2] Add deep link handler**
```typescript
// app/navigation/linking.ts

const config = {
  screens: {
    SessionInvite: 'invite/:code'
  }
};

export const linking = {
  prefixes: ['lagalaga://', 'https://lagalaga.app'],
  config
};
```

**[FE-5.2.3] Create SessionInviteScreen**
```typescript
export function SessionInviteScreen({ route }) {
  const { code } = route.params;
  const [session, setSession] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigation = useNavigation();
  const user = useUser();

  useEffect(() => {
    loadInvite();
  }, [code]);

  const loadInvite = async () => {
    try {
      const response = await api.get(`/invites/${code}`);
      setSession(response.data.session);

      // Auto-join if authenticated
      if (user) {
        await handleJoin();
      }
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Invalid invite');
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoin = async () => {
    try {
      await api.post(`/sessions/${session.id}/join`, { inviteCode: code });
      navigation.navigate('SessionDetail', { sessionId: session.id });
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to join');
    }
  };

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorState message={error} />;

  if (!user) {
    return (
      <View>
        <Text>You've been invited to join {session.title}</Text>
        <Button onPress={() => navigation.navigate('Login')}>
          Sign In to Join
        </Button>
      </View>
    );
  }

  return <LoadingSpinner />; // Auto-joining
}
```

**Tests:**
- [ ] Deep link opens app to invite screen
- [ ] Invalid code shows error
- [ ] Authenticated user auto-joins
- [ ] Unauthenticated user sees login prompt

---

## Epic 6: Roblox Deep Linking

### Overview
Launch Roblox app to join game, with browser fallback.

---

### Story 6.1: Launch Roblox from Session
**As a user, I want to launch Roblox directly to the game so I can start playing.**

**Acceptance Criteria:**
- [ ] Primary: Opens `roblox://placeId=<placeId>` deep link
- [ ] Fallback: Opens `canonical_start_url` in browser if deep link fails
- [ ] Works on iOS and Android
- [ ] Shows confirmation when Roblox is launching

**Engineering Tasks:**

**[FE-6.1.1] Create Roblox launcher utility**
```typescript
// app/services/roblox-launcher.ts

import { Linking, Platform, Alert } from 'react-native';

export async function launchRobloxGame(placeId: number, canonicalStartUrl: string): Promise<void> {
  const deepLink = `roblox://placeId=${placeId}`;

  try {
    // Check if Roblox app can handle the deep link
    const canOpen = await Linking.canOpenURL(deepLink);

    if (canOpen) {
      await Linking.openURL(deepLink);
    } else {
      // Fallback to browser
      await launchInBrowser(canonicalStartUrl);
    }
  } catch (error) {
    // Deep link failed, use browser fallback
    await launchInBrowser(canonicalStartUrl);
  }
}

async function launchInBrowser(url: string): Promise<void> {
  Alert.alert(
    'Opening in Browser',
    'The Roblox app is not installed. Opening in your browser instead.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Open', onPress: () => Linking.openURL(url) }
    ]
  );
}
```

**[FE-6.1.2] Add "Launch Roblox" button to SessionDetailScreen**
```typescript
// In SessionDetailScreen component

const handleLaunchRoblox = async () => {
  await launchRobloxGame(session.game.placeId, session.game.canonicalStartUrl);
};

// In render:
<Button onPress={handleLaunchRoblox} variant="primary">
  Launch Roblox
</Button>
```

**[FE-6.1.3] Add URL scheme to app.json**
```json
// app.json
{
  "expo": {
    "scheme": "lagalaga",
    "ios": {
      "bundleIdentifier": "com.lagalaga.app",
      "infoPlist": {
        "LSApplicationQueriesSchemes": ["roblox"]
      }
    },
    "android": {
      "package": "com.lagalaga.app",
      "intentFilters": [
        {
          "action": "VIEW",
          "data": {
            "scheme": "lagalaga"
          }
        }
      ]
    }
  }
}
```

**Tests:**
- [ ] Deep link opens Roblox app when installed
- [ ] Fallback opens browser when Roblox not installed
- [ ] Works on iOS and Android

---

## Epic 7: Security & RLS Policies

### Overview
Implement Row Level Security policies for all tables.

---

### Story 7.1: RLS Policies for Sessions
**As a system, I need to enforce data access rules at the database level.**

**Acceptance Criteria:**
- [ ] Enable RLS on all tables
- [ ] Users can read public sessions
- [ ] Users can read friends/invite_only sessions they're invited to
- [ ] Users can update/delete only their own hosted sessions
- [ ] Service role bypasses RLS for backend operations

**Engineering Tasks:**

**[DB-7.1.1] Enable RLS on all tables**
```sql
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_platforms ENABLE ROW LEVEL SECURITY;
```

**[DB-7.1.2] Create RLS policies for games**
```sql
-- Anyone can read games
CREATE POLICY "Games are viewable by everyone"
  ON games FOR SELECT
  USING (true);

-- Only service role can insert/update games (via backend)
CREATE POLICY "Games can be modified by service role only"
  ON games FOR ALL
  USING (auth.role() = 'service_role');
```

**[DB-7.1.3] Create RLS policies for sessions**
```sql
-- Users can view public sessions
CREATE POLICY "Public sessions are viewable by everyone"
  ON sessions FOR SELECT
  USING (visibility = 'public');

-- Users can view sessions they're participating in
CREATE POLICY "Users can view sessions they participate in"
  ON sessions FOR SELECT
  USING (
    id IN (
      SELECT session_id FROM session_participants
      WHERE user_id = auth.uid() AND state = 'joined'
    )
  );

-- Users can view sessions they're invited to
CREATE POLICY "Users can view sessions they're invited to"
  ON sessions FOR SELECT
  USING (
    id IN (
      SELECT session_id FROM session_invites si
      INNER JOIN session_participants sp ON si.session_id = sp.session_id
      WHERE sp.user_id = auth.uid()
    )
  );

-- Only service role can create sessions (via backend)
CREATE POLICY "Sessions can be created by service role only"
  ON sessions FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- Hosts can update their own sessions
CREATE POLICY "Hosts can update their own sessions"
  ON sessions FOR UPDATE
  USING (host_id = auth.uid())
  WITH CHECK (host_id = auth.uid());

-- Hosts can delete their own sessions
CREATE POLICY "Hosts can delete their own sessions"
  ON sessions FOR DELETE
  USING (host_id = auth.uid());
```

**[DB-7.1.4] Create RLS policies for session_participants**
```sql
-- Users can view participants of sessions they can view
CREATE POLICY "Users can view participants of accessible sessions"
  ON session_participants FOR SELECT
  USING (
    session_id IN (
      SELECT id FROM sessions
      WHERE visibility = 'public'
        OR host_id = auth.uid()
        OR id IN (
          SELECT session_id FROM session_participants
          WHERE user_id = auth.uid()
        )
    )
  );

-- Only service role can manage participants (via backend)
CREATE POLICY "Participants can be managed by service role only"
  ON session_participants FOR ALL
  USING (auth.role() = 'service_role');
```

**[DB-7.1.5] Create RLS policies for session_invites**
```sql
-- Users can view invites for sessions they host
CREATE POLICY "Users can view invites for their sessions"
  ON session_invites FOR SELECT
  USING (
    session_id IN (
      SELECT id FROM sessions WHERE host_id = auth.uid()
    )
  );

-- Only service role can manage invites (via backend)
CREATE POLICY "Invites can be managed by service role only"
  ON session_invites FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Invites can be updated by service role only"
  ON session_invites FOR UPDATE
  USING (auth.role() = 'service_role');
```

**[DB-7.1.6] Create RLS policies for user_platforms**
```sql
-- Users can view their own platform connections
CREATE POLICY "Users can view their own platforms"
  ON user_platforms FOR SELECT
  USING (user_id = auth.uid());

-- Users can view other users' platforms (for display purposes)
CREATE POLICY "Users can view other users' platforms"
  ON user_platforms FOR SELECT
  USING (true);

-- Only service role can manage user platforms (via backend OAuth)
CREATE POLICY "User platforms can be managed by service role only"
  ON user_platforms FOR ALL
  USING (auth.role() = 'service_role');
```

**Tests:**
- [ ] **[TEST-7.1.1]** Unauthenticated user can SELECT public sessions
- [ ] **[TEST-7.1.2]** Unauthenticated user cannot SELECT private sessions
- [ ] **[TEST-7.1.3]** User can SELECT sessions they've joined
- [ ] **[TEST-7.1.4]** User cannot UPDATE sessions they don't host
- [ ] **[TEST-7.1.5]** User can UPDATE their own hosted sessions
- [ ] **[TEST-7.1.6]** Service role can bypass all policies

---

### Story 7.2: Backend Service Role Configuration
**As a backend service, I need to use the service role key for privileged operations.**

**Acceptance Criteria:**
- [ ] Backend uses service role key (stored in env vars)
- [ ] Service role key is never exposed to client
- [ ] Client uses anon key with RLS enforcement

**Engineering Tasks:**

**[BE-7.2.1] Configure environment variables**
```bash
# backend/.env

SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGc... # Public, RLS-enforced
SUPABASE_SERVICE_KEY=eyJhbGc... # Private, bypasses RLS
```

**[BE-7.2.2] Create Supabase client factories**
```typescript
// backend/src/lib/supabase.ts

import { createClient } from '@supabase/supabase-js';

// For backend operations (bypasses RLS)
export function getServiceClient() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
}

// For user-scoped operations (enforces RLS)
export function getUserClient(accessToken: string) {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!
  );

  supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: ''
  });

  return supabase;
}
```

**[BE-7.2.3] Update backend to use service client**
```typescript
// Replace all instances of:
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// With:
const supabaseAdmin = getServiceClient();
```

**Tests:**
- [ ] Service client can create sessions (bypasses RLS)
- [ ] User client respects RLS policies
- [ ] Service key is not exposed in API responses

---

## Epic 8: Testing & Observability

### Overview
Comprehensive testing and basic logging/metrics.

---

### Story 8.1: Unit Tests for Link Normalization
**As a developer, I need confidence that link normalization works correctly.**

**Acceptance Criteria:**
- [ ] 90%+ code coverage for RobloxLinkNormalizer
- [ ] Tests for all URL formats
- [ ] Tests for error cases
- [ ] Uses Jest

**Engineering Tasks:**

**[BE-8.1.1] Create test suite for link normalizer**
```typescript
// backend/src/services/__tests__/roblox-link-normalizer.test.ts

import { RobloxLinkNormalizer, NormalizedFrom } from '../roblox-link-normalizer';

describe('RobloxLinkNormalizer', () => {
  let normalizer: RobloxLinkNormalizer;

  beforeEach(() => {
    normalizer = new RobloxLinkNormalizer();
  });

  describe('Web Games URL', () => {
    it('should parse https://www.roblox.com/games/<placeId>/<slug>', async () => {
      const result = await normalizer.normalize('https://www.roblox.com/games/606849621/Jailbreak');

      expect(result.placeId).toBe(606849621);
      expect(result.canonicalWebUrl).toBe('https://www.roblox.com/games/606849621');
      expect(result.canonicalStartUrl).toBe('https://www.roblox.com/games/start?placeId=606849621');
      expect(result.normalizedFrom).toBe(NormalizedFrom.WEB_GAMES);
      expect(result.originalInputUrl).toBe('https://www.roblox.com/games/606849621/Jailbreak');
    });

    it('should parse https://roblox.com/games/<placeId> (without www)', async () => {
      const result = await normalizer.normalize('https://roblox.com/games/606849621');

      expect(result.placeId).toBe(606849621);
      expect(result.normalizedFrom).toBe(NormalizedFrom.WEB_GAMES);
    });
  });

  describe('Web Start URL', () => {
    it('should parse https://www.roblox.com/games/start?placeId=<placeId>', async () => {
      const result = await normalizer.normalize('https://www.roblox.com/games/start?placeId=606849621');

      expect(result.placeId).toBe(606849621);
      expect(result.normalizedFrom).toBe(NormalizedFrom.WEB_START);
    });
  });

  describe('Protocol Deep Link', () => {
    it('should parse roblox://placeId=<placeId>', async () => {
      const result = await normalizer.normalize('roblox://placeId=606849621');

      expect(result.placeId).toBe(606849621);
      expect(result.normalizedFrom).toBe(NormalizedFrom.PROTOCOL);
    });

    it('should parse roblox://experiences/start?placeId=<placeId>', async () => {
      const result = await normalizer.normalize('roblox://experiences/start?placeId=606849621');

      expect(result.placeId).toBe(606849621);
      expect(result.normalizedFrom).toBe(NormalizedFrom.PROTOCOL);
    });
  });

  describe('Roblox Shortlink', () => {
    it('should parse ro.blox.com with af_web_dp parameter', async () => {
      const url = 'https://ro.blox.com/Ebh5?af_web_dp=https%3A%2F%2Fwww.roblox.com%2Fgames%2F606849621';
      const result = await normalizer.normalize(url);

      expect(result.placeId).toBe(606849621);
      expect(result.normalizedFrom).toBe(NormalizedFrom.ROBLOX_SHORTLINK_PARAM);
    });

    it('should follow redirects for ro.blox.com without af_web_dp', async () => {
      // Mock fetch to simulate redirect
      global.fetch = jest.fn().mockResolvedValue({
        url: 'https://www.roblox.com/games/606849621/Jailbreak'
      });

      const result = await normalizer.normalize('https://ro.blox.com/Ebh5');

      expect(result.placeId).toBe(606849621);
      expect(result.normalizedFrom).toBe(NormalizedFrom.ROBLOX_SHORTLINK_REDIRECT);
    });
  });

  describe('Error Cases', () => {
    it('should throw error for invalid URL', async () => {
      await expect(normalizer.normalize('not-a-url')).rejects.toThrow();
    });

    it('should throw error for non-Roblox URL', async () => {
      await expect(normalizer.normalize('https://google.com')).rejects.toThrow('Unable to extract placeId');
    });

    it('should throw error for Roblox URL without placeId', async () => {
      await expect(normalizer.normalize('https://www.roblox.com/home')).rejects.toThrow('Unable to extract placeId');
    });
  });
});
```

**[BE-8.1.2] Configure Jest**
```json
// backend/package.json

{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage"
  },
  "jest": {
    "preset": "ts-jest",
    "testEnvironment": "node",
    "coverageThreshold": {
      "global": {
        "branches": 90,
        "functions": 90,
        "lines": 90,
        "statements": 90
      }
    }
  }
}
```

**Tests:**
- [ ] All test cases pass
- [ ] Coverage meets 90% threshold

---

### Story 8.2: Integration Tests for Session Flows
**As a developer, I need to verify end-to-end session workflows.**

**Acceptance Criteria:**
- [ ] Test: Create session → Join session → Launch Roblox
- [ ] Test: Invalid invite code rejection
- [ ] Test: Session capacity enforcement
- [ ] Uses Supertest for API testing

**Engineering Tasks:**

**[BE-8.2.1] Create session flow integration tests**
```typescript
// backend/src/__tests__/integration/session-flow.test.ts

import request from 'supertest';
import { app } from '../../app';
import { getServiceClient } from '../../lib/supabase';

describe('Session Flow Integration', () => {
  let authToken: string;
  let userId: string;

  beforeAll(async () => {
    // Create test user
    const supabase = getServiceClient();
    const { data: { user } } = await supabase.auth.admin.createUser({
      email: 'test@example.com',
      password: 'password123',
      email_confirm: true
    });

    userId = user!.id;

    // Get auth token
    const { data: { session } } = await supabase.auth.signInWithPassword({
      email: 'test@example.com',
      password: 'password123'
    });

    authToken = session!.access_token;
  });

  afterAll(async () => {
    // Cleanup test user
    const supabase = getServiceClient();
    await supabase.auth.admin.deleteUser(userId);
  });

  describe('Create Session', () => {
    it('should create session with valid Roblox URL', async () => {
      const response = await request(app)
        .post('/api/sessions')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          robloxUrl: 'https://www.roblox.com/games/606849621/Jailbreak',
          title: 'Test Session',
          description: 'Integration test',
          visibility: 'public',
          maxParticipants: 5
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.session.id).toBeDefined();
      expect(response.body.data.session.title).toBe('Test Session');
      expect(response.body.data.inviteLink).toMatch(/^lagalaga:\/\/invite\//);
    });

    it('should reject unauthenticated request', async () => {
      const response = await request(app)
        .post('/api/sessions')
        .send({
          robloxUrl: 'https://www.roblox.com/games/606849621',
          title: 'Test Session'
        });

      expect(response.status).toBe(401);
    });
  });

  describe('Join Session', () => {
    let sessionId: string;
    let inviteCode: string;

    beforeEach(async () => {
      // Create session
      const response = await request(app)
        .post('/api/sessions')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          robloxUrl: 'https://www.roblox.com/games/606849621',
          title: 'Join Test',
          maxParticipants: 3
        });

      sessionId = response.body.data.session.id;
      inviteCode = response.body.data.inviteLink.split('/').pop();
    });

    it('should allow user to join public session', async () => {
      // Create second user
      const supabase = getServiceClient();
      const { data: { user: user2 } } = await supabase.auth.admin.createUser({
        email: 'test2@example.com',
        password: 'password123',
        email_confirm: true
      });

      const { data: { session: session2 } } = await supabase.auth.signInWithPassword({
        email: 'test2@example.com',
        password: 'password123'
      });

      const response = await request(app)
        .post(`/api/sessions/${sessionId}/join`)
        .set('Authorization', `Bearer ${session2!.access_token}`);

      expect(response.status).toBe(200);
      expect(response.body.data.session.currentParticipants).toBe(2);

      // Cleanup
      await supabase.auth.admin.deleteUser(user2!.id);
    });

    it('should reject join when session is full', async () => {
      // Fill session to capacity (max 3)
      const supabase = getServiceClient();

      for (let i = 0; i < 2; i++) {
        const { data: { user } } = await supabase.auth.admin.createUser({
          email: `fill${i}@example.com`,
          password: 'password123',
          email_confirm: true
        });

        await supabase.from('session_participants').insert({
          session_id: sessionId,
          user_id: user!.id,
          role: 'member',
          state: 'joined'
        });
      }

      // Attempt to join (should fail - already at max)
      const { data: { user: user3 } } = await supabase.auth.admin.createUser({
        email: 'overflow@example.com',
        password: 'password123',
        email_confirm: true
      });

      const { data: { session: session3 } } = await supabase.auth.signInWithPassword({
        email: 'overflow@example.com',
        password: 'password123'
      });

      const response = await request(app)
        .post(`/api/sessions/${sessionId}/join`)
        .set('Authorization', `Bearer ${session3!.access_token}`);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('SESSION_FULL');
    });
  });
});
```

**Tests:**
- [ ] Integration tests pass
- [ ] Tests run in CI/CD pipeline

---

### Story 8.3: Basic Logging & Metrics
**As a developer, I need visibility into production issues.**

**Acceptance Criteria:**
- [ ] Structured logging with Winston or Pino
- [ ] Log levels: error, warn, info, debug
- [ ] Request logging middleware
- [ ] Error tracking (optional: Sentry integration)

**Engineering Tasks:**

**[BE-8.3.1] Configure structured logging**
```typescript
// backend/src/lib/logger.ts

import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true
    }
  }
});
```

**[BE-8.3.2] Add request logging middleware**
```typescript
// backend/src/middleware/logging.middleware.ts

import pinoHttp from 'pino-http';
import { logger } from '../lib/logger';

export const requestLogger = pinoHttp({
  logger,
  customLogLevel: (res, err) => {
    if (res.statusCode >= 500 || err) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customSuccessMessage: (res) => {
    return `${res.req.method} ${res.req.url} completed with ${res.statusCode}`;
  },
  customErrorMessage: (err, res) => {
    return `${res.req.method} ${res.req.url} failed with ${res.statusCode}: ${err.message}`;
  }
});

// Usage in app.ts:
app.use(requestLogger);
```

**[BE-8.3.3] Add error tracking (optional)**
```typescript
// backend/src/lib/sentry.ts (if using Sentry)

import * as Sentry from '@sentry/node';

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1
  });
}

export { Sentry };
```

**Tests:**
- [ ] Logs are written for requests
- [ ] Error logs include stack traces
- [ ] Log levels work correctly

---

## Epic 9: Roblox OAuth Integration (Future - M3)

### Overview
Implement Roblox OAuth PKCE flow with backend token exchange.

---

### Story 9.1: OAuth Flow Implementation
**As a user, I want to connect my Roblox account so the app can verify my identity.**

**Acceptance Criteria:**
- [ ] Frontend initiates OAuth with PKCE
- [ ] Backend exchanges code for tokens
- [ ] Backend stores Roblox user ID in user_platforms
- [ ] Tokens stored securely (encrypted at rest)

**Engineering Tasks:**

**[BE-9.1.1] Create OAuth endpoints**
```typescript
// POST /api/auth/roblox/initiate
// POST /api/auth/roblox/callback
// GET /api/auth/roblox/profile
```

**[BE-9.1.2] Implement PKCE flow**
**[BE-9.1.3] Store tokens in user_platforms**
**[FE-9.1.1] Add "Connect Roblox" button to settings**
**[FE-9.1.2] Handle OAuth redirect**

---

## Definition of Done (MVP)

### M0: Foundation Complete
- [ ] All database tables created and migrated
- [ ] Roblox link normalization service operational
- [ ] Unit tests pass with 90%+ coverage for link parser

### M1: Session Lifecycle Complete
- [ ] Users can create sessions by pasting any Roblox link
- [ ] Users can browse public sessions
- [ ] Users can view session details
- [ ] Users can join sessions (with capacity checks)
- [ ] Users can launch Roblox from session (deep link + fallback)
- [ ] Invite links work end-to-end

### M2: Production Ready
- [ ] All Supabase RLS policies implemented
- [ ] Backend uses service role key (not exposed to client)
- [ ] Integration tests pass for create/join/launch flows
- [ ] Structured logging operational
- [ ] Error handling provides user-friendly messages
- [ ] No critical security vulnerabilities

### M3: Enhanced (Optional)
- [ ] Roblox OAuth integration complete
- [ ] Profile cache operational
- [ ] Activity feed implemented

---

## Appendix: API Summary

### Backend Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/roblox/normalize-link` | No | Normalize Roblox URL to placeId |
| POST | `/api/sessions` | Yes | Create new session |
| GET | `/api/sessions` | Optional | List sessions (paginated) |
| GET | `/api/sessions/:id` | Optional | Get session details |
| POST | `/api/sessions/:id/join` | Yes | Join session |
| GET | `/api/invites/:code` | No | Get session by invite code |

### Database Schema Summary

| Table | Purpose | Key Relationships |
|-------|---------|-------------------|
| `games` | Roblox game metadata | Referenced by `sessions` |
| `sessions` | Gaming sessions | Created by `users`, references `games` |
| `session_participants` | Session membership | Links `users` to `sessions` |
| `session_invites` | Invite codes | References `sessions` |
| `user_platforms` | Platform account links | Links `users` to `platforms` |
| `platforms` | Supported platforms | Referenced by `user_platforms` |
| `roblox_profile_cache` | Cached Roblox profiles | Optional, future use |

---

## Appendix: Migration Strategy

### Migration Execution Order

1. **Migration 001**: Core schema (games, sessions, participants, invites)
2. **Migration 002**: Platform tables (platforms, user_platforms)
3. **Migration 003**: RLS policies (enable RLS + create policies)
4. **Migration 004**: Indexes and performance optimization
5. **Migration 005** (Optional): Roblox profile cache

### Rollback Plan

- Each migration has a corresponding `down` script
- Migrations are idempotent (can be run multiple times)
- Rollback executes `down` scripts in reverse order

---

## Next Steps

1. **Review & Approve**: Stakeholders review this plan
2. **Kickoff M0**: Start database schema + link normalization
3. **Parallel Work**: Security (E7) can start alongside feature work
4. **Testing First**: Write tests before or alongside implementation
5. **Iterate**: Adjust plan as we learn more during implementation

---

**End of Implementation Plan**
