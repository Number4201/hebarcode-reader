import {
  buildBarcodeId,
  centroid,
  distance,
  resolveSelectedBarcode,
} from '../src/scanner/selection';
import type {DetectedBarcode, SelectionLock} from '../src/scanner/types';

function makeBarcode(
  id: string,
  format: string,
  text: string,
  x: number,
  y: number,
): DetectedBarcode {
  return {
    id,
    format,
    text,
    contentType: 'TEXT',
    points: [
      {x, y},
      {x: x + 10, y},
      {x: x + 10, y: y + 10},
      {x, y: y + 10},
    ],
  };
}

describe('scanner selection helpers', () => {
  it('computes centroid for a quadrilateral', () => {
    expect(
      centroid([
        {x: 0, y: 0},
        {x: 10, y: 0},
        {x: 10, y: 10},
        {x: 0, y: 10},
      ]),
    ).toEqual({x: 5, y: 5});
  });

  it('computes euclidean distance', () => {
    expect(distance({x: 0, y: 0}, {x: 3, y: 4})).toBe(5);
  });

  it('builds stable ids', () => {
    expect(buildBarcodeId('QR_CODE', 'hello', 2)).toBe('QR_CODE|hello|2');
    expect(buildBarcodeId('EAN_13', null, 0)).toBe('EAN_13||0');
  });

  it('prefers exact format/text match near the previous centroid', () => {
    const detections = [
      makeBarcode('a', 'QR_CODE', 'target', 10, 10),
      makeBarcode('b', 'QR_CODE', 'other', 100, 100),
    ];

    const lock: SelectionLock = {
      format: 'QR_CODE',
      text: 'target',
      centroid: {x: 12, y: 14},
    };

    expect(resolveSelectedBarcode(detections, lock)?.id).toBe('a');
  });

  it('falls back to nearest detection when exact text is gone', () => {
    const detections = [
      makeBarcode('a', 'QR_CODE', 'first', 10, 10),
      makeBarcode('b', 'CODE_128', 'second', 200, 200),
    ];

    const lock: SelectionLock = {
      format: 'QR_CODE',
      text: 'missing-now',
      centroid: {x: 11, y: 11},
    };

    expect(resolveSelectedBarcode(detections, lock)?.id).toBe('a');
  });

  it('returns null when nothing is close enough', () => {
    const detections = [makeBarcode('a', 'QR_CODE', 'target', 500, 500)];
    const lock: SelectionLock = {
      format: 'QR_CODE',
      text: 'target',
      centroid: {x: 0, y: 0},
    };

    expect(resolveSelectedBarcode(detections, lock, 100)).toBeNull();
  });
});
