# App Store Review Notes Template

Use this in App Store Connect -> Submission -> Review Notes.

## Review Notes

This build addresses Sign in with Apple parity and in-app authentication flow requirements.

1. **Sign in with Apple (Guideline 4.8)**
- On iOS, the sign-in screen shows **Sign in with Apple** as a primary option.
- Apple sign-in is supported with Apple private relay email.
- We only request name/email scopes from Apple.

2. **In-app auth presentation (Guideline 4.0)**
- Authentication uses in-app auth session flow.
- The user does not need to leave the app to Safari during the login/linking flow.

3. **Roblox account linking after Apple login**
- After successful Apple login, users without a linked Roblox account are directed to a **Connect Roblox** screen.
- Completing link enables Roblox features for the same user account.

4. **Equivalent account access**
- Users can sign in with Apple or Roblox and access the same Lagalaga account once linked.

5. **Account deletion (Guideline 5.1.1(v))**
- Account deletion is available directly in app:
  - `Me` -> `Delete Account`
- No external website is required to submit deletion.
