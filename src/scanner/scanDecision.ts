import { buildLogicalBarcodeKey, hasBarcodePayload } from './barcodeIdentity';
import { mapDetectionsToStage, type StageInsets, type StageSize } from './overlay';
import type { DetectedBarcode, FrameSize } from './types';

export type ScanDecisionStatus =
  | 'idle'
  | 'aiming'
  | 'ready'
  | 'ambiguous'
  | 'duplicateSuppressed';

export type ScanCommitReason = 'manual' | 'aim-zone';

export type RecentScanCommit = {
  logicalKey: string;
  committedAtMs: number;
  barcode: DetectedBarcode;
};

export type RankedScanCandidate = {
  barcode: DetectedBarcode;
  logicalKey: string;
  score: number;
  aimZoneScore: number;
  distanceToAimCenter: number;
  areaScore: number;
  confidenceScore: number;
  recencyScore: number;
};

export type ScanCommitIntent = {
  logicalKey: string;
  barcode: DetectedBarcode;
  decidedAtMs: number;
  reason: ScanCommitReason;
};

export type ScanDecisionResult = {
  status: ScanDecisionStatus;
  primary: DetectedBarcode | null;
  ranked: RankedScanCandidate[];
  ambiguousCandidates: RankedScanCandidate[];
  message: string;
  canCommit: boolean;
  commitIntent: ScanCommitIntent | null;
};

export type ScanDecisionInput = {
  detections: DetectedBarcode[];
  nowMs?: number;
  recentCommits?: RecentScanCommit[];
  selectedBarcode?: DetectedBarcode | null;
  frameSize?: FrameSize;
  stageSize?: StageSize;
  reservedInsets?: StageInsets;
  duplicateCooldownMs?: number;
};

const DEFAULT_STAGE_SIZE: StageSize = { width: 360, height: 640 };
const DEFAULT_FRAME_SIZE: FrameSize = { width: 360, height: 640 };
const DUPLICATE_COOLDOWN_MS = 1800;
const AMBIGUOUS_SCORE_DELTA = 0.12;
const MANUAL_SELECTION_BONUS = 2;

export function decideScanTarget(input: ScanDecisionInput): ScanDecisionResult {
  const nowMs = input.nowMs ?? Date.now();
  const decodedDetections = input.detections.filter(hasBarcodePayload);

  if (input.detections.length === 0) {
    return makeResult('idle', null, [], [], 'Namiř skener na kód.', false, null);
  }

  if (decodedDetections.length === 0) {
    return makeResult('aiming', null, [], [], 'Zaměřuji kód…', false, null);
  }

  const frameSize = input.frameSize ?? input.detections[0]?.frameSize ?? DEFAULT_FRAME_SIZE;
  const stageSize = input.stageSize ?? DEFAULT_STAGE_SIZE;
  const ranked = rankCandidates(
    decodedDetections,
    frameSize,
    stageSize,
    nowMs,
    input.selectedBarcode,
    input.reservedInsets,
  );
  const primary = ranked[0] ?? null;

  if (!primary) {
    return makeResult('aiming', null, [], [], 'Zaměřuji kód…', false, null);
  }

  const ambiguousCandidates = ranked.filter(
    candidate => primary.score - candidate.score <= AMBIGUOUS_SCORE_DELTA,
  );

  if (ambiguousCandidates.length > 1) {
    return makeResult(
      'ambiguous',
      primary.barcode,
      ranked,
      ambiguousCandidates,
      'Více kódů v zóně. Vyber kód ručně.',
      false,
      null,
    );
  }

  const reason: ScanCommitReason =
    input.selectedBarcode && primary.barcode.id === input.selectedBarcode.id ? 'manual' : 'aim-zone';
  const intent: ScanCommitIntent = {
    logicalKey: primary.logicalKey,
    barcode: primary.barcode,
    decidedAtMs: nowMs,
    reason,
  };

  if (reason === 'aim-zone' && isDuplicateSuppressed(primary.logicalKey, input.recentCommits ?? [], nowMs, input.duplicateCooldownMs ?? DUPLICATE_COOLDOWN_MS)) {
    return makeResult(
      'duplicateSuppressed',
      primary.barcode,
      ranked,
      [],
      'Duplicitní načtení potlačeno.',
      false,
      intent,
    );
  }

  return makeResult('ready', primary.barcode, ranked, [], 'Připraveno ke skenu.', true, intent);
}

