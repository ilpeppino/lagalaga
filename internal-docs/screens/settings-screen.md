# Settings Screen

## Route And Screen
- Route: `/settings`
- Route file: `app/settings.tsx`
- Screen component name: `SettingsScreen`
- Screen type: React Function Component

## Graphical Structure (Component Name + Type)

```text
Settings Screen (/settings)
Component: SettingsScreen (type: React Function Component)

┌──────────────────────────────────────────────────────────┐
│ Stack Header                                             │
│ title: "Settings"                                        │
├──────────────────────────────────────────────────────────┤
│ Loading State                                            │
│ type: LagaLoadingSpinner                                 │
│ label: "Loading settings..."                             │
├──────────────────────────────────────────────────────────┤
│ Loaded State                                             │
│ type: View (white/dark card)                             │
│                                                          │
│  Sessions Section                                        │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Section label: "Sessions"                         │  │
│  │ NumberSettingRow: "Auto-complete live sessions    │  │
│  │   after" — stepper (–/+) for hours (0–48)        │  │
│  │ NumberSettingRow: "Auto-hide completed sessions   │  │
│  │   after" — stepper (–/+) for hours (0–48)        │  │
│  │ NumberSettingRow: "Starting soon window"          │  │
│  │   — stepper (–/+) for hours (0–48)               │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  Notifications Section                                   │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Section label: "Notifications"                    │  │
│  │ Toggle row: "Session reminders" — Switch          │  │
│  │ Toggle row: "Friend requests" — Switch            │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

## Types Used In The Screen
- `SessionSettings` from `@/src/lib/sessionSettings`:
  - `autoCompleteLiveAfterHours: number`
  - `autoHideCompletedAfterHours: number`
  - `startingSoonWindowHours: number`
- `NotificationPrefsResponse` from `@/src/lib/api`:
  - `sessionsRemindersEnabled: boolean`
  - `friendRequestsEnabled: boolean`

## Important Named UI Elements
- `NumberSettingRow` — a label + (–) value (+) stepper for hour-based settings
- Session reminders toggle Switch
- Friend requests toggle Switch

## Key Behaviour
- Session settings are persisted **locally** via `loadSessionSettings()` / `saveSessionSettings()` (AsyncStorage-backed)
- Notification preferences are persisted **on the server** via `GET/PATCH /api/notification-prefs`
- Notification preference updates are **optimistic**: UI updates immediately, reverts on API failure
- Hour values are clamped to [0, 48]
- Settings are loaded once on mount (`useEffect`)

## API Calls
- `apiClient.notificationPrefs.get()` — load notification preferences (`GET /api/notification-prefs`)
- `apiClient.notificationPrefs.patch(partial)` — save notification preferences (`PATCH /api/notification-prefs`)

## Entry Point
Navigated to from the Me screen via the "Settings" SettingsRow.
