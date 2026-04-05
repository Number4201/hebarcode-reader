import {
  formatNativeScannerStatus,
  normalizeNativeDetectionsFrame,
} from '../src/native/HebarcodeScanner';

describe('Hebarcode scanner native bridge normalization', () => {
  it('normalizes detection frame payload from native', () => {
    const frame = normalizeNativeDetectionsFrame({
      frameId: 'frame-1',
      timestampMs: 1710000000000,
      source: 'camera',
      rotationDegrees: 90,
      frameSize: {width: 1920, height: 1080},
      detections: [
        {
          format: 'QR_CODE',
          text: 'hello',
          contentType: 'TEXT',
          points: [
            {x: 1, y: 2},
            {x: 11, y: 2},
            {x: 11, y: 12},
            {x: 1, y: 12},
          ],
          confidence: 0.97,
        },
      ],
    });

    expect(frame.frameId).toBe('frame-1');
    expect(frame.source).toBe('camera');
    expect(frame.rotationDegrees).toBe(90);
    expect(frame.frameSize).toEqual({width: 1920, height: 1080});
    expect(frame.detections).toHaveLength(1);
    expect(frame.detections[0]?.id).toBe('QR_CODE|hello|0');
    expect(frame.detections[0]?.confidence).toBe(0.97);
  });

  it('falls back safely for incomplete payloads', () => {
    const frame = normalizeNativeDetectionsFrame({
      source: 'unexpected-source',
      detections: [{format: 'EAN_13'}],
    });

    expect(frame.source).toBe('mock');
    expect(frame.detections[0]?.contentType).toBe('TEXT');
    expect(frame.detections[0]?.points).toEqual([
      {x: 0, y: 0},
      {x: 0, y: 0},
      {x: 0, y: 0},
      {x: 0, y: 0},
    ]);
  });

  it('formats status string with streaming state', () => {
    const label = formatNativeScannerStatus({
      platform: 'android',
      nativeModulePresent: true,
      version: '0.2.0-scaffold',
      cameraPermissionDeclared: true,
      cameraPermissionGranted: true,
      mode: 'stub',
      streaming: true,
      detectionEventName: 'HebarcodeScanner.onDetections',
    });

    expect(label).toContain('android / stub / v0.2.0-scaffold');
    expect(label).toContain('streaming');
  });
});
