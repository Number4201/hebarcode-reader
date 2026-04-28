# Changelog

## 2026-04-28

- Published demo APK `v0.0.1-demo.15` and updated the GitHub-facing README download link.
- Stabilized scanner preview cards across frame jitter and made selected barcodes persist with a primary add-to-expedition action.
- Added a production hybrid scanner path with ML Kit Barcode auto-zoom, ZXing-C++ fallback, 1080p analysis, stable barcode tracking, 1D box expansion, and 2D-ready corner geometry.
- Forced Samsung Android 15 scanner startup onto analyzer-first preview fallback, reduced fallback render cost, and added quicker stream-config recovery after device testing.
- Prioritized color CameraX preview over saved analysis-only fallback, added a 30 FPS color analyzer fallback path, guarded stale frame fusion by geometry, and made expedition scan commits explicit.
- Rotated native barcode points into display coordinates and shortened frame fusion so off-screen codes clear quickly.
- Restored ZXing-native barcode point orientation and increased assisted/deep decode cadence for more reliable live scanning.

## 2026-04-27

- Cleaned the expedition scanner UI, moved camera state labels to diagnostics, and replaced automatic torch assist with a manual flashlight control.
- Published demo APK `v0.0.1-demo.14` and updated the GitHub-facing README download link.
- Moved analyzer fallback preview into the native Android camera view, added scanner FPS perf logs, cached the working CameraX bind profile, and raised fallback preview to near-analyzer FPS.
- Published demo APK `v0.0.1-demo.12` and updated the GitHub-facing README download link.
- Added deeper CameraX 0 FPS recovery with CameraState/lifecycle diagnostics, Camera2 tuning fallback, and ImageAnalysis-only binding mode.
- Published demo APK `v0.0.1-demo.11` and updated the GitHub-facing README download link.
- Fixed another 0 FPS camera startup path by updating native preview size after child layout and adding native frame-flow recovery for CameraX binds that produce no analyzer frames.
- Published demo APK `v0.0.1-demo.10` and updated the GitHub-facing README download link.
- Fixed a CameraX preview dead-start path by delaying bind until the native preview has size and by cycling PreviewView surface modes on stale preview streams.
- Published demo APK `v0.0.1-demo.9` and updated the GitHub-facing README download link.
- Locked the project scope to Android-only and added CameraX preview-stream diagnostics plus analyzer resolution fallback profiles.
- Published demo APK `v0.0.1-demo.8` and updated the GitHub-facing README download link.
- Hardened camera orchestration by separating CameraX bind state from live analyzer frame flow, retrying stale frame pipelines, and preventing stale analyzer images from covering native preview.

## 2026-04-26

- Published demo APK `v0.0.1-demo.7` and updated the GitHub-facing README download link.
- Enlarged the expedition camera view by replacing the heavy scanner overlays with a compact scanning dock.
- Published demo APK `v0.0.1-demo.6` and updated the GitHub-facing README download link.
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
