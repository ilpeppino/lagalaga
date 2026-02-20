# Supabase Schema

This document describes the expected database schema for the Lagalaga app backend.

## Tables

### games

Stores information about games that can be played in sessions.

```sql
CREATE TABLE games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_key TEXT NOT NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  genre TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### sessions

Stores gaming session information.

```sql
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_user_id UUID NOT NULL,
  game_id UUID NOT NULL REFERENCES games(id),
  title TEXT,
  start_time_utc TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER,
  max_players INTEGER NOT NULL,
  session_type TEXT NOT NULL CHECK (session_type IN ('casual', 'ranked', 'tournament', 'practice')),
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'friends', 'private')),
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'active', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sessions_status ON sessions(status);
CREATE INDEX idx_sessions_start_time ON sessions(start_time_utc);
```

### session_participants

Tracks participants in gaming sessions.

```sql
CREATE TABLE session_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('host', 'player')),
  state TEXT NOT NULL DEFAULT 'invited' CHECK (state IN ('invited', 'joined', 'left')),
  joined_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(session_id, user_id)
);

CREATE INDEX idx_participants_session ON session_participants(session_id);
CREATE INDEX idx_participants_user ON session_participants(user_id);
```

## Row Level Security (RLS)

Enable RLS on all tables and create appropriate policies based on your authentication requirements.

```sql
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_participants ENABLE ROW LEVEL SECURITY;
```

Example policies (adjust based on your auth setup):

```sql
-- Games: Public read, authenticated write
CREATE POLICY "Anyone can read games"
  ON games FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can create games"
  ON games FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Sessions: Public read for public sessions, authenticated write
CREATE POLICY "Anyone can read public sessions"
  ON sessions FOR SELECT
  USING (visibility = 'public' OR auth.uid() = host_user_id);

CREATE POLICY "Authenticated users can create sessions"
  ON sessions FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = host_user_id);

-- Session participants: Read own participations, host can manage
CREATE POLICY "Users can read their participations"
  ON session_participants FOR SELECT
  USING (auth.uid() = user_id);
```

## Notes

1. The TypeScript types in `src/features/sessions/types.ts` should match this schema
2. The Supabase store implementation in `src/features/sessions/store.ts` needs to map between database column names (snake_case) and TypeScript properties (camelCase)
3. Future migrations should be created using Supabase CLI or dashboard
