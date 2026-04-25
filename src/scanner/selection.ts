import type {DetectedBarcode, Point, SelectionLock} from './types';

export function centroid(points: Point[]): Point {
  if (points.length === 0) {
    return {x: 0, y: 0};
  }

  const sums = points.reduce(
    (acc, point) => ({x: acc.x + point.x, y: acc.y + point.y}),
    {x: 0, y: 0},
  );

  return {
    x: sums.x / points.length,
    y: sums.y / points.length,
  };
}

export function distance(a: Point, b: Point): number {
  return Math.sqrt(squaredDistance(a, b));
}

export function squaredDistance(a: Point, b: Point): number {
  const deltaX = a.x - b.x;
  const deltaY = a.y - b.y;

  return deltaX * deltaX + deltaY * deltaY;
}

export function buildBarcodeId(
  format: string,
  text: string | null | undefined,
  index: number,
): string {
  return `${format}|${text ?? ''}|${index}`;
}

export function resolveSelectedBarcode(
  detections: DetectedBarcode[],
  lock: SelectionLock | null,
  maxDistance = 180,
): DetectedBarcode | null {
  if (!lock || detections.length === 0) {
    return null;
  }

  let nearestExact: {detection: DetectedBarcode; distanceSquared: number} | null = null;
  let nearestFallback: {detection: DetectedBarcode; distanceSquared: number} | null = null;

  for (const detection of detections) {
    const candidate = {
      detection,
      distanceSquared: squaredDistance(centroid(detection.points), lock.centroid),
    };

    if (detection.format === lock.format && (detection.text ?? null) === (lock.text ?? null)) {
      if (!nearestExact || candidate.distanceSquared < nearestExact.distanceSquared) {
        nearestExact = candidate;
      }
      continue;
    }

    if (!nearestFallback || candidate.distanceSquared < nearestFallback.distanceSquared) {
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
