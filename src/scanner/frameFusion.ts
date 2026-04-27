import {centroid, squaredDistance} from './selection';
import type {BarcodeDetectionsFrame, DetectedBarcode} from './types';

const DEFAULT_TTL_MS = 700;
const PREVIEW_IMAGE_TTL_MS = 1500;
const INSTANCE_MATCH_DISTANCE = 64;
const INSTANCE_MATCH_DISTANCE_SQUARED = INSTANCE_MATCH_DISTANCE * INSTANCE_MATCH_DISTANCE;

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

  const nextPreviewTimestampMs = nextFrame.previewImageBase64
    ? nextFrame.previewImageTimestampMs ?? nextFrame.timestampMs
    : null;
  const previousPreviewTimestampMs = previousFrame?.previewImageBase64
    ? previousFrame.previewImageTimestampMs ?? previousFrame.timestampMs
    : null;
  const canReusePreviousPreview =
    previousFrame?.source === 'camera' &&
    Boolean(previousFrame.previewImageBase64) &&
    previousPreviewTimestampMs !== null &&
    nextFrame.timestampMs - previousPreviewTimestampMs <= PREVIEW_IMAGE_TTL_MS;

  return {
    ...nextFrame,
    detections: merged,
    previewImageBase64:
      nextFrame.previewImageBase64 ??
      (canReusePreviousPreview ? previousFrame?.previewImageBase64 : null) ??
      null,
    previewImageMimeType:
      nextFrame.previewImageMimeType ??
      (canReusePreviousPreview ? previousFrame?.previewImageMimeType : null) ??
      null,
    previewImageTimestampMs:
      nextPreviewTimestampMs ??
      (canReusePreviousPreview ? previousPreviewTimestampMs : null),
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

  return (
    squaredDistance(centroid(left.points), centroid(right.points)) <=
    INSTANCE_MATCH_DISTANCE_SQUARED
  );
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
