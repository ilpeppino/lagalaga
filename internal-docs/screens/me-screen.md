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
├──────────────────────────────────────────────────────────┤
│ Loading State                                            │
│ type: LagaLoadingSpinner (centered)                      │
│ label: "Loading profile..."                              │
├──────────────────────────────────────────────────────────┤
│ Loaded State                                             │
│ type: ScrollView (Animated.View wrapping for fade-out)   │
│                                                          │
│  Top Card (rounded, theme-aware)                         │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Avatar Circle (132×132)                           │  │
│  │  - If connected: Roblox headshot Image (fade-in)  │  │
│  │  - Else: letter initial (primaryName.charAt(0))   │  │
│  │ Profile name (primaryName)                        │  │
│  │ StatusIndicator: "Roblox connected" or "not..."   │  │
│  │ SettingsRow:                                      │  │
│  │   label: "Sync data" (if connected)               │  │
│  │   label: "Connect Roblox" (if not connected)      │  │
│  │   rightContent: ActivityIndicator or ✓ flash      │  │
│  │ sync caption: "Last synced N min ago"             │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  Account Section                                         │
│  ┌────────────────────────────────────────────────────┐  │
│  │ SettingsSection title: "Account"                  │  │
│  │   SettingsRow: "Settings" → /settings             │  │
│  │   SettingsRow: "Safety & Report" → /safety-report │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  Legal Section                                           │
│  ┌────────────────────────────────────────────────────┐  │
│  │ SettingsSection title: "Legal"                    │  │
│  │   SettingsRow: "Privacy Policy" → opens URL       │  │
│  │   SettingsRow: "Terms of Service" → opens URL     │  │
│  │   disclaimer: "Lagalaga is not affiliated with    │  │
│  │   Roblox."                                        │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  Danger Zone                                             │
│  ┌────────────────────────────────────────────────────┐  │
│  │ DangerZone component                              │  │
│  │ onDelete: warning haptic → router.push('/account/ │  │
│  │   delete')                                        │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

## Types Used In The Screen
- Local `MeData` interface:
  - `appUser: { id, email, displayName }`
  - `roblox: { connected, robloxUserId, username, displayName, avatarHeadshotUrl, verifiedAt }`
- Local `MeResponse` interface: `{ success, data: MeData, requestId }`

## Important Named UI Elements
- Circular avatar (Roblox headshot with fade-in, or letter initials fallback)
- StatusIndicator — Roblox connection status badge
- "Sync data" / "Connect Roblox" SettingsRow (same action, different label)
- "Last synced" caption with animated ✓ confirmation flash
- SettingsSection "Account": Settings + Safety & Report
- SettingsSection "Legal": Privacy Policy + Terms links + disclaimer
- DangerZone (delete account with warning haptic)

## Settings Components Used
All from `@/src/components/settings/`:
- `SettingsRow` — tappable row with label and optional right content
- `SettingsSection` — titled group of SettingsRow items
- `StatusIndicator` — small status label chip
- `DangerZone` — red danger-style delete action
- Tokens: `settingsTypography`, `spacing`

## Key Behaviour
- `useFocusEffect` re-fetches `GET /api/me` on every screen focus
- `primaryName` resolution order: `roblox.displayName` → `roblox.username` → `appUser.displayName`
- "Sync data" triggers `refreshFriends(force=true)`, `refreshFavorites(force=true)`, then re-fetches `/api/me`
- Individual sync sub-failures are collected and shown in an Alert ("Sync completed with issues: friends, favorites")
- "Connect Roblox" navigates to `/roblox`
- "Settings" navigates to `/settings` with a fade-out animation on the content
- Content animates via `Animated.View` (contentOpacity) to give a flash-out on Settings navigation

## Data Source
- `GET /api/me` — returns `appUser` + `roblox` profile data
