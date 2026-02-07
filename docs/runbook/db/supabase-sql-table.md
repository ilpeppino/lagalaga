-- 1) Extensions
create extension if not exists pgcrypto;

-- 2) Enums (optional but clean)
do $$ begin
  create type session_type as enum ('casual','competitive','grind','hangout');
exception when duplicate_object then null; end $$;

do $$ begin
  create type session_visibility as enum ('public','friends','invite_only');
exception when duplicate_object then null; end $$;

do $$ begin
  create type session_status as enum ('scheduled','cancelled','ended');
exception when duplicate_object then null; end $$;

do $$ begin
  create type participant_role as enum ('host','participant');
exception when duplicate_object then null; end $$;

do $$ begin
  create type participant_state as enum ('joined','left','kicked');
exception when duplicate_object then null; end $$;

-- 3) Tables
create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  platform_key text not null default 'roblox',
  name text not null,
  url text not null,
  genre text null,
  is_verified boolean not null default false,
  created_at timestamptz not null default now(),
  unique(platform_key, url)
);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  host_user_id uuid not null, -- app-level user id for now
  game_id uuid not null references public.games(id) on delete restrict,
  title text null,
  start_time_utc timestamptz not null,
  duration_minutes int null,
  max_players int not null check (max_players >= 1),
  session_type session_type not null default 'casual',
  visibility session_visibility not null default 'public',
  status session_status not null default 'scheduled',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.session_participants (
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null,
  role participant_role not null default 'participant',
  state participant_state not null default 'joined',
  joined_at timestamptz not null default now(),
  left_at timestamptz null,
  primary key (session_id, user_id)
);

-- 4) updated_at trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_sessions_updated_at on public.sessions;
create trigger trg_sessions_updated_at
before update on public.sessions
for each row execute function public.set_updated_at();

-- 5) RLS ON
alter table public.games enable row level security;
alter table public.sessions enable row level security;
alter table public.session_participants enable row level security;

-- 6) Policies (MVP, public sessions only)
-- Read: anyone can read games
drop policy if exists "games_read_all" on public.games;
create policy "games_read_all" on public.games
for select using (true);

-- Insert: allow anyone (for MVP) to create games
-- If you want to restrict later, require auth and ownership.
drop policy if exists "games_insert_all" on public.games;
create policy "games_insert_all" on public.games
for insert with check (true);

-- Read: anyone can read public scheduled sessions (and their games via join)
drop policy if exists "sessions_read_public" on public.sessions;
create policy "sessions_read_public" on public.sessions
for select using (visibility = 'public' and status = 'scheduled');

-- Insert: allow anyone to create sessions (MVP)
drop policy if exists "sessions_insert_all" on public.sessions;
create policy "sessions_insert_all" on public.sessions
for insert with check (true);

-- Read participants: anyone can read participants of public scheduled sessions
drop policy if exists "participants_read_public_sessions" on public.session_participants;
create policy "participants_read_public_sessions" on public.session_participants
for select using (
  exists (
    select 1 from public.sessions s
    where s.id = session_participants.session_id
      and s.visibility = 'public'
      and s.status = 'scheduled'
  )
);

-- Insert participant rows: allow anyone to join public scheduled sessions
drop policy if exists "participants_join_public_sessions" on public.session_participants;
create policy "participants_join_public_sessions" on public.session_participants
for insert with check (
  exists (
    select 1 from public.sessions s
    where s.id = session_participants.session_id
      and s.visibility = 'public'
      and s.status = 'scheduled'
  )
);