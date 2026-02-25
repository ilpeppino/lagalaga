# Friends Tab Screen

## Route And Screen
- Route: `/(tabs)/friends`
- Route file: `app/(tabs)/friends.tsx`
- Screen component name: `FriendsTabScreen`
- Screen type: React Function Component

## Graphical Structure (Component Name + Type)

```text
Friends Tab Screen (/(tabs)/friends)
Component: FriendsTabScreen (type: React Function Component)

┌──────────────────────────────────────────────────────────┐
│ Loading State                                            │
│ type: LagaLoadingSpinner (centered View)                 │
│ label: "Loading friends..."                              │
├──────────────────────────────────────────────────────────┤
│ Loaded State                                             │
│ type: ScrollView                                         │
│ title: ThemedText "Friends" (type="title")               │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Requests Section                                  │  │
│  │ type: ThemedView                                  │  │
│  │ subtitle: "Requests"                              │  │
│  │ incoming count + outgoing count                   │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ LagaLaga Friends Section                          │  │
│  │ type: ThemedView                                  │  │
│  │ header: SyncedAtBadge ("LagaLaga Friends")        │  │
│  │   - shows syncedAt time + stale indicator         │  │
│  │   - refresh button (calls onRefresh)              │  │
│  │ list: friend display names                        │  │
│  │ empty: "No friends yet."                          │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Roblox Suggestions Section                        │  │
│  │ type: ThemedView                                  │  │
│  │ subtitle: "Roblox Suggestions"                    │  │
│  │ if robloxNotConnected:                            │  │
│  │   "Connect Roblox to sync friends."               │  │
│  │ else:                                             │  │
│  │   list (up to 20): display name + "Add" button   │  │
│  │     "Add" → Pressable → sendFriendRequest()       │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

## Types Used In The Screen
- Local `FriendsPayload` interface:
  - `lagalaFriends?: Array<{ userId, robloxDisplayName, robloxUsername, friendshipId }>`
  - `requests?: { incoming?: Array<{ friendshipId, fromUser }>, outgoing?: Array<{ friendshipId, toUser }> }`
  - `robloxSuggestions?: { onApp?: Array<{ userId, robloxDisplayName, robloxUsername }> }`

## Important Named UI Elements
- Requests section (incoming/outgoing counts)
- LagaLaga Friends list with `SyncedAtBadge` header
- Roblox Suggestions list with "Add" Pressable buttons (or not-connected message)
- Pull-to-refresh (calls `refresh()` from `useFriends` then reloads)

## Hooks Used
- `useFriends(user?.id)` from `@/src/features/friends/useFriends` — provides:
  - `syncedAt`, `isStale`, `robloxNotConnected`, `isRefreshing`, `refresh`
- `useAuth()` — provides `user.id`

## API Calls
- `apiClient.friends.list('all')` — load all friends data on mount and focus
- `apiClient.friends.refresh()` — force refresh Roblox friends cache (via `useFriends` hook's `refresh()`)
- `apiClient.friends.sendRequest(targetUserId)` — send a friend request from suggestion row

## Components Used
- `SyncedAtBadge` from `@/components/SyncedAtBadge` — displays sync time/staleness + refresh action
- `LagaLoadingSpinner` from `@/components/ui/LagaLoadingSpinner` — loading state
