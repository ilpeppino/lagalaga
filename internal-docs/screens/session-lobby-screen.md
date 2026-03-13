# Session Lobby Screen

## Route And Screen
- Route: `/sessions/lobby`
- Route file: `app/sessions/lobby.tsx`
- Screen component name: `SessionLobbyScreen`
- Screen type: React Function Component

## Graphical Structure (Component Name + Type)

```text
Session Lobby Screen (/sessions/lobby)
Component: SessionLobbyScreen (type: React Function Component)

┌──────────────────────────────────────────────────────────┐
│ Root Container                                           │
│ type: KeyboardAvoidingView                               │
├──────────────────────────────────────────────────────────┤
│ Scroll Area                                              │
│ type: ScrollView                                         │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ SessionHeroCard                                   │  │
│  │ - game thumbnail, game name                       │  │
│  │ - session title (inline-editable)                 │  │
│  │ - visibility + host name                          │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ ParticipantReadinessList (when participants > 0)  │  │
│  │ - squad summary ("X / N in game")                 │  │
│  │ - per-participant handoff state rows              │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ QuickInviteStrip (SUGGESTED FRIENDS)              │  │
│  │ - 4 skeleton chips while loading                  │  │
│  │ - smart-ranked friend chips with reason label     │  │
│  │ - hidden when empty after load                    │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ INVITED Section                                   │  │
│  │ type: InvitedFriendsCard                          │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Search Friends trigger                            │  │
│  │ → navigates to /sessions/friend-picker            │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Session Settings (expandable)                     │  │
│  │ - Ranked session toggle (display-only)            │  │
│  │ - Share invite link                               │  │
│  └────────────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────────────┤
│ Footer                                                   │
│ START SESSION CTA (navigates to /sessions/[id])          │
└──────────────────────────────────────────────────────────┘
```

## Types Used In The Screen
- `SessionDetail` from `@/src/features/sessions/types-v2`
- `SuggestedFriend` from `@/src/features/sessions/smartInviteSuggestions`
- `ParticipantHandoffState` from `@/src/features/sessions/types-v2`

## Important Named UI Elements
- `SessionHeroCard` — game + editable title + visibility + host
- `ParticipantReadinessList` — squad readiness, refreshes every 15 s
- `QuickInviteStrip` — smart invite suggestions (skeleton while loading)
- `InvitedFriendsCard` — participants in invited/joined state
- Search trigger — opens FriendPickerScreen
- `START SESSION` — navigates to session detail (`/sessions/[id]`)

## Key Behaviour
- Receives `id` and `inviteLink` as route params from CreateSessionScreen
- Loads `SessionDetail` via `getSessionById` on mount
- Polls session every 15 s to refresh readiness list while host waits
- Smart invite strip uses `useSmartInviteSuggestions` (presence + invite history)
- Invite action opens native Share sheet with the invite link
- Each invite tap records the friend in `inviteHistory` for future ranking
- Title edit is local UI state only (no session update API exists)
- Session settings panel shows ranked toggle as display-only (set at creation)

## API Calls
- `GET /api/sessions/:id` — load and periodically refresh session
- `GET /api/me/roblox/friends` — load friends for suggestions (via `useFriends`)
- `POST /api/roblox/presence` — bulk presence for smart ranking (via hook)
