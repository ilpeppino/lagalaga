# Favorites Caching

## Server cache (backend)

- Endpoint: `GET /api/me/favorite-experiences`
- Cache table: `public.user_favorites_cache`
- TTL: 15 minutes (`expires_at = cached_at + 15 minutes`)
- ETag:
  - Backend normalizes favorites (`id`, `name`, `url`, `thumbnailUrl`), sorts by `id`, hashes JSON with SHA-256, and returns a weak ETag.
  - Client sends `If-None-Match` on refresh.
  - If ETag matches, backend returns `304 Not Modified`.
- Stale cache behavior:
  - If cache exists but is stale, backend immediately returns stale cached data (`200`) and starts a non-blocking background refresh.
  - If refresh fails, stale cache is kept.

## Device cache (app)

- Module: `src/features/favorites/cache.ts`
- Keys per user:
  - `favorites:${userId}:data`
  - `favorites:${userId}:etag`
  - `favorites:${userId}:cachedAt`
- Storage:
  - Uses AsyncStorage for persistence.
  - Also keeps an in-memory copy to avoid repeated disk reads.
  - If persistent storage is unavailable (for example some web/runtime environments), code falls back to in-memory behavior without crashing.

## Prefetch and refresh timing

- After auth user load: `warmFavorites(userId)` is triggered in `useAuth`.
- On Create Session mount: `warmFavorites(userId)` runs again as a fallback prewarm.
- UI hook (`useFavorites`) flow:
  - Loads cached favorites first (instant render when available).
  - Starts background refresh with `If-None-Match`.
  - Updates cache + UI on `200`, keeps cache on `304`.
