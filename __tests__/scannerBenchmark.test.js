const {
  assertThresholds,
  buildBarcodeInstanceKey,
  buildBarcodeKey,
  evaluateDataset,
  normalizeBarcodeFormat,
} = require('../scripts/benchmark-scanner');

describe('scanner benchmark harness', () => {
  it('normalizes barcode identity aliases consistently', () => {
    expect(normalizeBarcodeFormat('pdf417')).toBe('PDF_417');
    expect(buildBarcodeKey({ format: 'code128', text: ' SKU-1 ' })).toBe(
      'CODE_128|SKU-1',
    );
    expect(
      buildBarcodeInstanceKey({
        format: 'code128',
        instanceId: 'rack-left',
        text: ' SKU-1 ',
      }),
    ).toBe('CODE_128|SKU-1#rack-left');
  });

  it('passes a normal multi-code scan with candidates before payload decode', () => {
    const report = evaluateDataset({
      schemaVersion: 1,
      cases: [
        {
          id: 'case-1',
          expected: [
            { format: 'CODE_128', text: 'SKU-1', firstVisibleAtMs: 1000 },
            { format: 'EAN_13', text: '8591234567890', firstVisibleAtMs: 1000 },
          ],
          frames: [
            {
              timestampMs: 1000,
              detections: [{ format: 'UNKNOWN', trackingState: 'candidate' }],
            },
            {
              timestampMs: 1120,
              detections: [{ format: 'CODE_128', text: 'SKU-1' }],
            },
            {
              timestampMs: 1320,
              detections: [
                { format: 'EAN13', text: '8591234567890' },
                { format: 'QR_CODE', text: 'unexpected' },
              ],
            },
          ],
        },
      ],
    });

    expect(report.summary.decodeRate).toBe(1);
    expect(report.summary.falsePositiveCount).toBe(1);
    expect(report.summary.collapsedInstanceCount).toBe(0);
    expect(report.summary.duplicateDetectionCount).toBe(0);
    expect(report.summary.latencyMs.p95).toBe(320);
    expect(report.cases[0].candidateDetections).toBe(1);
  });

  it('validates separate physical labels with the same payload by instance', () => {
    const report = evaluateDataset({
      schemaVersion: 1,
      cases: [
        {
          id: 'same-payload-two-labels',
          expected: [
            {
              firstVisibleAtMs: 0,
              format: 'CODE_128',
              instanceId: 'left-label',
              text: 'SKU-SAME',
            },
            {
              firstVisibleAtMs: 0,
              format: 'CODE_128',
              instanceId: 'right-label',
              text: 'SKU-SAME',
            },
          ],
          frames: [
            {
              timestampMs: 120,
              detections: [
                {
                  format: 'CODE_128',
                  instanceId: 'left-label',
                  text: 'SKU-SAME',
                },
              ],
            },
            {
              timestampMs: 220,
              detections: [
                {
                  format: 'CODE_128',
                  instanceId: 'left-label',
                  text: 'SKU-SAME',
                },
                {
                  format: 'CODE_128',
                  instanceId: 'right-label',
                  text: 'SKU-SAME',
                },
              ],
            },
          ],
        },
      ],
    });

    expect(report.summary.decodeRate).toBe(1);
    expect(report.summary.collapsedInstanceCount).toBe(0);
    expect(report.cases[0].latencyMs.samples).toEqual([120, 220]);
  });

  it('reports collapsed same-payload instances as missed physical labels', () => {
    const report = evaluateDataset({
      schemaVersion: 1,
      cases: [
        {
          id: 'collapsed-same-payload',
          expected: [
            {
              format: 'CODE_128',
              instanceId: 'left-label',
              text: 'SKU-SAME',
            },
            {
              format: 'CODE_128',
              instanceId: 'right-label',
              text: 'SKU-SAME',
            },
          ],
          frames: [
            {
              timestampMs: 100,
              detections: [{ format: 'CODE_128', text: 'SKU-SAME' }],
            },
          ],
        },
      ],
    });

    expect(report.summary.decodeRate).toBe(0);
    expect(report.summary.collapsedInstanceCount).toBe(1);
    expect(report.cases[0].missedInstanceCount).toBe(2);
    expect(
      assertThresholds(report, {
        maxCollapsedInstances: 0,
        maxDuplicateDetections: 0,
        maxFalsePositives: 0,
        maxP95LatencyMs: 500,
        minDecodeRate: 1,
      }),
    ).toEqual([
      'decode rate 0.0% < 100.0%',
      'collapsed instances 1 > 0',
    ]);
  });

  it('reports duplicate detections for the same physical label in one frame', () => {
    const report = evaluateDataset({
      schemaVersion: 1,
      cases: [
        {
          id: 'duplicate-instance',
          expected: [
            {
              format: 'QR_CODE',
              instanceId: 'target-label',
              text: 'SKU-1',
            },
          ],
          frames: [
            {
              timestampMs: 100,
              detections: [
                {
                  format: 'QR_CODE',
                  instanceId: 'target-label',
                  text: 'SKU-1',
                },
                {
                  format: 'QR_CODE',
                  instanceId: 'target-label',
                  text: 'SKU-1',
                },
              ],
            },
          ],
        },
      ],
    });

    expect(report.summary.decodeRate).toBe(1);
    expect(report.summary.duplicateDetectionCount).toBe(1);
    expect(report.cases[0].duplicateDetectionKeys).toEqual([
      'QR_CODE|SKU-1#target-label',
    ]);
  });

  it('tracks candidate-only frames as misses without false positives', () => {
    const report = evaluateDataset({
      schemaVersion: 1,
      cases: [
        {
          id: 'candidate-only',
          expected: [{ format: 'DATA_MATRIX', text: 'SKU-DM-1' }],
          frames: [
            {
              timestampMs: 100,
              detections: [
                {
                  contentType: 'POTENTIAL',
                  format: 'UNKNOWN',
                  trackingState: 'candidate',
                },
              ],
            },
          ],
        },
      ],
    });

    expect(report.summary.decodeRate).toBe(0);
    expect(report.summary.falsePositiveCount).toBe(0);
    expect(report.cases[0].candidateDetections).toBe(1);
    expect(report.cases[0].misses).toEqual(['DATA_MATRIX|SKU-DM-1']);
  });

  it('reports false positive payloads explicitly', () => {
    const report = evaluateDataset({
      schemaVersion: 1,
      cases: [
        {
          id: 'false-positive',
          expected: [{ format: 'EAN_13', text: '8591234567890' }],
          frames: [
            {
              timestampMs: 120,
              detections: [
                { format: 'EAN_13', text: '8591234567890' },
                { format: 'QR_CODE', text: 'not-on-shipment' },
              ],
            },
          ],
        },
      ],
    });

    expect(report.summary.decodeRate).toBe(1);
    expect(report.summary.falsePositiveCount).toBe(1);
    expect(report.cases[0].falsePositiveKeys).toEqual([
      'QR_CODE|not-on-shipment',
    ]);
  });

  it('reports latency threshold failures separately from decode failures', () => {
    const report = evaluateDataset({
      schemaVersion: 1,
      cases: [
        {
          id: 'slow-first-hit',
          expected: [
            { format: 'CODE_128', text: 'SKU-1', firstVisibleAtMs: 0 },
          ],
          frames: [
            {
              timestampMs: 420,
              detections: [{ format: 'CODE_128', text: 'SKU-1' }],
            },
          ],
        },
      ],
    });

    expect(
      assertThresholds(report, {
        maxCollapsedInstances: 0,
        maxDuplicateDetections: 0,
        maxFalsePositives: 0,
        maxP95LatencyMs: 300,
        minDecodeRate: 1,
      }),
    ).toEqual(['p95 latency 420ms > 300ms']);
  });

  it('passes strict sellable correctness thresholds for a clean report', () => {
    const report = evaluateDataset({
      schemaVersion: 1,
      cases: [
        {
          id: 'clean',
          expected: [
            {
              format: 'CODE_128',
              instanceId: 'slot-a',
              text: 'SKU-1',
              firstVisibleAtMs: 100,
            },
          ],
          frames: [
            {
              timestampMs: 250,
              detections: [
                {
                  format: 'CODE_128',
                  instanceId: 'slot-a',
                  text: 'SKU-1',
                },
              ],
            },
          ],
        },
      ],
    });

    expect(
      assertThresholds(report, {
        maxCollapsedInstances: 0,
        maxDuplicateDetections: 0,
        maxFalsePositives: 0,
        maxP95LatencyMs: 300,
        minDecodeRate: 1,
      }),
    ).toEqual([]);
  });
});
