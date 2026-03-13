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
│ Scroll Container                                         │
│ type: ScrollView                                         │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Intro Text                                        │  │
│  │ type: ThemedText                                  │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ GAME Section                                      │  │
│  │ types: GameSelectorCard (favorites mode)          │  │
│  │        or TextInput (link mode)                   │  │
│  │  + "Paste a link instead" / "Back to favorites"   │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ VISIBILITY Section                                │  │
│  │ type: SegmentedButtons                            │  │
│  │ default: Friends Only                             │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Auto-title Preview                                │  │
│  │ type: ThemedText                                  │  │
│  │ format: "{displayName}'s {gameName} session"      │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ CREATE SESSION Button                             │  │
│  │ type: AnimatedButton                              │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

## Types Used In The Screen
- `SessionVisibility` from `@/src/features/sessions/types-v2`
- `Favorite` from `@/src/features/favorites/cache`

## Important Named UI Elements
- Game selector card (thumbnail + name + refresh icon) — favorites mode
- Roblox link input — link mode
- Visibility segmented control (Public / Friends Only / Invite Only)
- Auto-title preview (read-only)
- CREATE SESSION button (full-width CTA)
- Helper text: "You can rename the session and invite friends in the next step."

## Key Behaviour
- Session title is auto-generated: `{robloxDisplayName}'s {gameName} session`
- No manual title input on this screen — title is editable in the lobby
- No friend picker on this screen — inviting moves to the lobby
- No scheduled start or ranked toggle on this screen — these moved to lobby settings
- On successful creation: navigates to `/sessions/lobby` with `id` + `inviteLink` params

## API Calls
- `GET /api/me/favorite-experiences` — load Roblox favorites (via `useFavorites`)
- `POST /api/sessions` — create session with `robloxUrl`, auto-title, visibility
