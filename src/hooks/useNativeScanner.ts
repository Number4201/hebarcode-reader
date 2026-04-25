import React from 'react';
import {Platform} from 'react-native';
import {fuseDetectionFrame} from '../scanner/frameFusion';
import {
  formatNativeScannerStatus,
  getNativeMockDetectionsFrame,
  getNativeScannerCapabilities,
  getNativeScannerStatus,
  setNativeAssistModeEnabled,
  setNativeDetectionThrottleMs,
  startNativeScanner,
  stopNativeScanner,
  subscribeToNativeDetections,
  type NativeScannerCapabilities,
  type NativeScannerStatus,
} from '../native/HebarcodeScanner';
import type {BarcodeDetectionsFrame, DetectedBarcode} from '../scanner/types';

type UseNativeScannerOptions = {
  assistMode?: boolean;
};

const ASSISTED_THROTTLE_MS = 72;
const BALANCED_THROTTLE_MS = 120;

async function applyScannerRuntimePreferences(assistMode: boolean): Promise<void> {
  await Promise.all([
    setNativeAssistModeEnabled(assistMode),
    setNativeDetectionThrottleMs(assistMode ? ASSISTED_THROTTLE_MS : BALANCED_THROTTLE_MS),
  ]);
}

export function useNativeScanner(options: UseNativeScannerOptions = {}) {
  const assistMode = options.assistMode ?? true;
  const assistModeRef = React.useRef(assistMode);
  const [status, setStatus] = React.useState<NativeScannerStatus | null>(null);
  const [capabilities, setCapabilities] = React.useState<NativeScannerCapabilities | null>(null);
  const [latestFrame, setLatestFrame] = React.useState<BarcodeDetectionsFrame | null>(null);

  const refreshStatus = React.useCallback(async () => {
    const [nextStatus, nextCapabilities] = await Promise.all([
      getNativeScannerStatus(),
      getNativeScannerCapabilities(),
    ]);

    setStatus(nextStatus);
    setCapabilities(nextCapabilities);

    return {nextStatus, nextCapabilities};
  }, []);

  const applyRuntimePreferences = React.useCallback(async () => {
    await applyScannerRuntimePreferences(assistMode);
  }, [assistMode]);

  const start = React.useCallback(async () => {
    await applyRuntimePreferences();
    await startNativeScanner();
    await refreshStatus();
  }, [applyRuntimePreferences, refreshStatus]);

  const stop = React.useCallback(async () => {
    await stopNativeScanner();
    await refreshStatus();
  }, [refreshStatus]);

  React.useEffect(() => {
    assistModeRef.current = assistMode;
    applyScannerRuntimePreferences(assistMode).catch(() => undefined);
  }, [assistMode]);

  React.useEffect(() => {
    let mounted = true;
    let unsubscribe: () => void = () => {};

    async function load() {
      try {
        const statusResult = await refreshStatus();

        if (!mounted) {
          return;
        }

        await applyScannerRuntimePreferences(assistModeRef.current);

        const shouldUseMockFrame =
          Platform.OS !== 'android' || !statusResult.nextStatus.nativeModulePresent;

        if (shouldUseMockFrame) {
          const nextMockFrame = await getNativeMockDetectionsFrame();

          if (!mounted) {
            return;
          }

          if (nextMockFrame) {
            React.startTransition(() => {
              setLatestFrame(nextMockFrame);
            });
          }
        }

        unsubscribe = subscribeToNativeDetections(frame => {
          if (!mounted) {
            return;
          }

          React.startTransition(() => {
            setLatestFrame(previousFrame => fuseDetectionFrame(previousFrame, frame));
          });
        });

        if (statusResult.nextStatus.cameraPermissionGranted) {
          await startNativeScanner();

          if (mounted) {
            await refreshStatus();
          }
        }
      } catch {
        if (!mounted) {
          return;
        }

        setStatus(prev =>
          prev ?? {
            platform: 'unknown',
            nativeModulePresent: false,
            version: 'error',
            cameraPermissionDeclared: false,
            cameraPermissionGranted: false,
            previewAttached: false,
            mode: 'ready',
            streaming: false,
            detectionEventName: undefined,
          },
        );
      }
    }

    load().catch(() => undefined);

    return () => {
      mounted = false;
      unsubscribe();
      stopNativeScanner().catch(() => undefined);
    };
  }, [refreshStatus]);

  const detections: DetectedBarcode[] = latestFrame?.detections ?? [];

  return {
    status,
    statusLabel: status ? formatNativeScannerStatus(status) : 'Loading native scanner status...',
    capabilities,
    latestFrame,
    detections,
    start,
    stop,
    refreshStatus,
    assistMode,
  };
}
