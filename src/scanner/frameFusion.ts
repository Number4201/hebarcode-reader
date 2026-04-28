import { centroid, squaredDistance } from './selection';
import type { BarcodeDetectionsFrame, DetectedBarcode } from './types';

const DEFAULT_TTL_MS = 360;
const PREVIEW_IMAGE_TTL_MS = 1500;
const INSTANCE_MATCH_DISTANCE = 64;
const INSTANCE_MATCH_SIZE_RATIO = 0.28;
const INSTANCE_MATCH_MAX_DISTANCE = 160;
const SMOOTHING_CURRENT_WEIGHT = 0.45;

export function fuseDetectionFrame(
  previousFrame: BarcodeDetectionsFrame | null,
  nextFrame: BarcodeDetectionsFrame,
  ttlMs = DEFAULT_TTL_MS,
): BarcodeDetectionsFrame {
  if (nextFrame.source !== 'camera') {
    return nextFrame;
  }

  const previousDetections =
    previousFrame &&
    previousFrame.source === 'camera' &&
    hasCompatibleFrameGeometry(previousFrame, nextFrame)
      ? previousFrame.detections
      : [];
  const currentDetections = dedupeDetections(
    nextFrame.detections.map(detection =>
      stabilizeDetection(
        markDetectionSeen(detection, nextFrame.timestampMs),
        previousDetections,
        nextFrame.timestampMs,
      ),
    ),
  );
  const merged = [...currentDetections];

  if (
    previousFrame &&
    previousFrame.source === 'camera' &&
    hasCompatibleFrameGeometry(previousFrame, nextFrame) &&
    previousDetections.length > 0
  ) {
    for (const detection of previousDetections) {
      const lastSeenTimestampMs = resolveDetectionLastSeenTimestamp(
        detection,
        previousFrame.timestampMs,
      );

      if (
        nextFrame.timestampMs - lastSeenTimestampMs <= ttlMs &&
        !hasMatchingDetection(merged, detection)
      ) {
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
    hasCompatibleFrameGeometry(previousFrame, nextFrame) &&
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

function markDetectionSeen(
  detection: DetectedBarcode,
  timestampMs: number,
): DetectedBarcode {
  return {
    ...detection,
    lastSeenTimestampMs: timestampMs,
  };
}

function stabilizeDetection(
  current: DetectedBarcode,
  previousDetections: DetectedBarcode[],
  timestampMs: number,
): DetectedBarcode {
  const previous = findBestMatchingDetection(previousDetections, current);

  if (!previous) {
    return current;
  }

  const previousLastSeenTimestampMs = resolveDetectionLastSeenTimestamp(
    previous,
    timestampMs,
  );
  const canSmoothPoints =
    current.points.length === previous.points.length &&
    current.points.length > 0 &&
    timestampMs - previousLastSeenTimestampMs <= PREVIEW_IMAGE_TTL_MS;

  return {
    ...current,
    id: previous.id,
    points: canSmoothPoints
      ? smoothPoints(previous.points, current.points)
      : current.points,
  };
}

function dedupeDetections(detections: DetectedBarcode[]): DetectedBarcode[] {
  const deduped: DetectedBarcode[] = [];

  for (const detection of detections) {
    const existingIndex = deduped.findIndex(current =>
      detectionsRepresentSameInstance(current, detection),
    );

    if (existingIndex < 0) {
      deduped.push(detection);
      continue;
    }

    deduped[existingIndex] = choosePreferredDetection(
      deduped[existingIndex]!,
      detection,
    );
  }

  return deduped;
}

function choosePreferredDetection(
  left: DetectedBarcode,
  right: DetectedBarcode,
): DetectedBarcode {
  const leftScore = detectionQualityScore(left);
  const rightScore = detectionQualityScore(right);

  return rightScore > leftScore ? right : left;
}

function detectionQualityScore(detection: DetectedBarcode): number {
  const confidence = detection.confidence ?? 0;
  return confidence * 10_000 + polygonArea(detection.points);
}

function findBestMatchingDetection(
  detections: DetectedBarcode[],
  candidate: DetectedBarcode,
): DetectedBarcode | null {
  let best: { detection: DetectedBarcode; distanceSquared: number } | null =
    null;

  for (const detection of detections) {
    if (!detectionsRepresentSameInstance(detection, candidate)) {
      continue;
    }

    const distanceSquared = squaredDistance(
      centroid(detection.points),
      centroid(candidate.points),
    );

    if (!best || distanceSquared < best.distanceSquared) {
      best = { detection, distanceSquared };
    }
  }

  return best?.detection ?? null;
}

function smoothPoints(
  previous: DetectedBarcode['points'],
  current: DetectedBarcode['points'],
) {
  return current.map((point, index) => {
    const previousPoint = previous[index] ?? point;

    return {
      x:
        previousPoint.x * (1 - SMOOTHING_CURRENT_WEIGHT) +
        point.x * SMOOTHING_CURRENT_WEIGHT,
      y:
        previousPoint.y * (1 - SMOOTHING_CURRENT_WEIGHT) +
        point.y * SMOOTHING_CURRENT_WEIGHT,
    };
  });
}

function resolveDetectionLastSeenTimestamp(
  detection: DetectedBarcode,
  fallbackTimestampMs: number,
): number {
  return detection.lastSeenTimestampMs ?? fallbackTimestampMs;
}

function hasCompatibleFrameGeometry(
  previousFrame: BarcodeDetectionsFrame,
  nextFrame: BarcodeDetectionsFrame,
): boolean {
  return (
    normalizeRotation(previousFrame.rotationDegrees) ===
      normalizeRotation(nextFrame.rotationDegrees) &&
    previousFrame.frameSize.width === nextFrame.frameSize.width &&
    previousFrame.frameSize.height === nextFrame.frameSize.height
  );
}

function normalizeRotation(rotationDegrees: number): number {
  return ((rotationDegrees % 360) + 360) % 360;
}

function hasMatchingDetection(
  detections: DetectedBarcode[],
  candidate: DetectedBarcode,
): boolean {
  return detections.some(current =>
    detectionsRepresentSameInstance(current, candidate),
  );
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

  const matchDistance = Math.max(
    INSTANCE_MATCH_DISTANCE,
    Math.min(
      INSTANCE_MATCH_MAX_DISTANCE,
      Math.max(polygonExtent(left.points), polygonExtent(right.points)) *
        INSTANCE_MATCH_SIZE_RATIO,
    ),
  );

  return (
    squaredDistance(centroid(left.points), centroid(right.points)) <=
    matchDistance * matchDistance
  );
}

function haveSamePayload(
  left: DetectedBarcode,
  right: DetectedBarcode,
): boolean {
  if (
    normalizeBarcodeFormat(left.format) !== normalizeBarcodeFormat(right.format)
  ) {
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

function normalizeBarcodeFormat(format: string): string {
  switch (format.toUpperCase().replace(/[^A-Z0-9]/g, '')) {
    case 'PDF417':
      return 'PDF417';
    case 'QRCODE':
      return 'QRCODE';
    case 'DATAMATRIX':
      return 'DATAMATRIX';
    default:
      return format.toUpperCase().replace(/[^A-Z0-9]/g, '');
  }
}

function polygonArea(points: DetectedBarcode['points']): number {
  if (points.length < 3) {
    return 0;
  }

  let sum = 0;

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    sum += current.x * next.y - next.x * current.y;
  }

  return Math.abs(sum) / 2;
}

function polygonExtent(points: DetectedBarcode['points']): number {
  if (points.length === 0) {
    return 0;
  }

  let left = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;

  for (const point of points) {
    left = Math.min(left, point.x);
    right = Math.max(right, point.x);
    top = Math.min(top, point.y);
    bottom = Math.max(bottom, point.y);
  }

  return Math.max(right - left, bottom - top);
}
