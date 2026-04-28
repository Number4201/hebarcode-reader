import React from 'react';
import { Platform } from 'react-native';
import { fuseDetectionFrame } from '../scanner/frameFusion';
import {
  formatNativeScannerStatus,
  getNativeMockDetectionsFrame,
  getNativeScannerCapabilities,
  getNativeScannerStatus,
  isNativeScannerFrameFlowStale,
  isNativeScannerPipelineBound,
  isNativeScannerPreviewStreamStale,
  retryNativeScanner,
  setNativeAnalyzerPreviewEnabled,
  setNativeAssistModeEnabled,
  setNativeDetectionThrottleMs,
  setNativeTorchEnabled,
  startNativeScanner,
  stopNativeScanner,
  subscribeToNativeDetections,
} from '../native/HebarcodeScanner';
import type { BarcodeDetectionsFrame, DetectedBarcode } from '../scanner/types';

type UseNativeScannerOptions = {
  assistMode?: boolean;
  mode?: ScannerRuntimeMode;
};

export type ScannerRuntimeMode = 'inactive' | 'expedition' | 'diagnostics';

type ScannerStatus = Awaited<ReturnType<typeof getNativeScannerStatus>>;
type ScannerCapabilities = Awaited<
  ReturnType<typeof getNativeScannerCapabilities>
>;

const ASSISTED_THROTTLE_MS = 88;
const BALANCED_THROTTLE_MS = 170;
const ACTIVE_STATUS_POLL_MS = 850;
const CAMERA_STARTUP_TIMEOUT_MS = 9000;
const FRAME_FLOW_AUTO_RETRY_MS = 4500;
const FRAME_FLOW_AUTO_RETRY_COOLDOWN_MS = 6500;
const BACKGROUND_EMPTY_FRAME_PUBLISH_MS = 520;

async function applyScannerRuntimePreferences(
  assistMode: boolean,
  analyzerPreviewEnabled: boolean,
): Promise<void> {
  await Promise.all([
    setNativeAssistModeEnabled(assistMode),
    setNativeAnalyzerPreviewEnabled(analyzerPreviewEnabled),
    setNativeDetectionThrottleMs(
      assistMode ? ASSISTED_THROTTLE_MS : BALANCED_THROTTLE_MS,
    ),
  ]);
}

