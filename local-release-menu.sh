#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

DEVICE_HOST="100.103.213.58"
APP_JSON_PATH="$ROOT_DIR/app.json"
APP_CONFIG_TS_PATH="$ROOT_DIR/app.config.ts"
BUILD_GRADLE_PATH="$ROOT_DIR/android/app/build.gradle"

increment_first_match() {
  local file="$1"
  local pattern="$2"
  local replacement="$3"

  perl -i -pe "if (!\$done) { s/$pattern/$replacement/ && (\$done = 1) }" "$file"
}

printf "\nLagalaga Local Release Menu\n"
printf "1) Connect ADB to mobile phone\n"
printf "2) Uninstall Android app and install release version\n"
printf "3) Increment Android versionCode + build .aab\n"
printf "4) Increment iOS build numbers + run iOS prebuild\n\n"

read -r -p "Select an option (1-4): " choice

case "$choice" in
  1)
    read -r -p "Enter adb port: " port
    if [[ ! "$port" =~ ^[0-9]+$ ]]; then
      echo "Invalid port. Please use digits only." >&2
      exit 1
    fi

    adb connect "$DEVICE_HOST:$port"
    ;;

  2)
    adb uninstall com.ilpeppino.lagalaga
    APP_VARIANT=prod npx expo run:android --variant release
    ;;

  3)
    current_version_code="$(perl -ne 'if (/versionCode\s+(\d+)/) { print $1; exit }' "$BUILD_GRADLE_PATH")"
    if [[ -z "$current_version_code" ]]; then
      echo "Could not find versionCode in android/app/build.gradle" >&2
      exit 1
    fi

    next_version_code=$((current_version_code + 1))

    increment_first_match \
      "$BUILD_GRADLE_PATH" \
      'versionCode\\s+\\d+' \
      "versionCode $next_version_code"

    echo "Updated Android versionCode: $current_version_code -> $next_version_code"

    (
      cd "$ROOT_DIR/android"
      ./gradlew clean bundleRelease
    )
    ;;

  4)
    current_app_json_build="$(perl -ne 'if (/"buildNumber"\s*:\s*"(\d+)"/) { print $1; exit }' "$APP_JSON_PATH")"
    if [[ -z "$current_app_json_build" ]]; then
      echo "Could not find buildNumber in app.json" >&2
      exit 1
    fi

    next_app_json_build=$((current_app_json_build + 1))

    increment_first_match \
      "$APP_JSON_PATH" \
      '"buildNumber"\\s*:\\s*"\\d+"' \
      "\"buildNumber\": \"$next_app_json_build\""

    current_app_config_build="$(perl -ne 'if (/buildNumber:\s*["\x27](\d+)["\x27]/) { print $1; exit }' "$APP_CONFIG_TS_PATH")"
    if [[ -z "$current_app_config_build" ]]; then
      echo "Could not find buildNumber in app.config.ts" >&2
      exit 1
    fi

    next_app_config_build=$((current_app_config_build + 1))

    increment_first_match \
      "$APP_CONFIG_TS_PATH" \
      'buildNumber:\\s*["\\x27]\\d+["\\x27]' \
      "buildNumber: \"$next_app_config_build\""

    echo "Updated iOS buildNumber in app.json: $current_app_json_build -> $next_app_json_build"
    echo "Updated iOS buildNumber in app.config.ts: $current_app_config_build -> $next_app_config_build"

    npx expo prebuild -p ios
    ;;

  *)
    echo "Invalid option. Please run again and choose 1-4." >&2
    exit 1
    ;;
esac
