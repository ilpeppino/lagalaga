# Settings Screen

## Route And Screen
- Route: `/settings`
- Route file: `app/settings.tsx`
- Screen component name: `SettingsScreen`
- Screen type: React Function Component
- **Entry point**: Previously linked from Me screen "Settings" row — that link has been removed.
  The route still exists and is reachable by direct navigation (e.g. deep link, future entry points).
  The session settings it contains are now also **embedded directly in the Me screen** Settings card.

## Graphical Structure (Component Name + Type)

```text
Settings Screen (/settings)
Component: SettingsScreen (type: React Function Component)

┌──────────────────────────────────────────────────────────┐
│ Stack Header                                             │
│ title: "Settings"                                        │
├──────────────────────────────────────────────────────────┤
│ Loading State (conditional)                              │
│ type: View (centered)                                    │
│ content: LagaLoadingSpinner + "Loading settings..."      │
├──────────────────────────────────────────────────────────┤
│ Sessions Card                                            │
│ type: View (card style)                                  │
│ section title: "Sessions" (titleLarge)                   │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ NumberSettingRow: "Auto-complete live sessions     │  │
│  │  after"                                           │  │
│  │ control: − / value (Nh) / + stepper buttons       │  │
│  │ range: 0–48 hours                                 │  │
│  │ persists: autoCompleteLiveAfterHours               │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ NumberSettingRow: "Auto-hide completed sessions    │  │
│  │  after"                                           │  │
│  │ control: − / value (Nh) / + stepper buttons       │  │
│  │ range: 0–48 hours                                 │  │
│  │ persists: autoHideCompletedAfterHours              │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ NumberSettingRow: "Starting soon window"           │  │
│  │ control: − / value (Nh) / + stepper buttons       │  │
│  │ range: 0–48 hours                                 │  │
│  │ persists: startingSoonWindowHours                  │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

## Types Used In The Screen
- `SessionSettings` from `@/src/lib/sessionSettings`:
  ```typescript
  interface SessionSettings {
    autoCompleteLiveAfterHours: number;
    autoHideCompletedAfterHours: number;
    startingSoonWindowHours: number;
  }
  ```

## Important Named UI Elements
- `NumberSettingRow` — inline component with label + stepper (−/+) buttons
- Three session timing settings (all in hours, clamped 0–48)

## Key Behaviour
- Settings are loaded from `AsyncStorage` via `loadSessionSettings()` on mount
- Each stepper change calls `saveSessionSettings(partial)` immediately (no save button)
- `DEFAULT_SESSION_SETTINGS` is used if no stored settings exist
- Error handling via `useErrorHandler()` hook

## Data Source
- `src/lib/sessionSettings.ts` — `loadSessionSettings()` / `saveSessionSettings()` — AsyncStorage key: `session_settings_v1`

## Notes
- The same session settings (and a theme selector) are now embedded in the **Me screen** Settings card.
  Both screens share the same AsyncStorage backing, so changes in either location are immediately reflected.
- This screen remains as a standalone route for any future deep-link or navigational entry point.
