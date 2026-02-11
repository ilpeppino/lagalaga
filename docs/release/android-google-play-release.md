# Android Release And Google Play Submission

This guide explains how to configure the app for production, build the Android release artifact, and publish it through Google Play Console.

## Scope

- Platform: Android
- Build system: Expo + EAS Build
- Distribution: Google Play Store (Internal testing, then Production)

## 1. Prerequisites

- Google Play Console account (active).
- Expo account with access to this project.
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

## 5. Build Release Artifact (AAB) With EAS

Google Play requires an Android App Bundle (`.aab`) for store releases.

From repo root:

```sh
npm install
npx eas login
npx eas build --platform android --profile production
```

Notes:
- `eas.json` already contains a `production` profile.
- EAS will manage signing credentials if you allow it (recommended for most teams).
- `autoIncrement` is enabled for production in this project, so versionCode is incremented remotely.

## 6. Create/Configure App In Play Console

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

## 7. Upload To Internal Testing First (Recommended)

1. In Play Console, open your app.
2. Go to `Testing` -> `Internal testing`.
3. Create a new release.
4. Upload the generated `.aab` from EAS.
5. Add release notes.
6. Save and roll out to internal testers.

Why first:
- Validates signing, install, auth, and backend behavior on real devices before production.

## 8. Validate Internal Release

On tester Android devices, verify:

- Install/update works from Play.
- App starts and calls Render backend successfully.
- Roblox sign-in returns to app via `lagalaga://auth/roblox`.
- Core user flows work on Wi-Fi and mobile data.
- No crashes during startup, sign-in, and session flows.

## 9. Promote To Production

1. Go to `Release` -> `Production`.
2. Create a new production release (or promote tested build).
3. Add release notes.
4. Review all warnings/checks.
5. Roll out to production (start staged rollout if preferred).

After approval by Google Play review, the version will become available by rollout settings.

## 10. Optional: Submit From CLI

If you want to use EAS Submit:

```sh
npx eas submit --platform android --profile production
```

This can automate upload, but Play Console setup items (policy/listing) still must be complete.

## 11. Release Checklist

- `.env.production` points to Render production URL.
- `app.json` package/scheme/deep link values are correct.
- Render + Roblox redirect URI values are aligned.
- Production `eas build` completed and artifact generated.
- Internal testing release validated on physical Android devices.
- Store listing and policy forms completed.
- Production rollout executed and monitored.

## 12. Rollback Strategy

If a production issue appears:

- Halt/stop the rollout in Play Console.
- Fix and produce a new build (`eas build --profile production`).
- Release a new version with notes describing the fix.

