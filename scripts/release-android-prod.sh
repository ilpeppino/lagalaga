#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

export APP_VARIANT=prod
export NODE_ENV=production

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
  ./gradlew :app:assembleRelease
)

echo "Release APK ready at: android/app/build/outputs/apk/release/app-release.apk"
