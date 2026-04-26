import React from 'react';
import {Platform} from 'react-native';
import {fuseDetectionFrame} from '../scanner/frameFusion';
import {
  formatNativeScannerStatus,
  getNativeMockDetectionsFrame,
  getNativeScannerCapabilities,
  getNativeScannerStatus,
  retryNativeScanner,
  setNativeAssistModeEnabled,
  setNativeDetectionThrottleMs,
  startNativeScanner,
  stopNativeScanner,
  subscribeToNativeDetections,
} from '../native/HebarcodeScanner';
import type {BarcodeDetectionsFrame, DetectedBarcode} from '../scanner/types';

type UseNativeScannerOptions = {
  assistMode?: boolean;
  active?: boolean;
};

type ScannerStatus = Awaited<ReturnType<typeof getNativeScannerStatus>>;
type ScannerCapabilities = Awaited<ReturnType<typeof getNativeScannerCapabilities>>;

const ASSISTED_THROTTLE_MS = 72;
const BALANCED_THROTTLE_MS = 120;
const ACTIVE_STATUS_POLL_MS = 850;
const CAMERA_STARTUP_TIMEOUT_MS = 9000;

async function applyScannerRuntimePreferences(assistMode: boolean): Promise<void> {
  await Promise.all([
    setNativeAssistModeEnabled(assistMode),
    setNativeDetectionThrottleMs(assistMode ? ASSISTED_THROTTLE_MS : BALANCED_THROTTLE_MS),
  ]);
}

export function useNativeScanner(options: UseNativeScannerOptions = {}) {
  const assistMode = options.assistMode ?? true;
  const active = options.active ?? false;
  const assistModeRef = React.useRef(assistMode);
  const [status, setStatus] = React.useState<ScannerStatus | null>(null);
  const [capabilities, setCapabilities] = React.useState<ScannerCapabilities | null>(null);
  const [latestFrame, setLatestFrame] = React.useState<BarcodeDetectionsFrame | null>(null);
  const [startupTimedOut, setStartupTimedOut] = React.useState(false);

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
    setStartupTimedOut(false);
    await applyRuntimePreferences();
    await startNativeScanner();
    await refreshStatus();
  }, [applyRuntimePreferences, refreshStatus]);

  const retry = React.useCallback(async () => {
    setStartupTimedOut(false);
    await applyRuntimePreferences();
    await retryNativeScanner();
    await refreshStatus();
  }, [applyRuntimePreferences, refreshStatus]);

  const stop = React.useCallback(async () => {
    setStartupTimedOut(false);
    await stopNativeScanner();
    await refreshStatus();
  }, [refreshStatus]);

  React.useEffect(() => {
    assistModeRef.current = assistMode;
    applyScannerRuntimePreferences(assistMode).catch(() => undefined);
  }, [assistMode]);

  React.useEffect(() => {
    let mounted = true;
    let syncInFlight = false;

    async function syncScannerState() {
      if (syncInFlight) {
        return;
      }

      syncInFlight = true;

      try {
        const {nextStatus} = await refreshStatus();

        if (!mounted || Platform.OS !== 'android' || !nextStatus.nativeModulePresent) {
          return;
        }

        if (!active) {
          await stopNativeScanner();

          if (mounted) {
            await refreshStatus();
          }

          return;
        }

        await applyScannerRuntimePreferences(assistModeRef.current);

        if (nextStatus.cameraPermissionGranted && !nextStatus.lastErrorCode) {
          await startNativeScanner();

          if (mounted) {
            await refreshStatus();
          }
        }
      } catch {
        if (mounted) {
          refreshStatus().catch(() => undefined);
        }
      } finally {
        syncInFlight = false;
      }
    }

    syncScannerState().catch(() => undefined);

    const interval = active ? setInterval(syncScannerState, ACTIVE_STATUS_POLL_MS) : undefined;

    return () => {
      mounted = false;

      if (interval) {
        clearInterval(interval);
      }
    };
  }, [active, refreshStatus]);

  React.useEffect(() => {
    const waitingForCamera =
      active &&
      Platform.OS === 'android' &&
      status?.nativeModulePresent === true &&
      status.cameraPermissionGranted === true &&
      status.streaming !== true &&
      !status.lastErrorCode;

    if (!waitingForCamera) {
      setStartupTimedOut(false);
      return undefined;
    }

    const timeout = setTimeout(() => {
      setStartupTimedOut(true);
    }, CAMERA_STARTUP_TIMEOUT_MS);

    return () => clearTimeout(timeout);
  }, [
    active,
    status?.cameraPermissionGranted,
    status?.lastErrorCode,
    status?.nativeModulePresent,
    status?.streaming,
  ]);

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
            bindingInProgress: false,
            scanningRequested: false,
            lastErrorCode: null,
            lastErrorMessage: null,
            previewAttachedAtMs: 0,
            previewWidth: 0,
            previewHeight: 0,
            analyzedFrameCount: 0,
            emittedFrameCount: 0,
            lastAnalyzedAtMs: 0,
            lastEmittedAtMs: 0,
            lastDetectionCount: 0,
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
    retry,
    stop,
    refreshStatus,
    assistMode,
    startupTimedOut,
  };
}
