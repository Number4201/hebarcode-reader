# Hebarcode Reader

[![Android Debug APK](https://github.com/Number4201/hebarcode-reader/actions/workflows/android-debug-apk.yml/badge.svg)](https://github.com/Number4201/hebarcode-reader/actions/workflows/android-debug-apk.yml)
[![Demo APK](https://img.shields.io/github/v/release/Number4201/hebarcode-reader?include_prereleases&label=demo%20apk)](https://github.com/Number4201/hebarcode-reader/releases/tag/v0.0.1-demo.16)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

Hebarcode Reader is an Android-only React Native app for warehouse shipping workflows where multiple barcodes can be visible at the same time and the operator must pick the correct one quickly.

iOS is intentionally not supported.

## Latest Demo

- Release: [v0.0.1-demo.16](https://github.com/Number4201/hebarcode-reader/releases/tag/v0.0.1-demo.16)
- APK: [hebarcode-reader-demo-dd41dc2-arm64.apk](https://github.com/Number4201/hebarcode-reader/releases/download/v0.0.1-demo.16/hebarcode-reader-demo-dd41dc2-arm64.apk)
- SHA-256: `fdb508d65c0cbeffdfecf0ea8dce0a65476059f28067c4c05bb86e88a9b6d033`

The demo APK is debug-key signed and intended for internal device testing.

## Current Product

The app provides:

- Android live camera scanning with CameraX, ZXing-C++, and ML Kit Barcode.
- Multi-barcode overlays with tap-to-select behavior.
- Expedition draft creation with quantity aggregation.
- Archive of saved expeditions.
- Local Android persistence for archive, active draft, settings, and XML layout config; draft scan journals are retained only in that local app state so undo can restore the previous scan timestamp.
- Configurable XML export for I6-style integration.
- Android file import for XML layout configuration.
- Diagnostics mode for camera, frame-flow, decoder, assist, and frame-quality telemetry.

## User Flow

The home screen opens one of the main work areas:

- `New expedition`
- `Expedition archive`
- `Settings`

The expedition screen is the operator workflow. It shows the live scanner, detected code labels, the current selected/last-scanned code, running totals, manual flashlight control, finish, and draft reset actions.

The archive stores finalized expeditions with item and quantity summaries.

The settings screen controls XML export options, scanner assist mode, XML preview/export, and XML layout config import/editing.

## Scanner Pipeline

The Android scanner currently uses:

- CameraX `Preview` and `ImageAnalysis`.
- `ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST` for analyzer backpressure.
- A balanced 720p analysis profile by default, with compatibility/detail retry profiles.
- ZXing-C++ fast decode on the regular path.
- ZXing-C++ deep decode when assisted recovery is useful.
- ML Kit Barcode fallback with potential boxes and auto-zoom support.
- Native focus, exposure, and white-balance metering assist.
- Manual torch control from the expedition UI.
- Frame quality telemetry from the Y plane: luma, contrast, sharpness, quality score, and reason.
- Frame fusion that keeps physical labels with identical payloads separate when their geometry is distinct.
- JS-side event coalescing to reduce React render pressure outside diagnostics.

Diagnostics exposes scanner status, preview stream state, analyzer/event FPS, bind mode, CameraX state, analysis profile, decode mode, hit/miss counters, ML Kit potential boxes, focus/zoom assists, frame quality, and analyzer errors.

## XML Configuration

The XML structure is controlled by JSON stored in settings. It can be edited manually, reset to the built-in I6-style profile, or imported from an Android file picker.

Example:

```json
{
  "schemaVersion": 1,
  "rootTag": "I6Data",
  "expeditionTag": "Shipment",
  "expeditionFields": [
    {"name": "id", "source": "expeditionId", "mode": "attribute"},
    {"name": "createdAt", "source": "createdAt", "mode": "attribute"},
    {"name": "updatedAt", "source": "updatedAt", "mode": "attribute"}
  ],
  "itemsTag": "Rows",
  "itemTag": "Row",
  "itemFields": [
    {"name": "Code", "source": "text"},
    {"name": "Format", "source": "format"},
    {"name": "Quantity", "source": "quantity"},
    {"name": "ContentType", "source": "contentType"}
  ],
  "summaryTag": "Summary",
  "summaryFields": [
    {"name": "totalUnits", "source": "totalUnits", "mode": "attribute"},
    {"name": "distinctItems", "source": "distinctItems", "mode": "attribute"}
  ]
}
```

## Architecture

Main React Native app flow:

- `App.tsx`
- `src/app/models.ts`
- `src/app/expeditions.ts`
- `src/app/screens/*`
- `src/native/HebarcodeStorage.ts`

Scanner and overlay logic:

- `src/hooks/useNativeScanner.ts`
- `src/components/ScannerStage.tsx`
- `src/scanner/frameFusion.ts`
- `src/scanner/overlay.ts`
- `src/scanner/useScannerSelection.ts`
- `src/native/HebarcodeScanner.ts`

Android native scanner/storage:

- `android/app/src/main/java/com/hebarcode/reader/HebarcodeScannerController.kt`
- `android/app/src/main/java/com/hebarcode/reader/HebarcodeAnalyzerPreviewRenderer.kt`
- `android/app/src/main/java/com/hebarcode/reader/HebarcodeMlKitBarcodeMapper.kt`
- `android/app/src/main/java/com/hebarcode/reader/HebarcodeScannerModule.kt`
- `android/app/src/main/java/com/hebarcode/reader/HebarcodeScannerView.kt`
- `android/app/src/main/java/com/hebarcode/reader/HebarcodeStorageModule.kt`
- `android/app/src/main/java/com/hebarcode/reader/HebarcodeScannerPackage.kt`

## Development

```bash
npm ci
npm start
npm run android
```

Requires Node `>=22.13.0`.

## Verification

Recommended local checks:

```bash
npm run audit
npm run typecheck
npm run verify:scanner
npm run lint
npm test -- --runInBand
cd android && ./gradlew :app:assembleDemo -PreactNativeArchitectures=arm64-v8a
```

For the full local CI-equivalent gate, run:

```bash
npm run verify:ci
```

The debug APK workflow runs on pushes and pull requests.

## Scanner Benchmark

```bash
npm run benchmark:scanner
```

All `benchmarks/scanner/*.json` fixtures are included automatically. Each dataset contains expected barcodes and timestamped detection frames. The harness reports decode rate, unique false positives, collapsed same-payload instances, duplicate detections, and first-hit latency.

The default scanner quality gate is strict:

- Decode rate: 100%.
- False positives: 0.
- Collapsed same-payload physical instances: 0.
- Duplicate detections in a frame: 0.
- p95 first-hit latency: <= 500ms.

`npm run verify:scanner` runs the benchmark with the same explicit thresholds used by CI and release verification.

Use the benchmark for deterministic scanner-regression checks. Real device quality still requires captured frame/event fixtures from physical devices.

## Demo Build

```bash
npm run build:demo
```

The demo build script creates the `demo` Android variant, copies the arm64 APK into `release-artifacts/`, and writes a matching `.sha256` checksum. Demo APKs are debug-key signed and use the `.demo` application id suffix.

## Release Build

Production release verification requires a real Android signing key:

```bash
export HEBARCODE_RELEASE_STORE_FILE=/absolute/path/to/release.keystore
export HEBARCODE_RELEASE_STORE_PASSWORD=...
export HEBARCODE_RELEASE_KEY_ALIAS=...
export HEBARCODE_RELEASE_KEY_PASSWORD=...
npm run verify:release
```

`npm run verify:release` runs audit, TypeScript, scanner benchmark, lint, and Jest checks before validating signing configuration and building the arm64 release APK.

The GitHub release workflow requires these repository secrets:

- `HEBARCODE_RELEASE_KEYSTORE_BASE64`
- `HEBARCODE_RELEASE_STORE_PASSWORD`
- `HEBARCODE_RELEASE_KEY_ALIAS`
- `HEBARCODE_RELEASE_KEY_PASSWORD`

## Workspace Cleanup

```bash
npm run clean:workspace
```

The cleanup script removes generated AigisCode reports, Android Gradle/CMake/build outputs, coverage, generated test assets, and emulator logs. It keeps `node_modules`, source files, patches, and local Android properties.

## Repository Notes

- Keep moderate repo changes documented in `CHANGELOG.md`.
- Document reusable local scripts in this README.
- Persist third-party dependency fixes with `patch-package` under `patches/`.
- Update the demo release link, APK link, and checksum together whenever a newer demo APK is published.

## License

Apache-2.0

## Third-Party Notices

See `THIRD_PARTY_NOTICES.md`.
