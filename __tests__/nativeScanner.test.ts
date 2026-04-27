import {
  getNativeMockDetections,
  getNativeScannerCapabilities,
  formatNativeScannerStatus,
  getNativeScannerStatus,
} from '../src/native/HebarcodeScanner';

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
    expect(status.lastBindBlockReason).toBeNull();
    expect(status.analyzerPreviewEnabled).toBe(false);
    expect(status.frameFlowActiveWindowMs).toBe(0);
    expect(status.analyzerPreviewFrameCount).toBe(0);
    expect(status.lastAnalyzerPreviewAtMs).toBe(0);
    expect(status.lastDecodeMode).toBe('fast');
    expect(status.deepDecodeCount).toBe(0);
    expect(status.analysisProfileName).toBe('unavailable');
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
    expect(capabilities.engine).toBe('unavailable');
  });

  it('returns no native mock detections when native module is absent in tests', async () => {
    await expect(getNativeMockDetections()).resolves.toEqual([]);
  });
});
