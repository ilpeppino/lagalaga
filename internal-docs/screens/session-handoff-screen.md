# Session Handoff Screen

## Route And Screen
- Route: `/sessions/handoff`
- Route file: `app/sessions/handoff.tsx`
- Screen component name: `SessionHandoffScreen`
- Screen type: React Function Component

## Graphical Structure (Component Name + Type)

```text
Session Handoff Screen (/sessions/handoff)
Component: SessionHandoffScreen (type: React Function Component)

┌──────────────────────────────────────────────────────────┐
│ Root Container                                           │
│ type: ScrollView                                         │
├──────────────────────────────────────────────────────────┤
│ Header                                                    │
│ type: ThemedText                                          │
├──────────────────────────────────────────────────────────┤
│ Game Preview                                               │
│ types: Image or fallback View                             │
├──────────────────────────────────────────────────────────┤
│ Host Block                                                 │
│ types: View + Image + ThemedText                          │
├──────────────────────────────────────────────────────────┤
│ Join Instructions                                          │
│ types: View + ThemedText                                  │
├──────────────────────────────────────────────────────────┤
│ Action Buttons                                             │
│ types: Button                                              │
│ actions: Open Roblox, I'm in, I'm stuck, connect Roblox   │
└──────────────────────────────────────────────────────────┘
```

## Types Used In The Screen
- `SessionDetail` from `@/src/features/sessions/types-v2`
- `busyAction` union state: `'open' | 'confirm' | 'stuck' | null`

## Important Named UI Elements
- `Open Roblox`
- `I'm in`
- `I'm stuck`
- `Connect Roblox for Presence`
- `Back to Session`
