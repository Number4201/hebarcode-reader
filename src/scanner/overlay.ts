import {centroid, distance, squaredDistance} from './selection';
import type {DetectedBarcode, FrameSize, Point} from './types';

export type StageSize = {
  width: number;
  height: number;
};

export type StageInsets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type StageRect = {
  left: number;
  top: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
};

export type StageDetection = {
  barcode: DetectedBarcode;
  polygon: Point[];
  polygonPoints: string;
  centroid: Point;
  bounds: StageRect;
  previewText: string;
};

export type PreviewCardLayout = {
  barcode: DetectedBarcode;
  rect: StageRect;
  leaderStart: Point;
  leaderEnd: Point;
  previewText: string;
  selected: boolean;
};

const CARD_WIDTH = 148;
const CARD_HEIGHT = 52;
const CARD_GAP = 10;
const STAGE_PADDING = 8;
const TAP_FALLBACK_RADIUS = 28;
const ZERO_INSETS: StageInsets = {top: 0, right: 0, bottom: 0, left: 0};

export function mapPointToStage(
  point: Point,
  frameSize: FrameSize,
  stageSize: StageSize,
): Point {
  const transform = resolveCoverTransform(frameSize, stageSize);

  return {
    x: point.x * transform.scale + transform.offsetX,
    y: point.y * transform.scale + transform.offsetY,
  };
}

export function mapDetectionsToStage(
  detections: DetectedBarcode[],
  frameSize: FrameSize,
  stageSize: StageSize,
): StageDetection[] {
  const transform = resolveCoverTransform(frameSize, stageSize);

  return detections.flatMap(barcode => {
    if (barcode.points.length === 0) {
      return [];
    }

    const polygon: Point[] = [];
    let left = Number.POSITIVE_INFINITY;
    let right = Number.NEGATIVE_INFINITY;
    let top = Number.POSITIVE_INFINITY;
    let bottom = Number.NEGATIVE_INFINITY;

    for (const point of barcode.points) {
      const mappedPoint = applyCoverTransform(point, transform);
      polygon.push(mappedPoint);
      left = Math.min(left, mappedPoint.x);
      right = Math.max(right, mappedPoint.x);
      top = Math.min(top, mappedPoint.y);
      bottom = Math.max(bottom, mappedPoint.y);
    }

    return [
      {
        barcode,
        polygon,
        polygonPoints: formatPolygonPoints(polygon),
        centroid: centroid(polygon),
        bounds: createRect(left, top, right - left, bottom - top),
        previewText: formatBarcodePreview(barcode),
      },
    ];
  });
}

export function hitTestStageDetections(
  mappedDetections: StageDetection[],
  touchPoint: Point,
): DetectedBarcode | null {
  const containing = mappedDetections.filter(({polygon}) => pointInPolygon(touchPoint, polygon));

  if (containing.length > 0) {
    return containing
      .slice()
      .sort((left, right) => area(left.bounds) - area(right.bounds))[0]?.barcode ?? null;
  }

  const nearest = mappedDetections.reduce<StageDetection | null>((best, current) => {
    if (!best) {
      return current;
    }

    return squaredDistance(current.centroid, touchPoint) < squaredDistance(best.centroid, touchPoint)
      ? current
      : best;
  }, null);

  if (!nearest) {
    return null;
  }

  return distance(nearest.centroid, touchPoint) <= TAP_FALLBACK_RADIUS ? nearest.barcode : null;
}

export function layoutPreviewCards(
  mappedDetections: StageDetection[],
  stageSize: StageSize,
  selectedId?: string,
  reservedInsets: StageInsets = ZERO_INSETS,
): PreviewCardLayout[] {
  const occupied: StageRect[] = mappedDetections.map(item => item.bounds);

  return mappedDetections
    .slice()
    .sort((left, right) => {
      if ((left.barcode.id === selectedId) !== (right.barcode.id === selectedId)) {
        return left.barcode.id === selectedId ? -1 : 1;
      }

      if (left.bounds.top !== right.bounds.top) {
        return left.bounds.top - right.bounds.top;
      }

      return left.bounds.left - right.bounds.left;
    })
    .map(item => {
      const rect = chooseCardRect(item, occupied, stageSize, reservedInsets);
      occupied.push(rect);

      return {
        barcode: item.barcode,
        rect,
        leaderStart: item.centroid,
        leaderEnd: nearestPointOnRect(rect, item.centroid),
        previewText: item.previewText,
        selected: item.barcode.id === selectedId,
      };
    });
}

function chooseCardRect(
  item: StageDetection,
  occupied: StageRect[],
  stageSize: StageSize,
  reservedInsets: StageInsets,
): StageRect {
  const candidateRects = buildCandidateRects(item, stageSize, reservedInsets);

  return candidateRects.slice(1).reduce<StageRect>((best, current) => {
    const currentScore = scoreRect(current, item.centroid, occupied);
    const bestScore = scoreRect(best, item.centroid, occupied);

    return currentScore < bestScore ? current : best;
  }, candidateRects[0]!);
}

