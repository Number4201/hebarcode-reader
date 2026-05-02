import {
  buildLogicalBarcodeKey,
  normalizeBarcodeFormat,
  resolveBarcodePayload,
} from './barcodeIdentity';
import { centroid, squaredDistance } from './geometry';
import type { DetectedBarcode, SelectionLock } from './types';

export function buildBarcodeId(
  format: string,
  text: string | null | undefined,
  index: number,
): string {
  return `${format}|${text ?? ''}|${index}`;
}

export function createSelectionLock(barcode: DetectedBarcode): SelectionLock {
  return {
    format: barcode.format,
    text: barcode.text,
    rawBytesBase64: barcode.rawBytesBase64,
    logicalKey: buildLogicalBarcodeKey(barcode),
    centroid: centroid(barcode.points),
    barcode,
    selectedAtMs: Date.now(),
  };
}

export function resolveSelectedBarcode(
  detections: DetectedBarcode[],
  lock: SelectionLock | null,
  maxDistance = 180,
): DetectedBarcode | null {
  if (!lock || detections.length === 0) {
    return null;
  }

  let nearestExact: {
    detection: DetectedBarcode;
    distanceSquared: number;
  } | null = null;
  let nearestFallback: {
    detection: DetectedBarcode;
    distanceSquared: number;
  } | null = null;
  const lockLogicalKey = buildSelectionLockLogicalKey(lock);

  for (const detection of detections) {
    const candidate = {
      detection,
      distanceSquared: squaredDistance(
        centroid(detection.points),
        lock.centroid,
      ),
    };

    if (
      buildLogicalBarcodeKey(detection) === lockLogicalKey
    ) {
      if (
        !nearestExact ||
        candidate.distanceSquared < nearestExact.distanceSquared
      ) {
        nearestExact = candidate;
      }
      continue;
    }

    if (
      !nearestFallback ||
      candidate.distanceSquared < nearestFallback.distanceSquared
    ) {
      nearestFallback = candidate;
    }
  }

  const nearest = nearestExact ?? nearestFallback;

  if (!nearest) {
    return null;
  }

  return nearest.distanceSquared <= maxDistance * maxDistance
    ? nearest.detection
    : null;
}

function buildSelectionLockLogicalKey(lock: SelectionLock): string {
  if (lock.logicalKey) {
    return lock.logicalKey;
  }

  return `${normalizeBarcodeFormat(lock.format)}|${resolveBarcodePayload({
    ...lock.barcode,
    format: lock.format,
    text: lock.text,
    rawBytesBase64: lock.rawBytesBase64,
  })}`;
}
