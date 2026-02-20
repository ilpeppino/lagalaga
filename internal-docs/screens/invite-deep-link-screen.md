# Invite Deep Link Screen

## Route And Screen
- Route: `/invite/[code]`
- Route file: `app/invite/[code].tsx`
- Screen component name: `InviteScreen`
- Screen type: React Function Component

**Note:** This is the public invite link handler for deep links (`lagalaga://invite/:code`). Distinct from `/invites/[sessionId]` which handles directed in-app invites. Resolves an invite code and shows a session preview before joining.

## Graphical Structure (Component Name + Type)

```text
Invite Deep Link Screen (/invite/[code])
Component: InviteScreen (type: React Function Component)

┌──────────────────────────────────────────────────────────┐
│ Loading State                                            │
│ type: centered ActivityIndicator + "Loading invite..."   │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│ Error State                                              │
│ type: View                                               │
│   Circular error icon (red "X")                          │
│   "Invalid Invite" headline                              │
│   Error message text                                     │
│   "Go Back" button                                       │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│ Joining State                                            │
│ type: centered ActivityIndicator + "Joining session..."  │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│ Preview / Login Required State                           │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Session Preview Card                              │  │
│  │ type: Card (themed)                               │  │
│  │                                                   │  │
│  │ Game thumbnail Image or placeholder               │  │
│  │ "YOU HAVE BEEN INVITED!" label (blue, uppercase)  │  │
│  │ Session title (up to 2 lines)                     │  │
│  │ Game name                                         │  │
│  │ Participant count (X/Y players)                   │  │
│  │   - red if full, blue otherwise                   │  │
│  │ "FULL" badge (red pill, conditional)              │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Actions (state-dependent)                         │  │
│  │                                                   │  │
│  │ login_required:                                   │  │
│  │   Info: "Sign in to join..."                      │  │
│  │   "Sign In to Join" button                        │  │
│  │   → /auth/sign-in?returnTo=/invite/:code          │  │
│  │   "View Session" outlined button (optional)       │  │
│  │                                                   │  │
│  │ preview (not full):                               │  │
│  │   "Join Session" primary button                   │  │
│  │   "View Details" outlined button                  │  │
│  │                                                   │  │
│  │ preview (full):                                   │  │
│  │   "This session is full" message block            │  │
│  │   "View Session Anyway" outlined button           │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

## Types Used In The Screen
- `InviteState = 'loading' | 'preview' | 'joining' | 'error' | 'login_required'` — local union
- `Session` (as `Partial<Session>`) from `@/src/features/sessions/types-v2`
- `isApiError` from `@/src/lib/errors` (for `SESSION_003` already-joined check)

## Important Named UI Elements
- "YOU HAVE BEEN INVITED!" banner
- "FULL" capacity badge
- "Join Session" primary button
- "Sign In to Join" button (unauthenticated)
- "View Session Anyway" outlined button (when full)
- "View Details" outlined button

## Key Behaviour
- **Auto-join**: authenticated users arriving at this screen trigger `handleAutoJoin` immediately (no manual tap required)
- **Already joined** (`SESSION_003`): treated silently as success, navigates to handoff
- **Login flow**: preserves `returnTo` param so user returns after sign-in
- On success: navigates to `/sessions/handoff?sessionId=...`
