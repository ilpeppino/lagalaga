# Home Tab Screen

## Route And Screen
- Route: `/(tabs)/`
- Route file: `app/(tabs)/index.tsx`
- Screen component name: `HomeScreen`
- Screen type: React Function Component

## Graphical Structure (Component Name + Type)

```text
Home Tab Screen (/(tabs)/)
Component: HomeScreen (type: React Function Component)

┌──────────────────────────────────────────────────────────┐
│ ParallaxScrollView                                       │
│ header: light blue / dark teal background + react logo   │
├──────────────────────────────────────────────────────────┤
│ Title Container                                          │
│ type: ThemedView                                         │
│ "Welcome!" text + HelloWave animated component           │
├──────────────────────────────────────────────────────────┤
│ Quick Play Section                                       │
│ type: ThemedView                                         │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ "Play Now" Pressable Button                       │  │
│  │ style: blue (#007AFF), 56px min-height            │  │
│  │ loading: ActivityIndicator while creating         │  │
│  │ action: handleQuickPlay()                         │  │
│  │   → sessionsAPIStoreV2.createQuickSession()       │  │
│  │   → router.push /sessions/${session.id}-v2       │  │
│  └────────────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────────────┤
│ Boilerplate Steps (from Expo starter template)           │
│ types: ThemedView, ThemedText, Link                      │
│                                                          │
│  Step 1: "Try it" — edit index.tsx, dev tools hint       │
│  Step 2: "Explore" — Link with Preview, Menu actions     │
│  Step 3: "Get a fresh start" — npm run reset-project     │
└──────────────────────────────────────────────────────────┘
```

## Types Used In The Screen
- No custom types; `isCreating: boolean` for loading state

## Important Named UI Elements
- "Play Now" quick-play button (primary action)
- `HelloWave` animated component

## Key Behaviour
- `handleQuickPlay()` creates a session with `template=quick` and immediately navigates to the session detail screen
- Error handling via `useErrorHandler()` hook