export function useNativeScanner(options: UseNativeScannerOptions = {}) {
  const assistMode = options.assistMode ?? true;
  const runtimeMode = options.mode ?? 'inactive';
  const active = runtimeMode !== 'inactive';
  const analyzerPreviewEnabled = runtimeMode !== 'inactive';
  const diagnosticMode = runtimeMode === 'diagnostics';
  const assistModeRef = React.useRef(assistMode);
  const analyzerPreviewEnabledRef = React.useRef(analyzerPreviewEnabled);
  const diagnosticModeRef = React.useRef(diagnosticMode);
  const activeRef = React.useRef(active);
  const lastPublishedEmptyFrameAtRef = React.useRef(0);
  const lastAutoRetryAtRef = React.useRef(0);
  const [status, setStatus] = React.useState<ScannerStatus | null>(null);
  const [capabilities, setCapabilities] =
    React.useState<ScannerCapabilities | null>(null);
  const [latestFrame, setLatestFrame] =
    React.useState<BarcodeDetectionsFrame | null>(null);
  const [startupTimedOut, setStartupTimedOut] = React.useState(false);

  const refreshStatus = React.useCallback(async () => {
    const [nextStatus, nextCapabilities] = await Promise.all([
      getNativeScannerStatus(),
      getNativeScannerCapabilities(),
    ]);

    setStatus(nextStatus);
    setCapabilities(nextCapabilities);

    return { nextStatus, nextCapabilities };
  }, []);

  const applyRuntimePreferences = React.useCallback(async () => {
    await applyScannerRuntimePreferences(assistMode, analyzerPreviewEnabled);
  }, [analyzerPreviewEnabled, assistMode]);

  const start = React.useCallback(async () => {
    setStartupTimedOut(false);
    setLatestFrame(null);
    lastPublishedEmptyFrameAtRef.current = 0;
    lastAutoRetryAtRef.current = 0;
    await applyRuntimePreferences();
    await startNativeScanner();
    await refreshStatus();
  }, [applyRuntimePreferences, refreshStatus]);

  const retry = React.useCallback(async () => {
    setStartupTimedOut(false);
    setLatestFrame(null);
    lastPublishedEmptyFrameAtRef.current = 0;
    lastAutoRetryAtRef.current = Date.now();
    await applyRuntimePreferences();
    await retryNativeScanner();
    await refreshStatus();
  }, [applyRuntimePreferences, refreshStatus]);

  const stop = React.useCallback(async () => {
    setStartupTimedOut(false);
    setLatestFrame(null);
    lastPublishedEmptyFrameAtRef.current = 0;
    lastAutoRetryAtRef.current = 0;
    await stopNativeScanner();
    await refreshStatus();
  }, [refreshStatus]);

  const setTorchEnabled = React.useCallback(
    async (enabled: boolean) => {
      await setNativeTorchEnabled(enabled);
      await refreshStatus();
    },
    [refreshStatus],
  );

  React.useEffect(() => {
    assistModeRef.current = assistMode;
    analyzerPreviewEnabledRef.current = analyzerPreviewEnabled;
    applyScannerRuntimePreferences(assistMode, analyzerPreviewEnabled).catch(
      () => undefined,
    );
  }, [analyzerPreviewEnabled, assistMode]);

  React.useEffect(() => {
    diagnosticModeRef.current = diagnosticMode;
  }, [diagnosticMode]);

  React.useEffect(() => {
    activeRef.current = active;

    if (!active) {
      setLatestFrame(null);
      lastPublishedEmptyFrameAtRef.current = 0;
    }
  }, [active]);

  React.useEffect(() => {
    let mounted = true;
    let syncInFlight = false;

    async function syncScannerState() {
      if (syncInFlight) {
        return;
      }

      syncInFlight = true;

      try {
        const { nextStatus } = await refreshStatus();

        if (
          !mounted ||
          Platform.OS !== 'android' ||
          !nextStatus.nativeModulePresent
        ) {
          return;
        }

        if (!active) {
          lastAutoRetryAtRef.current = 0;
          lastPublishedEmptyFrameAtRef.current = 0;
          setLatestFrame(null);
          await stopNativeScanner();

          if (mounted) {
            await refreshStatus();
          }

          return;
        }

        await applyScannerRuntimePreferences(
          assistModeRef.current,
          analyzerPreviewEnabledRef.current,
        );

        const now = Date.now();
        const pipelineBound = isNativeScannerPipelineBound(nextStatus);
        const frameFlowStale = isNativeScannerFrameFlowStale(
          nextStatus,
          FRAME_FLOW_AUTO_RETRY_MS,
          now,
        );
        const previewStreamStale = isNativeScannerPreviewStreamStale(
          nextStatus,
          FRAME_FLOW_AUTO_RETRY_MS,
          now,
        );

        if (
          nextStatus.cameraPermissionGranted &&
          !nextStatus.lastErrorCode &&
          (frameFlowStale || previewStreamStale) &&
          now - lastAutoRetryAtRef.current >= FRAME_FLOW_AUTO_RETRY_COOLDOWN_MS
        ) {
          lastAutoRetryAtRef.current = now;
          await retryNativeScanner();

          if (mounted) {
            await refreshStatus();
          }

          return;
        }

        const scannerNeedsStart =
          !nextStatus.scanningRequested ||
          (!pipelineBound &&
            !nextStatus.bindingInProgress &&
            nextStatus.previewAttached);

        if (
          nextStatus.cameraPermissionGranted &&
          !nextStatus.lastErrorCode &&
          scannerNeedsStart
        ) {
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

    const interval = active
      ? setInterval(syncScannerState, ACTIVE_STATUS_POLL_MS)
      : undefined;

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
        await refreshStatus();

        if (!mounted) {
          return;
        }

        await applyScannerRuntimePreferences(
          assistModeRef.current,
          analyzerPreviewEnabledRef.current,
        );

        const shouldUseMockFrame = Platform.OS !== 'android';

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

          if (frame.source === 'camera' && !activeRef.current) {
            return;
          }

          React.startTransition(() => {
            setLatestFrame(previousFrame => {
              const fusedFrame = fuseDetectionFrame(previousFrame, frame);

              return shouldPublishFrame(
                previousFrame,
                frame,
                fusedFrame,
                diagnosticModeRef.current,
                lastPublishedEmptyFrameAtRef,
              )
                ? fusedFrame
                : previousFrame;
            });
          });
        });
      } catch {
        if (!mounted) {
          return;
        }

        setStatus(
          prev =>
            prev ?? {
              platform: 'unknown',
              nativeModulePresent: false,
              version: 'error',
              cameraPermissionDeclared: false,
              cameraPermissionGranted: false,
              previewAttached: false,
              mode: 'ready',
              pipelineBound: false,
              streaming: false,
              previewStreamState: 'IDLE',
              previewStreaming: false,
              previewStreamUpdatedAtMs: 0,
              previewSizeReady: false,
              previewImplementationMode: 'PERFORMANCE',
              useCaseBindingMode: 'viewport-group',
              nativeFrameFlowRecoveryCount: 0,
              lifecycleState: 'none',
              cameraState: 'UNBOUND',
              cameraStateErrorCode: 0,
              cameraStateErrorMessage: null,
              torchEnabled: false,
              torchRequested: false,
              analyzerPreviewEnabled: false,
              detectionEventName: undefined,
              bindingInProgress: false,
              scanningRequested: false,
              lastErrorCode: null,
              lastErrorMessage: null,
              lastBindBlockReason: null,
              pipelineBoundAtMs: 0,
              frameFlowActiveWindowMs: 0,
              previewAttachedAtMs: 0,
              previewWidth: 0,
              previewHeight: 0,
              boundPreviewWidth: 0,
              boundPreviewHeight: 0,
              analyzedFrameCount: 0,
              emittedFrameCount: 0,
              lastAnalyzedAtMs: 0,
              lastEmittedAtMs: 0,
              lastDetectionCount: 0,
              analyzerPreviewFrameCount: 0,
              lastAnalyzerPreviewAtMs: 0,
              lastDecodeMode: 'fast',
              fastDecodeCount: 0,
              deepDecodeCount: 0,
              mlKitDecodeCount: 0,
              mlKitBusy: false,
              analysisProfileName: 'unavailable',
              analysisTargetWidth: 0,
              analysisTargetHeight: 0,
              analysisFallbackRule: 'unavailable',
              analysisRetryCount: 0,
              lastAnalyzerErrorCode: null,
              lastAnalyzerErrorMessage: null,
              lastAnalyzerErrorAtMs: 0,
              analyzerErrorCount: 0,
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
    statusLabel: status
      ? formatNativeScannerStatus(status)
      : 'Loading native scanner status...',
    capabilities,
    latestFrame,
    detections,
    start,
    retry,
    stop,
    refreshStatus,
    setTorchEnabled,
    assistMode,
    runtimeMode,
    startupTimedOut,
  };
}

function shouldPublishFrame(
  previousFrame: BarcodeDetectionsFrame | null,
  incomingFrame: BarcodeDetectionsFrame,
  fusedFrame: BarcodeDetectionsFrame,
  diagnosticMode: boolean,
  lastPublishedEmptyFrameAtRef: React.MutableRefObject<number>,
): boolean {
  if (diagnosticMode || fusedFrame.source !== 'camera') {
    return true;
  }

  if (incomingFrame.previewImageBase64) {
    lastPublishedEmptyFrameAtRef.current = fusedFrame.timestampMs;
    return true;
  }

  if (incomingFrame.detections.length > 0) {
    lastPublishedEmptyFrameAtRef.current = fusedFrame.timestampMs;
    return true;
  }

  if (
    (previousFrame?.detections.length ?? 0) > 0 &&
    fusedFrame.detections.length === 0
  ) {
    lastPublishedEmptyFrameAtRef.current = fusedFrame.timestampMs;
    return true;
  }

  if (
    fusedFrame.timestampMs - lastPublishedEmptyFrameAtRef.current >=
    BACKGROUND_EMPTY_FRAME_PUBLISH_MS
  ) {
    lastPublishedEmptyFrameAtRef.current = fusedFrame.timestampMs;
    return true;
  }

  return false;
}
