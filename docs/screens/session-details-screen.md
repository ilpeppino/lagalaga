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
│ Main Scroll                                              │
│ name: contentScroll                                      │
│ type: ScrollView                                         │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Banner Area                                        │  │
│  │ names: banner / bannerPlaceholder                  │  │
│  │ types: Image OR View + ThemedText                  │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Title Section                                      │  │
│  │ name: titleSection                                 │  │
│  │ type: View                                         │  │
│  │ children:                                          │  │
│  │ - titleRow (View)                                  │  │
│  │ - title/game/hostPresence (ThemedText)             │  │
│  │ - live indicator (LivePulseDot)                    │  │
│  │ - badges container (View) + badge chips (View)     │  │
│  │   with badge text (ThemedText)                     │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Primary Actions                                    │  │
│  │ name: primaryActions                               │  │
│  │ type: View                                         │  │
│  │ children:                                          │  │
│  │ - Join / Launch / Handoff buttons (Button)         │  │
│  │ - Full message (View + ThemedText)                 │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Players Section                                    │  │
│  │ name: playersSection                               │  │
│  │ type: View                                         │  │
│  │ children:                                          │  │
│  │ - section title (ThemedText)                       │  │
│  │ - playersList (View)                               │  │
│  │   - participant row (View) x N                     │  │
│  │     - avatar (View + ThemedText)                   │  │
│  │     - info (View + ThemedText)                     │  │
│  │     - status chip (View + ThemedText)              │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Footer Section                                     │  │
│  │ name: footerSections                               │  │
│  │ type: View                                         │  │
│  │ child: Share Invite (Button)                       │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Host Tools (conditional)                           │  │
│  │ type: View                                         │  │
│  │ children: title (ThemedText), buttons (Button)     │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Stuck Players Card (conditional)                   │  │
│  │ type: View                                         │  │
│  │ children: text rows (ThemedText), copy button      │  │
│  └────────────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────────────┤
│ Overlay Dialog Layer                                    │
│ type: Portal > Dialog                                   │
│ children: Dialog.Title, Dialog.Content, Dialog.Actions  │
│ row input: RadioButton.Item                             │
└──────────────────────────────────────────────────────────┘
```

## Types Used In The Screen
- `SessionDetail` from `@/src/features/sessions/types-v2`
- `RobloxPresencePayload` from `@/src/features/sessions/apiStore-v2`
- `SessionDetail['participants'][number]` as participant item type

## Important Named UI Elements
- `Players`
- `Host tools`
- `Share Invite`
- `Submit Result`
- `Connect Roblox for Presence`
- `Copy Host Tip`
