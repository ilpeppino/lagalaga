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
│ Root Wrapper                                             │
│ type: Fragment                                           │
├──────────────────────────────────────────────────────────┤
│ Main Scroll Content                                      │
│ type: ScrollView                                         │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Header Banner                                     │  │
│  │ types: Image OR placeholder View + ThemedText     │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Title And Status                                  │  │
│  │ types: View, ThemedText, LivePulseDot, single LIVE│  │
│  │ chip, host username metadata                      │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Primary Actions                                   │  │
│  │ types: Button, optional full-capacity message     │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Players Header                                    │  │
│  │ type: View + ThemedText                           │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Players List                                      │  │
│  │ type: mapped View rows (host first + joined users)│  │
│  │ with host highlight + state badges                │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Invited Section                                   │  │
│  │ type: invited rows with "Invited" badge + Share   │  │
│  │ Invite action                                     │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Footer Sections (conditional)                     │  │
│  │ types:                                            │  │
│  │ - Host tools (Submit Result / Connect Roblox)     │  │
│  │ - Stuck players card (Copy Host Tip)              │  │
│  │ - Bottom text link: Safety & Report               │  │
│  └────────────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────────────┤
│ Overlay Dialog Layer (conditional)                       │
│ type: Portal > Dialog                                    │
│ children: winner radio options + confirm/cancel actions  │
└──────────────────────────────────────────────────────────┘
```

## Types Used In The Screen
- `SessionDetail` from `@/src/features/sessions/types-v2`
- `RobloxPresencePayload` from `@/src/features/sessions/apiStore-v2`
- `SessionDetail['participants'][number]` for participant row rendering

## Important Named UI Elements
- `Join Session`
- `Launch Roblox`
- `Open Join Handoff`
- `LIVE`
- `Players • X / Y`
- `Invited`
- `Share Invite`
- `HOST`
- `In session`
- `Invited`
- `Host tools`
- `Submit Result`
- `Connect Roblox for Presence`
- `Copy Host Tip`
- `Safety & Report` (text link)
- `Select Winner`
