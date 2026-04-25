#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"

rm -rf \
  .aigiscode \
  android/.gradle \
  android/.kotlin \
  android/app/.cxx \
  android/app/build \
  android/build \
  coverage \
  generated-test-assets \
  emulator.log

echo "Workspace generated artifacts removed."
