# Hebarcode Reader

Hebarcode Reader is an Android-first React Native application for warehouse shipping workflows.

The app is designed for situations where multiple barcodes are visible at the same time and the operator must select the correct one quickly and reliably.

## Current Product State

The current app is no longer just a scanner prototype. It now includes a structured shipping workflow:

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
- scanner status, stack information, and assist feedback

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
- preserved a useful mock/sample fallback when the native scanner is unavailable

### Robustness improvements

- adaptive detection throttle when detections go stale
- low-light torch assist on Android
- autofocus / auto-exposure / auto-white-balance behavior pushed into the CameraX pipeline
- explicit assist mode wiring between React Native and Android native code

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
- assist mode and torch behavior
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
npm test -- --runInBand
cd android && ./gradlew assembleDebug
```

## Repository Notes

- Android native scanner and storage code live under `android/app/src/main/java/com/hebarcode/reader`
- React Native application flow lives under `src/app`
- scanner logic and geometry helpers live under `src/scanner`
- `patch-package` is used to keep Android dependency fixes persistent under `patches/`
- moderate repo changes should add a short entry to `CHANGELOG.md`

## License

Apache-2.0

## Third-Party Notices

See `THIRD_PARTY_NOTICES.md`.
