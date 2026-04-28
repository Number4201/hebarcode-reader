export type Point = {
  x: number;
  y: number;
};

export type BarcodeFormat =
  | 'QR_CODE'
  | 'CODE_128'
  | 'EAN_13'
  | 'EAN_8'
  | 'UPC_A'
  | 'UPC_E'
  | 'PDF_417'
  | 'DATA_MATRIX'
  | 'AZTEC'
  | 'ITF'
  | 'CODABAR'
  | string;

export type BarcodeContentType =
  | 'TEXT'
  | 'BINARY'
  | 'URL'
  | 'CONTACT'
  | 'WIFI'
  | 'PRODUCT'
  | string;

export type DetectionSource = 'camera' | 'mock';

export type FrameSize = {
  width: number;
  height: number;
};

export type DetectedBarcode = {
  id: string;
  format: BarcodeFormat;
  text?: string | null;
  rawBytesBase64?: string | null;
  contentType: BarcodeContentType;
  points: Point[];
  confidence?: number;
  frameSize?: FrameSize;
  lastSeenTimestampMs?: number;
};

export type BarcodeDetectionsFrame = {
  frameId: string;
  timestampMs: number;
  source: DetectionSource;
  rotationDegrees: number;
  frameSize: FrameSize;
  detections: DetectedBarcode[];
  previewImageBase64?: string | null;
  previewImageMimeType?: string | null;
  previewImageTimestampMs?: number | null;
};

export type SelectionLock = {
  format: BarcodeFormat;
  text?: string | null;
  centroid: Point;
  barcode: DetectedBarcode;
  selectedAtMs: number;
};
