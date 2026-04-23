import {fuseDetectionFrame} from '../src/scanner/frameFusion';
import type {BarcodeDetectionsFrame, DetectedBarcode} from '../src/scanner/types';

function makeDetection(id: string, format: string, text: string, x: number): DetectedBarcode {
  return {
    id,
    format,
    text,
    contentType: 'TEXT',
    points: [
      {x, y: 10},
      {x: x + 20, y: 10},
      {x: x + 20, y: 30},
      {x, y: 30},
    ],
    frameSize: {width: 200, height: 100},
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
    frameSize: {width: 200, height: 100},
    detections,
  };
}

describe('frameFusion', () => {
  it('keeps recent camera detections for a short ttl window', () => {
    const previous = makeFrame(1000, [makeDetection('a', 'QR_CODE', 'alpha', 10)]);
    const next = makeFrame(1200, [makeDetection('b', 'CODE_128', 'beta', 100)]);

    const fused = fuseDetectionFrame(previous, next, 500);

    expect(fused.detections.map(item => item.text)).toEqual(['beta', 'alpha']);
  });

  it('drops stale detections outside the ttl window', () => {
    const previous = makeFrame(1000, [makeDetection('a', 'QR_CODE', 'alpha', 10)]);
    const next = makeFrame(1800, [makeDetection('b', 'CODE_128', 'beta', 100)]);

    const fused = fuseDetectionFrame(previous, next, 500);

    expect(fused.detections.map(item => item.text)).toEqual(['beta']);
  });

  it('keeps separate detections with the same decoded content when they are spatially distinct', () => {
    const previous = makeFrame(1000, [makeDetection('a', 'QR_CODE', 'same', 10)]);
    const next = makeFrame(1200, [makeDetection('b', 'QR_CODE', 'same', 90)]);

    const fused = fuseDetectionFrame(previous, next, 500);

    expect(fused.detections.map(item => item.id)).toEqual(['b', 'a']);
  });

  it('deduplicates the same logical detection when it only shifts slightly between frames', () => {
    const previous = makeFrame(1000, [makeDetection('a', 'QR_CODE', 'same', 10)]);
    const next = makeFrame(1200, [makeDetection('b', 'QR_CODE', 'same', 18)]);

    const fused = fuseDetectionFrame(previous, next, 500);

    expect(fused.detections).toHaveLength(1);
    expect(fused.detections[0]?.id).toBe('b');
  });
});
