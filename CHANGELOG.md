# Changelog

## 2026-04-25

- Prepared the GitHub-facing repository state by making release APK builds manual, restoring the full Apache-2.0 license text, and clarifying CI/release documentation.

## 2026-04-24

- Fixed audit findings around TypeScript/lint verification, XML config validation, native import/export bounds, scanner lifecycle races, release signing guardrails, and React Native CLI audit vulnerabilities.
- Cleaned scanner overlay hit-testing, removed unused UI code, and added a repeatable workspace cleanup script for generated Android/AigisCode artifacts.

## 2026-04-16

- Switched Android GitHub Actions workflows to Node 24-compatible action majors, explicit `contents: read` permissions, Gradle caching, and a dedicated `npm audit --package-lock-only` step.
- Added `scripts/verify-release.sh` and `npm run verify:release` to reproduce audit, tests, and arm64 release APK verification locally.
- Documented the changelog rule for future moderate changes, clarified the Android bundle entrypoint path, normalized the local Gradle ABI block to Gradle 9 assignment syntax, and introduced persistent `patch-package` fixes for Gradle deprecations in `react-native-safe-area-context` and `react-native-svg`.
- Reworked the `react-native-svg` patch from build-level warning silencing to source-level compatibility fixes, eliminating Android deprecation and unchecked compiler warnings in release builds while keeping the patch set minimal.

## 2026-04-23

- Reworked the application from a scanner-first prototype into a structured shipping workflow with dedicated Home, Expedition, Archive, and Settings screens.
- Added expedition draft handling, archive summaries, local Android persistence, and real XML export.
- Added configurable XML layout support for I6 through a JSON-based configuration profile used by both preview and export.
- Added Android document-picker import for XML layout configuration files.
- Improved scanner behavior with frame-fusion fixes, overlay/preview alignment, adaptive scanner assist behavior, and low-light torch assistance.
