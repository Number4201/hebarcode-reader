import {
  DeviceEventEmitter,
  NativeEventEmitter,
  NativeModules,
  Platform,
  type NativeModule,
} from 'react-native';
import { buildBarcodeId } from '../scanner/selection';
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
  previewAttached?: boolean;
  mode: 'ready' | 'native';
  pipelineBound?: boolean;
  streaming?: boolean;
  torchEnabled?: boolean;
  analyzerPreviewEnabled?: boolean;
  detectionEventName?: string;
  bindingInProgress?: boolean;
  scanningRequested?: boolean;
  lastErrorCode?: string | null;
  lastErrorMessage?: string | null;
  pipelineBoundAtMs?: number;
  frameFlowActiveWindowMs?: number;
  previewAttachedAtMs?: number;
  previewWidth?: number;
  previewHeight?: number;
  analyzedFrameCount?: number;
  emittedFrameCount?: number;
  lastAnalyzedAtMs?: number;
  lastEmittedAtMs?: number;
  lastDetectionCount?: number;
  lastDecodeMode?: 'fast' | 'deep' | string;
  fastDecodeCount?: number;
  deepDecodeCount?: number;
};

export type NativeScannerCapabilities = {
  cameraPreview: boolean;
  cameraPreviewView: boolean;
  barcodeDecoding: boolean;
  multiBarcodeSelection: boolean;
  sampleDetections: boolean;
  detectionEvents: boolean;
  torchControl: boolean;
  autoTorchAssist: boolean;
  engine: string;
  cameraStack: string;
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
  previewImageBase64?: string | null;
  previewImageMimeType?: string | null;
};

