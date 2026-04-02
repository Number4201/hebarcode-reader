# Hebarcode Reader

React Native barcode scanner project focused on a **Scanbot-like Android experience**:

- live camera preview
- multiple barcodes visible at once
- AR-style overlays over each detected symbol
- tap-to-select a specific barcode from the camera feed

## Status

Current repository state:
- React Native scaffold initialized
- project metadata set for public open-source release
- license and third-party notices added
- scanner architecture chosen
- implementation of the scanning stack is the next step

## Target architecture

### App layer
- **React Native** for app UI and state
- JS/TS overlay state and selection UX

### Android scanning layer
- **CameraX** for preview + frame analysis
- **ZXing-C++ Android wrapper** as the decoding engine
- custom native bridge / module to expose:
  - decoded barcode values
  - barcode format
  - polygon / quad coordinates
  - frame-relative positions for overlay rendering

### Selection UX
- render polygons over the camera preview
- allow tapping the exact code the user wants
- keep a short-lived selection lock so the chosen code does not jump between frames
- optionally freeze / confirm after tap

## Why ZXing-C++

The key requirement is **multiple codes in one frame with positional metadata**.
ZXing-C++ is a strong open-source foundation because it can return:
- multiple decoded symbols
- per-symbol format and content
- a 4-point position / quadrilateral for each barcode

That is what makes Scanbot-like per-code selection possible.

## License

This repository is licensed under **Apache-2.0**.

Reason:
- business-friendly
- open-source friendly
- includes an explicit patent grant

## Third-party open-source software

Current scaffold and/or intended core stack includes open-source components such as:

- **React Native** — MIT
- **React** — MIT
- **react-native-safe-area-context** — MIT
- **ZXing-C++** — Apache-2.0 (planned scanner engine)
- **AndroidX CameraX** — Apache-2.0 (planned Android camera stack)

See `THIRD_PARTY_NOTICES.md` for attribution notes.

## Development

### Start Metro

```bash
npm start
```

### Run Android

```bash
npm run android
```

## Near-term roadmap

1. add Android camera preview and analysis pipeline
2. expose multi-barcode results from native Android to React Native
3. draw overlay polygons in sync with preview coordinates
4. implement tap hit-testing and per-barcode selection
5. add selection freeze / confirm UX
6. add batch mode vs single-select mode

## Notes on attribution

This repository aims to stay clean on licensing:
- keep direct dependency licenses documented
- preserve upstream notices where required
- mention third-party components in docs when redistribution or attribution makes sense

If more libraries are added, `THIRD_PARTY_NOTICES.md` should be updated.
