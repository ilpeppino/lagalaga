# Android Local Build and Device Installation Guide

**App**: Lagalaga  
**Production package**: `com.ilpeppino.lagalaga`  
**Dev package**: `com.ilpeppino.lagalaga.dev`  
**React Native**: 0.81.5 / Expo SDK ~54.0.33  
**Gradle**: 8.14.3 / Min SDK: 24 / Target SDK: 35  
**Last verified**: 2026-02-27

---

## Quick Reference

| Goal | Command |
|---|---|
| Build + install debug via Expo | `APP_VARIANT=prod npx expo run:android` |
| Build debug APK via Gradle | `cd android && ./gradlew assembleDebug` |
| Install APK via ADB | `adb install -r app/build/outputs/apk/debug/app-debug.apk` |
| Get debug SHA-1 | `cd android && ./gradlew signingReport` |
| Test deep link | `adb shell am start -W -a android.intent.action.VIEW -d "lagalaga://auth/roblox"` |
| Test Google deep link | `adb shell am start -W -a android.intent.action.VIEW -d "lagalaga://auth/google?code=1&state=2"` |
| View live logs | `adb logcat -s ReactNativeJS` |

---

## Section 1 — Architecture Summary

### Expo type: Bare workflow (prebuild)

This project uses the **Expo bare workflow with prebuild**. The `android/` directory exists and contains a complete native Android project with `MainActivity.kt` and `MainApplication.kt`. It is **not** Expo Go-compatible (it uses `expo-dev-client` and native modules that require a custom build).

Evidence in the repo:
- `android/` directory exists with full Gradle project
- `MainActivity.kt` and `MainApplication.kt` contain `@generated begin expo-splashscreen - expo prebuild` comments
- `package.json` lists `expo-dev-client` as a dependency
- `eas.json` `development` profile sets `"developmentClient": true`

**This means**: You cannot simply install Expo Go and scan a QR code. You must build a custom APK.

### App variant system

`app.config.ts` uses an `APP_VARIANT` environment variable to switch between two configurations:

| Variant | Package | Scheme | App name |
|---|---|---|---|
| `prod` (default) | `com.ilpeppino.lagalaga` | `lagalaga` | Lagalaga |
| `dev` | `com.ilpeppino.lagalaga.dev` | `lagalaga-dev` | Lagalaga Dev |

Always set `APP_VARIANT=prod` when building for device testing that exercises real production flows (Roblox login, Google login). Use `APP_VARIANT=dev` only when running a local Metro server.

### Google login method: backend-mediated browser OAuth (not native SDK)

LagaLaga does **not** use the Android native Google Sign-In SDK (`GoogleSignInClient` or `CredentialManager`). The flow is:

1. App calls `GET https://lagalaga-api.onrender.com/api/auth/google/start`
2. Backend returns a Google authorization URL (with PKCE code challenge)
3. App opens that URL in an in-app browser (`expo-web-browser`)
4. User authenticates with Google in the browser
5. Google redirects to the **HTTPS backend callback**: `https://lagalaga-api.onrender.com/api/auth/google/callback?code=...&state=...`
6. Backend completes the code exchange and then redirects (302) to an app deep link such as: `lagalaga://auth/google?...`
7. Android intercepts the `lagalaga://` deep link and opens the app
8. The app’s Google callback route extracts parameters and completes the in-app session (stores JWTs / routes user)

**Consequence**: The debug SHA-1 is NOT required for Google Sign-In to work. SHA-1 matters only for Firebase services (FCM push notifications). Google Sign-In errors on debug builds are typically caused by: (a) a `redirect_uri_mismatch` due to the Web OAuth client missing `https://lagalaga-api.onrender.com/api/auth/google/callback`, (b) a backend `GOOGLE_REDIRECT_URI` that does not match that HTTPS callback exactly, or (c) a missing/incorrect deep link route for `/auth/google` in the app.

