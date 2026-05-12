import { decideScanTarget, type RecentScanCommit } from '../src/scanner/scanDecision';
import type { DetectedBarcode } from '../src/scanner/types';

function barcode(id: string, text: string | null, x: number, y = 204): DetectedBarcode {
  return {
    id,
    format: 'CODE_128',
    text,
    contentType: 'TEXT',
    confidence: 0.9,
    lastSeenTimestampMs: 1000,
    points: [
      { x: x - 40, y: y - 20 },
      { x: x + 40, y: y - 20 },
      { x: x + 40, y: y + 20 },
      { x: x - 40, y: y + 20 },
    ],
    frameSize: { width: 360, height: 640 },
  };
}

describe('decideScanTarget', () => {
  it('returns idle for empty detections', () => {
    const decision = decideScanTarget({ detections: [], nowMs: 1000 });

    expect(decision.status).toBe('idle');
    expect(decision.canCommit).toBe(false);
  });

  it('returns aiming for payload-less detections', () => {
    const decision = decideScanTarget({ detections: [barcode('candidate', null, 180)], nowMs: 1000 });

    expect(decision.status).toBe('aiming');
    expect(decision.canCommit).toBe(false);
  });

  it('ranks a centered barcode above an off-center barcode', () => {
    const centered = barcode('center', 'CENTER', 180);
    const edge = barcode('edge', 'EDGE', 20);
    const decision = decideScanTarget({ detections: [edge, centered], nowMs: 1000 });

    expect(decision.ranked[0]?.barcode).toBe(centered);
  });

  it('blocks two near-equal candidates as ambiguous', () => {
    const decision = decideScanTarget({
      detections: [barcode('left', 'LEFT', 166), barcode('right', 'RIGHT', 194)],
      nowMs: 1000,
    });

    expect(decision.status).toBe('ambiguous');
    expect(decision.canCommit).toBe(false);
    expect(decision.ambiguousCandidates).toHaveLength(2);
  });

  it('suppresses the same logical key within cooldown', () => {
    const target = barcode('target', 'SKU-1', 180);
    const recentCommits: RecentScanCommit[] = [
      { logicalKey: 'CODE_128|SKU-1', committedAtMs: 900, barcode: target },
    ];

    const decision = decideScanTarget({ detections: [target], recentCommits, nowMs: 1000 });

    expect(decision.status).toBe('duplicateSuppressed');
    expect(decision.canCommit).toBe(false);
  });

  it('allows the same logical key after cooldown', () => {
    const target = barcode('target', 'SKU-1', 180);
    const recentCommits: RecentScanCommit[] = [
      { logicalKey: 'CODE_128|SKU-1', committedAtMs: 0, barcode: target },
    ];

    const decision = decideScanTarget({ detections: [target], recentCommits, nowMs: 3000 });

    expect(decision.status).toBe('ready');
    expect(decision.canCommit).toBe(true);
  });

  it('prioritizes a manual selected barcode if it is still inside the reticle', () => {
    const centered = barcode('center', 'CENTER', 166);
    const selected = barcode('manual', 'MANUAL', 194);
    const decision = decideScanTarget({
      detections: [centered, selected],
      selectedBarcode: selected,
      nowMs: 1000,
    });

    expect(decision.status).toBe('ready');
    expect(decision.primary).toBe(selected);
    expect(decision.commitIntent?.reason).toBe('manual');
  });

  it('ignores decoded detections outside the upper reticle', () => {
    const decision = decideScanTarget({
      detections: [barcode('low-edge', 'EDGE', 180, 420)],
      frameSize: { width: 360, height: 640 },
      stageSize: { width: 360, height: 640 },
      nowMs: 1000,
    });

    expect(decision.status).toBe('aiming');
    expect(decision.primary).toBeNull();
    expect(decision.canCommit).toBe(false);
  });

  it('uses the upper visual reticle rather than reserved dock insets for aiming', () => {
    const aimed = barcode('upper-reticle', 'AIMED', 180, 204);
    const screenCenter = barcode('screen-center', 'CENTER', 180, 320);
    const decision = decideScanTarget({
      detections: [screenCenter, aimed],
      frameSize: { width: 360, height: 640 },
      reservedInsets: { top: 70, right: 12, bottom: 168, left: 12 },
      stageSize: { width: 360, height: 640 },
      nowMs: 1000,
    });

    expect(decision.ranked[0]?.barcode).toBe(aimed);
  });
});
