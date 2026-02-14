create table if not exists public.user_favorites_cache (
  user_id uuid primary key,
  favorites_json jsonb not null default '[]'::jsonb,
  etag text not null,
  cached_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists idx_user_favorites_cache_expires_at
  on public.user_favorites_cache (expires_at);
