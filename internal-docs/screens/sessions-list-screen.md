# Sessions List Screen

## Route And Screen
- Route: `/sessions`
- Route file: `app/sessions/index.tsx`
- Implementation file: `app/sessions/index-v2.tsx`
- Screen component name: `SessionsListScreenV2`
- Screen type: React Function Component

## Graphical Structure (Component Name + Type)

```text
Sessions List Screen (/sessions)
Component: SessionsListScreenV2 (type: React Function Component)

┌──────────────────────────────────────────────────────────┐
│ Root Container                                           │
│ type: View                                               │
├──────────────────────────────────────────────────────────┤
│ Header Actions (via Stack options)                       │
│ type: profile touch target + sign out action             │
├──────────────────────────────────────────────────────────┤
│ Session Feed                                              │
│ type: FlatList                                           │
│ row: session card (Card + TouchableOpacity + Image)      │
│ optional row wrapper: CollapsibleSessionRow (Animated)   │
│ optional row affordance: Swipeable for planned sessions  │
├──────────────────────────────────────────────────────────┤
│ Empty/Loading/Error States                               │
│ types: View + ThemedText + ActivityIndicator             │
├──────────────────────────────────────────────────────────┤
│ Floating Actions                                         │
│ types: FAB, IconButton                                   │
└──────────────────────────────────────────────────────────┘
```

## Types Used In The Screen
- `Session` from `@/src/features/sessions/types-v2`
- `ReactNode` from React

## Important Named UI Elements
- Session cards (live/planned)
- Quick play action
- Create session action
- Delete session (swipe + selection mode)
