import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {Text} from 'react-native';
import App from '../App';
import {APP_HEADLINE, APP_NAME} from '../src/content';
import {MOCK_BARCODES} from '../src/scanner/mockData';

jest.mock('react-native-safe-area-context', () => {
  const {View} = require('react-native');

  return {
    SafeAreaProvider: ({children}: {children: React.ReactNode}) => <View>{children}</View>,
    SafeAreaView: ({children}: {children: React.ReactNode}) => <View>{children}</View>,
    useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 0, left: 0}),
  };
});

jest.mock('../src/hooks/useNativeScanner', () => ({
  useNativeScanner: jest.fn(() => ({
    status: {
      nativeModulePresent: true,
      cameraPermissionGranted: true,
      previewAttached: true,
    },
    statusLabel: 'android / native / v0.3.0 / live / preview ready / camera ready',
    capabilities: {
      cameraStack: 'CameraX',
      engine: 'zxing-cpp',
    },
    latestFrame: {
      frameId: 'frame-1',
      timestampMs: 1710000000000,
      source: 'mock',
      rotationDegrees: 0,
      frameSize: {width: 360, height: 320},
      detections: MOCK_BARCODES,
    },
    start: jest.fn(),
    retry: jest.fn(),
    stop: jest.fn(),
    refreshStatus: jest.fn(),
    setTorchEnabled: jest.fn(),
    startupTimedOut: false,
  })),
}));

jest.mock('../src/native/HebarcodeStorage', () => ({
  loadPersistedAppState: jest.fn().mockResolvedValue({
    archive: [],
    activeExpedition: null,
    settings: {
      xmlRootTag: 'Expedice',
      xmlPrettyPrint: true,
      xmlIncludeTimestamp: true,
      xmlIncludeQuantityTotals: true,
      autoReturnToMenuAfterSave: false,
      scannerAssistMode: true,
    },
    available: false,
  }),
  savePersistedAppState: jest.fn().mockResolvedValue(false),
  exportXmlDocument: jest.fn().mockResolvedValue({ok: false, available: false}),
}));

function collectText(node: ReactTestRenderer.ReactTestInstance): string[] {
  return node
    .findAllByType(Text)
    .flatMap(textNode => textNode.props.children)
    .flatMap((child: unknown) => {
      if (typeof child === 'string') {
        return [child];
      }

      if (Array.isArray(child)) {
        return child.filter((item): item is string => typeof item === 'string');
      }

      return [];
    });
}

function getUseNativeScannerMock() {
  return jest.requireMock('../src/hooks/useNativeScanner').useNativeScanner as jest.Mock;
}

describe('App', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the start menu shell', async () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<App />);
      await Promise.resolve();
    });

    const texts = collectText(renderer.root).join('\n');

    expect(texts).toContain(APP_NAME);
    expect(texts).toContain(APP_HEADLINE);
    expect(texts).toContain('Nová expedice');
    expect(texts).toContain('Diagnostika skeneru');
    expect(texts).toContain('Archiv expedicí');
    expect(texts).toContain('Nastavení');
    expect(texts).toContain('Rozpracováno');

    await ReactTestRenderer.act(() => {
      renderer.unmount();
    });
  });

  it('activates the scanner lifecycle when expedition opens', async () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<App />);
      await Promise.resolve();
    });

    expect(getUseNativeScannerMock()).toHaveBeenLastCalledWith({
      assistMode: true,
      mode: 'inactive',
    });

    const startExpeditionButton = renderer.root.findByProps({
      accessibilityLabel: 'Nová expedice',
    });

    await ReactTestRenderer.act(async () => {
      startExpeditionButton.props.onPress();
      await Promise.resolve();
    });

    expect(getUseNativeScannerMock()).toHaveBeenLastCalledWith({
      assistMode: true,
      mode: 'expedition',
    });

    await ReactTestRenderer.act(() => {
      renderer.unmount();
    });
  });
});
