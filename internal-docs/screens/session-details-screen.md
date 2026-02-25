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
│  │ types: View, ThemedText, LivePulseDot, badge rows │  │
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
│  │ type: mapped View rows (participant + placeholders│  │
│  │ for invited/unfilled slots), optional empty state │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Footer Sections (conditional)                     │  │
│  │ types:                                            │  │
│  │ - Invite+Safety section:                         │  │
│  │     "Share Invite" button (if inviteLink exists)  │  │
│  │     "Safety & Report" button (always shown)       │  │
│  │     → /safety-report with SESSION target pre-fill │  │
│  │ - Host tools (Submit Result / Connect Roblox)     │  │
│  │ - Stuck players card (Copy Host Tip)              │  │
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
- `Join Session` — green, for non-joined non-full sessions
- `Launch Roblox` — blue, for host after joining; opens Roblox deep link
- `Open Join Handoff` — blue, for non-host joined members; navigates to `/sessions/handoff`
- `Share Invite` — outlined, visible when `session.inviteLink` exists
- `Safety & Report` — red outlined, always in footer; pre-fills `targetType=SESSION` and `targetSessionId`
- `Host tools` section — visible when `isHost && isRanked` or host Roblox presence unavailable
- `Submit Result` — orange outlined, visible for ranked sessions (requires ≥2 joined participants)
- `Connect Roblox for Presence` — blue outlined, shown when host presence is unavailable
- `Stuck players` card — shown to host when any participants have `handoffState='stuck'`
- `Copy Host Tip` — copies troubleshooting text for stuck participants
- `Select Winner` dialog — Portal > Dialog with RadioButton list + Confirm/Cancel

## URL Params
- `id` — session ID (required)
- `inviteLink` — invite link URL (optional, triggers share prompt on first load when `justCreated=true`)
- `justCreated` — `'true'` triggers a share prompt 500ms after mount (once per mount)

## Key Behaviour
- Compact layout when screen height < 700px (smaller banners, tighter spacing)
- Banner height responsive: 16–18% of screen height (min 110–120px, max 170–200px)
- `hasJoined` = user is host OR user has a `joined`-state participant entry
- Presence checked via `getRobloxPresence([session.hostId])` on load
- Fallback thumbnail fetched from Roblox API if `game.thumbnailUrl` is missing
