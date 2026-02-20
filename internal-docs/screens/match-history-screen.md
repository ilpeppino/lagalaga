# Match History Screen

## Route And Screen
- Route: `/match-history`
- Route file: `app/match-history.tsx`
- Screen component name: `MatchHistoryScreen`
- Screen type: React Function Component

## Feature Flag
Gated behind `ENABLE_COMPETITIVE_DEPTH`. If false, renders a centered "Unavailable" message and no data is fetched.

## Graphical Structure (Component Name + Type)

```text
Match History Screen (/match-history)
Component: MatchHistoryScreen (type: React Function Component)

┌──────────────────────────────────────────────────────────┐
│ Feature-flagged guard                                    │
│ type: centered ThemedText "Unavailable"                  │
│ (shown when ENABLE_COMPETITIVE_DEPTH=false)              │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│ Loading State                                            │
│ type: centered ActivityIndicator (orange, #FF6B00)       │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│ Loaded State                                             │
│ type: ScrollView with RefreshControl                     │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Error Banner (conditional)                        │  │
│  │ type: ThemedText (red)                            │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Match Entry Cards (mapped list)                   │  │
│  │ type: Card (react-native-paper, mode="outlined")  │  │
│  │ per card:                                         │  │
│  │   - Session title (ThemedText type="titleMedium") │  │
│  │   - Formatted play date                          │  │
│  │   - Result: "Win" or "Loss" + ratingDelta         │  │
│  │     (+N for positive delta)                       │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Empty State (conditional)                         │  │
│  │ type: ThemedText "No ranked matches yet."         │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

## Types Used In The Screen
- `MatchHistoryEntry` from `@/src/features/sessions/types-v2`

## Important Named UI Elements
- Match result cards (Win / Loss + rating delta)
- Pull-to-refresh

## Data Source
- `sessionsAPIStoreV2.getMyMatchHistory(20)` — loads last 20 entries
