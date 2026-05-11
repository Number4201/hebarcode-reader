import {
  getNativeMockDetections,
  getNativeScannerCapabilities,
  formatNativeScannerStatus,
  getNativeScannerStatus,
  setNativeScannerProfile,
} from '../src/native/HebarcodeScanner';
import {
  getScannerRuntimeDescriptor,
  isImplementedScannerRuntime,
  normalizeScannerRuntimeId,
} from '../src/scanner/runtimeAdapters';

describe('native scanner wrapper', () => {
  it('returns a fallback status when no native module is present in tests', async () => {
    const status = await getNativeScannerStatus();

    expect(status.nativeModulePresent).toBe(false);
    expect(status.mode).toBe('ready');
    expect(status.pipelineBound).toBe(false);
    expect(status.streaming).toBe(false);
    expect(status.previewStreaming).toBe(false);
    expect(status.previewStreamState).toBe('IDLE');
    expect(status.previewSizeReady).toBe(false);
    expect(status.previewImplementationMode).toBe('PERFORMANCE');
    expect(status.useCaseBindingMode).toBe('viewport-group');
    expect(status.nativeFrameFlowRecoveryCount).toBe(0);
    expect(status.lifecycleState).toBe('none');
    expect(status.cameraState).toBe('UNBOUND');
    expect(status.cameraStateErrorCode).toBe(0);
    expect(status.cameraStateErrorMessage).toBeNull();
    expect(status.torchEnabled).toBe(false);
    expect(status.torchRequested).toBe(false);
    expect(status.lastBindBlockReason).toBeNull();
    expect(status.analyzerPreviewEnabled).toBe(false);
    expect(status.scannerProfileName).toBe('unavailable');
    expect(status.roiEnabled).toBe(false);
    expect(status.maxDetections).toBe(0);
    expect(status.mlKitEnabled).toBe(false);
    expect(status.deepScanEnabled).toBe(false);
    expect(status.frameFlowActiveWindowMs).toBe(0);
    expect(status.analyzerPreviewFrameCount).toBe(0);
    expect(status.lastAnalyzerPreviewAtMs).toBe(0);
    expect(status.lastDecodeMode).toBe('fast');
    expect(status.deepDecodeCount).toBe(0);
    expect(status.mlKitDecodeCount).toBe(0);
    expect(status.fastDecodeHitCount).toBe(0);
    expect(status.deepDecodeHitCount).toBe(0);
    expect(status.mlKitDecodeHitCount).toBe(0);
    expect(status.mlKitPotentialCount).toBe(0);
    expect(status.mlKitBusy).toBe(false);
    expect(status.mlKitDroppedBecauseBusyCount).toBe(0);
    expect(status.mlKitTimeoutCount).toBe(0);
    expect(status.mlKitStaleResultCount).toBe(0);
    expect(status.mlKitLastGeneration).toBe(0);
    expect(status.focusAssistCount).toBe(0);
    expect(status.zoomAssistCount).toBe(0);
    expect(status.zoomResetCount).toBe(0);
    expect(status.consecutiveDecodeMissCount).toBe(0);
    expect(status.consecutiveDecodeHitCount).toBe(0);
    expect(status.lastAverageLuma).toBe(-1);
    expect(status.lastFrameContrast).toBe(-1);
    expect(status.lastFrameSharpness).toBe(-1);
    expect(status.lastFrameQualityScore).toBe(-1);
    expect(status.lastFrameQualityReason).toBe('unknown');
    expect(status.lastAnalyzerDurationMs).toBe(0);
    expect(status.lastFastDecodeDurationMs).toBe(0);
    expect(status.lastDeepDecodeDurationMs).toBe(0);
    expect(status.lastMlKitDecodeDurationMs).toBe(0);
    expect(status.analysisProfileName).toBe('unavailable');
  });

  it('no-ops scanner profile updates when native module is absent in tests', async () => {
    await expect(
      setNativeScannerProfile({
        name: 'warehouse-code128',
        roiEnabled: true,
        maxDetections: 8,
        mlKitEnabled: false,
      }),
    ).resolves.toBeUndefined();
  });

  it('normalizes ML Kit backpressure diagnostics from native status payloads', async () => {
    jest.resetModules();
    const reactNative = require('react-native');
    reactNative.NativeModules.HebarcodeScanner = {
      getStatus: jest.fn().mockResolvedValue({
        platform: 'android',
        nativeModulePresent: true,
        version: '0.4.0',
        cameraPermissionDeclared: true,
        mode: 'native',
        pipelineBound: true,
        mlKitDroppedBecauseBusyCount: 3,
        mlKitTimeoutCount: 2,
        mlKitStaleResultCount: 1,
        mlKitLastGeneration: 8,
      }),
      addListener: jest.fn(),
      removeListeners: jest.fn(),
    };

    const { getNativeScannerStatus: getStatus } = require('../src/native/HebarcodeScanner') as typeof import('../src/native/HebarcodeScanner');
    const status = await getStatus();

    expect(status.mlKitDroppedBecauseBusyCount).toBe(3);
    expect(status.mlKitTimeoutCount).toBe(2);
    expect(status.mlKitStaleResultCount).toBe(1);
    expect(status.mlKitLastGeneration).toBe(8);

    delete reactNative.NativeModules.HebarcodeScanner;
    jest.resetModules();
  });

  it('formats present native module status', () => {
    expect(
      formatNativeScannerStatus({
        platform: 'android',
        nativeModulePresent: true,
        version: '0.3.0',
        cameraPermissionDeclared: true,
        mode: 'ready',
      }),
    ).toContain('android / ready / v0.3.0');
  });

  it('returns safe fallback capabilities when native module is absent in tests', async () => {
    const capabilities = await getNativeScannerCapabilities();

    expect(capabilities.cameraPreview).toBe(false);
    expect(capabilities.autoTorchAssist).toBe(false);
    expect(capabilities.engine).toBe('unavailable');
  });

  it('returns no native mock detections when native module is absent in tests', async () => {
    await expect(getNativeMockDetections()).resolves.toEqual([]);
  });

  it('defaults to the built-in CameraX runtime', () => {
    const runtimeId = normalizeScannerRuntimeId('unknown');
    const descriptor = getScannerRuntimeDescriptor(runtimeId);

    expect(runtimeId).toBe('camera-x');
    expect(descriptor.implemented).toBe(true);
  });

  it('keeps enterprise scanner runtimes explicit until implemented', () => {
    expect(getScannerRuntimeDescriptor('datawedge').implemented).toBe(false);
    expect(isImplementedScannerRuntime('honeywell')).toBe(false);
  });
});
