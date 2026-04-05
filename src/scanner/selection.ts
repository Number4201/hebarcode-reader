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
  return Math.hypot(a.x - b.x, a.y - b.y);
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

  const exactMatches = detections.filter(
    detection =>
      detection.format === lock.format && (detection.text ?? null) === (lock.text ?? null),
  );

  const pool = exactMatches.length > 0 ? exactMatches : detections;

  const nearest = pool.reduce<DetectedBarcode | null>((best, current) => {
    if (!best) {
      return current;
    }

    const currentDistance = distance(centroid(current.points), lock.centroid);
    const bestDistance = distance(centroid(best.points), lock.centroid);

    return currentDistance < bestDistance ? current : best;
  }, null);

  if (!nearest) {
    return null;
  }

  return distance(centroid(nearest.points), lock.centroid) <= maxDistance
    ? nearest
    : null;
}
