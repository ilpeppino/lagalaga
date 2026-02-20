# Session Create Screen

## Route And Screen
- Route: `/sessions/create`
- Route file: `app/sessions/create.tsx`
- Implementation file: `app/sessions/create-v2.tsx`
- Screen component name: `CreateSessionScreenV2`
- Screen type: React Function Component

## Graphical Structure (Component Name + Type)

```text
Session Create Screen (/sessions/create)
Component: CreateSessionScreenV2 (type: React Function Component)

┌──────────────────────────────────────────────────────────┐
│ Root Container                                           │
│ type: KeyboardAvoidingView                               │
├──────────────────────────────────────────────────────────┤
│ Form Scroll                                               │
│ type: ScrollView                                         │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Game Section                                      │  │
│  │ types: Menu, Button, TextInput                    │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Session Metadata                                  │  │
│  │ types: TextInput, SegmentedButtons, Switch        │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Schedule Controls                                 │  │
│  │ types: Pressable, DateTimePicker                  │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Friend Selection                                  │  │
│  │ types: FriendPickerTwoRowHorizontal               │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Submit Area                                       │  │
│  │ type: Button + loading/error text                 │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

## Types Used In The Screen
- `RobloxFriend` from `@/src/features/sessions/types-v2`
- `SessionVisibility` from `@/src/features/sessions/types-v2`
- `Favorite` from `@/src/features/favorites/cache`

## Important Named UI Elements
- Game selector
- Roblox link input
- Session title
- Visibility selector
- Ranked toggle
- Schedule picker
- Friend picker
- Create session button
