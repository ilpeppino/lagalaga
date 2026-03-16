# Caching Strategy

## Freshness UI Contract
Any screen that renders cached list data must show a `SyncedAtBadge` near the section header.

Use `SyncedAtBadge` with:
- `syncedAt`: ISO timestamp of the last successful fetch for that dataset.
- `isStale`: `true` when the dataset TTL has elapsed.
- `isRefreshing`: `true` while a refresh is in progress.
- `onRefresh`: a handler that triggers a network refresh.

## Current TTLs
- Friends cache: 24 hours (`expiresAt` from `/api/me/roblox/friends`).
- Favorites cache: 15 minutes (derived client-side from `syncedAt`).

## Source of Truth
- Friends: `fetchedAt` from `/api/me/roblox/friends`, surfaced by `useFriends` as `syncedAt`.
- Favorites: cache `cachedAt` from `useFavorites`, surfaced as `syncedAt`.

## Implementation Rule
Do not hand-roll sync labels like `Last synced ...` or duplicate refresh icon rows. Use `SyncedAtBadge` consistently.
