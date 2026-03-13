# Session Friend Picker Screen

## Route And Screen
- Route: `/sessions/friend-picker`
- Route file: `app/sessions/friend-picker.tsx`
- Screen component name: `FriendPickerScreen`
- Screen type: React Function Component

## Graphical Structure (Component Name + Type)

```text
Friend Picker Screen (/sessions/friend-picker)
Component: FriendPickerScreen (type: React Function Component)

┌──────────────────────────────────────────────────────────┐
│ Root Container                                           │
│ type: KeyboardAvoidingView                               │
├──────────────────────────────────────────────────────────┤
│ Search Input                                             │
│ type: TextInput (outlined)                               │
│ placeholder: "Search friends…"                           │
├──────────────────────────────────────────────────────────┤
│ Friend List                                              │
│ type: VirtualizedFriendList (SectionList)                │
│                                                          │
│  Sections (when no search query):                        │
│    ONLINE      — presenceType 1                          │
│    IN GAME     — presenceType 2 or 3                     │
│    ALL FRIENDS — presenceType 0 or undefined             │
│                                                          │
│  Section when search active:                             │
│    RESULTS — filtered by displayName or username         │
│                                                          │
│  Each row: FriendInviteRow                               │
│    - presence dot (green/yellow/grey)                    │
│    - avatar + display name + presence label              │
│    - INVITE / INVITED toggle button                      │
└──────────────────────────────────────────────────────────┘
```

## Types Used In The Screen
- `RobloxFriend` from `@/src/features/sessions/types-v2`
- `RobloxFriendPresence` from `@/src/features/sessions/types-v2`

## Important Named UI Elements
- Search input (real-time filter)
- `VirtualizedFriendList` — sectioned SectionList with presence grouping
- `FriendInviteRow` — avatar, name, presence, INVITE/INVITED button

## Key Behaviour
- Receives `inviteLink` as route param from SessionLobbyScreen
- Loads friends via `useFriends` hook (cache-first)
- Fetches bulk presence once on mount (best-effort)
- INVITE taps open native Share sheet with `inviteLink`
- INVITE toggles local `invitedIds` state (visual feedback only)
- Friend list is virtualized via SectionList — safe for large friend counts
- Graceful empty states for: Roblox not connected, loading, no results

## API Calls
- `GET /api/me/roblox/friends` — via `useFriends`
- `POST /api/roblox/presence` — bulk presence on mount (best-effort)
