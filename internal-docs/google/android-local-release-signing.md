# Android Local Release Signing

This project supports a single local Gradle path for producing Play-ready `.aab` files with deterministic signing.

## 1) Configure signing credentials

Copy the template:

```bash
cp android/keystore.properties.example android/keystore.properties
```

Set values in `android/keystore.properties`:

```properties
storeFile=app/debug.keystore
storePassword=android
keyAlias=androiddebugkey
keyPassword=android
```

Notes:
- `android/keystore.properties` is git-ignored.
- Current Play track for this app expects SHA1:
  `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`

## 2) Build and verify AAB

```bash
EXPECTED_SHA1=5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25 \
  ./scripts/release-android-prod.sh
```

The script will:
- build `android/app/build/outputs/bundle/release/app-release.aab`
- print the bundle signing SHA1
- fail if SHA1 does not match `EXPECTED_SHA1`

## 3) Manual SHA1 check (optional)

```bash
keytool -printcert -jarfile android/app/build/outputs/bundle/release/app-release.aab | rg SHA1
```

## 4) Upload

Upload:

`android/app/build/outputs/bundle/release/app-release.aab`
