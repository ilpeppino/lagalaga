# Dev Vs Prod Testing (Side-By-Side Apps)

This project supports two installable variants so you can keep both apps on one phone:

- Dev client app (local Metro): `com.ilpeppino.lagalaga.dev`
- Production standalone app (Play): `com.ilpeppino.lagalaga`

Config is controlled by `APP_VARIANT` in `app.config.ts`.

## Quick Commands

### Local dev client testing

```sh
# Start Metro for the dev app
npm run start:dev
```

```sh
# Build/install dev app locally (Android)
APP_VARIANT=dev npx expo prebuild --platform android
npm run android:dev
```

### Production/standalone testing

```sh
# Ensure native files are generated for production IDs
APP_VARIANT=prod npx expo prebuild --platform android
```

```sh
# Build local production AAB (no Metro required at runtime)
cd android
./gradlew clean bundleRelease
```

Output:

- `android/app/build/outputs/bundle/release/app-release.aab`

## EAS Profiles

`eas.json` is already configured:

- `development` -> `APP_VARIANT=dev` + `developmentClient=true`
- `preview` -> `APP_VARIANT=dev`
- `production` -> `APP_VARIANT=prod`

Build commands:

```sh
eas build -p android --profile development
eas build -p android --profile production
```

## Reliable Testing Flow

1. Keep Play app installed (`com.ilpeppino.lagalaga`).
2. Install dev client app separately (`com.ilpeppino.lagalaga.dev`).
3. Open dev app only when Metro is running (`npm run start:dev`).
4. Open Play app to validate true standalone behavior (no Metro).
5. Before any production build, run:

```sh
APP_VARIANT=prod npx expo prebuild --platform android
```

This prevents accidentally shipping dev variant identifiers.

## Troubleshooting

- If app asks for Metro unexpectedly:
  - Confirm package installed on device is the prod one (`com.ilpeppino.lagalaga`).
  - Rebuild with `APP_VARIANT=prod`.
  - Verify `expo-dev-client` is excluded in prod config (`npx expo config --type public` with `APP_VARIANT=prod`).
- If only one app appears on device:
  - You likely built both with the same package ID.
  - Re-run prebuild with correct `APP_VARIANT` and reinstall.
