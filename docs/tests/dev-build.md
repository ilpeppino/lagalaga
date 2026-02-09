# Testing With A Development Build (Dev Client)

This guide covers testing OAuth sign-in and API connectivity using a **development build** (not Expo Go).

## Why This Is Different

- **Expo Go** cannot reliably receive custom scheme redirects like `lagalaga://...`.
- A **dev build** can, so the preferred redirect is the app scheme: `lagalaga://auth/roblox`.

## Config Checklist (Dev Build)

1. Expo app config
   - `app.json`:
     - `expo.scheme` is `lagalaga`
     - Android deep link handling is configured (intent filters) for `lagalaga://auth/roblox`
     - `android.package` is `com.ilpeppino.lagalaga`

2. Frontend env (repo root)
   - `.env`:
     - `EXPO_PUBLIC_API_URL=http://<YOUR_LAN_IP>:3001`
     - `EXPO_PUBLIC_ROBLOX_REDIRECT_URI=lagalaga://auth/roblox`

3. Backend env (`backend/`)
   - `backend/.env`:
     - `HOST=0.0.0.0`
     - `PORT=3001`
     - `ROBLOX_REDIRECT_URI=lagalaga://auth/roblox`

4. Roblox OAuth application (Creator Dashboard)
   - Allowed redirect URIs must include **exactly**:
     - `lagalaga://auth/roblox`

## Build + Run (Local Native)

1. Install deps
```sh
npm install
```

2. Start backend
```sh
cd backend
npm install
npm run dev
```

3. Android (device)
```sh
cd ..
npx expo run:android
npx expo start --dev-client -c
```

4. iOS (device)

Requires Xcode + proper signing setup for a physical device.
```sh
cd ..
npx expo run:ios --device
npx expo start --dev-client -c
```

## Build + Run (EAS Development Build)

If you prefer not to compile locally:
```sh
npm install
npx eas login
npx eas build --profile development --platform android
npx eas build --profile development --platform ios
npx expo start --dev-client -c
```

## What To Test

1. Deep link return
- Start Roblox sign-in.
- After consent, the browser should redirect to `lagalaga://auth/roblox?...` and reopen the app.
- The app should land on `/sessions`.

2. Token exchange
- Confirm you can navigate into authenticated screens that require `apiClient.auth.me()`.
- If you loop back to sign-in, check backend logs for `/auth/roblox/callback` errors.

## Switching Between Expo Go And Dev Build

- Expo Go redirect:
  - `https://auth.expo.io/@ilpeppino/lagalaga`
- Dev build redirect:
  - `lagalaga://auth/roblox`

When switching, you must update:
- `.env` `EXPO_PUBLIC_ROBLOX_REDIRECT_URI`
- `backend/.env` `ROBLOX_REDIRECT_URI`
- Roblox app allowlist to include whichever redirect you are using

Then restart:
```sh
cd backend && npm run dev
cd .. && npx expo start -c
```
