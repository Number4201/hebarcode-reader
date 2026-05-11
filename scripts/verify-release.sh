#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"

echo "[1/9] Audit dependencies"
npm run audit

echo "[2/9] TypeScript"
npm run typecheck

echo "[3/9] Scanner benchmark"
npm run verify:scanner

echo "[4/9] Lint"
npm run lint

echo "[5/9] Tests"
npm test -- --ci --runInBand

echo "[6/9] Validate signing environment"
: "${HEBARCODE_RELEASE_STORE_FILE:?Set HEBARCODE_RELEASE_STORE_FILE before building a release APK}"
: "${HEBARCODE_RELEASE_STORE_PASSWORD:?Set HEBARCODE_RELEASE_STORE_PASSWORD before building a release APK}"
: "${HEBARCODE_RELEASE_KEY_ALIAS:?Set HEBARCODE_RELEASE_KEY_ALIAS before building a release APK}"
: "${HEBARCODE_RELEASE_KEY_PASSWORD:?Set HEBARCODE_RELEASE_KEY_PASSWORD before building a release APK}"

echo "[7/9] Building arm64 release APK"
cd android
chmod +x gradlew
./gradlew :app:createBundleReleaseJsAndAssets :app:assembleRelease -PreactNativeArchitectures=arm64-v8a

echo "[8/9] Verifying bundled JS"
APK_PATH="$(find app/build/outputs/apk/release -type f -name '*arm64-v8a*.apk' | head -n 1)"
test -n "$APK_PATH"
unzip -l "$APK_PATH" | grep 'assets/index.android.bundle'

echo "[9/9] Show output size"
ls -lh "$APK_PATH"
