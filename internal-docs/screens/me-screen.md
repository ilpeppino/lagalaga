# Me Screen

## Route And Screen
- Route: `/me`
- Route file: `app/me.tsx`
- Screen component name: `MeScreen`
- Screen type: React Function Component
- Header: **none** — `headerShown: false` in `_layout.tsx`; floating back arrow rendered manually

## Graphical Structure (Component Name + Type)

```text
Me Screen (/me)
Component: MeScreen (type: React Function Component)

┌──────────────────────────────────────────────────────────┐
│ ← Back arrow (floating, safe-area-aware, no app bar)     │
├──────────────────────────────────────────────────────────┤
│ Profile Header (full-bleed, no card background)          │
│                                                          │
│   ┌─────────────────────────────────────────────────┐   │
│   │  [AVATAR w/ halo ring]  [↻ sync]  [roblox icon]│   │
│   │        username                                 │   │
│   │        @robloxname (if connected)               │   │
│   └─────────────────────────────────────────────────┘   │
│                                                          │
│   Halo color:                                            │
│     connected  → green  (#34c759)                        │
│     syncing    → blue   (#0a7ea4, animated rotation)     │
│     disconnected → grey (#8e8e93)                        │
│                                                          │
│   Sync icon (arrow.clockwise):                           │
│     idle    → static, tappable → handleSyncRobloxData()  │
│     syncing → continuous rotation (600ms/turn)           │
│     success → avatar halo pulses once, no alert          │
│     partial-failure → Alert with failed action list      │
│                                                          │
│   Roblox indicator (right):                              │
│     connected  → small (44px) headshot with green border │
│     not connected → "Connect" pill → handleConnectRoblox │
├──────────────────────────────────────────────────────────┤
│ Settings Card                                            │
│ type: View (card style)                                  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ THEME (segmented control)                         │  │
│  │   [System] [Light] [Dark]                         │  │
│  │   → useAppTheme().setThemePreference()            │  │
│  │   → persists via AsyncStorage (theme_preference_v1)│ │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ SESSIONS                                          │  │
│  │   NumberSettingRow: Auto-complete live after      │  │
│  │   NumberSettingRow: Auto-hide completed after     │  │
│  │   NumberSettingRow: Starting soon window          │  │
│  │   All 0–48 h, immediate save to AsyncStorage      │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ ACCOUNT (conditional)                             │  │
│  │   Email row (if email present)                    │  │
│  │   Link Apple Account (iOS + roblox connected)     │  │
│  │   Roblox details (collapsible) → ID + connected date│ │
│  └────────────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────────────┤
│ Competitive Profile Card (conditional)                   │
│ shown when: ENABLE_COMPETITIVE_DEPTH && data.competitive │
│ (same data as before: tier, rating, season, badges,      │
│  Pro View toggle, View Match History button)             │
├──────────────────────────────────────────────────────────┤
│ More Card (legal + destructive actions as list items)    │
│ type: View (card style)                                  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Privacy Policy → opens URL                        │  │
│  │ Terms of Service → opens URL                      │  │
│  │ Safety & Report → /safety-report                  │  │
│  │ Delete Account (red text) → /account/delete       │  │
│  └────────────────────────────────────────────────────┘  │
│  Disclaimer: "Lagalaga is not affiliated with Roblox..."  │
└──────────────────────────────────────────────────────────┘
```

## Types Used In The Screen
- Local `MeData` interface: `appUser`, `roblox`, `competitive?`
- Local `MeResponse` interface: `{ success, data: MeData, requestId }`
- `SessionSettings` from `@/src/lib/sessionSettings`
- `ThemePreference` ('light'|'dark'|'system') from `@/src/lib/themePreference`
- Tier union: `'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | 'master'`

## Important Named UI Elements
- `BackButton` — floating chevron.left, positioned with safe area inset, `position: absolute`
- Circular avatar with `haloRing` border (color from `resolveHaloColor()`)
- `syncButton` — `arrow.clockwise` icon, rotates while `refreshing === true`
- `robloxSmallAvatar` — 44px headshot (or placeholder) with green border when connected
- `connectPill` — "Connect" bordered pill shown when Roblox is not connected
- Segmented control (3 segments: System / Light / Dark) — wired to `AppThemeContext`
- `NumberSettingRow` — inline stepper (`−`/`+` buttons) for session hour settings
- "Roblox details" collapsible row (info.circle icon) → `advancedExpanded` state
- "Link Apple Account" list row (iOS, only if Roblox connected)
- "Delete Account" list row — red text/icon, destructive style but NOT a large CTA button

## Key Behaviour
- `handleSyncRobloxData()`: calls `refreshFriends(userId, { force: true })` + `refreshFavorites(userId, { force: true })` + refetches `/api/me`. On full success: halo pulses (no alert). On partial failure: Alert. The sync icon rotates while `refreshing === true`.
- `handleConnectRoblox()`: opens Roblox OAuth session; on success redirects to `/auth/roblox` with code+state params.
- Display name priority: `roblox.displayName` → `roblox.username` → `appUser.displayName`
- Theme: `AppThemeContext` provides `colorScheme` (resolved) + `themePreference` + `setThemePreference`. Persisted to AsyncStorage key `theme_preference_v1`.
- Session settings: loaded from AsyncStorage key `session_settings_v1` on each screen focus via `loadSessionSettings()`. Changes saved immediately via `saveSessionSettings(partial)`.
- Content fades in via `Animated.timing` (280ms) after initial load completes.
- `resolveHaloColor({ connected, syncing })` is exported as a pure function (tested separately).

## Data Sources
- `useFocusEffect` re-fetches `GET /api/me` on every screen focus
- Session settings: AsyncStorage via `loadSessionSettings()` / `saveSessionSettings()`
- Theme preference: AsyncStorage via `loadThemePreference()` / `saveThemePreference()` (managed by `AppThemeContext`)
- Response shape: `{ success, data: MeData, requestId }`

## Navigation (outbound)
- Back: `router.back()`
- Connect Roblox: `router.replace('/auth/roblox', { code, state })` after OAuth
- Safety & Report: `router.push('/safety-report')`
- Delete Account: `router.push('/account/delete')`
- Match History: `router.push('/match-history')` (gated by `ENABLE_COMPETITIVE_DEPTH`)
- Privacy Policy / Terms: `Linking.openURL(url)`

## What Changed vs Previous Version
- Removed Stack header (no "Me" title bar, no ellipsis overflow menu)
- Removed standalone Roblox card — replaced by visual header (avatar halo + sync icon + indicator)
- Removed "Roblox connected / not connected" text badge — state communicated via halo color
- Removed large "Sync Roblox data" button — replaced by graphical sync icon with animation
- Removed large "Delete Account" red CTA button — now a list item with red text
- Removed "Safety & Report" large button — now a list item in the More card
- Removed "Settings" navigation row — session settings are now embedded inline
- Added theme selector (Light / Dark / System segmented control)
- Added card fade-in animation on load
- Settings screen (`/settings`) is still accessible as a standalone route but no longer linked from Me
