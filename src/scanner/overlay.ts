import { centroid, distance, squaredDistance } from './selection';
import type { DetectedBarcode, FrameSize, Point } from './types';

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

export type PreviewCardRectCache = Record<string, StageRect>;

const CARD_WIDTH = 136;
const CARD_HEIGHT = 44;
const CARD_GAP = 8;
const STAGE_PADDING = 8;
const TAP_FALLBACK_RADIUS = 28;
const STICKY_CARD_SWITCH_MARGIN = 96;
const LINEAR_CODE_MIN_SHORT_AXIS = 44;
const LINEAR_CODE_MAX_SHORT_AXIS = 180;
const LINEAR_CODE_SHORT_AXIS_RATIO = 0.18;
const LINEAR_CODE_MIN_MAJOR_PADDING = 4;
const LINEAR_CODE_MAX_MAJOR_PADDING = 12;
const LINEAR_CODE_MAJOR_PADDING_RATIO = 0.015;
const ZERO_INSETS: StageInsets = { top: 0, right: 0, bottom: 0, left: 0 };

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

    const rawPolygon: Point[] = [];
    let left = Number.POSITIVE_INFINITY;
    let right = Number.NEGATIVE_INFINITY;
    let top = Number.POSITIVE_INFINITY;
    let bottom = Number.NEGATIVE_INFINITY;

    for (const point of barcode.points) {
      const mappedPoint = applyCoverTransform(point, transform);
      rawPolygon.push(mappedPoint);
    }

    const polygon = normalizeBarcodeOverlayPolygon(barcode, rawPolygon);

    for (const mappedPoint of polygon) {
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
  const containing = mappedDetections.filter(({ polygon }) =>
    pointInPolygon(touchPoint, polygon),
  );

  if (containing.length > 0) {
    return (
      containing
        .slice()
        .sort((left, right) => area(left.bounds) - area(right.bounds))[0]
        ?.barcode ?? null
    );
  }

  const nearest = mappedDetections.reduce<StageDetection | null>(
    (best, current) => {
      if (!best) {
        return current;
      }

      return squaredDistance(current.centroid, touchPoint) <
        squaredDistance(best.centroid, touchPoint)
        ? current
        : best;
    },
    null,
  );

  if (!nearest) {
    return null;
  }

  return distance(nearest.centroid, touchPoint) <= TAP_FALLBACK_RADIUS
    ? nearest.barcode
    : null;
}