function buildCandidateRects(
  item: StageDetection,
  stageSize: StageSize,
  reservedInsets: StageInsets,
): StageRect[] {
  const {bounds, centroid: center} = item;

  return [
    clampRect(
      bounds.right + CARD_GAP,
      bounds.top - 4,
      CARD_WIDTH,
      CARD_HEIGHT,
      stageSize,
      reservedInsets,
    ),
    clampRect(
      bounds.left - CARD_WIDTH - CARD_GAP,
      bounds.top - 4,
      CARD_WIDTH,
      CARD_HEIGHT,
      stageSize,
      reservedInsets,
    ),
    clampRect(
      center.x - CARD_WIDTH / 2,
      bounds.bottom + CARD_GAP,
      CARD_WIDTH,
      CARD_HEIGHT,
      stageSize,
      reservedInsets,
    ),
    clampRect(
      center.x - CARD_WIDTH / 2,
      bounds.top - CARD_HEIGHT - CARD_GAP,
      CARD_WIDTH,
      CARD_HEIGHT,
      stageSize,
      reservedInsets,
    ),
    clampRect(
      bounds.right + CARD_GAP,
      center.y - CARD_HEIGHT / 2,
      CARD_WIDTH,
      CARD_HEIGHT,
      stageSize,
      reservedInsets,
    ),
    clampRect(
      bounds.left - CARD_WIDTH - CARD_GAP,
      center.y - CARD_HEIGHT / 2,
      CARD_WIDTH,
      CARD_HEIGHT,
      stageSize,
      reservedInsets,
    ),
  ];
}

function scoreRect(rect: StageRect, anchor: Point, occupied: StageRect[]): number {
  const overlapPenalty = occupied.reduce((sum, current) => sum + overlapArea(rect, current), 0);
  return overlapPenalty * 1000 + distance(anchor, nearestPointOnRect(rect, anchor));
}

function clampRect(
  left: number,
  top: number,
  width: number,
  height: number,
  stageSize: StageSize,
  reservedInsets: StageInsets,
): StageRect {
  const clampedLeft = clamp(
    left,
    STAGE_PADDING + reservedInsets.left,
    stageSize.width - width - STAGE_PADDING - reservedInsets.right,
  );
  const clampedTop = clamp(
    top,
    STAGE_PADDING + reservedInsets.top,
    stageSize.height - height - STAGE_PADDING - reservedInsets.bottom,
  );

  return createRect(clampedLeft, clampedTop, width, height);
}

function nearestPointOnRect(rect: StageRect, point: Point): Point {
  return {
    x: clamp(point.x, rect.left, rect.right),
    y: clamp(point.y, rect.top, rect.bottom),
  };
}

function resolveCoverTransform(frameSize: FrameSize, stageSize: StageSize) {
  const safeFrameWidth = Math.max(frameSize.width, 1);
  const safeFrameHeight = Math.max(frameSize.height, 1);
  const scale = Math.max(stageSize.width / safeFrameWidth, stageSize.height / safeFrameHeight);
  const contentWidth = safeFrameWidth * scale;
  const contentHeight = safeFrameHeight * scale;

  return {
    scale,
    offsetX: (stageSize.width - contentWidth) / 2,
    offsetY: (stageSize.height - contentHeight) / 2,
  };
}

function applyCoverTransform(
  point: Point,
  transform: ReturnType<typeof resolveCoverTransform>,
): Point {
  return {
    x: point.x * transform.scale + transform.offsetX,
    y: point.y * transform.scale + transform.offsetY,
  };
}

function formatPolygonPoints(polygon: Point[]): string {
  return polygon.map(point => `${point.x},${point.y}`).join(' ');
}

function overlapArea(left: StageRect, right: StageRect): number {
  const overlapWidth = Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left));
  const overlapHeight = Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));

  return overlapWidth * overlapHeight;
}

function area(rect: StageRect): number {
  return rect.width * rect.height;
}

function createRect(left: number, top: number, width: number, height: number): StageRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

function pointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;

  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const currentPoint = polygon[index];
    const previousPoint = polygon[previous];

    if (!currentPoint || !previousPoint) {
      continue;
    }

    const intersects =
      currentPoint.y > point.y !== previousPoint.y > point.y &&
      point.x <
        ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)) /
          (previousPoint.y - currentPoint.y) +
          currentPoint.x;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function formatBarcodePreview(barcode: DetectedBarcode): string {
  const rawValue = barcode.text?.trim() || barcode.rawBytesBase64 || '<binary payload>';
  return rawValue.length > 26 ? `${rawValue.slice(0, 23)}...` : rawValue;
}
