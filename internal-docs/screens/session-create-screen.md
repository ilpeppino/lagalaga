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
1. Game card (favorites with Roblox thumbnail, refresh, and paste-link switch)
2. Editable session name field (initialized from auto-generated title)
3. Start time controls (`Now` or `Scheduled` with date/time pickers)
4. Squad section
- Current user appears first
- Selected friends appear in Squad row
- Horizontal add-friends rail below
- First rail tile is `Search`
5. `Start Session` CTA

## Behavior
- No separate `Session Lobby` step after creation.
- No visibility selector in this UI.
- No ranked controls in this UI.
- No `Invited` section in this UI.
- Friend tap in add-friends rail selects into Squad directly (no share sheet).
- Tapping selected Squad member removes them from Squad.
- Creation payload still includes `invitedRobloxUserIds` from Squad selection.
- Session visibility is sent as `friends` by default from this flow.
- Scheduled sessions send `scheduledStart` as ISO timestamp derived from local date/time.

## Navigation
- On success, navigates directly to `/sessions/[id]` with `id`, `inviteLink`, and `justCreated=true`.
