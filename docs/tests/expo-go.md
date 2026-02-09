# Testing With Expo Go (Store Client)

This guide covers testing OAuth sign-in and API connectivity using **Expo Go** on a physical device.

## Preconditions

- You are signed into Expo locally:
  - `npx expo whoami` should return your account.
- Backend is reachable from the phone over LAN (same Wi-Fi).

## Config Checklist (Expo Go)

1. Expo app config
   - `app.json`:
     - `expo.owner` must be `ilpeppino`
     - `expo.slug` must be `lagalaga`

2. Frontend env (repo root)
   - `.env`:
     - `EXPO_PUBLIC_API_URL=http://<YOUR_LAN_IP>:3001`
     - `EXPO_PUBLIC_ROBLOX_REDIRECT_URI=https://auth.expo.io/@ilpeppino/lagalaga`

3. Backend env (`backend/`)
   - `backend/.env`:
     - `HOST=0.0.0.0`
     - `PORT=3001`
     - `ROBLOX_REDIRECT_URI=https://auth.expo.io/@ilpeppino/lagalaga`

4. Roblox OAuth application (Creator Dashboard)
   - Allowed redirect URIs must include **exactly**:
     - `https://auth.expo.io/@ilpeppino/lagalaga`

## Run Steps

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

3. Verify backend is reachable from your dev machine
```sh
curl "http://<YOUR_LAN_IP>:3001/health"
```

4. Start Expo (clear cache)
```sh
cd ..
npx expo start -c
```

5. Open in Expo Go
- Scan the QR code with the device camera (iOS) or Expo Go (Android).

## What To Test

1. API connectivity
- From the app, trigger an action that calls the API.
- If you see `Network request failed`, fix `EXPO_PUBLIC_API_URL` to the correct LAN IP and restart `npx expo start -c`.

2. Roblox sign-in (Expo Auth Proxy)
- Tap "Sign in with Roblox".
- Complete the Roblox consent page.
- You should return to the app and land on `/sessions`.

If you end on an Expo page saying something like "close this screen to go back to the app" and the app returns to sign-in:
- The auth proxy cookie handshake likely didn’t happen.
- Confirm the app started auth via `https://auth.expo.io/@ilpeppino/lagalaga/start?...` (client code path).
- Confirm `ROBLOX_REDIRECT_URI` is **exactly** `https://auth.expo.io/@ilpeppino/lagalaga` on the backend.

## Reset / Troubleshooting

- Clear Expo cache:
  - `npx expo start -c`
- If the backend IP changed:
  - update `.env` `EXPO_PUBLIC_API_URL`, then restart Expo with cache clear.
- If Roblox says "URI is invalid for this application":
  - you changed redirect URI without updating Roblox allowlist, or you edited the wrong Roblox OAuth app for the configured `ROBLOX_CLIENT_ID`.
