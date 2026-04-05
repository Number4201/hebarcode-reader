import React from 'react';
import {
  formatNativeScannerStatus,
  getNativeMockDetectionsFrame,
  getNativeScannerCapabilities,
  getNativeScannerStatus,
  setNativeDetectionThrottleMs,
  startNativeScanner,
  stopNativeScanner,
  subscribeToNativeDetections,
  type NativeScannerCapabilities,
  type NativeScannerStatus,
} from '../native/HebarcodeScanner';
import type {BarcodeDetectionsFrame, DetectedBarcode} from '../scanner/types';

export function useNativeScanner() {
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

  const start = React.useCallback(async () => {
    await setNativeDetectionThrottleMs(250);
    await startNativeScanner();
    await refreshStatus();
  }, [refreshStatus]);

  const stop = React.useCallback(async () => {
    await stopNativeScanner();
    await refreshStatus();
  }, [refreshStatus]);

  React.useEffect(() => {
    let mounted = true;
    let unsubscribe = () => undefined;

    async function load() {
      try {
        const [nextMockFrame, statusResult] = await Promise.all([
          getNativeMockDetectionsFrame(),
          refreshStatus(),
        ]);

        if (!mounted) {
          return;
        }

        if (nextMockFrame) {
          setLatestFrame(nextMockFrame);
        }

        unsubscribe = subscribeToNativeDetections(frame => {
          if (!mounted) {
            return;
          }

          setLatestFrame(frame);
        });

        if (statusResult.nextStatus.cameraPermissionGranted) {
          await start();
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
            mode: 'stub',
            streaming: false,
            detectionEventName: undefined,
          },
        );
      }
    }

    void load();

    return () => {
      mounted = false;
      unsubscribe();
      void stop();
    };
  }, [refreshStatus, start, stop]);

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
  };
}