**Status**: Backend is implemented. Mobile must include (a) a "Sign in with Google" button (typically `app/auth/sign-in.tsx`) and (b) a Google callback route handling `lagalaga://auth/google?...`. Android must have an intent filter that matches `/auth/google` deep links.

### Roblox login method: same browser-based OAuth

Roblox login uses the same pattern:

1. App calls `POST https://lagalaga-api.onrender.com/auth/roblox/start` with a PKCE code challenge
2. Backend returns a Roblox authorization URL
3. App opens it via `Linking.openURL` (iOS) or `expo-web-browser` (Android)
4. Roblox redirects to `lagalaga://auth/roblox`
5. Android intercepts via intent filter; Expo Router routes to `app/auth/roblox.tsx`
6. Screen sends `code`, `state`, `codeVerifier` to `POST /auth/roblox/callback`
7. Backend returns JWT tokens

Roblox login is **fully implemented** end-to-end.

### Backend

- Production: `https://lagalaga-api.onrender.com`
- Local dev: `http://<YOUR_MACHINE_IP>:3001` — note that `android/app/src/debug/AndroidManifest.xml` sets `android:usesCleartextTraffic="true"`, so HTTP works in debug builds

### Required environment variables (frontend)

These must be present in your local `.env` file before building. The repo's `.env` already contains them for production use:

```bash
EXPO_PUBLIC_API_URL=https://lagalaga-api.onrender.com
EXPO_PUBLIC_ROBLOX_REDIRECT_URI=lagalaga://auth/roblox
EXPO_PUBLIC_ROBLOX_CLIENT_ID=3756642473415882345
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=697006480494-ijg20hit5lgl1idj9lu839a7lptrvam4.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=697006480494-f34uq29h24oqf2r2539igs0m5mjk9d7j.apps.googleusercontent.com
```

---

## Section 2 — Device Preparation

### Prerequisites on your development machine

