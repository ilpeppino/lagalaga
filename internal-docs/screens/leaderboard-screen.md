# Leaderboard Screen

## Route And Screen
- Route: `/leaderboard`
- Route file: `app/leaderboard/index.tsx`
- Screen component name: `LeaderboardScreen`
- Screen type: React Function Component

## Feature Flag
Competitive features (tier display, season badge) gated behind `ENABLE_COMPETITIVE_DEPTH`.

## Graphical Structure (Component Name + Type)

```text
Leaderboard Screen (/leaderboard)
Component: LeaderboardScreen (type: React Function Component)

┌──────────────────────────────────────────────────────────┐
│ Loading State                                            │
│ type: centered ActivityIndicator                         │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│ Loaded State                                             │
│ type: ScrollView with RefreshControl                     │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Header                                            │  │
│  │ title: "Weekly Leaderboard"                       │  │
│  │ subtitle: timezone "Europe/Amsterdam"             │  │
│  │ "Season Mode Enabled" badge (when competitive)    │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Error Banner (conditional)                        │  │
│  │ type: ThemedText (red)                            │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Leaderboard Entry Cards (mapped)                  │  │
│  │ type: Card (react-native-paper, mode="outlined")  │  │
│  │ current user row: orange border (#FF6B00, 2px)    │  │
│  │ per card:                                         │  │
│  │   - Rank (#N)                                     │  │
│  │   - User display name or truncated userId         │  │
│  │   - Wins / Losses (W / L)                         │  │
│  │   - Tier (conditional on ENABLE_COMPETITIVE_DEPTH)│  │
│  │   - Rating (orange #FF6B00)                       │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Empty State (conditional)                         │  │
│  │ type: ThemedText                                  │  │
│  │ "No ranked activity this week yet."               │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

## Types Used In The Screen
- `LeaderboardEntry` from `@/src/features/sessions/types-v2`

## Important Named UI Elements
- Weekly leaderboard ranking cards
- Current user row (highlighted orange)
- Pull-to-refresh

## Data Source
- `sessionsAPIStoreV2.getLeaderboard('weekly')` — loaded on mount and refresh
