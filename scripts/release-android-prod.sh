#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

export APP_VARIANT=prod
export NODE_ENV=production

EXPECTED_SHA1="${EXPECTED_SHA1:-}"
KEYSTORE_PROPERTIES_FILE="android/keystore.properties"
BUNDLE_PATH="android/app/build/outputs/bundle/release/app-release.aab"

if [[ ! -f "$KEYSTORE_PROPERTIES_FILE" ]]; then
  echo "WARN: $KEYSTORE_PROPERTIES_FILE not found."
  echo "      Release will use fallback signing (debug keystore) per android/app/build.gradle."
fi

# Install runtime deps only so dev-client packages cannot be included in release graph.
npm ci --omit=dev

DEPS_FILE="$(mktemp)"
trap 'rm -f "$DEPS_FILE"' EXIT

(
  cd android
  ./gradlew -q :app:dependencies --configuration releaseRuntimeClasspath > "$DEPS_FILE"
)

if rg -q "project :expo-dev-client|project :expo-dev-launcher|project :expo-dev-menu|project :expo-dev-menu-interface" "$DEPS_FILE"; then
  echo "ERROR: releaseRuntimeClasspath still contains expo dev-client modules."
  echo "Aborting release build."
  exit 1
fi

(
  cd android
  ./gradlew :app:bundleRelease
)

if [[ ! -f "$BUNDLE_PATH" ]]; then
  echo "ERROR: expected AAB not found at $BUNDLE_PATH"
  exit 1
fi

SIGN_SHA1="$(keytool -printcert -jarfile "$BUNDLE_PATH" | awk -F': ' '/SHA1:/{print $2; exit}')"
if [[ -z "$SIGN_SHA1" ]]; then
  echo "ERROR: failed to read signing SHA1 from bundle"
  exit 1
fi

echo "Release AAB ready at: $BUNDLE_PATH"
echo "Bundle signing SHA1: $SIGN_SHA1"

if [[ -n "$EXPECTED_SHA1" ]]; then
  if [[ "$SIGN_SHA1" != "$EXPECTED_SHA1" ]]; then
    echo "ERROR: bundle signing SHA1 mismatch."
    echo "Expected: $EXPECTED_SHA1"
    echo "Actual:   $SIGN_SHA1"
    exit 1
  fi
  echo "Signing SHA1 matches EXPECTED_SHA1."
fi
