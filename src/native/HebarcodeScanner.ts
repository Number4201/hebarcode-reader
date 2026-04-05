import {NativeEventEmitter, NativeModules, Platform} from 'react-native';
import {buildBarcodeId} from '../scanner/selection';
import type {
  BarcodeDetectionsFrame,
  BarcodeFormat,
  DetectedBarcode,
  DetectionSource,
  FrameSize,
  Point,
} from '../scanner/types';

export const NATIVE_DETECTIONS_EVENT = 'HebarcodeScanner.onDetections';

export type NativeScannerStatus = {
  platform: string;
  nativeModulePresent: boolean;
  version: string;
  cameraPermissionDeclared: boolean;
  cameraPermissionGranted?: boolean;
  mode: 'stub' | 'native';
  streaming?: boolean;
  detectionEventName?: string;
};

export type NativeScannerCapabilities = {
  cameraPreview: boolean;
  cameraPreviewView: boolean;
  barcodeDecoding: boolean;
  multiBarcodeSelection: boolean;
  mockDetections: boolean;
  detectionEvents: boolean;
  plannedEngine: string;
  plannedCameraStack: string;
};

type NativeDetectedBarcode = {
  id?: string;
  format?: string;
  text?: string | null;
  rawBytesBase64?: string | null;
  contentType?: string;
  points?: Array<Partial<Point>>;
  confidence?: number;
};

type NativeDetectionsFrame = {
  frameId?: string;
  timestampMs?: number;
  source?: string;
  rotationDegrees?: number;
  frameSize?: Partial<FrameSize>;
  detections?: NativeDetectedBarcode[];
};

type NativeScannerModuleShape = {
  getStatus?: () => Promise<NativeScannerStatus>;
  getCapabilities?: () => Promise<NativeScannerCapabilities>;
  isCameraPermissionGranted?: () => Promise<boolean>;
  getMockDetections?: () => Promise<NativeDetectedBarcode[]>;
  startScanning?: () => Promise<void>;
  stopScanning?: () => Promise<void>;
  setDetectionThrottleMs?: (throttleMs: number) => Promise<void>;
  addListener?: (eventName: string) => void;
  removeListeners?: (count: number) => void;
};

const NativeScannerModule = NativeModules.HebarcodeScanner as
  | NativeScannerModuleShape
  | undefined;

function normalizeFrameSize(raw: Partial<FrameSize> | undefined): FrameSize {
  return {
    width: toFiniteNumber(raw?.width),
    height: toFiniteNumber(raw?.height),
  };
}

function normalizePoint(raw: Partial<Point> | undefined): Point {
  return {
    x: toFiniteNumber(raw?.x),
    y: toFiniteNumber(raw?.y),
  };
}

function normalizePoints(raw: Array<Partial<Point>> | undefined): Point[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return [
      {x: 0, y: 0},
      {x: 0, y: 0},
      {x: 0, y: 0},
      {x: 0, y: 0},
    ];
  }

  const points = raw.slice(0, 4).map(point => normalizePoint(point));

  while (points.length < 4) {
    points.push({x: 0, y: 0});
  }

  return points;
}

function normalizeSource(raw: string | undefined): DetectionSource {
  return raw === 'camera' ? 'camera' : 'mock';
}

function toFiniteNumber(value: unknown): number {
  if (typeof value !== 'number') {
    return 0;
  }

  return Number.isFinite(value) ? value : 0;
}

function normalizeDetection(
  raw: NativeDetectedBarcode,
  index: number,
  frameSize: FrameSize,
): DetectedBarcode {
  const format = (raw.format ?? 'UNKNOWN') as BarcodeFormat;
  const text = raw.text ?? null;

  return {
    id: raw.id ?? buildBarcodeId(format, text, index),
    format,
    text,
    rawBytesBase64: raw.rawBytesBase64 ?? null,
    contentType: raw.contentType ?? 'TEXT',
    points: normalizePoints(raw.points),
    confidence: toFiniteNumber(raw.confidence),
    frameSize,
  };
}

export function normalizeNativeDetectionsFrame(raw: NativeDetectionsFrame): BarcodeDetectionsFrame {
  const timestampMs = toFiniteNumber(raw.timestampMs) || Date.now();
  const frameSize = normalizeFrameSize(raw.frameSize);
  const detections = Array.isArray(raw.detections)
    ? raw.detections.map((detection, index) => normalizeDetection(detection, index, frameSize))
    : [];

  return {
    frameId: raw.frameId ?? `native-${timestampMs}`,
    timestampMs,
    source: normalizeSource(raw.source),
    rotationDegrees: toFiniteNumber(raw.rotationDegrees),
    frameSize,
    detections,
  };
}