function rankCandidates(
  detections: DetectedBarcode[],
  frameSize: FrameSize,
  stageSize: StageSize,
  nowMs: number,
  selectedBarcode?: DetectedBarcode | null,
  reservedInsets?: StageInsets,
): RankedScanCandidate[] {
  const mapped = mapDetectionsToStage(detections, frameSize, stageSize);
  const mappedById = new Map(mapped.map(item => [item.barcode.id, item]));
  const aimBounds = resolveAimBounds(stageSize, reservedInsets);
  const aimCenter = {
    x: aimBounds.left + aimBounds.width / 2,
    y: aimBounds.top + aimBounds.height * 0.44,
  };
  const maxDistance = Math.hypot(aimBounds.width / 2, aimBounds.height / 2) || 1;
  const stageArea = stageSize.width * stageSize.height || 1;

  return detections
    .map(barcode => {
      const mappedDetection = mappedById.get(barcode.id);
      const center = mappedDetection?.centroid ?? barcodeCenter(barcode);
      const distanceToAimCenter = Math.hypot(center.x - aimCenter.x, center.y - aimCenter.y);
      const aimZoneScore = clamp01(1 - distanceToAimCenter / maxDistance);
      const areaScore = mappedDetection ? clamp01((mappedDetection.bounds.width * mappedDetection.bounds.height) / stageArea * 18) : 0;
      const confidenceScore = clamp01(barcode.confidence ?? 0.8);
      const seenAt = barcode.lastDecodedTimestampMs ?? barcode.lastSeenTimestampMs ?? nowMs;
      const recencyScore = clamp01(1 - Math.max(0, nowMs - seenAt) / 2500);
      const selectedBonus = selectedBarcode?.id === barcode.id ? MANUAL_SELECTION_BONUS : 0;
      const score = selectedBonus + aimZoneScore * 0.58 + areaScore * 0.14 + confidenceScore * 0.18 + recencyScore * 0.1;

      return {
        barcode,
        logicalKey: buildLogicalBarcodeKey(barcode),
        score,
        aimZoneScore,
        distanceToAimCenter,
        areaScore,
        confidenceScore,
        recencyScore,
      };
    })
    .sort((left, right) => right.score - left.score);
}

function resolveAimBounds(stageSize: StageSize, reservedInsets?: StageInsets) {
  const left = clamp(reservedInsets?.left ?? 0, 0, stageSize.width);
  const right = clamp(reservedInsets?.right ?? 0, 0, stageSize.width - left);
  const top = clamp(reservedInsets?.top ?? 0, 0, stageSize.height);
  const bottom = clamp(reservedInsets?.bottom ?? 0, 0, stageSize.height - top);
  const width = Math.max(1, stageSize.width - left - right);
  const height = Math.max(1, stageSize.height - top - bottom);

  return { left, top, width, height };
}

function isDuplicateSuppressed(logicalKey: string, recentCommits: RecentScanCommit[], nowMs: number, cooldownMs: number): boolean {
  return recentCommits.some(commit => commit.logicalKey === logicalKey && nowMs - commit.committedAtMs >= 0 && nowMs - commit.committedAtMs < cooldownMs);
}

function makeResult(
  status: ScanDecisionStatus,
  primary: DetectedBarcode | null,
  ranked: RankedScanCandidate[],
  ambiguousCandidates: RankedScanCandidate[],
  message: string,
  canCommit: boolean,
  commitIntent: ScanCommitIntent | null,
): ScanDecisionResult {
  return { status, primary, ranked, ambiguousCandidates, message, canCommit, commitIntent };
}

function barcodeCenter(barcode: DetectedBarcode) {
  if (barcode.points.length === 0) {
    return { x: 0, y: 0 };
  }
  const sum = barcode.points.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), { x: 0, y: 0 });
  return { x: sum.x / barcode.points.length, y: sum.y / barcode.points.length };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
