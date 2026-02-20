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
├──────────────────────────────────────────────────────────┤
│ Account Email Card (conditional, if email exists)        │
│ type: View with label/value row                          │
├──────────────────────────────────────────────────────────┤
│ Roblox Card                                              │
│ type: ThemedView                                         │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Header: "Roblox" + connected/not-connected badge  │  │
│  └────────────────────────────────────────────────────┘  │
│  If connected:                                           │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Roblox account name                               │  │
│  │ Expandable "Advanced" section:                    │  │
│  │   - Roblox ID                                     │  │
│  │   - Connected date                               │  │
│  │ "Refresh Roblox data" button (arrow.clockwise)    │  │
│  └────────────────────────────────────────────────────┘  │
│  If not connected:                                       │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Explanatory text + "Connect Roblox" button        │  │
│  │ (link icon) → navigates to /roblox                │  │
│  └────────────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────────────┤
│ Account Card                                             │
│ type: ThemedView                                         │
│                                                          │
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
│ type: ThemedView                                         │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Header with "Pro View" Switch toggle              │  │
│  │ Info rows: Tier, Rating, Season #, Season countdown│  │
│  │ "Season Badges" list (when Pro View on)           │  │
│  │ "View Match History" button → /match-history      │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

## Types Used In The Screen
- Local `MeData` interface: `appUser`, `roblox`, `competitive?`
- Local `MeResponse` interface: `{ success, data: MeData, requestId }`
- Tier union: `'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | 'master'`

## Important Named UI Elements
- Circular avatar (Roblox headshot or placeholder icon)
- "Safety & Report" (overflow menu + Account card button)
- "Connect Roblox" / "Refresh Roblox data"
- "Delete Account" (danger, red)
- "Pro View" toggle switch
- "View Match History" button

## Data Source
- `useFocusEffect` re-fetches `GET /api/me` on every screen focus
