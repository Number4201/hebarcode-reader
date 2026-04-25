#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"

echo "[1/4] Auditing lockfile"
npm audit --package-lock-only

echo "[2/4] Running tests"
npm test -- --ci --runInBand

echo "[3/4] Building arm64 release APK"
: "${HEBARCODE_RELEASE_STORE_FILE:?Set HEBARCODE_RELEASE_STORE_FILE before building a release APK}"
: "${HEBARCODE_RELEASE_STORE_PASSWORD:?Set HEBARCODE_RELEASE_STORE_PASSWORD before building a release APK}"
: "${HEBARCODE_RELEASE_KEY_ALIAS:?Set HEBARCODE_RELEASE_KEY_ALIAS before building a release APK}"
: "${HEBARCODE_RELEASE_KEY_PASSWORD:?Set HEBARCODE_RELEASE_KEY_PASSWORD before building a release APK}"
cd android
chmod +x gradlew
./gradlew :app:createBundleReleaseJsAndAssets :app:assembleRelease -PreactNativeArchitectures=arm64-v8a

echo "[4/4] Verifying bundled JS"
APK_PATH="$(find app/build/outputs/apk/release -type f -name '*arm64-v8a*.apk' | head -n 1)"
test -n "$APK_PATH"
unzip -l "$APK_PATH" | grep 'assets/index.android.bundle'
ls -lh "$APK_PATH"
