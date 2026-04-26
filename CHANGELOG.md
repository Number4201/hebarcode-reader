# Changelog

## 2026-04-26

- Optimized scanner runtime with fast/deep decode profiles, throttled analyzer preview, and reduced empty-frame UI renders.
- Published demo APK `v0.0.1-demo.5` and updated the GitHub-facing README download link.
- Added an analyzer-frame preview fallback and FPS diagnostics for camera sessions where native CameraX preview is invisible.

## 2026-04-25

- Published demo APK `v0.0.1-demo.4` and updated the GitHub-facing README download link.
- Added a scanner diagnostics menu mode, native preview size/frame reporting, preview resize rebinding, and moved local agent instructions out of GitHub tracking.
- Published demo APK `v0.0.1-demo.3` and updated the GitHub-facing README download link.
- Hardened camera startup with native CameraX error reporting, scanner retry UI, preview attach retry continuity, and release/demo permission cleanup.
- Published demo APK `v0.0.1-demo.2` and updated the GitHub-facing README download link.
- Fixed expedition scanner startup lifecycle, Android preview attach retries, and compacted the home/expedition UI for small screens.
- Linked the current installable demo APK directly from the GitHub-facing README.
- Added a standalone Android demo build variant and repeatable `npm run build:demo` installer workflow.
- Prepared the GitHub-facing repository state by making release APK builds manual, restoring the full Apache-2.0 license text, and clarifying CI/release documentation.
- Reduced scanner runtime overhead by reusing overlay transforms, avoiding repeated distance/centroid work, and skipping luma sampling when torch assist cannot use it.

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
