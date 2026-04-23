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
