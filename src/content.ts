export const APP_NAME = 'Hebarcode Reader';
export const APP_HEADLINE = 'Multi-barcode selection for Android';
export const APP_DESCRIPTION =
  'This repository is being set up as an open-source React Native app for Scanbot-like barcode selection: multiple visible codes, overlays above each symbol, and tap-to-pick the exact one the user wants.';

export const STACK_ITEMS = [
  'React Native UI',
  'Android CameraX preview + analysis',
  'ZXing-C++ Android wrapper for multi-barcode decoding',
  'AR-like overlay polygons and tap hit-testing',
] as const;

export const HYGIENE_ITEMS = [
  'Apache-2.0 license added',
  'Third-party notices documented',
  'Public GitHub-ready metadata configured',
] as const;

export const DEVELOPMENT_ITEMS = [
  'React Native scanner contract for Android bridge',
  'Android native module stub registered in MainApplication',
  'Prototype overlay with selectable mock barcodes',
  'Selection-resolution utilities covered by tests',
  'Native mock detections now flow over an Android event channel',
  'Scanner lifecycle contract (start/stop/throttle) is scaffolded',
] as const;
