import {centroid, distance} from './selection';
import type {BarcodeDetectionsFrame, DetectedBarcode} from './types';

const DEFAULT_TTL_MS = 700;
const INSTANCE_MATCH_DISTANCE = 64;

export function fuseDetectionFrame(
  previousFrame: BarcodeDetectionsFrame | null,
  nextFrame: BarcodeDetectionsFrame,
  ttlMs = DEFAULT_TTL_MS,
): BarcodeDetectionsFrame {
  if (nextFrame.source !== 'camera') {
    return nextFrame;
  }

  const merged = [...nextFrame.detections];

  if (
    previousFrame &&
    previousFrame.source === 'camera' &&
    nextFrame.timestampMs - previousFrame.timestampMs <= ttlMs
  ) {
    for (const detection of previousFrame.detections) {
      if (!hasMatchingDetection(merged, detection)) {
        merged.push(detection);
      }
    }
  }

  return {
    ...nextFrame,
    detections: merged,
  };
}

function hasMatchingDetection(
  detections: DetectedBarcode[],
  candidate: DetectedBarcode,
): boolean {
  return detections.some(current => detectionsRepresentSameInstance(current, candidate));
}

function detectionsRepresentSameInstance(
  left: DetectedBarcode,
  right: DetectedBarcode,
): boolean {
  if (left.id === right.id) {
    return true;
  }

  if (!haveSamePayload(left, right)) {
    return false;
  }

  return distance(centroid(left.points), centroid(right.points)) <= INSTANCE_MATCH_DISTANCE;
}

function haveSamePayload(left: DetectedBarcode, right: DetectedBarcode): boolean {
  if (left.format !== right.format) {
    return false;
  }

  const leftText = left.text?.trim();
  const rightText = right.text?.trim();

  if (leftText || rightText) {
    return leftText === rightText;
  }

  if (left.rawBytesBase64 || right.rawBytesBase64) {
    return left.rawBytesBase64 === right.rawBytesBase64;
  }

  return false;
}
