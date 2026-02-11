# Android Release And Google Play Submission

This guide explains how to configure the app for production, build a signed Android App Bundle (`.aab`) locally, and publish it through Google Play Console.

## Scope

- Platform: Android
- Build system: Expo + native Android Gradle (no EAS)
- Distribution: Google Play Store (Internal testing, then Production)

## 1. Prerequisites

- Google Play Console account (active).
- Local Android release toolchain:
  - JDK 17
  - Android SDK
  - `android/` folder present in this repo (already true here)
- Backend deployed (Render) and reachable over HTTPS.
- Roblox OAuth app configured for production redirect.

## 2. Configure Production Environment

Create/update `.env.production` in repo root:

```env
EXPO_PUBLIC_API_URL=https://<YOUR_RENDER_SERVICE>.onrender.com
EXPO_PUBLIC_ROBLOX_CLIENT_ID=<YOUR_ROBLOX_CLIENT_ID>
EXPO_PUBLIC_ROBLOX_REDIRECT_URI=lagalaga://auth/roblox
```

Important:
- Do not use `localhost` for production.
- Ensure the Render URL is HTTPS and publicly reachable.

## 3. Verify App Configuration (`app.json`)

Confirm these Android values:

- `expo.android.package`: `com.ilpeppino.lagalaga`
- `expo.scheme`: `lagalaga`
- Intent filter for OAuth deep link:
  - scheme: `lagalaga`
  - host: `auth`
  - pathPrefix: `/roblox`

If `android.package` is changed after a Play release, it creates a new app identity and cannot update the existing listing.

## 4. Verify Backend + OAuth Settings

### Render environment variables

- `ROBLOX_REDIRECT_URI=lagalaga://auth/roblox`
- `NODE_ENV=production`
- `HOST=0.0.0.0`
- Other required secrets (`JWT_SECRET`, Supabase keys, etc.) set correctly

### Roblox OAuth app

Allowed redirect URIs must include:

- `lagalaga://auth/roblox`

The value must match exactly across frontend, backend, and Roblox dashboard.

## 5. Create Android Upload Keystore (One-Time)

Run once (keep this file safe and backed up):

```sh
keytool -genkeypair -v \
  -storetype PKCS12 \
  -keystore android/app/lagalaga-upload-key.keystore \
  -alias lagalaga-upload \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

Store these values securely:
- keystore path
- keystore password
- key alias
- key password

Losing this key can block future app updates in Play.

## 6. Configure Gradle Signing For Release

Add signing secrets to `~/.gradle/gradle.properties` (machine-local, do not commit):

```properties
LAGALAGA_UPLOAD_STORE_FILE=lagalaga-upload-key.keystore
LAGALAGA_UPLOAD_KEY_ALIAS=lagalaga-upload
LAGALAGA_UPLOAD_STORE_PASSWORD=<STORE_PASSWORD>
LAGALAGA_UPLOAD_KEY_PASSWORD=<KEY_PASSWORD>
```

Then update `android/app/build.gradle` release signing config:

```groovy
signingConfigs {
    debug {
        storeFile file('debug.keystore')
        storePassword 'android'
        keyAlias 'androiddebugkey'
        keyPassword 'android'
    }
    release {
        if (project.hasProperty('LAGALAGA_UPLOAD_STORE_FILE')) {
            storeFile file(LAGALAGA_UPLOAD_STORE_FILE)
            storePassword LAGALAGA_UPLOAD_STORE_PASSWORD
            keyAlias LAGALAGA_UPLOAD_KEY_ALIAS
            keyPassword LAGALAGA_UPLOAD_KEY_PASSWORD
        }
    }
}

buildTypes {
    debug {
        signingConfig signingConfigs.debug
    }
    release {
        signingConfig signingConfigs.release
        // existing shrink/proguard settings...
    }
}
```

Current repo note: `android/app/build.gradle` is still using `signingConfigs.debug` for `release`; change that before publishing.

## 7. Bump Android Version For Each Release

Before each Play upload, increment in `android/app/build.gradle`:

- `versionCode` (must strictly increase each release)
- `versionName` (user-facing, e.g. `1.0.1`)

Example:

```groovy
defaultConfig {
    // ...
    versionCode 2
    versionName "1.0.1"
}
```

## 8. Build Signed AAB Locally (No EAS)

From repo root:

```sh
npm install
cd android
./gradlew clean bundleRelease
```

Generated file:

- `android/app/build/outputs/bundle/release/app-release.aab`

If signing properties are missing, Gradle will fail the release task; fix signing config first.

## 9. Create/Configure App In Play Console

1. Create a new app in Google Play Console (if not already created).
2. Complete required store information:
   - App name, default language, category
   - App access, ads declaration
   - Data safety
   - Content rating
3. Prepare store listing assets:
   - App icon
   - Screenshots (phone required)
   - Short description and full description
   - Privacy policy URL

Without these fields, release submission may be blocked.

## 10. Upload To Internal Testing First (Recommended)

1. In Play Console, open your app.
2. Go to `Testing` -> `Internal testing`.
3. Create a new release.
4. Upload `android/app/build/outputs/bundle/release/app-release.aab`.
5. Add release notes.
6. Save and roll out to internal testers.

Why first:
- Validates signing, install, auth, and backend behavior on real devices before production.

## 11. Validate Internal Release

On tester Android devices, verify:

- Install/update works from Play.
- App starts and calls Render backend successfully.
- Roblox sign-in returns to app via `lagalaga://auth/roblox`.
- Core user flows work on Wi-Fi and mobile data.
- No crashes during startup, sign-in, and session flows.

## 12. Promote To Production

1. Go to `Release` -> `Production`.
2. Create a new production release (or promote tested build).
3. Add release notes.
4. Review all warnings/checks.
5. Roll out to production (start staged rollout if preferred).

After approval by Google Play review, the version will become available by rollout settings.

## 13. Release Checklist

- `.env.production` points to Render production URL.
- `app.json` package/scheme/deep link values are correct.
- Render + Roblox redirect URI values are aligned.
- Upload keystore is created, backed up, and configured in Gradle.
- `versionCode` incremented for this release.
- Local `bundleRelease` completed and `.aab` generated.
- Internal testing release validated on physical Android devices.
- Store listing and policy forms completed.
- Production rollout executed and monitored.

## 14. Rollback Strategy

If a production issue appears:

- Halt/stop the rollout in Play Console.
- Fix the issue in code/config.
- Increment `versionCode` again.
- Build a new signed AAB (`./gradlew bundleRelease`) and publish a new release.
