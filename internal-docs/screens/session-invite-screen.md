# Session Invite Screen

## Route And Screen
- Route: `/invites/[sessionId]`
- Route file: `app/invites/[sessionId].tsx`
- Screen component name: `SessionInviteScreen`
- Screen type: React Function Component

**Note:** Distinct from the deep-link invite flow (`/invite/[code]`). This screen is for responding to a session invite directed to the authenticated user, navigated to programmatically with the session's ID.

## Graphical Structure (Component Name + Type)

```text
Session Invite Screen (/invites/[sessionId])
Component: SessionInviteScreen (type: React Function Component)

┌──────────────────────────────────────────────────────────┐
│ Loading State                                            │
│ type: centered ActivityIndicator + "Loading invite..."   │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│ Error State                                              │
│ type: centered ThemedText "Invite unavailable"           │
│ error message text                                       │
│ "Back to Sessions" button                                │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│ Ready / Action State                                     │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Session Preview Card                              │  │
│  │ type: Card (rounded, themed)                      │  │
│  │                                                   │  │
│  │ Game thumbnail Image or placeholder (first letter) │  │
│  │ "Session Invite" label (blue)                     │  │
│  │ Session title (headlineSmall)                     │  │
│  │ Game name (if available)                          │  │
│  │ Host name (robloxDisplayName > robloxUsername)    │  │
│  │ Participant count: currentParticipants/max        │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Actions Area (state-dependent)                    │  │
│  │                                                   │  │
│  │ If alreadyJoined:                                 │  │
│  │   "Continue to Handoff" button                    │  │
│  │   → /sessions/handoff                             │  │
│  │                                                   │  │
│  │ Otherwise:                                        │  │
│  │   "Accept" / "Accepting..." button                │  │
│  │   (disabled if busy or session is full)           │  │
│  │   "Decline" / "Declining..." button (outlined)    │  │
│  │   (disabled if busy or already joined)            │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

## Types Used In The Screen
- `InviteState = 'loading' | 'ready' | 'accepting' | 'declining' | 'error'` — local union
- `SessionDetail` from `@/src/features/sessions/types-v2`

## Important Named UI Elements
- Session preview card (thumbnail, title, host, participant count)
- "Accept" button (joins session → navigates to `/sessions/handoff?sessionId=...`)
- "Decline" button (calls decline-invite API → navigates to `/sessions`)
- "Continue to Handoff" (when already joined)

## Navigation
- Accept → `POST /api/sessions/:id/join` → `/sessions/handoff?sessionId=...`
- Decline → `POST /api/sessions/:id/decline-invite` → `/sessions`
