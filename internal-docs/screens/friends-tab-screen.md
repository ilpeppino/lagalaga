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
│ Root Container                                           │
│ type: ThemedView                                         │
│ title: "Friends"                                         │
├──────────────────────────────────────────────────────────┤
│ ScrollView with RefreshControl                           │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Loading State                                     │  │
│  │ type: ThemedText "Loading friends..."             │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  After load:                                             │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Requests Section                                  │  │
│  │ type: ThemedView                                  │  │
│  │ subtitle: "Requests"                              │  │
│  │ counts: incoming and outgoing request counts      │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ LagaLaga Friends Section                          │  │
│  │ type: ThemedView                                  │  │
│  │ subtitle: "LagaLaga Friends"                      │  │
│  │ list: friend display names                        │  │
│  │ empty: "No friends yet."                          │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Roblox Suggestions Section                        │  │
│  │ type: ThemedView                                  │  │
│  │ subtitle: "Roblox Suggestions"                    │  │
│  │ last synced time (with "(stale)" if stale)        │  │
│  │ list (up to 20): user display name + "Add" button │  │
│  │   "Add" → Pressable → sendFriendRequest()         │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

## Types Used In The Screen
- Local `FriendsPayload` interface:
  - `lagalaFriends?: Array<{ userId, robloxDisplayName, robloxUsername, friendshipId }>`
  - `requests?: { incoming?: Array<{ friendshipId, fromUser }>, outgoing?: Array<{ friendshipId, toUser }> }`
  - `robloxSuggestions?: { onApp?: Array<{ userId, robloxDisplayName, robloxUsername }>, syncedAt, isStale }`

## Important Named UI Elements
- Requests section (incoming/outgoing counts)
- LagaLaga Friends list
- Roblox Suggestions list with "Add" buttons
- Pull-to-refresh (calls refresh then reloads)

## API Calls
- `apiClient.friends.getList('all')` — load all friends data
- `apiClient.friends.refresh()` — force refresh Roblox friends cache on pull-to-refresh
- `apiClient.friends.sendRequest(targetUserId)` — send a friend request from suggestion
