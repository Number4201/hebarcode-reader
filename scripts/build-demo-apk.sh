#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SHORT_SHA="$(git -C "$ROOT_DIR" rev-parse --short HEAD)"

if ! git -C "$ROOT_DIR" diff --quiet || ! git -C "$ROOT_DIR" diff --cached --quiet; then
  SHORT_SHA="$SHORT_SHA-dirty"
fi

OUTPUT_DIR="$ROOT_DIR/release-artifacts"
APK_SOURCE="$ROOT_DIR/android/app/build/outputs/apk/demo/app-arm64-v8a-demo.apk"
APK_TARGET="$OUTPUT_DIR/hebarcode-reader-demo-$SHORT_SHA-arm64.apk"

cd "$ROOT_DIR/android"
chmod +x gradlew
./gradlew :app:assembleDemo

test -f "$APK_SOURCE"
mkdir -p "$OUTPUT_DIR"
cp "$APK_SOURCE" "$APK_TARGET"
sha256sum "$APK_TARGET" > "$APK_TARGET.sha256"

echo "Demo APK: $APK_TARGET"
echo "SHA-256:  $APK_TARGET.sha256"