export function layoutPreviewCards(
  mappedDetections: StageDetection[],
  stageSize: StageSize,
  selectedId?: string,
  reservedInsets: StageInsets = ZERO_INSETS,
  previousRects: PreviewCardRectCache = {},
): PreviewCardLayout[] {
  const occupied: StageRect[] = mappedDetections.map(item => item.bounds);

  return mappedDetections
    .slice()
    .sort((left, right) => {
      if (
        (left.barcode.id === selectedId) !==
        (right.barcode.id === selectedId)
      ) {
        return left.barcode.id === selectedId ? -1 : 1;
      }

      if (left.bounds.top !== right.bounds.top) {
        return left.bounds.top - right.bounds.top;
      }

      return left.bounds.left - right.bounds.left;
    })
    .map(item => {
      const rect = chooseCardRect(
        item,
        occupied,
        stageSize,
        reservedInsets,
        previousRects[item.barcode.id],
      );
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
  previousRect?: StageRect,
): StageRect {
  const candidateRects = buildCandidateRects(item, stageSize, reservedInsets);
  const bestCandidate = candidateRects
    .slice(1)
    .reduce<StageRect>((best, current) => {
      const currentScore = scoreRect(current, item.centroid, occupied);
      const bestScore = scoreRect(best, item.centroid, occupied);

      return currentScore < bestScore ? current : best;
    }, candidateRects[0]!);

  if (!previousRect) {
    return bestCandidate;
  }

  const stickyRect = clampRect(
    previousRect.left,
    previousRect.top,
    CARD_WIDTH,
    CARD_HEIGHT,
    stageSize,
    reservedInsets,
  );
  const stickyScore = scoreRect(stickyRect, item.centroid, occupied);
  const bestScore = scoreRect(bestCandidate, item.centroid, occupied);

  return stickyScore <= bestScore + STICKY_CARD_SWITCH_MARGIN
    ? stickyRect
    : bestCandidate;
}

function buildCandidateRects(
  item: StageDetection,
  stageSize: StageSize,
  reservedInsets: StageInsets,
): StageRect[] {
  const { bounds, centroid: center } = item;

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

function scoreRect(
  rect: StageRect,
  anchor: Point,
  occupied: StageRect[],
): number {
  const overlapPenalty = occupied.reduce(
    (sum, current) => sum + overlapArea(rect, current),
    0,
  );
  return (
    overlapPenalty * 1000 + distance(anchor, nearestPointOnRect(rect, anchor))
  );
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
  const scale = Math.max(
    stageSize.width / safeFrameWidth,
    stageSize.height / safeFrameHeight,
  );
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

function normalizeBarcodeOverlayPolygon(
  barcode: DetectedBarcode,
  polygon: Point[],
): Point[] {
  if (!isLinearBarcodeFormat(barcode.format) || polygon.length < 2) {
    return polygon;
  }

  return expandLinearBarcodePolygon(polygon);
}

function expandLinearBarcodePolygon(polygon: Point[]): Point[] {
  const center = centroid(polygon);
  const axis = resolvePrincipalAxis(polygon, center);
  const majorAxis = axis.major;
  const minorAxis = { x: -majorAxis.y, y: majorAxis.x };
  const projections = projectPolygon(polygon, center, majorAxis, minorAxis);
  const majorSpan = projections.maxMajor - projections.minMajor;
  const minorSpan = projections.maxMinor - projections.minMinor;

  if (majorSpan <= 0 || minorSpan < 0) {
    return polygon;
  }

  const targetMinorSpan = clamp(
    Math.max(minorSpan, majorSpan * LINEAR_CODE_SHORT_AXIS_RATIO),
    LINEAR_CODE_MIN_SHORT_AXIS,
    LINEAR_CODE_MAX_SHORT_AXIS,
  );
  const majorPadding = clamp(
    majorSpan * LINEAR_CODE_MAJOR_PADDING_RATIO,
    LINEAR_CODE_MIN_MAJOR_PADDING,
    LINEAR_CODE_MAX_MAJOR_PADDING,
  );
  const majorMid = (projections.minMajor + projections.maxMajor) / 2;
  const minorMid = (projections.minMinor + projections.maxMinor) / 2;
  const minMajor = majorMid - majorSpan / 2 - majorPadding;
  const maxMajor = majorMid + majorSpan / 2 + majorPadding;
  const minMinor = minorMid - targetMinorSpan / 2;
  const maxMinor = minorMid + targetMinorSpan / 2;

  return [
    pointFromAxes(center, majorAxis, minorAxis, minMajor, minMinor),
    pointFromAxes(center, majorAxis, minorAxis, maxMajor, minMinor),
    pointFromAxes(center, majorAxis, minorAxis, maxMajor, maxMinor),
    pointFromAxes(center, majorAxis, minorAxis, minMajor, maxMinor),
  ];
}

function resolvePrincipalAxis(
  polygon: Point[],
  center: Point,
): { major: Point } {
  let covarianceXx = 0;
  let covarianceXy = 0;
  let covarianceYy = 0;

  for (const point of polygon) {
    const deltaX = point.x - center.x;
    const deltaY = point.y - center.y;
    covarianceXx += deltaX * deltaX;
    covarianceXy += deltaX * deltaY;
    covarianceYy += deltaY * deltaY;
  }

  const angle = Math.atan2(2 * covarianceXy, covarianceXx - covarianceYy) / 2;
  let major = { x: Math.cos(angle), y: Math.sin(angle) };
  const minor = { x: -major.y, y: major.x };
  const projections = projectPolygon(polygon, center, major, minor);
  const majorSpan = projections.maxMajor - projections.minMajor;
  const minorSpan = projections.maxMinor - projections.minMinor;

  if (minorSpan > majorSpan) {
    major = minor;
  }

  return { major };
}

function projectPolygon(
  polygon: Point[],
  center: Point,
  majorAxis: Point,
  minorAxis: Point,
): {
  minMajor: number;
  maxMajor: number;
  minMinor: number;
  maxMinor: number;
} {
  let minMajor = Number.POSITIVE_INFINITY;
  let maxMajor = Number.NEGATIVE_INFINITY;
  let minMinor = Number.POSITIVE_INFINITY;
  let maxMinor = Number.NEGATIVE_INFINITY;

  for (const point of polygon) {
    const deltaX = point.x - center.x;
    const deltaY = point.y - center.y;
    const majorProjection = deltaX * majorAxis.x + deltaY * majorAxis.y;
    const minorProjection = deltaX * minorAxis.x + deltaY * minorAxis.y;

    minMajor = Math.min(minMajor, majorProjection);
    maxMajor = Math.max(maxMajor, majorProjection);
    minMinor = Math.min(minMinor, minorProjection);
    maxMinor = Math.max(maxMinor, minorProjection);
  }

  return { minMajor, maxMajor, minMinor, maxMinor };
}

function pointFromAxes(
  center: Point,
  majorAxis: Point,
  minorAxis: Point,
  majorProjection: number,
  minorProjection: number,
): Point {
  return {
    x: center.x + majorAxis.x * majorProjection + minorAxis.x * minorProjection,
    y: center.y + majorAxis.y * majorProjection + minorAxis.y * minorProjection,
  };
}

function isLinearBarcodeFormat(format: string): boolean {
  switch (format.toUpperCase()) {
    case 'CODABAR':
    case 'CODE_11':
    case 'CODE_39':
    case 'CODE_93':
    case 'CODE_128':
    case 'EAN_8':
    case 'EAN_13':
    case 'ITF':
    case 'RSS_14':
    case 'RSS_EXPANDED':
    case 'UPC_A':
    case 'UPC_E':
      return true;
    default:
      return false;
  }
}

function formatPolygonPoints(polygon: Point[]): string {
  return polygon.map(point => `${point.x},${point.y}`).join(' ');
}

function overlapArea(left: StageRect, right: StageRect): number {
  const overlapWidth = Math.max(
    0,
    Math.min(left.right, right.right) - Math.max(left.left, right.left),
  );
  const overlapHeight = Math.max(
    0,
    Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top),
  );

  return overlapWidth * overlapHeight;
}

function area(rect: StageRect): number {
  return rect.width * rect.height;
}

function createRect(
  left: number,
  top: number,
  width: number,
  height: number,
): StageRect {
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

  for (
    let index = 0, previous = polygon.length - 1;
    index < polygon.length;
    previous = index++
  ) {
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
  const rawValue =
    barcode.text?.trim() || barcode.rawBytesBase64 || '<binary payload>';
  return rawValue.length > 26 ? `${rawValue.slice(0, 23)}...` : rawValue;
}
