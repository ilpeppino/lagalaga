# Deploying And Testing On An iOS Device

This guide explains how to configure the app and deploy it to a physical iPhone for testing on both Wi-Fi and mobile data.

## Goal

- Install the app on an iPhone (not simulator).
- Connect the app to your live Render backend.
- Verify login and API calls on Wi-Fi and cellular networks.

## Prerequisites

- macOS machine.
- Xcode installed.
- Apple Developer account (required for most repeatable device signing workflows).
- iPhone with Developer Mode enabled.
- Render backend already deployed.
- Roblox OAuth app configured for this project.

## 1. Configure Frontend Environment

Update `.env` at repo root:

```env
EXPO_PUBLIC_API_URL=https://<YOUR_RENDER_SERVICE>.onrender.com
EXPO_PUBLIC_ROBLOX_CLIENT_ID=<YOUR_ROBLOX_CLIENT_ID>
EXPO_PUBLIC_ROBLOX_REDIRECT_URI=lagalaga://auth/roblox
```

Notes:
- Use your public Render URL, not `localhost`.
- Redirect URI must match the app scheme in `app.json`.

## 2. Confirm iOS App Config

Verify in `app.json`:

- `expo.scheme=lagalaga`
- `expo.ios.bundleIdentifier=com.ilpeppino.lagalaga`

## 3. Configure Backend + Roblox

In Render environment variables, confirm:

- `ROBLOX_REDIRECT_URI=lagalaga://auth/roblox`
- `NODE_ENV=production`

In Roblox Creator Dashboard, allowed redirect URIs must include:

- `lagalaga://auth/roblox`

## 4. Deploy Without EAS (Local Xcode Build)

Use this for direct installs from your Mac.

1. Connect iPhone to Mac via USB.
2. Trust computer on phone if prompted.
3. Open Xcode once and confirm your Apple account/signing are configured.

From repo root:

```sh
npm install
npx expo run:ios --device
```

Then start Metro for dev client:

```sh
npx expo start --dev-client -c
```

Notes:
- On first run, Xcode may prompt for signing fixes.
- If install is blocked, verify iPhone `Settings -> Privacy & Security -> Developer Mode`.

### Recommended For Physical Device OAuth Testing (Standalone-like)

If iPhone OAuth opens an Expo dev page instead of returning directly to the app, build and install using **Release** configuration:

```sh
rm -rf ios/build
rm -rf ~/Library/Developer/Xcode/DerivedData/lagalaga-*
npx expo run:ios --device --configuration Release
```

Why:
- `Debug` dev builds can route through Expo dev-launcher behavior on physical devices.
- `Release` behaves closer to a standalone app and fixes custom-scheme callback handling for OAuth.

After install, open the app icon directly on iPhone and test sign-in again.

## 5. Deploy With EAS (Internal Distribution)

Use this when you want cloud builds and shareable install links (via TestFlight/App Store Connect pipeline).

From repo root:

```sh
npm install
npx eas login
npx eas build --platform ios --profile preview
```

Then either:
- Upload and distribute through TestFlight, or
- Use your existing release workflow for iOS distribution.

## 6. Build And Publish To App Store Connect With EAS

Use this flow for production release to TestFlight/App Store.

### 6.1 One-time setup (Apple + EAS)

1. Ensure the iOS app exists in App Store Connect:
   - Bundle ID: `com.ilpeppino.lagalaga`
   - App name/SKU configured
2. Ensure you are logged into EAS:

```sh
npx eas login
```

3. Configure signing credentials (recommended: let EAS manage):

```sh
npx eas credentials -p ios
```

4. Configure App Store Connect auth for submit:
   - Preferred: App Store Connect API key (Issuer ID, Key ID, `.p8` key)
   - Or Apple ID session (interactive)

### 6.2 Build production iOS artifact

From repo root:

```sh
npm install
npx eas build --platform ios --profile production
```

Notes:
- Your `eas.json` production profile already has `autoIncrement: true`, so build numbers increment automatically.
- Wait for build status to become `finished` in EAS dashboard/CLI.

### 6.3 Submit build to App Store Connect

Option A (after build completes):

```sh
npx eas submit --platform ios --profile production
```

Option B (build + submit in one command):

```sh
npx eas build --platform ios --profile production --auto-submit
```

### 6.4 Complete release in App Store Connect

1. Open App Store Connect -> your app -> TestFlight.
2. Wait for Apple processing to complete for the uploaded build.
3. Add compliance/export info and testing notes if prompted.
4. Add internal/external testers and start TestFlight testing.
5. When ready, create a new App Store version, attach the approved build, complete metadata, and submit for review.
6. After approval, release manually or automatically per your release settings.

## 7. Test On Wi-Fi And Mobile Data

1. Connect iPhone to Wi-Fi.
2. Open app and test:
   - API-backed screens/actions
   - Roblox sign-in flow
3. Turn Wi-Fi off and enable mobile data.
4. Repeat tests.

Expected behavior:
- App works on both networks because it calls Render public HTTPS API.

## 8. Troubleshooting

- `Network request failed`
  - Confirm `EXPO_PUBLIC_API_URL` is valid HTTPS Render URL.
  - Check backend health:
    - `https://<YOUR_RENDER_SERVICE>.onrender.com/health`
  - If using EAS, confirm env vars are configured in EAS for the profile you built.

- OAuth returns to sign-in
  - Verify redirect URI exactly matches `lagalaga://auth/roblox` in:
    - frontend env
    - Render backend env
    - Roblox OAuth allowlist

- iPhone opens Expo page (dev build) instead of app callback
  - Use a physical-device **Release** install:
    - `npx expo run:ios --device --configuration Release`
  - Remove old dev builds / Expo Go from device before retesting.
  - Open the installed app icon directly (do not launch via Expo Go/QR flow).

- App installs but does not open on device
  - Re-check iOS signing/certificates in Xcode.
  - Confirm device is included in provisioning profile (if required by your signing setup).
