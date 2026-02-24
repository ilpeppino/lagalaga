# SECURITY: Web Token Storage Persistence

## Status
✅ **RESOLVED** (2026-02-24)

## Decision
- Web builds remain supported for internal testing and limited usage.
- Web auth tokens must not be persisted in `localStorage`.
- Token storage on web uses `sessionStorage` to limit token lifetime to the browser session.
- Native platforms continue to use `expo-secure-store`.

## Implemented Changes
- `src/lib/tokenStorage.ts`
  - Replaced `localStorage` reads/writes/removals with `sessionStorage`.
  - Added safe guards for environments where `sessionStorage` is unavailable.

## Follow-Up
- For full production-grade web hardening, migrate web auth to `HttpOnly` cookies managed server-side.
