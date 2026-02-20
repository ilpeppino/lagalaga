# Profile Screen

## Route And Screen
- Route: `/profile`
- Route file: `app/profile.tsx`
- Screen component name: `ProfileScreen`
- Screen type: React Function Component

## Graphical Structure (Component Name + Type)

```text
Profile Screen (/profile)
Component: ProfileScreen (type: React Function Component)

┌──────────────────────────────────────────────────────────┐
│ Stack Header                                             │
│ title: "Profile"                                         │
│ header-right: ellipsis.circle TouchableOpacity           │
│   → Alert with "Safety & Report" option                  │
│     → navigates to /safety-report                        │
├──────────────────────────────────────────────────────────┤
│ Statistics Section                                       │
│ type: ThemedView + ThemedText                            │
│ title: "Statistics"                                      │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ 3-Column Stat Grid (flexWrap: 'wrap')             │  │
│  │ type: View containing 3 stat cards                │  │
│  │ stats:                                            │  │
│  │   - Sessions Hosted (number headline)             │  │
│  │   - Sessions Joined (number headline)             │  │
│  │   - Day Streak (number headline)                  │  │
│  └────────────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────────────┤
│ Achievements Section                                     │
│ type: ThemedView + ThemedText                            │
│ title: "Achievements"                                    │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Achievement List (mapped)                         │  │
│  │ type: View rows per achievement badge             │  │
│  │ each row: code label + unlock date                │  │
│  │ code → label mapping:                             │  │
│  │   FIRST_HOST → "First Host"                       │  │
│  │   FIRST_JOIN → "First Join"                       │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Empty State (conditional)                         │  │
│  │ type: ThemedText                                  │  │
│  │ "No achievements unlocked yet..."                 │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

## Types Used In The Screen
- Local stats type: `{ sessionsHosted: number; sessionsJoined: number; streakDays: number }`
- Local achievements type: `Array<{ code: string; unlockedAt: string }>`

## Important Named UI Elements
- Sessions Hosted stat card
- Sessions Joined stat card
- Day Streak stat card
- Achievement badge rows
- "Safety & Report" overflow menu item

## Data Source
- `sessionsAPIStoreV2.getUserStats()` — loaded on mount
