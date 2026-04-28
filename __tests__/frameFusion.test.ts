import { fuseDetectionFrame } from '../src/scanner/frameFusion';
import type {
  BarcodeDetectionsFrame,
  DetectedBarcode,
} from '../src/scanner/types';

function makeDetection(
  id: string,
  format: string,
  text: string,
  x: number,
): DetectedBarcode {
  return {
    id,
    format,
    text,
    contentType: 'TEXT',
    points: [
      { x, y: 10 },
      { x: x + 20, y: 10 },
      { x: x + 20, y: 30 },
      { x, y: 30 },
    ],
    frameSize: { width: 200, height: 100 },
  };
}

function makeFrame(
  timestampMs: number,
  detections: DetectedBarcode[],
): BarcodeDetectionsFrame {
  return {
    frameId: `frame-${timestampMs}`,
    timestampMs,
    source: 'camera',
    rotationDegrees: 0,
    frameSize: { width: 200, height: 100 },
    detections,
  };
}

describe('frameFusion', () => {
  it('keeps recent camera detections for a short ttl window', () => {
    const previous = makeFrame(1000, [
      makeDetection('a', 'QR_CODE', 'alpha', 10),
    ]);
    const next = makeFrame(1200, [makeDetection('b', 'CODE_128', 'beta', 100)]);

    const fused = fuseDetectionFrame(previous, next, 500);

    expect(fused.detections.map(item => item.text)).toEqual(['beta', 'alpha']);
  });

  it('drops stale detections outside the ttl window', () => {
    const previous = makeFrame(1000, [
      makeDetection('a', 'QR_CODE', 'alpha', 10),
    ]);
    const next = makeFrame(1800, [makeDetection('b', 'CODE_128', 'beta', 100)]);

    const fused = fuseDetectionFrame(previous, next, 500);

    expect(fused.detections.map(item => item.text)).toEqual(['beta']);
  });

  it('keeps a briefly missed detection through a short decoder dropout', () => {
    const previous = makeFrame(1000, [
      makeDetection('a', 'QR_CODE', 'alpha', 10),
    ]);
    const next = makeFrame(1300, []);

    const fused = fuseDetectionFrame(previous, next);

    expect(fused.detections.map(item => item.text)).toEqual(['alpha']);
  });

  it('drops disappeared detections quickly with the default scanner ttl', () => {
    const previous = makeFrame(1000, [
      makeDetection('a', 'QR_CODE', 'alpha', 10),
    ]);
    const next = makeFrame(1400, []);

    const fused = fuseDetectionFrame(previous, next);

    expect(fused.detections).toHaveLength(0);
  });

  it('does not carry detections across rotated frame geometry', () => {
    const previous = {
      ...makeFrame(1000, [makeDetection('a', 'QR_CODE', 'alpha', 10)]),
      rotationDegrees: 90,
      frameSize: { width: 100, height: 200 },
    };
    const next = makeFrame(1200, [makeDetection('b', 'CODE_128', 'beta', 100)]);

    const fused = fuseDetectionFrame(previous, next, 500);

    expect(fused.detections.map(item => item.text)).toEqual(['beta']);
  });

  it('does not reuse analyzer preview images after frame geometry changes', () => {
    const previous = {
      ...makeFrame(1000, []),
      rotationDegrees: 90,
      frameSize: { width: 100, height: 200 },
      previewImageBase64: 'rotated-jpeg-preview',
      previewImageMimeType: 'image/jpeg',
      previewImageTimestampMs: 1000,
    };
    const next = makeFrame(1200, []);

    const fused = fuseDetectionFrame(previous, next, 500);

    expect(fused.previewImageBase64).toBeNull();
    expect(fused.previewImageMimeType).toBeNull();
    expect(fused.previewImageTimestampMs).toBeNull();
  });

  it('keeps separate detections with the same decoded content when they are spatially distinct', () => {
    const previous = makeFrame(1000, [
      makeDetection('a', 'QR_CODE', 'same', 10),
    ]);
    const next = makeFrame(1200, [makeDetection('b', 'QR_CODE', 'same', 90)]);

    const fused = fuseDetectionFrame(previous, next, 500);

    expect(fused.detections.map(item => item.id)).toEqual(['b', 'a']);
  });

  it('deduplicates the same logical detection when it only shifts slightly between frames', () => {
    const previous = makeFrame(1000, [
      makeDetection('a', 'QR_CODE', 'same', 10),
    ]);
    const next = makeFrame(1200, [makeDetection('b', 'QR_CODE', 'same', 18)]);

    const fused = fuseDetectionFrame(previous, next, 500);

    expect(fused.detections).toHaveLength(1);
    expect(fused.detections[0]?.id).toBe('a');
  });

  it('keeps the same id and smooths points for a stable tracked code', () => {
    const previous = makeFrame(1000, [
      makeDetection('a', 'CODE_128', 'same', 10),
    ]);
    const next = makeFrame(1080, [makeDetection('b', 'CODE_128', 'same', 30)]);

    const fused = fuseDetectionFrame(previous, next, 500);

    expect(fused.detections).toHaveLength(1);
    expect(fused.detections[0]?.id).toBe('a');
    expect(fused.detections[0]?.points[0]?.x).toBeCloseTo(19, 0);
    expect(fused.detections[0]?.lastSeenTimestampMs).toBe(1080);
  });

  it('deduplicates duplicate detections with the same payload in one frame', () => {
    const next = makeFrame(1000, [
      makeDetection('a', 'CODE_128', 'same', 10),
      makeDetection('b', 'CODE_128', 'same', 18),
    ]);

    const fused = fuseDetectionFrame(null, next, 500);

    expect(fused.detections).toHaveLength(1);
  });

  it('matches equivalent two-dimensional format aliases across engines', () => {
    const previous = makeFrame(1000, [
      makeDetection('a', 'PDF417', 'same-2d', 10),
    ]);
    const next = makeFrame(1100, [
      makeDetection('b', 'PDF_417', 'same-2d', 14),
    ]);

    const fused = fuseDetectionFrame(previous, next, 500);

    expect(fused.detections).toHaveLength(1);
    expect(fused.detections[0]?.id).toBe('a');
  });

  it('keeps the last analyzer preview image when the next camera event is throttled', () => {
    const previous = {
      ...makeFrame(1000, []),
      previewImageBase64: 'jpeg-preview',
      previewImageMimeType: 'image/jpeg',
      previewImageTimestampMs: 1000,
    };
    const next = makeFrame(1200, []);

    const fused = fuseDetectionFrame(previous, next, 500);

    expect(fused.previewImageBase64).toBe('jpeg-preview');
    expect(fused.previewImageMimeType).toBe('image/jpeg');
    expect(fused.previewImageTimestampMs).toBe(1000);
  });

  it('drops a stale analyzer preview image independently from the frame timestamp', () => {
    const previous = {
      ...makeFrame(2200, []),
      previewImageBase64: 'old-jpeg-preview',
      previewImageMimeType: 'image/jpeg',
      previewImageTimestampMs: 1000,
    };
    const next = makeFrame(2800, []);

    const fused = fuseDetectionFrame(previous, next, 700);

    expect(fused.previewImageBase64).toBeNull();
    expect(fused.previewImageMimeType).toBeNull();
    expect(fused.previewImageTimestampMs).toBeNull();
  });
});
