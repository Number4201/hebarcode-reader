import type { Point } from './types';

export function centroid(points: Point[]): Point {
  if (points.length === 0) {
    return { x: 0, y: 0 };
  }

  const sums = points.reduce(
    (acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }),
    { x: 0, y: 0 },
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
