import {
  formatNativeScannerStatus,
  isNativeScannerFrameFlowStale,
  isNativeScannerPipelineBound,
  isNativeScannerPreviewStreamStale,
  normalizeNativeDetectionsFrame,
} from '../src/native/HebarcodeScanner';

describe('Hebarcode scanner native bridge normalization', () => {
  it('normalizes detection frame payload from native', () => {
    const frame = normalizeNativeDetectionsFrame({
      frameId: 'frame-1',
      timestampMs: 1710000000000,
      source: 'camera',
      rotationDegrees: 90,
      frameSize: { width: 1920, height: 1080 },
      previewImageBase64: 'jpeg-preview',
      previewImageTimestampMs: 1710000000000,
      detections: [
        {
          format: 'QR_CODE',
          text: 'hello',
          contentType: 'TEXT',
          points: [
            { x: 1, y: 2 },
            { x: 11, y: 2 },
            { x: 11, y: 12 },
            { x: 1, y: 12 },
          ],
          confidence: 0.97,
        },
      ],
    });

    expect(frame.frameId).toBe('frame-1');
    expect(frame.source).toBe('camera');
    expect(frame.rotationDegrees).toBe(90);
    expect(frame.frameSize).toEqual({ width: 1920, height: 1080 });
    expect(frame.previewImageTimestampMs).toBe(1710000000000);
    expect(frame.detections).toHaveLength(1);
    expect(frame.detections[0]?.id).toBe('QR_CODE|hello|0');
    expect(frame.detections[0]?.confidence).toBe(0.97);
  });

  it('falls back safely for incomplete payloads', () => {
    const frame = normalizeNativeDetectionsFrame({
      source: 'unexpected-source',
      detections: [{ format: 'EAN_13' }],
    });

    expect(frame.source).toBe('mock');
    expect(frame.detections[0]?.contentType).toBe('TEXT');
    expect(frame.detections[0]?.points).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ]);
  });

  it('formats status string with streaming state', () => {
    const label = formatNativeScannerStatus({
      platform: 'android',
      nativeModulePresent: true,
      version: '0.3.0',
      cameraPermissionDeclared: true,
      cameraPermissionGranted: true,
      mode: 'ready',
      streaming: true,
      pipelineBound: true,
      detectionEventName: 'HebarcodeScanner.onDetections',
    });

    expect(label).toContain('android / ready / v0.3.0');
    expect(label).toContain('live');
  });

  it('distinguishes a bound CameraX pipeline from live analyzer frame flow', () => {
    const label = formatNativeScannerStatus({
      platform: 'android',
      nativeModulePresent: true,
      version: '0.3.0',
      cameraPermissionDeclared: true,
      cameraPermissionGranted: true,
      mode: 'native',
      pipelineBound: true,
      streaming: false,
      previewAttached: true,
      detectionEventName: 'HebarcodeScanner.onDetections',
    });

    expect(label).toContain('bound waiting for frames');
    expect(label).toContain('preview idle');
  });

  it('keeps idle status when CameraX is not bound', () => {
    const label = formatNativeScannerStatus({
      platform: 'android',
      nativeModulePresent: true,
      version: '0.3.0',
      cameraPermissionDeclared: true,
      cameraPermissionGranted: true,
      mode: 'ready',
      pipelineBound: false,
      streaming: false,
      previewAttached: false,
      detectionEventName: 'HebarcodeScanner.onDetections',
    });

    expect(label).toContain('idle');
    expect(label).toContain('preview starting');
  });

  it('detects stale analyzer frame flow only after CameraX has had time to produce frames', () => {
    expect(
      isNativeScannerPipelineBound({
        mode: 'native',
      }),
    ).toBe(true);
    expect(
      isNativeScannerFrameFlowStale(
        {
          platform: 'android',
          nativeModulePresent: true,
          version: '0.3.0',
          cameraPermissionDeclared: true,
          cameraPermissionGranted: true,
          mode: 'native',
          pipelineBound: true,
          pipelineBoundAtMs: 1710000000000,
          previewAttached: true,
          streaming: false,
          bindingInProgress: false,
          scanningRequested: true,
          lastAnalyzedAtMs: 0,
        },
        4500,
        1710000006000,
      ),
    ).toBe(true);
    expect(
      isNativeScannerFrameFlowStale(
        {
          platform: 'android',
          nativeModulePresent: true,
          version: '0.3.0',
          cameraPermissionDeclared: true,
          cameraPermissionGranted: true,
          mode: 'native',
          pipelineBound: true,
          pipelineBoundAtMs: 1710000000000,
          previewAttached: true,
          streaming: true,
          bindingInProgress: false,
          scanningRequested: true,
          lastAnalyzedAtMs: 1710000005900,
        },
        4500,
        1710000006000,
      ),
    ).toBe(false);
  });

  it('detects stale preview stream only after the native view has size and CameraX is bound', () => {
    expect(
      isNativeScannerPreviewStreamStale(
        {
          platform: 'android',
          nativeModulePresent: true,
          version: '0.3.0',
          cameraPermissionDeclared: true,
          cameraPermissionGranted: true,
          mode: 'native',
          pipelineBound: true,
          pipelineBoundAtMs: 1710000000000,
          previewAttached: true,
          previewSizeReady: true,
          previewStreaming: false,
          bindingInProgress: false,
          scanningRequested: true,
          lastAnalyzedAtMs: 1710000005900,
          streaming: true,
        },
        4500,
        1710000006000,
      ),
    ).toBe(true);
    expect(
      isNativeScannerPreviewStreamStale(
        {
          platform: 'android',
          nativeModulePresent: true,
          version: '0.3.0',
          cameraPermissionDeclared: true,
          cameraPermissionGranted: true,
          mode: 'native',
          pipelineBound: true,
          pipelineBoundAtMs: 1710000000000,
          previewAttached: true,
          previewSizeReady: false,
          previewStreaming: false,
          bindingInProgress: false,
          scanningRequested: true,
        },
        4500,
        1710000006000,
      ),
    ).toBe(false);
  });

  it('surfaces camera startup errors in the status string', () => {
    const label = formatNativeScannerStatus({
      platform: 'android',
      nativeModulePresent: true,
      version: '0.3.0',
      cameraPermissionDeclared: true,
      cameraPermissionGranted: true,
      mode: 'ready',
      streaming: false,
      lastErrorCode: 'E_CAMERA_BIND',
      lastErrorMessage: 'Camera pipeline failed to start',
    });

    expect(label).toContain('camera error E_CAMERA_BIND');
  });
});
