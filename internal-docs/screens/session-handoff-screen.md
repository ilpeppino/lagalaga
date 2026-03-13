# Session Handoff Screen

## Route And Screen
- Route: `/sessions/handoff`
- Route file: `app/sessions/handoff.tsx`
- Screen component name: `SessionHandoffScreen`
- Screen type: React Function Component

## Graphical Structure (Component Name + Type)

```text
Session Handoff Screen (/sessions/handoff)
Component: SessionHandoffScreen (type: React Function Component)

┌──────────────────────────────────────────────────────────┐
│ Root Container                                           │
│ type: ScrollView                                         │
├──────────────────────────────────────────────────────────┤
│ Game Thumbnail                                           │
│ type: Image or fallback View                             │
├──────────────────────────────────────────────────────────┤
│ Game Name + Session Title                                │
│ type: ThemedText                                         │
├──────────────────────────────────────────────────────────┤
│ Squad Readiness (when participants exist)                │
│ type: ParticipantReadinessList                           │
│  - host row always first                                 │
│  - other participants with handoff state labels          │
│  - "X / N in game" summary                              │
│  - stuck warning banner if any stuck                     │
├──────────────────────────────────────────────────────────┤
│ Launch Progress Panel                                    │
│ type: LaunchProgressPanel                                │
│  Phases:                                                 │
│   idle     → "Open in Roblox" CTA                       │
│   opening  → "Opening Roblox…" spinner                  │
│   checking → "Checking if you're in…" (presence poll)   │
│   confirmed → "You're in!" success                      │
│   recovery → "Still joining?" + I'm in / Try again      │
│   stuck    → "Host has been notified"                   │
└──────────────────────────────────────────────────────────┘
```

## Types Used In The Screen
- `SessionDetail` from `@/src/features/sessions/types-v2`
- `LaunchPhase` union: `'idle' | 'opening' | 'checking' | 'confirmed' | 'recovery' | 'stuck'`

## Important Named UI Elements
- `Open in Roblox` (LaunchProgressPanel, idle phase)
- `I'm already in` (early confirm shortcut during opening/checking)
- `I'm in` (manual confirm in recovery phase)
- `Try again` (re-launch in recovery phase)
- `I'm having trouble` (mark stuck in recovery)
- `Back to Session` (router.back)
- Squad readiness card with per-participant state rows

## Key Behaviour
- `LaunchProgressPanel` manages a self-contained state machine
- After "Open in Roblox": fires `opened_roblox` API call (best-effort), launches Roblox deep link, then polls presence every 10 s for up to 3 minutes
- If `in_game` presence detected: auto-calls `confirmed_in_game` endpoint → confirmed phase
- After 3-minute timeout without confirmation: transitions to `recovery` phase
- `ParticipantReadinessList` refreshes on `onConfirmed` / `onStuck` callbacks
- All timers cleared on component unmount

## API Calls
- `GET /api/sessions/:id` — load session on mount
- `POST /api/sessions/:id/handoff/opened` — on Open in Roblox tap
- `POST /api/sessions/:id/handoff/confirmed` — on auto-confirm or manual confirm
- `POST /api/sessions/:id/handoff/stuck` — on I'm having trouble
- `GET /api/presence/roblox/users?userIds=...` — presence polling during checking phase
