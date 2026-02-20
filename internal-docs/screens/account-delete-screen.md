# Account Deletion Screens

Three screens implement the account deletion flow in sequence:
1. **Info** (`/account/delete`) — explain what will be deleted
2. **Confirm** (`/account/delete-confirm`) — safety gate before deletion
3. **Done** (`/account/delete-done`) — terminal confirmation screen

---

## Screen 1: Delete Account Info

### Route And Screen
- Route: `/account/delete`
- Route file: `app/account/delete.tsx`
- Screen component name: `DeleteAccountInfoScreen`
- Screen type: React Function Component

### Graphical Structure (Component Name + Type)

```text
Delete Account Info Screen (/account/delete)
Component: DeleteAccountInfoScreen (type: React Function Component)

┌──────────────────────────────────────────────────────────┐
│ Stack Header                                             │
│ title: "Delete Account"                                  │
├──────────────────────────────────────────────────────────┤
│ ScrollView Content                                       │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Headline: "Delete Your LagaLaga Account"          │  │
│  │ type: ThemedText                                  │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Card 1: "What gets deleted"                       │  │
│  │ type: ThemedView                                  │  │
│  │ • Your profile and account                        │  │
│  │ • Your sessions                                   │  │
│  │ • Friend connections                              │  │
│  │ • Push notification tokens                        │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Card 2: "Data that may be retained"               │  │
│  │ type: ThemedView                                  │  │
│  │ • Security / audit logs                           │  │
│  │ • Anti-fraud records                              │  │
│  │ • Legal obligations                               │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Card 3: "Timeline"                                │  │
│  │ type: ThemedView                                  │  │
│  │ Deletion initiated immediately, completed ≤30 days │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ "Continue" button (filled)                        │  │
│  │ → navigates to /account/delete-confirm            │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ "Use web page instead" link                       │  │
│  │ type: TouchableOpacity (Linking.openURL)          │  │
│  │ URL: DELETE_ACCOUNT_WEB_URL from runtime config   │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

### Important Named UI Elements
- "What gets deleted" card
- "Data that may be retained" card
- "Timeline" card
- "Continue" button
- "Use web page instead" link

---

## Screen 2: Delete Account Confirm

### Route And Screen
- Route: `/account/delete-confirm`
- Route file: `app/account/delete-confirm.tsx`
- Screen component name: `DeleteAccountConfirmScreen`
- Screen type: React Function Component

### Graphical Structure (Component Name + Type)

```text
Delete Account Confirm Screen (/account/delete-confirm)
Component: DeleteAccountConfirmScreen (type: React Function Component)

┌──────────────────────────────────────────────────────────┐
│ Loading State (checkingStatus=true)                      │
│ type: centered ActivityIndicator                         │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│ Stack Header                                             │
│ title: "Confirm Deletion"                                │
├──────────────────────────────────────────────────────────┤
│ ScrollView Content                                       │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Card: "Before you continue"                       │  │
│  │ type: ThemedView                                  │  │
│  │                                                   │  │
│  │ Permanence warning paragraph                      │  │
│  │ Acknowledgement toggle row:                       │  │
│  │   type: Switch + ThemedText                       │  │
│  │   "I understand this cannot be undone."           │  │
│  │ Instruction: "Type DELETE to enable..."           │  │
│  │ Confirmation TextInput:                           │  │
│  │   autoCapitalize="characters", placeholder "DELETE"│  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ "Delete my account" Button                        │  │
│  │ type: Button (filled, red #c62828)                │  │
│  │ disabled unless: acknowledged && text="DELETE"    │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ "Go back" link                                    │  │
│  │ type: TouchableOpacity                            │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

### Important Named UI Elements
- Acknowledgement `Switch` ("I understand this cannot be undone")
- "DELETE" confirmation `TextInput`
- "Delete my account" button (danger red, double-gated)
- "Go back" link

### On Mount Behaviour
- Calls `apiClient.account.getDeletionStatus()` — if `PENDING`, redirects to `/account/delete-done` immediately

### On Success
- Calls `signOut()`, then replaces to `/account/delete-done` with `requestedAt` and `scheduledPurgeAt` params

---

## Screen 3: Delete Account Done

### Route And Screen
- Route: `/account/delete-done`
- Route file: `app/account/delete-done.tsx`
- Screen component name: `DeleteAccountDoneScreen`
- Screen type: React Function Component

### Graphical Structure (Component Name + Type)

```text
Delete Account Done Screen (/account/delete-done)
Component: DeleteAccountDoneScreen (type: React Function Component)

┌──────────────────────────────────────────────────────────┐
│ Stack Header                                             │
│ title: "Deletion Requested"                              │
│ headerBackVisible: false (no back navigation)            │
├──────────────────────────────────────────────────────────┤
│ ScrollView Content                                       │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Headline: "Deletion requested"                    │  │
│  │ type: ThemedText                                  │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Status Card                                       │  │
│  │ type: ThemedView                                  │  │
│  │ rows: Current status (PENDING), Requested at,    │  │
│  │   Scheduled purge at                              │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Grace period paragraph                            │  │
│  │ type: ThemedText                                  │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ "Return to sign in" button                        │  │
│  │ → router.replace('/auth/sign-in')                 │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

### URL Params
- `requestedAt?: string` - ISO timestamp of when deletion was requested
- `scheduledPurgeAt?: string` - ISO timestamp of when data will be purged

### Important Named UI Elements
- Status card (PENDING status + dates)
- "Return to sign in" button
