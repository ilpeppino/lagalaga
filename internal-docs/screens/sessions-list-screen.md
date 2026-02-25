# Sessions List Screen

## Route And Screen
- Route: `/sessions`
- Route file: `app/sessions/index.tsx`
- Implementation file: `app/sessions/index-v2.tsx`
- Screen component name: `SessionsListScreenV2`
- Screen type: React Function Component

## Graphical Structure (Component Name + Type)

```text
Sessions List Screen (/sessions)
Component: SessionsListScreenV2 (type: React Function Component)

┌──────────────────────────────────────────────────────────┐
│ Root Container                                           │
│ type: View                                               │
├──────────────────────────────────────────────────────────┤
│ Header Actions (via Stack options)                       │
│ type: profile touch target + sign out action             │
├──────────────────────────────────────────────────────────┤
│ Session Feed                                              │
│ type: FlatList                                           │
│ row: session card (Card + TouchableOpacity + Image)      │
│ optional row wrapper: CollapsibleSessionRow (Animated)   │
│ optional row affordance: Swipeable for planned sessions  │
├──────────────────────────────────────────────────────────┤
│ Empty/Loading/Error States                               │
│ types: View + ThemedText + ActivityIndicator             │
├──────────────────────────────────────────────────────────┤
│ Floating Actions                                         │
│ types: FAB, IconButton                                   │
└──────────────────────────────────────────────────────────┘
```

## Types Used In The Screen
- `Session` from `@/src/features/sessions/types-v2`
- `SessionListFilter` from `@/src/features/sessions/filtering` — `'all' | 'live' | 'starting_soon'`
- `SessionSettings` from `@/src/lib/sessionSettings`
- `ReactNode` from React

## Important Named UI Elements
- SegmentedButtons filter bar: "All" / "Starting soon" / "Live" (default: 'live')
- Session cards with live badge + LivePulseDot, host badge, participant count, FULL badge
- Game thumbnail image (or letter placeholder)
- Swipeable delete action for planned sessions (native only)
- Selection mode (long-press): checkboxes, toggle-all, bulk delete
- FAB stack:
  - **Quick Play FAB** (flash icon, green) → `createQuickSession()` → navigates to `/sessions/[id]` with `justCreated` + `inviteLink` params
  - **Create FAB** (plus icon, blue) → `/sessions/create`

## Key Behaviour
- Session filter state changes clear selection mode
- Session settings (`startingSoonWindowHours`, `autoCompleteLiveAfterHours`, `autoHideCompletedAfterHours`) are loaded from AsyncStorage on focus and applied via `applySessionFilter()`
- Planned sessions (user is host) loaded separately via `listMyPlannedSessions()` and merged into the display list
- Deduplication: a Map keyed by `session.id` merges public + planned sessions
- Delete: optimistic collapse animation (CollapsibleSessionRow), then API call, reverts on failure
- Bulk delete: immediate API call, optimistic UI removal, reloads on failure
- Fallback thumbnails fetched from Roblox API for sessions missing `thumbnailUrl`
- `loadAllSessionsInFlightRef` prevents concurrent duplicate loads

## API Calls
- `sessionsAPIStoreV2.listSessions({ status, limit, offset })` — fetch active/scheduled sessions
- `sessionsAPIStoreV2.listMyPlannedSessions({ limit, offset })` — fetch sessions user hosts
- `sessionsAPIStoreV2.deleteSession(id)` — delete single session
- `sessionsAPIStoreV2.bulkDeleteSessions(ids)` — delete multiple sessions
- `sessionsAPIStoreV2.createQuickSession()` — create quick-play session
