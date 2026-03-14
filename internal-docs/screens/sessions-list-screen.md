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
│ type: View (flex: 1, background from theme)              │
├──────────────────────────────────────────────────────────┤
│ SessionsHeader                                           │
│ type: View (row)                                         │
│  Left:  "Sessions" title (bold 28px)                     │
│         "Your Roblox sessions" subtitle (muted, 14px)    │
│  Right: avatar circle (taps → /me)                       │
├──────────────────────────────────────────────────────────┤
│ FilterControl                                            │
│ type: View (pill segments row)                           │
│  Segments: All | Soon | Live (LivePulseDot in Live pill) │
│  Note: "Soon" label maps to filter value "starting_soon" │
├──────────────────────────────────────────────────────────┤
│ Session Feed                                             │
│ type: FlatList                                           │
│ row: session card (TouchableOpacity)                     │
│   – thumbnail (Image, 72×72, rounded)                    │
│   – green left border + tinted bg when live              │
│   – title + "You host" chip (for hosted sessions only)   │
│   – meta row: LivePulseDot? + visibility · X/Y · time?   │
│   – no FULL badge, no "players" label, no Host badge     │
│ optional row wrapper: CollapsibleSessionRow (Animated)   │
│ optional row affordance: Swipeable (planned sessions)    │
├──────────────────────────────────────────────────────────┤
│ Empty/Loading/Error States                               │
│ types: View + ThemedText + ActivityIndicator             │
├──────────────────────────────────────────────────────────┤
│ Bottom Action Dock                                       │
│ type: View (row, fixed height 72px)                      │
│  Left:  Quick Play button (green fill, full-flex)        │
│  Right: Create button (tinted outline, full-flex)        │
└──────────────────────────────────────────────────────────┘

Selection mode: Stack header appears (headerShown toggled via Stack.Screen
options inside component) with close, toggle-all, and delete controls.
```

## Types Used In The Screen
- `Session` from `@/src/features/sessions/types-v2`
- `ReactNode` from React

## Important Named UI Elements
- `SessionsHeader` — custom sticky header (replaces Stack nav bar)
- `FilterControl` — pill segmented filter (All / Soon / Live)
- `LivePulseDot` — green pulsing dot shown for live sessions
- `YouHostChip` — subtle chip on cards the user is hosting
- `buildSessionMetaParts(session, isLive)` — pure fn, returns `[visibility, 'X/Y', relativeTime?]`
- `formatRelativeTime(isoString)` — pure fn, exported for testing
- Bottom dock — Quick Play + Create buttons (replaces floating FABs)
- CollapsibleSessionRow — animated wrapper for expand/collapse
- Swipeable delete affordance for planned sessions
- Selection mode with bulk delete

## Key Behaviour
- Avatar in header fetched from `apiClient.auth.me()` on mount; tapping navigates to `/me`
- Sign Out is NOT on this screen; it lives in the Me / Account flow
- Filter defaults to `'all'`; `'starting_soon'` shown as "Soon" in UI
- Live cards get green left accent border (`borderLeftColor: '#10b981'`) and subtle tinted background
- Hosted sessions show "You host" chip; no generic "Host" badge
- Occupancy shows as `X/Y` with no "players" suffix; no FULL badge
- Scheduled time shown via `formatRelativeTime` only when `!isLive`
- Bottom dock inset above home indicator via `insets.bottom`; FlatList padded by `DOCK_HEIGHT + 20`
- `buildSessionMetaParts` and `formatRelativeTime` are exported pure functions; tested in `src/lib/__tests__/sessionsScreenHelpers.test.ts`

## API Calls
- `GET /api/sessions` — session list with filter param
- `DELETE /api/sessions/:id` — delete session (swipe or bulk)
- `POST /api/sessions/:id/quick-play` — quick play action
- `GET /api/auth/me` — fetch avatar URL for header