1. **Node.js 20+**: `node --version`
2. **Java 17 or 21**: `java -version` — must be JDK, not JRE. Download from [Adoptium](https://adoptium.net/).
3. **Android SDK**: Install via [Android Studio](https://developer.android.com/studio) or `sdkmanager`
   - Required components: SDK Platform 35, Build Tools 35.0.0, NDK 27.1.12297006
4. **ANDROID_HOME** or **ANDROID_SDK_ROOT** environment variable set to your SDK path
   - Mac/Linux default: `~/Library/Android/sdk`
   - Add to `.zshrc`/`.bashrc`:
     ```bash
     export ANDROID_HOME=$HOME/Library/Android/sdk
     export PATH=$PATH:$ANDROID_HOME/platform-tools
     ```
5. **ADB** (comes with Android SDK platform-tools): `adb --version`

### Enable Developer Options on your Android device

1. Open **Settings → About phone**
2. Tap **Build number** seven times rapidly
3. You will see: "You are now a developer!"
4. Go back to **Settings → System → Developer options** (location varies by manufacturer; may be under **Additional settings**)
5. Enable **Developer options** (the main toggle at the top)
6. Enable **USB debugging**
7. On some devices, also enable **Install via USB** or **USB install**

**Why required**: USB debugging allows ADB to communicate with the device, push APKs, and stream logs. Without it, `adb devices` will show the device as `unauthorized`.

### Connect and verify your device

```bash
adb devices
```

Expected output:
```
List of devices attached
XXXXXXXXXXXXXXXX    device
```

If you see `unauthorized` instead of `device`:
- On your phone, look for the popup: "Allow USB debugging from this computer?"
- Tap **Always allow from this computer** and then **Allow**
- Run `adb devices` again

If no device appears at all:
- Try a different USB cable (data cable, not charge-only)
- Try a different USB port
- On Windows: install OEM USB drivers for your device brand
- Run `adb kill-server && adb start-server` and reconnect

To verify ADB works before building:
```bash
adb shell echo "connection ok"
# Should print: connection ok
```

---

## Section 3 — Method A: Using `npx expo run:android` (Recommended for Development)

This method compiles the native Android project and installs it directly onto your connected device via ADB. Metro bundler serves the JS bundle live, so JS changes reload without rebuilding.

### A1: Can I use Expo Go?

**No.** This project uses `expo-dev-client`, `expo-notifications`, `expo-secure-store`, and other modules that require native code not present in the Expo Go sandbox. Scanning a QR code in Expo Go will either fail or crash immediately.

### A2: Build and install via `expo run:android`

#### Step 1: Install dependencies (if not done)

```bash
cd /path/to/lagalaga
npm install
```

#### Step 2: Confirm your `.env` file is present

```bash
ls .env
```

The `.env` file must exist with at minimum:
```bash
EXPO_PUBLIC_API_URL=https://lagalaga-api.onrender.com
EXPO_PUBLIC_ROBLOX_REDIRECT_URI=lagalaga://auth/roblox
```

If testing against a local backend instead of production:
```bash
# Find your machine's local IP
ipconfig getifaddr en0       # macOS Wi-Fi
ip route get 8.8.8.8 | awk '{print $7}' # Linux

# Edit .env
EXPO_PUBLIC_API_URL=http://192.168.1.X:3001
```

Your device must be on the same Wi-Fi network as your machine for local backend testing.

#### Step 3: Run for production variant

```bash
APP_VARIANT=prod npx expo run:android
```

This command:
1. Runs `expo prebuild` (regenerates `android/` from `app.config.ts` if needed — though since `android/` already exists, it only updates generated files)
2. Compiles the native Android project using Gradle
3. Installs the resulting APK on your connected ADB device
4. Starts the Metro bundler

**First build takes 5–15 minutes** (Gradle downloads dependencies, compiles all native code). Subsequent builds take 30–90 seconds for incremental changes.

#### What it builds

- Build type: **debug** (default)
- Package: `com.ilpeppino.lagalaga`
- Signing: Uses `android/app/debug.keystore` (automatically)
- Cleartext HTTP traffic: **allowed** (from `android/app/src/debug/AndroidManifest.xml`)

#### Metro bundler

After installation, Metro bundler starts and serves the JavaScript bundle. Keep the terminal open. The app connects to Metro on launch.

To restart Metro only (without rebuilding native):
```bash
npx expo start --dev-client
```

Then tap the Expo Go-style overlay in the app to connect.

To clear Metro cache:
```bash
npx expo start --dev-client --clear
```

#### Rebuild after native code changes

Native code changes (modifications to `android/`, adding new native packages, `app.config.ts` changes) require a full rebuild:

```bash
APP_VARIANT=prod npx expo run:android
```

JS-only changes never require a rebuild.

#### Step 4: Confirm deep link scheme works

After the app installs, test that the `lagalaga://` scheme is registered:

```bash
adb shell am start -W \
  -a android.intent.action.VIEW \
  -d "lagalaga://auth/roblox" \
  com.ilpeppino.lagalaga
```

```bash
adb shell am start -W \
  -a android.intent.action.VIEW \
  -d "lagalaga://auth/google?code=test_code&state=test_state" \
  com.ilpeppino.lagalaga
```

Expected: The Lagalaga app opens (or comes to foreground) and attempts to process the `lagalaga://auth/roblox` or `lagalaga://auth/google?...` deep link. You should see the RobloxCallback or Google callback screen briefly before it fails (since no real `code` parameter is present).

If this does not open the app, your Android intent filters likely only match `/auth/roblox`. Update the manifest (or Expo config intentFilters) to also match `/auth/google`.

---

## Section 4 — Method B: Using `gradlew` (Native Android Build)

Use this method when you need an APK file to distribute, test on multiple devices, or build without Metro.

### Step 1: Navigate to the android directory

```bash
cd /path/to/lagalaga/android
```

All `gradlew` commands are run from this directory.

### Step 2: Clean previous build artifacts

```bash
./gradlew clean
```

**Why**: Cached build artifacts from previous builds can cause confusing errors (stale classes, wrong signed APK). Always clean before a release candidate build. For fast iterative debug builds, you can skip this.

Expected output ends with:
```
BUILD SUCCESSFUL in Xs
```

### Step 3: Build debug APK

```bash
./gradlew assembleDebug
```

This compiles the full native project including all React Native and Expo native modules. The JS bundle is **embedded** in the APK (not served via Metro), which means:
- No Metro server needed
- The JS is the version bundled at build time
- This is a standalone APK you can share and install anywhere

**Output APK location**:
```
android/app/build/outputs/apk/debug/app-debug.apk
```

Build time: 5–15 minutes first run, 1–3 minutes incremental.

**What will fail**: If `node_modules` is missing or if `npm install` has not been run, the build fails because `android/settings.gradle` calls `node` to resolve package paths.

### Step 4: Install to device via ADB

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

The `-r` flag replaces any existing installation (same package name). Without `-r`, the install fails if the app is already installed.

Expected output:
```
Performing Streamed Install
Success
```

If you see `INSTALL_FAILED_UPDATE_INCOMPATIBLE`: The device has a version signed with a different key (e.g., a Play Store build vs a local debug build). Uninstall the existing app first:

```bash
adb uninstall com.ilpeppino.lagalaga
adb install app/build/outputs/apk/debug/app-debug.apk
```

### Debug vs Release builds

| Property | Debug | Release |
|---|---|---|
| Signing key | `android/app/debug.keystore` (fixed, in repo) | Requires your release keystore |
| Minification | No | Optional (controlled by `enableMinifyInReleaseBuilds`) |
| JS bundle | Embedded at build time | Embedded at build time |
| Cleartext HTTP | Allowed (debug manifest) | Not allowed |
| `BuildConfig.DEBUG` | `true` | `false` |
| SHA-1 fingerprint | Debug key SHA-1 | Release key SHA-1 |

### Get the debug SHA-1 fingerprint

```bash
cd /path/to/lagalaga/android
./gradlew signingReport
```

Look for the `debug` variant output:
```
Variant: debug
Config: debug
Store: /path/to/lagalaga/android/app/debug.keystore
Alias: androiddebugkey
MD5: XX:XX:XX:...
SHA1: AA:BB:CC:DD:...  ← THIS IS THE DEBUG SHA-1
SHA-256: ...
```

The debug keystore values (from `android/app/build.gradle`):
- Store file: `android/app/debug.keystore`
- Store password: `android`
- Key alias: `androiddebugkey`
- Key password: `android`

You can also get the SHA-1 directly with `keytool`:
```bash
keytool -printcert -file android/app/debug.keystore
# OR
keytool -list -v \
  -keystore android/app/debug.keystore \
  -alias androiddebugkey \
  -storepass android \
  -keypass android
```

**Why SHA-1 matters for Firebase (FCM push notifications)**: Firebase validates the app signature before authorizing push token registration. The debug SHA-1 from this keystore must be registered in [Firebase Console](https://console.firebase.google.com/project/lagalaga-19985/settings/general) under the `com.ilpeppino.lagalaga` Android app to receive push notifications in debug builds.

**SHA-1 does NOT affect Google Sign-In** in LagaLaga (which uses browser-based OAuth, not the native SDK).

---

## Section 5 — Testing Google Login on Debug Builds

### Current status

The backend is fully implemented. The mobile "Sign in with Google" button is pending implementation in `app/auth/sign-in.tsx`. Once added, follow these steps to verify it works on a debug build.

### What the Google login flow looks like

1. User taps "Sign in with Google"
2. App calls `GET https://lagalaga-api.onrender.com/api/auth/google/start`
3. In-app browser opens a Google OAuth consent screen
4. User signs in and grants consent
5. Google redirects to `https://lagalaga-api.onrender.com/api/auth/google/callback?code=...&state=...`
6. Backend completes auth and redirects to `lagalaga://auth/google?...`
7. Android opens the app; the Google callback route runs
8. The app stores JWT tokens and routes the user (Roblox gate if not connected)

### Verify the deep link intercept for Google callback

```bash
# Simulate Google redirecting back to the app
adb shell am start -W \
  -a android.intent.action.VIEW \
  -d "lagalaga://auth/google?code=test_code&state=test_state" \
  com.ilpeppino.lagalaga
```

Expected: the app opens and the Google callback route runs. It should fail with an `AUTH_INVALID_STATE` (or equivalent) because `test_state` is not a valid state. This confirms the deep link routing is wired.

### Inspect logcat for Google login errors

```bash
adb logcat -s ReactNativeJS,GoogleSignIn | grep -i "google\|auth\|oauth"
```

Or for broader React Native logs:
```bash
adb logcat -s ReactNativeJS
```

### Common error codes and their meanings

| Error code | Cause | Fix |
|---|---|---|
| `AUTH_OAUTH_FAILED` (backend) | `GOOGLE_CLIENT_ID` env var on backend does not match the OAuth client used | Verify `GOOGLE_CLIENT_ID` in backend env matches the Web Application client at [GCP Console](https://console.cloud.google.com/apis/credentials?project=lagalaga-19985) |
| `redirect_uri_mismatch` (in browser) | HTTPS callback missing or mismatch | Ensure the Web Application OAuth client has `https://lagalaga-api.onrender.com/api/auth/google/callback` in Authorized redirect URIs, and ensure backend `GOOGLE_REDIRECT_URI` matches exactly. |
| `AUTH_INVALID_STATE` (backend) | OAuth state expired (10-minute TTL) or the user restarted the flow | Normal; user must restart sign-in from scratch |
| `ACCOUNT_LINK_CONFLICT` (409) | Google account is already linked to a different LagaLaga user | Expected; the app shows a conflict alert |
| `DEVELOPER_ERROR` | Only occurs with native Android Google Sign-In SDK (not used here) | Not applicable to LagaLaga |
| `12500` | Only occurs with native Google Sign-In SDK | Not applicable to LagaLaga |

---

## Section 6 — Testing Roblox Login

Roblox login is fully implemented and is the primary sign-in method.

### Step 1: Launch the app and navigate to sign-in

From a fresh install, the app opens the sign-in screen. Tap **"Sign in with Roblox"**.

### Step 2: Observe the browser flow

An in-app browser (or external browser on iOS) opens the Roblox OAuth consent screen. Sign in with any Roblox account age 13+.

### Step 3: Confirm the deep link callback

After authentication, Roblox redirects to `lagalaga://auth/roblox?code=...&state=...`. Android intercepts this and opens the app. The `app/auth/roblox.tsx` screen processes the callback.

### Step 4: Verify the `robloxConnected` flag

After successful login, navigate to the Me screen (`/me`). The Roblox section should show:
- A green "Connected" badge
- The Roblox username and/or display name
- The avatar headshot image

This confirms the backend returned a user with `robloxConnected: true`.

### Manual deep link test for Roblox callback

```bash
# Simulate the Roblox OAuth redirect
adb shell am start -W \
  -a android.intent.action.VIEW \
  -d "lagalaga://auth/roblox?code=fake_code&state=fake_state" \
  com.ilpeppino.lagalaga
```

The app opens and navigates to `app/auth/roblox.tsx`. Because `fake_state` does not match a stored PKCE state, the screen redirects back to sign-in. This is the expected behavior confirming the intent filter works.

### Inspect Roblox login logs

```bash
adb logcat -s ReactNativeJS | grep -i "roblox\|oauth\|token"
```

### Testing with a local backend

To test Roblox login against a local backend:

1. Start the backend: `cd backend && npm run dev`
2. Find your machine IP: `ipconfig getifaddr en0` (macOS)
3. Update `.env`: `EXPO_PUBLIC_API_URL=http://192.168.1.X:3001`
4. Rebuild: `APP_VARIANT=prod npx expo run:android`
5. Check that `ROBLOX_REDIRECT_URI=lagalaga://auth/roblox` is set in `backend/.env`

**Note**: The Roblox OAuth app must have `lagalaga://auth/roblox` as an allowed redirect URI in the [Roblox Developer portal](https://create.roblox.com/credentials). This is already configured for the production client (`ROBLOX_CLIENT_ID=3756642473415882345`).

---

## Section 7 — Testing Account Linking

### Google-first user (no Roblox)

1. Sign in with Google (when implemented)
2. Expected: User is logged in but sees a "Connect Roblox" prompt (Roblox gate)
3. Backend: A new `app_users` row exists with `roblox_user_id = NULL`
4. Backend: A `user_platforms` row exists with `platform_id = 'google'`
5. Check in Supabase: `SELECT id, roblox_user_id FROM app_users ORDER BY created_at DESC LIMIT 5`

### Roblox-first user

1. Sign in with Roblox
2. Expected: User is logged in, Roblox features accessible immediately
3. Backend: A `user_platforms` row with `platform_id = 'roblox'`

### Cross-link: Google user links their Roblox account

1. Sign in with Google (Google-first user)
2. On Me screen, tap **Connect Roblox**
3. Complete Roblox OAuth
4. Expected: Roblox connects successfully; `robloxConnected` becomes `true`
5. Backend: A second `user_platforms` row added with `platform_id = 'roblox'`; `app_users.roblox_user_id` is updated

### Conflict scenario

1. **Device A**: Sign in with Roblox account `R` → creates LagaLaga user A
2. **Device B**: Sign in with Google account G → creates LagaLaga user B
3. On Device B: Tap Connect Roblox → use the SAME Roblox account `R`
4. Expected: Backend returns HTTP 409 with `code: "ACCOUNT_LINK_CONFLICT"`
5. Expected mobile behavior: Alert dialog — "This Roblox account is already linked to another LagaLaga account." — with options to log in with original method or contact support

Verify in `adb logcat`:
```bash
adb logcat -s ReactNativeJS | grep -i "ACCOUNT_LINK_CONFLICT\|conflict"
```

---

## Section 8 — Release Candidate Test (Local Signed Build)

A local signed release build lets you test production behavior (no Metro, minification optional, cleartext HTTP disabled) without going through EAS or Google Play.

### Step 1: You need a release keystore

For testing purposes you can use the existing debug keystore as the release signing config (already set in `android/app/build.gradle` — the `release` build type also references `signingConfigs.debug`). This means a local release build is signed with the debug key.

**Important distinction**:
- This local release build uses the **debug key SHA-1**
- The Play Store distributes builds signed with the **Play App Signing key** (a different SHA-1)
- Push notifications to a locally-signed release build use the **debug key SHA-1** registered in Firebase
- Push notifications to Play Store builds use the **Play App Signing SHA-1** registered in Firebase

### Step 2: Build the release APK

```bash
cd /path/to/lagalaga/android
./gradlew clean assembleRelease
```

Output APK location:
```
android/app/build/outputs/apk/release/app-release.apk
```

### Step 3: Install the release APK

```bash
cd android
adb uninstall com.ilpeppino.lagalaga || true  # Ignore failure if not installed
adb install -r app/build/outputs/apk/release/app-release.apk
```

> **Note:** `adb uninstall` returns a non-zero exit code if the package is not present, which would normally cause a shell script to stop when using `set -e` or in CI pipelines. Appending `|| true` ensures the script continues even if the app is not installed.

### Step 4: What to verify in a release build

- The app opens without crashing
- The splash screen appears correctly
- There is no "Dev menu" or "Metro connection" overlay
- Sign-in with Roblox works (no cleartext HTTP — ensure `EXPO_PUBLIC_API_URL` points to the HTTPS production backend)
- Navigate to Me screen and confirm data loads

### What differs from the EAS production build

The EAS production build uses Play App Signing, which replaces your upload key with Google's managed signing key. A locally-assembled release APK uses whatever keystore is configured in `android/app/build.gradle` (currently the debug keystore for releases). For a production upload:

1. Generate a proper release keystore:
   ```bash
   keytool -genkey -v \
     -keystore lagalaga-release.jks \
     -alias lagalaga-release \
     -keyalg RSA \
     -keysize 2048 \
     -validity 10000
   ```
2. Reference it in `android/app/build.gradle` under `signingConfigs.release`
3. Never commit the `.jks` file to the repository

For uploading to Play Store, use EAS (`eas build --platform android --profile production`) rather than a locally-assembled release to benefit from Play App Signing.

---

## Section 9 — Troubleshooting Matrix

| Symptom | Likely Cause | Fix | Verify |
|---|---|---|---|
| `adb: device not found` | USB debugging not enabled, wrong cable, or ADB server out of sync | Enable USB debugging on device; run `adb kill-server && adb start-server`; try different cable | `adb devices` should show device as `device` not `unauthorized` |
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | App already installed with a different signing key | `adb uninstall com.ilpeppino.lagalaga` then reinstall | `adb shell pm list packages | grep ilpeppino` |
| Gradle build fails with `node: not found` | Node.js not in PATH when running `./gradlew` | Add Node.js to PATH; or run `which node` to confirm location; open terminal from the correct shell profile | `node --version` in the same terminal session |
| `ANDROID_SDK_ROOT is not set` | ANDROID_HOME/ANDROID_SDK_ROOT env var missing | Add `export ANDROID_HOME=$HOME/Library/Android/sdk` to `.zshrc` and `source ~/.zshrc` | `echo $ANDROID_HOME` returns a valid path |
| Metro bundler fails to connect | Wrong IP address in `.env` or device not on same network | Check `EXPO_PUBLIC_API_URL` for local builds; ensure phone and laptop are on same Wi-Fi | `adb logcat -s ReactNativeJS` shows "Could not connect to server" |
| App crashes on launch with "Unable to load script" | Metro bundler not running or bundle not embedded | For `expo run:android`, keep Metro running in the terminal; for `assembleDebug` the bundle should be embedded — rebuild with `./gradlew clean assembleDebug` | `adb logcat -s ReactNativeJS` |
| Roblox login: browser opens then app doesn't resume | Intent filter not matching `lagalaga://auth/roblox` | Check `android/app/src/main/AndroidManifest.xml` has intent filter for `android:scheme="lagalaga"` + `android:host="auth"` | `adb shell am start -d "lagalaga://auth/roblox"` opens app |
| Roblox login: "state mismatch" error | PKCE state stored in `oauthTransientStorage` expired or wasn't saved | User must restart the sign-in flow; normal if they backgrounded the app for too long | `adb logcat -s ReactNativeJS | grep state` |
| Push notifications not received on debug build | Debug key SHA-1 not registered in Firebase | Run `./gradlew signingReport`, copy debug SHA-1, add to [Firebase Console](https://console.firebase.google.com/project/lagalaga-19985/settings/general) | Push tokens should register in `user_push_tokens` table after login |
| `./gradlew` command not found | Running from wrong directory or file not executable | `cd android` first; if still fails: `chmod +x gradlew` | `ls -la gradlew` shows `x` permission |
| Build fails: `SDK location not found` | `local.properties` file missing in `android/` | Create `android/local.properties` with `sdk.dir=/Users/<you>/Library/Android/sdk` | `cat android/local.properties` shows correct path |
| Google login: `redirect_uri_mismatch` | HTTPS callback missing or mismatch: `https://lagalaga-api.onrender.com/api/auth/google/callback` | Add the HTTPS callback to the Web OAuth client and set backend `GOOGLE_REDIRECT_URI` to the same value. | Error message in browser is explicit about the mismatch |
| Build fails with `Duplicate class kotlin.collections` | Kotlin version conflict between project dependencies | Run `./gradlew dependencies | grep kotlin` to identify conflict; update `android/build.gradle` kotlin classpath version | `./gradlew assembleDebug --stacktrace` shows specific class path |
| `cleartext HTTP traffic not permitted` (release build) | Release build does not allow HTTP; API URL is HTTP | Use `EXPO_PUBLIC_API_URL=https://lagalaga-api.onrender.com` (never HTTP in release) | `adb logcat -s OkHttp,NetworkSecurityConfig` shows blocked URLs |

---

## Section 10 — Pre-Play Upload Checklist

Complete this checklist before submitting any build to Google Play.

**App identity**
- [ ] `applicationId` is `com.ilpeppino.lagalaga` (confirmed in `android/app/build.gradle`)
- [ ] `APP_VARIANT` is `prod` (not `dev`) during the build
- [ ] `versionCode` in `android/app/build.gradle` is greater than the current Play Store version (EAS auto-increments; local builds require manual increment)
- [ ] `versionName` is updated to match the release (currently `"1.0.0"`)

**Environment / URLs**
- [ ] `EXPO_PUBLIC_API_URL` is `https://lagalaga-api.onrender.com` (not `localhost` or a local IP)
- [ ] No `.env.local` override pointing to a local backend is active during the build
- [ ] `EXPO_PUBLIC_ROBLOX_REDIRECT_URI` is `lagalaga://auth/roblox`

**Signing**
- [ ] Release build uses the correct upload keystore (not the debug keystore for production Play submissions)
- [ ] Play App Signing is confirmed active in Play Console → App integrity for `com.ilpeppino.lagalaga`
- [ ] The Play App Signing key SHA-1 (not the upload key SHA-1) is registered in Firebase Console for FCM

**Google OAuth**
- [ ] The Web Application OAuth client in GCP project `lagalaga-19985` has `https://lagalaga-api.onrender.com/api/auth/google/callback` in Authorized redirect URIs
- [ ] `GOOGLE_CLIENT_ID` is set in the production backend environment (Render)
- [ ] `GOOGLE_REDIRECT_URI=https://lagalaga-api.onrender.com/api/auth/google/callback` is set in the production backend environment
- [ ] OAuth consent screen is published ("In production" status, not "Testing")

**Testing**
- [ ] App installed from Play internal test track (not sideloaded) and login tested
- [ ] Roblox login tested: browser opens, redirect works, user is logged in
- [ ] Roblox `robloxConnected: true` confirmed in Me screen
- [ ] Deep link `lagalaga://auth/roblox` confirmed working: `adb shell am start -d "lagalaga://auth/roblox" com.ilpeppino.lagalaga`
- [ ] Push notification delivery confirmed on Play-track build
- [ ] App opens correctly from cold start (splash screen → sign-in or sessions list)
- [ ] No crash on clean install

---

## Appendix: SDK and Build Tool Versions (verified from `node_modules`)

| Component | Version |
|---|---|
| Expo SDK | ~54.0.33 |
| React Native | 0.81.5 |
| Gradle wrapper | 8.14.3 |
| Android Build Tools | 35.0.0 |
| Compile SDK | 35 |
| Target SDK | 35 |
| Min SDK | 24 (Android 7.0) |
| NDK | 27.1.12297006 |
| Hermes | Enabled |
| New Architecture | Enabled (`newArchEnabled=true`) |

Source: `android/gradle/wrapper/gradle-wrapper.properties` and `node_modules/expo-modules-autolinking` plugin defaults.
