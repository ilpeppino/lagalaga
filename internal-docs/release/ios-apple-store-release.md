# iOS Release Guide

## Build Prep

1. Increment `ios.buildNumber` in:
- `app.config.ts`
- `app.json`

2. Generate native iOS project:

```bash
npx expo prebuild -p ios
```

3. Confirm auth config is present in generated iOS build:
- `ios.usesAppleSignIn: true`
- `expo-apple-authentication` plugin enabled
- App scheme supports `lagalaga://auth/roblox`

4. Change CFBundle​Version in Info​.plist to the same build number

5. From XCode, Product -> Clean Build Folder, then Archive

6. Open Window -> Organizer, select the build and distribute

## App Store Compliance Gate (Blocking)

Do not submit until all checks below pass on a physical iPhone build.

### Guideline 4.8 (Sign in with Apple parity)

1. On iOS sign-in screen:
- Primary button is `Sign in with Apple`
- Secondary button is `Continue with Roblox`

2. Apple sign-in:
- Completes in app flow
- Works with hidden/private relay email
- Account is created or resolved by Apple `sub`

3. Post-Apple behavior:
- If Roblox is not linked, user is redirected to `Connect Roblox` screen immediately
- `Connect Roblox Account` button starts linking flow

### Guideline 4.0 (No external browser auth flow)

1. During Roblox auth/login/linking:
- App uses in-app auth session (ASWebAuthenticationSession via Expo WebBrowser)
- Reviewer is not dropped to Safari app

2. Callback:
- Deep link returns to `lagalaga://auth/roblox`
- Auth callback completes and returns user to app flow

### Identity + Linking Safety

1. Linking conflict:
- If Roblox account belongs to another user, show `ACCOUNT_LINK_CONFLICT` UI

2. Apple conflict:
- If Apple identity belongs to another user, show clear conflict UI

3. Same-account access:
- Apple login and Roblox login resolve to same Lagalaga user after linking

### Guideline 5.1.1(v) (In-app deletion)

1. User can navigate in app: `Me` -> `Delete Account`
2. Deletion request can be submitted entirely in app
3. No external website is required to complete deletion

## Reviewer Path (Must Pass Exactly)

1. Install app
2. Open sign-in and tap `Sign in with Apple`
3. Complete Apple sign-in
4. On `Connect Roblox`, tap `Connect Roblox Account`
5. Complete Roblox linking in app auth session
6. Reach authenticated app experience
7. Log out
8. Log in again using Roblox
9. Confirm same account data and access

## App Store Metadata and Screenshots

Screenshots must show:
- Apple sign-in button visible on iOS sign-in screen
- In-app authentication flow (no Safari app context)
- Connect Roblox screen in the post-Apple flow

Do not upload screenshots that show:
- External Safari browser auth
- Any flow implying account deletion requires web

## Xcode Archive + Upload

1. In Xcode:
- Product -> Clean Build Folder
- Select project `lagalaga`
- Select target `lagalaga`
- General -> Identity -> increment version/build if needed
- Select `Any iOS Device (arm64)`
- Product -> Archive

2. In Organizer:
- Distribute App -> App Store Connect -> Upload

3. In App Store Connect:
- Attach updated screenshots
- Add reviewer notes:
  - Sign in with Apple is available and primary on iOS
  - Roblox linking is completed in-app
  - Account deletion is available in-app
