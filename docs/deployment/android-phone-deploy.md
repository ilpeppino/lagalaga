# Deploying And Testing On An Android Phone

This guide explains how to configure the app and deploy it to a physical Android device for testing on both Wi-Fi and mobile data.

## Goal

- Install the app on an Android phone (not emulator).
- Connect the app to your live Render backend.
- Verify login and API calls on Wi-Fi and cellular networks.

## Prerequisites

- Android phone with internet access.
- Node.js + npm installed.
- Android Studio (or Android SDK + platform tools) installed.
- `adb` available in your shell.
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
- Use your public Render URL, not `localhost` and not a LAN IP.
- The redirect URI must match the app scheme already configured in `app.json`.

## 2. Confirm App Config

These values should already exist in `app.json`:

- `expo.scheme=lagalaga`
- `expo.android.package=com.ilpeppino.lagalaga`
- Android intent filter for `lagalaga://auth/roblox`

## 3. Configure Backend (Render)

In Render environment variables, confirm:

- `ROBLOX_REDIRECT_URI=lagalaga://auth/roblox`
- `CORS_ORIGIN=*` (or a stricter value that still allows the app)
- `HOST=0.0.0.0`
- `NODE_ENV=production`

Then verify backend health:

```sh
curl "https://<YOUR_RENDER_SERVICE>.onrender.com/health"
```

## 4. Configure Roblox OAuth Redirects

In Roblox Creator Dashboard, make sure allowed redirect URIs include:

- `lagalaga://auth/roblox`

If this value does not match exactly, sign-in callback will fail.

## 5. Deploy To Phone (Without EAS)

You can install directly from your local machine without consuming EAS build quota.

### Option A: Local Dev Build (recommended)

Use this when you want fast iteration and repeated installs during testing.

1. Enable Developer options + USB debugging on your Android phone.
2. Connect phone by USB and verify:

```sh
adb devices
```

3. Build and install from repo root:

```sh
npm install
npx expo run:android --device
```

4. Start Metro for dev client:

```sh
npx expo start --dev-client -c
```

Notes:
- This installs a debug/dev build directly on the phone.
- The app still uses your public Render API URL from `.env`.

### Option B: Local APK Build + Manual Install

Use this when you want an APK file without EAS.

```sh
npm install
cd android
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Then open the app on the phone.

## 6. Optional: EAS Internal Distribution

If you prefer cloud builds, EAS remains available:

From repo root:

```sh
npm install
npx eas login
npx eas build --platform android --profile preview
```

Why `preview`:
- The repo `eas.json` has `preview.distribution=internal`, which is suitable for device testing outside Play Store.

## 7. Install On Android Phone (EAS path only)

1. Open the EAS build link on your Android phone.
2. Download the generated APK.
3. Allow "Install unknown apps" if Android prompts.
4. Install and open the app.

## 8. Test On Wi-Fi And Mobile Data

1. Connect phone to Wi-Fi.
2. Open app and test:
   - API-backed screens/actions
   - Roblox sign-in flow
3. Turn Wi-Fi off and enable mobile data.
4. Repeat the same tests.

Expected behavior:
- App works on both networks because it calls the public Render URL.

## 9. Troubleshooting

- `Network request failed`
  - Check `.env` `EXPO_PUBLIC_API_URL` points to valid Render HTTPS URL.
  - Confirm Render service is running and `/health` responds.
  - If you used EAS, confirm EAS env vars are set for the build profile; `.env` is not uploaded by default.

- OAuth returns to sign-in or fails callback
  - Verify both Render and Roblox use exactly `lagalaga://auth/roblox`.
  - Confirm frontend `.env` uses the same redirect URI.

- Build installs but app is old
  - Rebuild with EAS and reinstall the newest APK from the latest build link.
  - For local build, run `npx expo run:android --device` again or reinstall latest debug APK via `adb install -r`.
