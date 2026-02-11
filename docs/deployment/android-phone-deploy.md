# Deploying And Testing On An Android Phone

This guide explains how to configure the app and deploy it to a physical Android device for testing on both Wi-Fi and mobile data.

## Goal

- Install the app on an Android phone (not emulator).
- Connect the app to your live Render backend.
- Verify login and API calls on Wi-Fi and cellular networks.

## Prerequisites

- Android phone with internet access.
- Expo/EAS account.
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

## 5. Build Android App (EAS Internal Distribution)

From repo root:

```sh
npm install
npx eas login
npx eas build --platform android --profile preview
```

Why `preview`:
- The repo `eas.json` has `preview.distribution=internal`, which is suitable for device testing outside Play Store.

## 6. Install On Android Phone

1. Open the EAS build link on your Android phone.
2. Download the generated APK.
3. Allow "Install unknown apps" if Android prompts.
4. Install and open the app.

## 7. Test On Wi-Fi And Mobile Data

1. Connect phone to Wi-Fi.
2. Open app and test:
   - API-backed screens/actions
   - Roblox sign-in flow
3. Turn Wi-Fi off and enable mobile data.
4. Repeat the same tests.

Expected behavior:
- App works on both networks because it calls the public Render URL.

## 8. Troubleshooting

- `Network request failed`
  - Check `.env` `EXPO_PUBLIC_API_URL` points to valid Render HTTPS URL.
  - Confirm Render service is running and `/health` responds.

- OAuth returns to sign-in or fails callback
  - Verify both Render and Roblox use exactly `lagalaga://auth/roblox`.
  - Confirm frontend `.env` uses the same redirect URI.

- Build installs but app is old
  - Rebuild with EAS and reinstall the newest APK from the latest build link.