function asFrameFromDetections(detections: NativeDetectedBarcode[]): BarcodeDetectionsFrame {
  return normalizeNativeDetectionsFrame({
    frameId: `mock-${Date.now()}`,
    timestampMs: Date.now(),
    source: 'mock',
    rotationDegrees: 0,
    frameSize: {width: 0, height: 0},
    detections,
  });
}

export async function getNativeScannerStatus(): Promise<NativeScannerStatus> {
  if (NativeScannerModule?.getStatus) {
    const nativeStatus = await NativeScannerModule.getStatus();

    return {
      platform: nativeStatus.platform ?? Platform.OS,
      nativeModulePresent: Boolean(nativeStatus.nativeModulePresent),
      version: nativeStatus.version ?? 'unknown',
      cameraPermissionDeclared: Boolean(nativeStatus.cameraPermissionDeclared),
      cameraPermissionGranted: Boolean(nativeStatus.cameraPermissionGranted),
      mode: nativeStatus.mode === 'native' ? 'native' : 'stub',
      streaming: Boolean(nativeStatus.streaming),
      detectionEventName: nativeStatus.detectionEventName ?? NATIVE_DETECTIONS_EVENT,
    };
  }

  return {
    platform: Platform.OS,
    nativeModulePresent: false,
    version: 'unavailable',
    cameraPermissionDeclared: false,
    cameraPermissionGranted: false,
    mode: 'stub',
    streaming: false,
    detectionEventName: NATIVE_DETECTIONS_EVENT,
  };
}

export async function getNativeScannerCapabilities(): Promise<NativeScannerCapabilities> {
  if (NativeScannerModule?.getCapabilities) {
    const nativeCapabilities = await NativeScannerModule.getCapabilities();

    return {
      cameraPreview: Boolean(nativeCapabilities.cameraPreview),
      cameraPreviewView: Boolean(nativeCapabilities.cameraPreviewView),
      barcodeDecoding: Boolean(nativeCapabilities.barcodeDecoding),
      multiBarcodeSelection: Boolean(nativeCapabilities.multiBarcodeSelection),
      mockDetections: Boolean(nativeCapabilities.mockDetections),
      detectionEvents: Boolean(nativeCapabilities.detectionEvents),
      plannedEngine: nativeCapabilities.plannedEngine ?? 'unavailable',
      plannedCameraStack: nativeCapabilities.plannedCameraStack ?? 'unavailable',
    };
  }

  return {
    cameraPreview: false,
    cameraPreviewView: false,
    barcodeDecoding: false,
    multiBarcodeSelection: false,
    mockDetections: false,
    detectionEvents: false,
    plannedEngine: 'unavailable',
    plannedCameraStack: 'unavailable',
  };
}

export async function isNativeCameraPermissionGranted(): Promise<boolean> {
  if (NativeScannerModule?.isCameraPermissionGranted) {
    return NativeScannerModule.isCameraPermissionGranted();
  }

  return false;
}

export async function getNativeMockDetectionsFrame(): Promise<BarcodeDetectionsFrame | null> {
  if (!NativeScannerModule?.getMockDetections) {
    return null;
  }

  const detections = await NativeScannerModule.getMockDetections();
  return asFrameFromDetections(Array.isArray(detections) ? detections : []);
}

export async function getNativeMockDetections(): Promise<DetectedBarcode[]> {
  const frame = await getNativeMockDetectionsFrame();
  return frame?.detections ?? [];
}

export async function startNativeScanner(): Promise<void> {
  if (!NativeScannerModule?.startScanning) {
    return;
  }

  await NativeScannerModule.startScanning();
}

export async function stopNativeScanner(): Promise<void> {
  if (!NativeScannerModule?.stopScanning) {
    return;
  }

  await NativeScannerModule.stopScanning();
}

export async function setNativeDetectionThrottleMs(throttleMs: number): Promise<void> {
  if (!NativeScannerModule?.setDetectionThrottleMs) {
    return;
  }

  await NativeScannerModule.setDetectionThrottleMs(throttleMs);
}

export function subscribeToNativeDetections(
  onFrame: (frame: BarcodeDetectionsFrame) => void,
): () => void {
  if (!NativeScannerModule) {
    return () => undefined;
  }

  const emitter = new NativeEventEmitter(NativeScannerModule);
  const subscription = emitter.addListener(NATIVE_DETECTIONS_EVENT, (event: NativeDetectionsFrame) => {
    onFrame(normalizeNativeDetectionsFrame(event));
  });

  return () => {
    subscription.remove();
  };
}

export function formatNativeScannerStatus(status: NativeScannerStatus): string {
  if (!status.nativeModulePresent) {
    return 'Native scanner bridge is not loaded yet.';
  }

  const streamingPart = status.streaming ? 'streaming' : 'idle';

  return `${status.platform} / ${status.mode} / v${status.version} / ${streamingPart} / permission ${
    status.cameraPermissionGranted ? 'granted' : 'missing'
  }`;
}
