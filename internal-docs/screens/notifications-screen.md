# Notifications Screen

## Route And Screen
- Route: `/notifications`
- Route file: `app/notifications.tsx`
- Screen component name: `NotificationsScreen`
- Screen type: React Function Component

## Graphical Structure (Component Name + Type)

```text
Notifications Screen (/notifications)
Component: NotificationsScreen (type: React Function Component)

┌──────────────────────────────────────────────────────────┐
│ Stack Header                                             │
│ title: "Notifications"                                   │
├──────────────────────────────────────────────────────────┤
│ Loading State                                            │
│ type: LagaLoadingSpinner (centered View)                 │
│ label: "Loading notifications..."                        │
├──────────────────────────────────────────────────────────┤
│ Loaded State                                             │
│ type: ScrollView                                         │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Unread Count                                      │  │
│  │ type: ThemedText (bodySmall)                      │  │
│  │ text: "Unread: N"                                 │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  Empty state:                                            │
│  ┌────────────────────────────────────────────────────┐  │
│  │ ThemedView card                                   │  │
│  │ "No notifications yet."                           │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  List:                                                   │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Pressable notification card (per item)            │  │
│  │ type: Pressable > ThemedView                      │  │
│  │ unread: blue border + light blue background       │  │
│  │ read: default border (#d0d0d0)                    │  │
│  │   - title (ThemedText subtitle)                   │  │
│  │   - body (ThemedText)                             │  │
│  │   - timestamp (ThemedText bodySmall, locale str)  │  │
│  │ onPress: mark read → navigate to item.data.route  │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

## Types Used In The Screen
- `InAppNotification` from `@/src/lib/api`:
  - `id: string`
  - `title: string`
  - `body: string`
  - `isRead: boolean`
  - `createdAt: string` (ISO timestamp)
  - `data: Record<string, unknown>` — navigation payload, `data.route` is the destination path

## Important Named UI Elements
- Unread count badge
- Notification card (read/unread visual distinction)

## Key Behaviour
- `useFocusEffect` reloads the list on every focus
- Pull-to-refresh supported
- Tapping an unread item calls `POST /api/notifications/:id/read` optimistically, then navigates
- Navigation target extracted via `normalizeRouteData(item.data)`:
  - `data.route` → pathname
  - Other keys → params
- If `data.route` is absent the tap is a no-op (no navigation)
- Read-mark failures are silently swallowed so navigation still proceeds

## API Calls
- `apiClient.notifications.list({ limit: 50 })` — load notifications
- `apiClient.notifications.markRead(id)` — mark a single notification as read

## Entry Point
Accessible from the tab bar header via the bell icon (set in `app/(tabs)/_layout.tsx`).
