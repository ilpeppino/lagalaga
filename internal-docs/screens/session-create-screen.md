# Session Create Screen

## Route And Screen
- Route: `/sessions/create`
- Route file: `app/sessions/create.tsx`
- Implementation file: `app/sessions/create-v2.tsx`
- Screen component name: `CreateSessionScreenV2`
- Screen type: React Function Component

## Unified Flow
`Create Session` is now a single-screen squad-builder flow.

Screen structure:
1. Hero game block (large card with Roblox thumbnail, game title, refresh, and paste-link toggle)
2. Squad builder block
- horizontal squad row
- first tile is `Invite`
- selected friends appear in the same row
- tapping selected squad member removes them
- one search field below (`Search friends`)
- search results add directly into squad row
3. Start time block (`Now` / `Scheduled`)
- date + time controls shown only when `Scheduled` is selected
4. Sticky bottom `Start Session` CTA

## Behavior
- No separate `Session Lobby` step after creation.
- No visibility selector in this UI.
- No ranked controls in this UI.
- No `Invited` section in this UI.
- No session name input in this UI (title is generated internally).
- Friend search results and squad row both use direct toggle behavior (no share sheet).
- Tapping selected Squad member removes them from Squad.
- Creation payload still includes `invitedRobloxUserIds` from Squad selection.
- Session visibility is sent as `friends` by default from this flow.
- Scheduled sessions send `scheduledStart` as ISO timestamp derived from local date/time.

## Navigation
- On success, navigates directly to `/sessions/[id]` with `id`, `inviteLink`, and `justCreated=true`.
