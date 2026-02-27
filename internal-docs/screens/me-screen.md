# Me Screen

## Route And Screen
- Route: `/me`
- Route file: `app/me.tsx`
- Screen component name: `MeScreen`
- Screen type: React Function Component

## Graphical Structure (Component Name + Type)

```text
Me Screen (/me)
Component: MeScreen (type: React Function Component)

┌──────────────────────────────────────────────────────────┐
│ Stack Header                                             │
│ title: "Me"                                              │
│ header-right: ellipsis.circle TouchableOpacity           │
│   → Alert with "Safety & Report" option                  │
├──────────────────────────────────────────────────────────┤
│ Avatar Section                                           │
│ types: Image (circular) or person.fill icon              │
│ content: display name + connection status subtitle       │
│   subtitle: "Roblox connected" or "Roblox not connected" │
├──────────────────────────────────────────────────────────┤
│ Account Email Card (conditional, if email exists)        │
│ type: View with label/value row                          │
│ label: "Account email" → shows email address             │
├──────────────────────────────────────────────────────────┤
│ Roblox Card                                              │
│ type: View (card style)                                  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Header: "Roblox" + connected/not-connected badge  │  │
│  └────────────────────────────────────────────────────┘  │
│  If connected:                                           │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Roblox account name (info row)                    │  │
│  │ Expandable "Advanced" section (chevron toggle):   │  │
│  │   - Roblox ID                                     │  │
│  │   - Connected date                                │  │
│  │ "Sync Roblox data" button (arrow.clockwise)       │  │
│  │   → refreshFriends() + refreshFavorites() + refetch profile │
│  └────────────────────────────────────────────────────┘  │
│  If not connected:                                       │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Explanatory text + "Connect Roblox" button        │  │
│  │ (link icon) → router.push('/roblox')              │  │
│  └────────────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────────────┤
│ Account Card                                             │
│ type: View (card style)                                  │
│ section title: "Account"                                 │
│ description: "Manage sign-in and account deletion settings." │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ "Settings" list row (chevron.right) → /settings   │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ "Delete Account" button                           │  │
│  │ (red/danger, trash.fill) → /account/delete        │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ "Safety & Report" button                          │  │
│  │ (exclamationmark.shield.fill) → /safety-report    │  │
│  └────────────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────────────┤
│ Competitive Profile Card (conditional)                   │
│ shown when: ENABLE_COMPETITIVE_DEPTH && data.competitive │
│ type: View (card style)                                  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Header with "Pro View" Switch toggle              │  │
│  │ Info rows: Tier, Rating, Season #, Season countdown│  │
│  │ "Season Badges" list (when Pro View on)           │  │
│  │ "View Match History" button → /match-history      │  │
│  └────────────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────────────┤
│ Legal Card                                               │
│ type: View (card style)                                  │
│ section title: "Legal"                                   │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ "Privacy Policy" list row → opens URL in browser  │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ "Terms of Service" list row → opens URL in browser│  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Disclaimer text: "Lagalaga is not affiliated      │  │
│  │  with ... Roblox Corporation."                    │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

## Types Used In The Screen
- Local `MeData` interface: `appUser`, `roblox`, `competitive?`
- Local `MeResponse` interface: `{ success, data: MeData, requestId }`
- Tier union: `'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | 'master'`

## Important Named UI Elements
- Circular avatar (Roblox headshot or placeholder person.fill icon)
- "Safety & Report" (overflow menu + Account card button) → `/safety-report`
- "Connect Roblox" / "Sync Roblox data" (arrow.clockwise)
- "Settings" list row (Account card) → `/settings`
- "Delete Account" (danger, red) → `/account/delete`
- "Pro View" toggle switch (Competitive Profile card)
- "View Match History" button → `/match-history`
- "Privacy Policy" and "Terms of Service" list rows (Legal card)
- Roblox "Advanced" expandable section (chevron toggle)

## Key Behaviour
- `handleSyncRobloxData()`: calls `refreshFriends(userId, { force: true })` + `refreshFavorites(userId, { force: true })` + refetches `/api/me`. Shows partial-failure alert if individual refreshes fail.
- `handleConnectRoblox()`: navigates to `/roblox` (which is actually `app/roblox.tsx`, the deep-link compat shim — but for post-login Roblox connect this actually routes to the `GET /api/auth/roblox/start` flow).
- Display name priority: `roblox.displayName` → `roblox.username` → `appUser.displayName`

## Data Source
- `useFocusEffect` re-fetches `GET /api/me` on every screen focus
- Response shape: `{ success, data: MeData, requestId }`
