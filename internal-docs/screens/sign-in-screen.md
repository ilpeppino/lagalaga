# Sign-In Screen

## Route And Screen
- Route: `/auth/sign-in`
- Route file: `app/auth/sign-in.tsx`
- Screen component name: `SignInScreen`
- Screen type: React Function Component
- Entry point: Shown when `useAuth()` has no user (unauthenticated state)

## Graphical Structure (Component Name + Type)

```text
Sign-In Screen (/auth/sign-in)
Component: SignInScreen (type: React Function Component)

┌──────────────────────────────────────────────────────────┐
│ Root Container                                           │
│ type: View (full screen, themed background)              │
├──────────────────────────────────────────────────────────┤
│ Content Area (centered, max-width 400)                   │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Title: "Welcome to Lagalaga"                      │  │
│  │ type: ThemedText (headlineLarge, centered)         │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Subtitle: "Plan Roblox sessions with friends."    │  │
│  │ type: ThemedText (bodyLarge, centered)             │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ "Sign in with Roblox" AnimatedButton              │  │
│  │ variant: filled, color: #007AFF                   │  │
│  │ disabled: until both checkboxes are checked       │  │
│  │ loading: while signInWithRoblox() is in progress  │  │
│  │ enableHaptics: true                               │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Acknowledgement Checkboxes                        │  │
│  │ type: View (ackContainer) with two rows           │  │
│  │                                                   │  │
│  │ Row 1: Checkbox + "I have read and agree to the   │  │
│  │   Terms of Service." (link opens ToS URL)         │  │
│  │                                                   │  │
│  │ Row 2: Checkbox + "I have read and agree to the   │  │
│  │   Privacy Policy." (link opens Privacy Policy URL)│  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Hint text: "Requires a 13+ Roblox account."       │  │
│  │ type: ThemedText (bodyMedium, centered, subtle)   │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Disclaimer: "Lagalaga is not affiliated with,     │  │
│  │  endorsed by, or sponsored by Roblox Corporation."│  │
│  │ type: ThemedText (bodyMedium, centered, muted)    │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

## Types Used In The Screen
- No custom types; local state: `loading: boolean`, `acceptedTerms: boolean`, `acceptedPrivacy: boolean`

## Important Named UI Elements
- "Sign in with Roblox" button (`AnimatedButton` from react-native-paper)
- Terms of Service checkbox (must be checked to enable sign-in)
- Privacy Policy checkbox (must be checked to enable sign-in)
- ToS link → `https://ilpeppino.github.io/lagalaga/terms.html`
- Privacy Policy link → `https://ilpeppino.github.io/lagalaga/privacy-policy.html`

## Key Behaviour
- `canSignIn = acceptedTerms && acceptedPrivacy && !loading` — sign-in button is disabled until both legal agreements are acknowledged
- `handleRobloxSignIn()` calls `useAuth().signInWithRoblox()`:
  1. Generates PKCE `code_verifier` + `code_challenge`
  2. Stores verifier in `oauthTransientStorage`
  3. Calls `POST /auth/roblox/start` to get the Roblox authorization URL
  4. Opens the URL via `Linking.openURL` (iOS) or `WebBrowser.openAuthSessionAsync` (Android)
  5. OAuth callback is handled by `app/auth/roblox.tsx`
- Error handling via `useErrorHandler()` hook
