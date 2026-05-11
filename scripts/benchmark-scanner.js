#!/usr/bin/env node
/* eslint-env node */

'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_THRESHOLDS = {
  maxCollapsedInstances: 0,
  maxDuplicateDetections: 0,
  maxFalsePositives: 0,
  maxP95LatencyMs: 500,
  minDecodeRate: 1,
};

function normalizeBarcodeFormat(format) {
  const compact = String(format || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

  switch (compact) {
    case 'CODE128':
      return 'CODE_128';
    case 'CODE39':
      return 'CODE_39';
    case 'CODE93':
      return 'CODE_93';
    case 'EAN13':
      return 'EAN_13';
    case 'EAN8':
      return 'EAN_8';
    case 'UPCA':
      return 'UPC_A';
    case 'UPCE':
      return 'UPC_E';
    case 'QRCODE':
      return 'QR_CODE';
    case 'PDF417':
      return 'PDF_417';
    case 'DATAMATRIX':
      return 'DATA_MATRIX';
    default:
      return compact || 'UNKNOWN';
  }
}

function resolveBarcodePayload(barcode) {
  return String(barcode?.text || '').trim() || barcode?.rawBytesBase64 || null;
}

function buildBarcodeKey(barcode) {
  const payload = resolveBarcodePayload(barcode);

  if (!payload) {
    return null;
  }

  return `${normalizeBarcodeFormat(barcode.format)}|${payload}`;
}

function resolveInstanceId(barcode) {
  const instanceId =
    typeof barcode?.instanceId === 'string'
      ? barcode.instanceId.trim()
      : typeof barcode?.physicalId === 'string'
      ? barcode.physicalId.trim()
      : '';

  return instanceId || null;
}

function buildBarcodeInstanceKey(barcode) {
  const key = buildBarcodeKey(barcode);
  const instanceId = resolveInstanceId(barcode);

  if (!key) {
    return null;
  }

  return instanceId ? `${key}#${instanceId}` : key;
}

function percentile(values, percentileValue) {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.ceil((percentileValue / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

function collectDetectionEvents(frames) {
  return frames.flatMap((frame, frameIndex) => {
    const sourceFrame = frame || {};
    const timestampMs =
      typeof sourceFrame.timestampMs === 'number'
        ? sourceFrame.timestampMs
        : frameIndex;
    const detections = Array.isArray(sourceFrame.detections)
      ? sourceFrame.detections
      : [];

    return detections.map(detection => ({
      detection,
      frameIndex,
      timestampMs,
    }));
  });
}

function evaluateCase(testCase) {
  const frames = Array.isArray(testCase.frames) ? testCase.frames : [];
  const expected = Array.isArray(testCase.expected) ? testCase.expected : [];
  const detectionEvents = collectDetectionEvents(frames);
  const firstFrameTimestampMs = frames[0]?.timestampMs ?? 0;
  const expectedInstances = [];
  const detectedEvents = [];
  const falsePositiveKeys = new Set();
  let candidateDetections = 0;
  let payloadDetections = 0;

  for (const [expectedIndex, expectedBarcode] of expected.entries()) {
    const key = buildBarcodeKey(expectedBarcode);
    const instanceKey = buildBarcodeInstanceKey(expectedBarcode);

    if (!key || !instanceKey) {
      continue;
    }

    expectedInstances.push({
      barcodeKey: key,
      instanceId: resolveInstanceId(expectedBarcode),
      instanceKey,
      firstVisibleAtMs:
        typeof expectedBarcode.firstVisibleAtMs === 'number'
          ? expectedBarcode.firstVisibleAtMs
          : firstFrameTimestampMs,
      order: expectedIndex,
    });
  }

  for (const { detection, frameIndex, timestampMs } of detectionEvents) {
    const key = buildBarcodeKey(detection);
    const instanceKey = buildBarcodeInstanceKey(detection);
    const instanceId = resolveInstanceId(detection);

    if (!key || !instanceKey) {
      candidateDetections += 1;
      continue;
    }

    payloadDetections += 1;
    detectedEvents.push({
      barcodeKey: key,
      frameIndex,
      instanceId,
      instanceKey,
      timestampMs,
    });

    if (!isExpectedDetection(expectedInstances, key, instanceKey, instanceId)) {
      falsePositiveKeys.add(instanceId ? instanceKey : key);
    }
  }

  const latencies = [];
  const misses = [];
  const matchedDetectionIndexes = new Set();

  for (const expectedInstance of expectedInstances) {
    const match = findFirstMatchingDetection(
      detectedEvents,
      expectedInstance,
      matchedDetectionIndexes,
    );

    if (!match) {
      misses.push(expectedInstance.instanceKey);
      continue;
    }

    matchedDetectionIndexes.add(match.index);
    latencies.push(
      Math.max(0, match.timestampMs - expectedInstance.firstVisibleAtMs),
    );
  }

  const duplicateDetectionKeys = findDuplicateDetectionKeys(detectedEvents);
  const collapsedInstanceKeys = findCollapsedInstanceKeys(
    expectedInstances,
    detectedEvents,
  );
  const expectedCount = expectedInstances.length;
  const decodedCount = expectedCount - misses.length;

  return {
    id: testCase.id || 'unnamed-case',
    candidateDetections,
    collapsedInstanceCount: collapsedInstanceKeys.length,
    collapsedInstanceKeys,
    decodedCount,
    decodeRate: expectedCount > 0 ? decodedCount / expectedCount : 1,
    duplicateDetectionCount: duplicateDetectionKeys.length,
    duplicateDetectionKeys,
    expectedCount,
    falsePositiveCount: falsePositiveKeys.size,
    falsePositiveKeys: [...falsePositiveKeys].sort(),
    latencyMs: {
      average:
        latencies.length > 0
          ? latencies.reduce((sum, value) => sum + value, 0) / latencies.length
          : null,
      p95: percentile(latencies, 95),
      samples: latencies,
    },
    misses,
    missedInstanceCount: misses.length,
    payloadDetections,
    totalDetectionEvents: detectionEvents.length,
    totalFrames: frames.length,
  };
}

function isExpectedDetection(
  expectedInstances,
  barcodeKey,
  instanceKey,
  instanceId,
) {
  return expectedInstances.some(expected => {
    if (expected.barcodeKey !== barcodeKey) {
      return false;
    }

    return instanceId ? expected.instanceKey === instanceKey : true;
  });
}

function findFirstMatchingDetection(
  detectedEvents,
  expectedInstance,
  matchedDetectionIndexes,
) {
  for (const [index, event] of detectedEvents.entries()) {
    if (matchedDetectionIndexes.has(index)) {
      continue;
    }

    if (event.barcodeKey !== expectedInstance.barcodeKey) {
      continue;
    }

    if (
      expectedInstance.instanceId &&
      event.instanceKey !== expectedInstance.instanceKey
    ) {
      continue;
    }

    return { index, timestampMs: event.timestampMs };
  }

  return null;
}

function findDuplicateDetectionKeys(detectedEvents) {
  const keys = new Set();
  const frameCounts = new Map();

  for (const event of detectedEvents) {
    const key = `${event.frameIndex}|${event.instanceKey}`;
    const count = (frameCounts.get(key) ?? 0) + 1;
    frameCounts.set(key, count);

    if (count > 1) {
      keys.add(event.instanceKey);
    }
  }

  return [...keys].sort();
}

function findCollapsedInstanceKeys(expectedInstances, detectedEvents) {
  const expectedByBarcodeKey = groupBy(expectedInstances, item => item.barcodeKey);
  const collapsed = [];

  for (const [barcodeKey, instances] of expectedByBarcodeKey) {
    if (instances.length <= 1) {
      continue;
    }

    const detectedInstanceKeys = new Set(
      detectedEvents
        .filter(event => event.barcodeKey === barcodeKey)
        .map(event => event.instanceKey),
    );

    if (detectedInstanceKeys.size < instances.length) {
      collapsed.push(
        `${barcodeKey} expected ${instances.length}, detected ${detectedInstanceKeys.size}`,
      );
    }
  }

  return collapsed.sort();
}

function groupBy(items, buildKey) {
  const grouped = new Map();

  for (const item of items) {
    const key = buildKey(item);
    const values = grouped.get(key);

    if (values) {
      values.push(item);
    } else {
      grouped.set(key, [item]);
    }
  }

  return grouped;
}

function summarizeResults(results) {
  const expectedCount = results.reduce(
    (sum, item) => sum + item.expectedCount,
    0,
  );
  const decodedCount = results.reduce(
    (sum, item) => sum + item.decodedCount,
    0,
  );
  const totalDetectionEvents = results.reduce(
    (sum, item) => sum + item.totalDetectionEvents,
    0,
  );
  const totalFrames = results.reduce((sum, item) => sum + item.totalFrames, 0);
  const falsePositiveCount = results.reduce(
    (sum, item) => sum + item.falsePositiveCount,
    0,
  );
  const duplicateDetectionCount = results.reduce(
    (sum, item) => sum + item.duplicateDetectionCount,
    0,
  );
  const collapsedInstanceCount = results.reduce(
    (sum, item) => sum + item.collapsedInstanceCount,
    0,
  );
  const latencySamples = results.flatMap(item => item.latencyMs.samples);

  return {
    cases: results.length,
    collapsedInstanceCount,
    decodedCount,
    decodeRate: expectedCount > 0 ? decodedCount / expectedCount : 1,
    duplicateDetectionCount,
    expectedCount,
    falsePositiveCount,
    totalDetectionEvents,
    totalFrames,
    latencyMs: {
      average:
        latencySamples.length > 0
          ? latencySamples.reduce((sum, value) => sum + value, 0) /
            latencySamples.length
          : null,
      p95: percentile(latencySamples, 95),
    },
  };
}

function evaluateDataset(dataset) {
  const cases = Array.isArray(dataset.cases) ? dataset.cases : [];
  const results = cases.map(evaluateCase);

  return {
    schemaVersion: dataset.schemaVersion ?? 1,
    summary: summarizeResults(results),
    cases: results,
  };
}

function readDatasetFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readDatasets(inputPath) {
  const stat = fs.statSync(inputPath);
  const files = stat.isDirectory()
    ? fs
        .readdirSync(inputPath)
        .filter(fileName => fileName.endsWith('.json'))
        .sort()
        .map(fileName => path.join(inputPath, fileName))
    : [inputPath];

  return files.map(filePath => ({
    filePath,
    dataset: readDatasetFile(filePath),
  }));
}

function parseCliArgs(argv) {
  const options = {
    inputPath: 'benchmarks/scanner',
    thresholds: { ...DEFAULT_THRESHOLDS },
  };

  for (const arg of argv) {
    if (arg.startsWith('--min-decode-rate=')) {
      options.thresholds.minDecodeRate = Number(arg.split('=')[1]);
    } else if (arg.startsWith('--max-collapsed-instances=')) {
      options.thresholds.maxCollapsedInstances = Number(arg.split('=')[1]);
    } else if (arg.startsWith('--max-duplicate-detections=')) {
      options.thresholds.maxDuplicateDetections = Number(arg.split('=')[1]);
    } else if (arg.startsWith('--max-false-positives=')) {
      options.thresholds.maxFalsePositives = Number(arg.split('=')[1]);
    } else if (arg.startsWith('--max-p95-latency-ms=')) {
      options.thresholds.maxP95LatencyMs = Number(arg.split('=')[1]);
    } else {
      options.inputPath = arg;
    }
  }

  return options;
}

function assertThresholds(report, thresholds) {
  const failures = [];
  const resolvedThresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };

  if (report.summary.decodeRate < resolvedThresholds.minDecodeRate) {
    failures.push(
      `decode rate ${formatRate(report.summary.decodeRate)} < ${formatRate(
        resolvedThresholds.minDecodeRate,
      )}`,
    );
  }

  if (
    report.summary.falsePositiveCount > resolvedThresholds.maxFalsePositives
  ) {
    failures.push(
      `false positives ${report.summary.falsePositiveCount} > ${resolvedThresholds.maxFalsePositives}`,
    );
  }

  if (
    report.summary.collapsedInstanceCount >
    resolvedThresholds.maxCollapsedInstances
  ) {
    failures.push(
      `collapsed instances ${report.summary.collapsedInstanceCount} > ${resolvedThresholds.maxCollapsedInstances}`,
    );
  }

  if (
    report.summary.duplicateDetectionCount >
    resolvedThresholds.maxDuplicateDetections
  ) {
    failures.push(
      `duplicate detections ${report.summary.duplicateDetectionCount} > ${resolvedThresholds.maxDuplicateDetections}`,
    );
  }

  if (
    report.summary.latencyMs.p95 !== null &&
    report.summary.latencyMs.p95 > resolvedThresholds.maxP95LatencyMs
  ) {
    failures.push(
      `p95 latency ${report.summary.latencyMs.p95}ms > ${resolvedThresholds.maxP95LatencyMs}ms`,
    );
  }

  return failures;
}

function formatRate(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function printReport(report, thresholds) {
  const { summary } = report;

  console.log('Scanner benchmark');
  console.log(`Datasets: ${report.datasets.length}`);
  console.log(`Cases: ${summary.cases}`);
  console.log(
    `Frames/detections: ${summary.totalFrames}/${summary.totalDetectionEvents}`,
  );
  console.log(
    `Decode rate: ${formatRate(summary.decodeRate)} (${summary.decodedCount}/${
      summary.expectedCount
    })`,
  );
  console.log(`False positives: ${summary.falsePositiveCount}`);
  console.log(`Collapsed instances: ${summary.collapsedInstanceCount}`);
  console.log(`Duplicate detections: ${summary.duplicateDetectionCount}`);
  console.log(
    `Latency avg/p95: ${formatNullableMs(
      summary.latencyMs.average,
    )} / ${formatNullableMs(summary.latencyMs.p95)}`,
  );
  console.log(
    `Thresholds: decode >= ${formatRate(
      thresholds.minDecodeRate,
    )}, false positives <= ${
      thresholds.maxFalsePositives
    }, collapsed <= ${thresholds.maxCollapsedInstances}, duplicates <= ${
      thresholds.maxDuplicateDetections
    }, p95 <= ${formatNullableMs(thresholds.maxP95LatencyMs)}`,
  );
}

function formatNullableMs(value) {
  return typeof value === 'number' && Number.isFinite(value)
    ? `${Math.round(value)}ms`
    : '-';
}

function runCli(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  const datasets = readDatasets(options.inputPath);
  const datasetReports = datasets.map(({ filePath, dataset }) => ({
    filePath,
    ...evaluateDataset(dataset),
  }));
  const allCases = datasetReports.flatMap(dataset => dataset.cases);
  const report = {
    datasets: datasetReports,
    summary: summarizeResults(allCases),
  };
  const failures = assertThresholds(report, options.thresholds);

  printReport(report, options.thresholds);

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`Benchmark failed: ${failure}`);
    }
    process.exitCode = 1;
  }

  return report;
}

if (require.main === module) {
  runCli();
}

module.exports = {
  assertThresholds,
  buildBarcodeKey,
  buildBarcodeInstanceKey,
  evaluateCase,
  evaluateDataset,
  normalizeBarcodeFormat,
  parseCliArgs,
  runCli,
  summarizeResults,
};
