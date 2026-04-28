# Hebarcode Reader

[![Android Debug APK](https://github.com/Number4201/hebarcode-reader/actions/workflows/android-debug-apk.yml/badge.svg)](https://github.com/Number4201/hebarcode-reader/actions/workflows/android-debug-apk.yml)
[![Demo APK](https://img.shields.io/github/v/release/Number4201/hebarcode-reader?include_prereleases&label=demo%20apk)](https://github.com/Number4201/hebarcode-reader/releases/tag/v0.0.1-demo.15)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

Hebarcode Reader is an Android-only React Native application for warehouse shipping workflows.

The app is designed for situations where multiple barcodes are visible at the same time and the operator must select the correct one quickly and reliably. iOS is intentionally not supported.

## Latest Demo

The current installable Android demo is available from GitHub Releases:

- Release: [v0.0.1-demo.15](https://github.com/Number4201/hebarcode-reader/releases/tag/v0.0.1-demo.15)
- APK: [hebarcode-reader-demo-53e0c65-arm64.apk](https://github.com/Number4201/hebarcode-reader/releases/download/v0.0.1-demo.15/hebarcode-reader-demo-53e0c65-arm64.apk)
- SHA-256: `bd57401ac2c4010ccbc8507a82fad08d660f03f62dc602e4ab5fd4bfec06c723`

This is an internal demo build signed with the Android debug key. It is suitable
for device testing, not store distribution.

## Current Product State

The current app includes a structured shipping workflow:

- a start menu with 3 main actions
- a dedicated expedition screen for live scanning
- an expedition archive
- application and export settings
- local persistence for archive, draft expedition, and settings
- real XML export on Android
- configurable XML layout for I6 integration
- Android file import for XML layout configuration

## Main User Flow

### 1. Home

The start screen contains 3 primary actions:

- `New expedition`
- `Expedition archive`
- `Settings`

This keeps startup lightweight and prevents the scanner UI from loading as the only top-level screen.

### 2. Expedition

The expedition screen provides:

- live camera preview on Android
- multi-barcode detection
- polygon overlays on the stage
- tap-to-select barcode choice
- a running expedition draft with quantity aggregation
- a clean scanner surface with manual flashlight control

The screen is optimized for fast operator use rather than deep navigation.

### 3. Archive

The archive screen shows saved expeditions with:

- expedition identifier
- update timestamp
- item count summary
- quantity summary
- short preview rows for saved items

### 4. Settings

The settings screen contains:

- XML export options
- scanner assist mode toggle
- local persistence status
- XML preview
- XML export trigger
- manual JSON configuration for XML layout
- Android file import for XML layout configuration

## I6 XML Configuration

The app supports a configurable XML layout intended for integration with I6.

The XML structure is controlled by a JSON configuration stored in settings. The configuration can be:

- edited manually in the settings screen
- reset to the built-in I6-style default profile
- imported from an Android file picker

The configuration can define:

- root tag
- expedition tag
- expedition fields
- items container tag
- item tag
- item field mapping
- summary tag
- summary field mapping
- whether fields are rendered as XML elements or attributes

Example configuration:

```json
{
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

## Scanner Behavior

The scanner pipeline was upgraded to be more usable in real working conditions.

### Functional improvements

- corrected frame fusion so separate physical labels with the same payload are not collapsed incorrectly
- aligned overlay mapping with the actual preview scaling model
- improved scanner status reporting so "live" reflects the real native pipeline state more accurately
- split diagnostics into preview attachment, CameraX preview stream, and analyzer frame flow
- blocks CameraX binding until the native preview view has a non-zero size
- updates preview layout from the real native child view, not only the React Native wrapper
- preserved a useful mock/sample fallback when the native scanner is unavailable

### Robustness improvements

- adaptive detection throttle when detections go stale
- split fast/deep ZXing-C++ decode profiles so expensive recovery scanning is used when it helps instead of on every frame
- throttled analyzer-frame preview fallback that can be enabled through the native bridge for visible camera diagnostics
- reduced React render pressure by coalescing empty camera frames outside diagnostics mode
- manual Android torch control from the expedition scanner UI; automatic torch assist is disabled
- autofocus / auto-exposure / auto-white-balance behavior pushed into the CameraX pipeline
- explicit assist mode wiring between React Native and Android native code
- Android CameraX ImageAnalysis starts on a balanced 720p profile and falls back to a compatible 480p profile after stale frame-flow retries
- Android CameraX preview starts in the default high-performance surface mode and cycles surface modes if preview streaming stays idle
- Android CameraX rebinding can fall back from viewport-group binding to plain preview + analysis use-cases when a device binds successfully but produces 0 analyzer frames
- Android CameraX recovery can disable Camera2 tuning and bind ImageAnalysis without a Preview use-case when a device camera session opens but still delivers 0 analyzer frames

### Diagnostics mode

Diagnostics mode keeps the scanner runtime fully observable while avoiding the heavier UI path during normal expedition work. It shows analyzer FPS, event FPS, preview attach state, CameraX preview stream state, bind wait reason, use-case binding mode, lifecycle state, CameraX camera state/error, torch state, native recovery count, analysis profile, analyzer image availability, decode mode, analyzer errors, and deep scan counters so camera or device-specific problems can be diagnosed without guessing.

## Persistence and Export

The app persists its working state on Android using a lightweight native storage module.

Persisted data includes:

- expedition archive
- current draft expedition
- settings
- XML layout configuration text

The app can also export a real XML file on Android:

- on newer Android versions through MediaStore into `Download/Hebarcode`
- with a filesystem fallback path where appropriate

## Architecture Overview

### React Native app layer

Main files:

- `App.tsx`
- `src/app/models.ts`
- `src/app/expeditions.ts`
- `src/app/components.tsx`
- `src/app/styles.ts`
- `src/app/screens/*`

Responsibilities:

- screen shell
- expedition state and archive workflow
- settings state
- XML preview and export orchestration
- imported configuration handling

### Scanner and overlay logic

Main files:

- `src/hooks/useNativeScanner.ts`
- `src/components/ScannerStage.tsx`
- `src/scanner/frameFusion.ts`
- `src/scanner/overlay.ts`
- `src/scanner/useScannerSelection.ts`
- `src/native/HebarcodeScanner.ts`

Responsibilities:

- native scanner lifecycle
- frame normalization
- frame fusion
- hit-testing and overlay layout
- barcode selection lock

### Android native layer

Main files:

- `android/app/src/main/java/com/hebarcode/reader/HebarcodeScannerController.kt`
- `android/app/src/main/java/com/hebarcode/reader/HebarcodeScannerModule.kt`
- `android/app/src/main/java/com/hebarcode/reader/HebarcodeScannerView.kt`
- `android/app/src/main/java/com/hebarcode/reader/HebarcodeStorageModule.kt`
- `android/app/src/main/java/com/hebarcode/reader/HebarcodeScannerPackage.kt`

Responsibilities:

- CameraX preview and image analysis
- ZXing-C++ barcode decoding
- assist mode and manual torch behavior
- native event emission to React Native
- local persistence
- XML file export
- XML config file import through Android document picker

## Development

```bash
npm ci
npm start
npm run android
```

## Verification

```bash
npm run audit
npx tsc --noEmit
npm run lint
npm test -- --runInBand
cd android && ./gradlew assembleDebug
```

The debug APK workflow runs automatically on pushes and pull requests.

## Demo APK

For an installable standalone demo build:

```bash
npm run build:demo
```

The script builds the `demo` Android variant, copies the arm64 APK into
`release-artifacts/`, and writes a matching `.sha256` checksum. Demo APKs are
debug-key signed, use the `.demo` application id suffix, and are intended for
internal testing. Production release APKs still require a real release signing
key.

Release APK builds are manual because they require a real signing key. Set these
local variables before running `npm run verify:release`:

```bash
export HEBARCODE_RELEASE_STORE_FILE=/absolute/path/to/release.keystore
export HEBARCODE_RELEASE_STORE_PASSWORD=...
export HEBARCODE_RELEASE_KEY_ALIAS=...
export HEBARCODE_RELEASE_KEY_PASSWORD=...
```

The GitHub release workflow requires these repository secrets:

- `HEBARCODE_RELEASE_KEYSTORE_BASE64`
- `HEBARCODE_RELEASE_STORE_PASSWORD`
- `HEBARCODE_RELEASE_KEY_ALIAS`
- `HEBARCODE_RELEASE_KEY_PASSWORD`

## Workspace Cleanup

Generated analysis and Android build artifacts can grow quickly. Use:

```bash
npm run clean:workspace
```

The cleanup removes generated AigisCode reports, Android Gradle/CMake/build
outputs, coverage, generated test assets, and emulator logs. It keeps
`node_modules`, source files, patches, and local Android properties intact.

## Repository Notes

- Android native scanner and storage code live under `android/app/src/main/java/com/hebarcode/reader`
- React Native application flow lives under `src/app`
- scanner logic and geometry helpers live under `src/scanner`
- `patch-package` is used to keep Android dependency fixes persistent under `patches/`
- `npm run clean:workspace` removes only regenerable local artifacts when the workspace gets noisy.
- moderate repo changes should add a short entry to `CHANGELOG.md`

## License

Apache-2.0

## Third-Party Notices

See `THIRD_PARTY_NOTICES.md`.
