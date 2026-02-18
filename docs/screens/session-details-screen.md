# Session Details Screen

## Route And Screen
- Route: `/sessions/[id]`
- Route file: `app/sessions/[id].tsx`
- Implementation file: `app/sessions/[id]-v2.tsx`
- Screen component name: `SessionDetailScreenV2`
- Screen type: React Function Component

## Graphical Structure (Component Name + Type)

```text
Session Details Screen (/sessions/[id])
Component: SessionDetailScreenV2 (type: React Function Component)

┌──────────────────────────────────────────────────────────┐
│ Root Container                                           │
│ name: styles.container                                   │
│ type: View                                               │
├──────────────────────────────────────────────────────────┤
│ Header Banner                                            │
│ names: banner / bannerPlaceholder                        │
│ types: Image OR View + ThemedText                        │
├──────────────────────────────────────────────────────────┤
│ Title Section                                            │
│ name: titleSection                                       │
│ type: View                                               │
│ children: titleRow (View), title/game/presence text      │
│           (ThemedText), status badges (View+ThemedText), │
│           live indicator (LivePulseDot)                  │
├──────────────────────────────────────────────────────────┤
│ Primary Actions                                          │
│ name: primaryActions                                     │
│ type: View                                               │
│ children: Join/Launch/Handoff buttons (Button),          │
│           full message (View + ThemedText)               │
├──────────────────────────────────────────────────────────┤
│ Main Content                                             │
│ name: mainContent                                        │
│ type: View                                               │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Players Section                                    │  │
│  │ name: playersSection                               │  │
│  │ type: View                                         │  │
│  │ children:                                          │  │
│  │ - section title (ThemedText)                       │  │
│  │ - playersList (FlatList)                           │  │
│  │   - participant row (View) x N                     │  │
│  │   - ListFooterComponent (optional extra sections)  │  │
│  └────────────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────────────┤
│ Overlay Dialog Layer                                     │
│ type: Portal > Dialog                                    │
│ children: Dialog.Title, Dialog.Content, Dialog.Actions   │
│ row input: RadioButton.Item                              │
└──────────────────────────────────────────────────────────┘
```

## Types Used In The Screen
- `SessionDetail` from `@/src/features/sessions/types-v2`
- `RobloxPresencePayload` from `@/src/features/sessions/apiStore-v2`
- `SessionDetail['participants'][number]` for participant items

## Important Named UI Elements
- `Players`
- `Share Invite`
- `Host tools`
- `Submit Result`
- `Connect Roblox for Presence`
- `Copy Host Tip`