type NativeScannerModuleShape = {
  getStatus?: () => Promise<NativeScannerStatus>;
  getCapabilities?: () => Promise<NativeScannerCapabilities>;
  isCameraPermissionGranted?: () => Promise<boolean>;
  getMockDetections?: () => Promise<NativeDetectedBarcode[]>;
  startScanning?: () => Promise<void>;
  retryScanning?: () => Promise<void>;
  stopScanning?: () => Promise<void>;
  setAssistModeEnabled?: (enabled: boolean) => Promise<void>;
  setAnalyzerPreviewEnabled?: (enabled: boolean) => Promise<void>;
  setDetectionThrottleMs?: (throttleMs: number) => Promise<void>;
  addListener: (eventName: string) => void;
  removeListeners: (count: number) => void;
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
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ];
  }

  const points = raw.slice(0, 4).map(point => normalizePoint(point));

  while (points.length < 4) {
    points.push({ x: 0, y: 0 });
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

export function normalizeNativeDetectionsFrame(
  raw: NativeDetectionsFrame,
): BarcodeDetectionsFrame {
  const timestampMs = toFiniteNumber(raw.timestampMs) || Date.now();
  const frameSize = normalizeFrameSize(raw.frameSize);
  const detections = Array.isArray(raw.detections)
    ? raw.detections.map((detection, index) =>
        normalizeDetection(detection, index, frameSize),
      )
    : [];

  return {
    frameId: raw.frameId ?? `native-${timestampMs}`,
    timestampMs,
    source: normalizeSource(raw.source),
    rotationDegrees: toFiniteNumber(raw.rotationDegrees),
    frameSize,
    detections,
    previewImageBase64:
      typeof raw.previewImageBase64 === 'string' &&
      raw.previewImageBase64.length > 0
        ? raw.previewImageBase64
        : null,
    previewImageMimeType: raw.previewImageMimeType ?? null,
  };
}

function asFrameFromDetections(
  detections: NativeDetectedBarcode[],
): BarcodeDetectionsFrame {
  return normalizeNativeDetectionsFrame({
    frameId: `mock-${Date.now()}`,
    timestampMs: Date.now(),
    source: 'mock',
    rotationDegrees: 0,
    frameSize: { width: 0, height: 0 },
    detections,
  });
}

export async function getNativeScannerStatus(): Promise<NativeScannerStatus> {
  if (NativeScannerModule?.getStatus) {
    const nativeStatus = await NativeScannerModule.getStatus();
    const mode = nativeStatus.mode === 'native' ? 'native' : 'ready';
    const pipelineBound =
      nativeStatus.pipelineBound === undefined
        ? mode === 'native'
        : Boolean(nativeStatus.pipelineBound);

    return {
      platform: nativeStatus.platform ?? Platform.OS,
      nativeModulePresent: Boolean(nativeStatus.nativeModulePresent),
      version: nativeStatus.version ?? 'unknown',
      cameraPermissionDeclared: Boolean(nativeStatus.cameraPermissionDeclared),
      cameraPermissionGranted: Boolean(nativeStatus.cameraPermissionGranted),
      previewAttached: Boolean(nativeStatus.previewAttached),
      mode,
      pipelineBound,
      streaming: Boolean(nativeStatus.streaming),
      torchEnabled: Boolean(nativeStatus.torchEnabled),
      analyzerPreviewEnabled: Boolean(nativeStatus.analyzerPreviewEnabled),
      detectionEventName:
        nativeStatus.detectionEventName ?? NATIVE_DETECTIONS_EVENT,
      bindingInProgress: Boolean(nativeStatus.bindingInProgress),
      scanningRequested: Boolean(nativeStatus.scanningRequested),
      lastErrorCode: nativeStatus.lastErrorCode ?? null,
      lastErrorMessage: nativeStatus.lastErrorMessage ?? null,
      pipelineBoundAtMs: toFiniteNumber(nativeStatus.pipelineBoundAtMs),
      frameFlowActiveWindowMs: toFiniteNumber(
        nativeStatus.frameFlowActiveWindowMs,
      ),
      previewAttachedAtMs: toFiniteNumber(nativeStatus.previewAttachedAtMs),
      previewWidth: toFiniteNumber(nativeStatus.previewWidth),
      previewHeight: toFiniteNumber(nativeStatus.previewHeight),
      analyzedFrameCount: toFiniteNumber(nativeStatus.analyzedFrameCount),
      emittedFrameCount: toFiniteNumber(nativeStatus.emittedFrameCount),
      lastAnalyzedAtMs: toFiniteNumber(nativeStatus.lastAnalyzedAtMs),
      lastEmittedAtMs: toFiniteNumber(nativeStatus.lastEmittedAtMs),
      lastDetectionCount: toFiniteNumber(nativeStatus.lastDetectionCount),
      lastDecodeMode: nativeStatus.lastDecodeMode ?? 'fast',
      fastDecodeCount: toFiniteNumber(nativeStatus.fastDecodeCount),
      deepDecodeCount: toFiniteNumber(nativeStatus.deepDecodeCount),
    };
  }

  return {
    platform: Platform.OS,
    nativeModulePresent: false,
    version: 'unavailable',
    cameraPermissionDeclared: false,
    cameraPermissionGranted: false,
    previewAttached: false,
    mode: 'ready',
    pipelineBound: false,
    streaming: false,
    torchEnabled: false,
    analyzerPreviewEnabled: false,
    detectionEventName: NATIVE_DETECTIONS_EVENT,
    bindingInProgress: false,
    scanningRequested: false,
    lastErrorCode: null,
    lastErrorMessage: null,
    pipelineBoundAtMs: 0,
    frameFlowActiveWindowMs: 0,
    previewAttachedAtMs: 0,
    previewWidth: 0,
    previewHeight: 0,
    analyzedFrameCount: 0,
    emittedFrameCount: 0,
    lastAnalyzedAtMs: 0,
    lastEmittedAtMs: 0,
    lastDetectionCount: 0,
    lastDecodeMode: 'fast',
    fastDecodeCount: 0,
    deepDecodeCount: 0,
  };
}

export function isNativeScannerPipelineBound(
  status:
    | Pick<NativeScannerStatus, 'mode' | 'pipelineBound'>
    | null
    | undefined,
): boolean {
  if (!status) {
    return false;
  }

  return Boolean(status.pipelineBound ?? status.mode === 'native');
}

export function isNativeScannerFrameFlowStale(
  status: NativeScannerStatus | null | undefined,
  staleAfterMs: number,
  now = Date.now(),
): boolean {
  if (!status || !isNativeScannerPipelineBound(status)) {
    return false;
  }

  const pipelineAgeMs =
    status.pipelineBoundAtMs && status.pipelineBoundAtMs > 0
      ? now - status.pipelineBoundAtMs
      : Number.POSITIVE_INFINITY;
  const lastAnalyzedAtMs = status.lastAnalyzedAtMs ?? 0;
  const frameIsFromCurrentBind =
    lastAnalyzedAtMs > 0 &&
    (!status.pipelineBoundAtMs || lastAnalyzedAtMs >= status.pipelineBoundAtMs);
  const frameFlowAgeMs = frameIsFromCurrentBind
    ? now - lastAnalyzedAtMs
    : Number.POSITIVE_INFINITY;

  return Boolean(
    status.scanningRequested &&
      status.previewAttached &&
      !status.streaming &&
      !status.bindingInProgress &&
      Math.min(pipelineAgeMs, frameFlowAgeMs) >= staleAfterMs,
  );
}

export async function getNativeScannerCapabilities(): Promise<NativeScannerCapabilities> {
  if (NativeScannerModule?.getCapabilities) {
    const nativeCapabilities = await NativeScannerModule.getCapabilities();

    return {
      cameraPreview: Boolean(nativeCapabilities.cameraPreview),
      cameraPreviewView: Boolean(nativeCapabilities.cameraPreviewView),
      barcodeDecoding: Boolean(nativeCapabilities.barcodeDecoding),
      multiBarcodeSelection: Boolean(nativeCapabilities.multiBarcodeSelection),
      sampleDetections: Boolean(nativeCapabilities.sampleDetections),
      detectionEvents: Boolean(nativeCapabilities.detectionEvents),
      torchControl: Boolean(nativeCapabilities.torchControl),
      autoTorchAssist: Boolean(nativeCapabilities.autoTorchAssist),
      engine: nativeCapabilities.engine ?? 'unavailable',
      cameraStack: nativeCapabilities.cameraStack ?? 'unavailable',
    };
  }

  return {
    cameraPreview: false,
    cameraPreviewView: false,
    barcodeDecoding: false,
    multiBarcodeSelection: false,
    sampleDetections: false,
    detectionEvents: false,
    torchControl: false,
    autoTorchAssist: false,
    engine: 'unavailable',
    cameraStack: 'unavailable',
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

export async function retryNativeScanner(): Promise<void> {
  if (NativeScannerModule?.retryScanning) {
    await NativeScannerModule.retryScanning();
    return;
  }

  await stopNativeScanner();
  await startNativeScanner();
}

export async function stopNativeScanner(): Promise<void> {
  if (!NativeScannerModule?.stopScanning) {
    return;
  }

  await NativeScannerModule.stopScanning();
}

export async function setNativeDetectionThrottleMs(
  throttleMs: number,
): Promise<void> {
  if (!NativeScannerModule?.setDetectionThrottleMs) {
    return;
  }

  await NativeScannerModule.setDetectionThrottleMs(throttleMs);
}

export async function setNativeAssistModeEnabled(
  enabled: boolean,
): Promise<void> {
  if (!NativeScannerModule?.setAssistModeEnabled) {
    return;
  }

  await NativeScannerModule.setAssistModeEnabled(enabled);
}

export async function setNativeAnalyzerPreviewEnabled(
  enabled: boolean,
): Promise<void> {
  if (!NativeScannerModule?.setAnalyzerPreviewEnabled) {
    return;
  }

  await NativeScannerModule.setAnalyzerPreviewEnabled(enabled);
}

export function subscribeToNativeDetections(
  onFrame: (frame: BarcodeDetectionsFrame) => void,
): () => void {
  const handleEvent = (event: NativeDetectionsFrame) => {
    onFrame(normalizeNativeDetectionsFrame(event));
  };

  if (Platform.OS === 'android') {
    const subscription = DeviceEventEmitter.addListener(
      NATIVE_DETECTIONS_EVENT,
      handleEvent,
    );

    return () => {
      subscription.remove();
    };
  }

  if (
    !NativeScannerModule?.addListener ||
    !NativeScannerModule.removeListeners
  ) {
    return () => undefined;
  }

  const emitter = new NativeEventEmitter(NativeScannerModule as NativeModule);
  const subscription = emitter.addListener(
    NATIVE_DETECTIONS_EVENT,
    handleEvent,
  );

  return () => {
    subscription.remove();
  };
}

export function formatNativeScannerStatus(status: NativeScannerStatus): string {
  if (!status.nativeModulePresent) {
    return 'Scanner bridge unavailable';
  }

  if (status.lastErrorCode) {
    return `${status.platform} / ${status.mode} / v${status.version} / camera error ${status.lastErrorCode}`;
  }

  const pipelineBound = isNativeScannerPipelineBound(status);
  const streamingPart = status.streaming
    ? 'live'
    : pipelineBound
    ? 'bound waiting for frames'
    : 'idle';
  const previewPart = status.previewAttached
    ? status.bindingInProgress
      ? 'preview binding'
      : 'preview ready'
    : 'preview starting';
  const torchPart = status.torchEnabled ? ' / torch assist' : '';

  return `${status.platform} / ${status.mode} / v${
    status.version
  } / ${streamingPart} / ${previewPart} / camera ${
    status.cameraPermissionGranted ? 'ready' : 'permission needed'
  }${torchPart}`;
}
