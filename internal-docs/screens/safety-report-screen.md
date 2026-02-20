# Safety Report Screen

## Route And Screen
- Route: `/safety-report`
- Route file: `app/safety-report.tsx`
- Screen component name: `SafetyReportScreen`
- Screen type: React Function Component

## Graphical Structure (Component Name + Type)

```text
Safety Report Screen (/safety-report)
Component: SafetyReportScreen (type: React Function Component)

┌──────────────────────────────────────────────────────────┐
│ Step 1 — Category Selection                              │
│ type: ScrollView                                         │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Policy Banner                                     │  │
│  │ type: ThemedText (zero-tolerance statement)       │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Category List (5 rows)                            │  │
│  │ type: TouchableOpacity rows                       │  │
│  │ items: CSAM, GROOMING_OR_SEXUAL_EXPLOITATION,     │  │
│  │   HARASSMENT_OR_ABUSIVE_BEHAVIOR,                 │  │
│  │   IMPERSONATION, OTHER                            │  │
│  │ checkmark.circle.fill icon when selected          │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Continue Button                                   │  │
│  │ type: AnimatedButton (disabled until selected)    │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│ Step 2 — Details Entry                                   │
│ type: ScrollView + KeyboardAvoidingView                  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Target Type Chips                                 │  │
│  │ type: row of pill TouchableOpacity buttons        │  │
│  │ options: "Another user", "A session",             │  │
│  │   "General safety concern"                        │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Conditional Target ID Fields                      │  │
│  │ type: TextInput (user ID, when targetType=USER)   │  │
│  │ type: TextInput (session ID, when targetType=SESSION) │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Description TextInput                             │  │
│  │ type: multiline TextInput (max 5000 chars)        │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Child Safety Policy Link                          │  │
│  │ type: TouchableOpacity row (Linking.openURL)      │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Action Row                                        │  │
│  │ types: "Back" TouchableOpacity + "Submit report"  │  │
│  │   AnimatedButton (disabled while submitting)      │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│ Step 3 — Confirmation                                    │
│ type: ScrollView                                         │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Success Heading                                   │  │
│  │ type: ThemedText "Report submitted"               │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Confirmation Text                                 │  │
│  │ type: ThemedText (law enforcement notice)         │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Reference ID                                      │  │
│  │ type: ThemedText label + monospaced ticketId      │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Done Button                                       │  │
│  │ type: AnimatedButton → router.back()              │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

## Types Used In The Screen
- `Step = 1 | 2 | 3` - local union type for wizard step
- `ReportCategory` from `@/src/lib/api` (CSAM, GROOMING_OR_SEXUAL_EXPLOITATION, HARASSMENT_OR_ABUSIVE_BEHAVIOR, IMPERSONATION, OTHER)
- `ReportTargetType` from `@/src/lib/api` (USER, SESSION, GENERAL)

## URL Params (pre-fill context)
- `targetType?: ReportTargetType` - pre-select a target type on step 2
- `targetUserId?: string` - pre-fill user ID field
- `targetSessionId?: string` - pre-fill session ID field

## Important Named UI Elements
- Category radio list (5 options)
- Target type chip selector
- Description multiline input
- "View Child Safety policy" link
- "Submit report" button
- Reference ID display (ticketId)
- "Done" button

## Entry Points
- `app/me.tsx` → "Safety & Report" button (Account card) and overflow menu
- `app/profile.tsx` → "Safety & Report" overflow menu item
- `app/sessions/[id]-v2.tsx` → pre-fills `targetType=SESSION`, `targetSessionId`
