import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Text } from 'react-native';
import App from '../App';
import { APP_HEADLINE, APP_NAME } from '../src/content';
import { MOCK_BARCODES } from '../src/scanner/mockData';
import type { BarcodeDetectionsFrame, DetectedBarcode } from '../src/scanner/types';

function makeBarcode(id: string, text: string, x = 180, y = 320): DetectedBarcode {
  return {
    id,
    format: 'CODE_128',
    text,
    contentType: 'TEXT',
    confidence: 0.95,
    lastSeenTimestampMs: 1710000000000,
    points: [
      { x: x - 35, y: y - 20 },
      { x: x + 35, y: y - 20 },
      { x: x + 35, y: y + 20 },
      { x: x - 35, y: y + 20 },
    ],
    frameSize: { width: 360, height: 640 },
  };
}

const mockCameraBarcode = makeBarcode('CODE_128|AUTO-1|0', 'AUTO-1');
let mockLatestFrame: BarcodeDetectionsFrame = {
  frameId: 'frame-1',
  timestampMs: 1710000000000,
  source: 'mock',
  rotationDegrees: 0,
  frameSize: { width: 360, height: 320 },
  detections: MOCK_BARCODES,
};

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');

  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => (
      <View>{children}</View>
    ),
    SafeAreaView: ({ children }: { children: React.ReactNode }) => (
      <View>{children}</View>
    ),
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  };
});

jest.mock('../src/hooks/useNativeScanner', () => ({
  useNativeScanner: jest.fn(() => ({
    status: {
      nativeModulePresent: true,
      cameraPermissionGranted: true,
      previewAttached: true,
    },
    statusLabel:
      'android / native / v0.3.0 / live / preview ready / camera ready',
    capabilities: {
      cameraStack: 'CameraX',
      engine: 'zxing-cpp',
    },
    latestFrame: mockLatestFrame,
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
      scannerRuntimeId: 'camera-x',
      xmlLayoutConfigText: '',
    },
    available: false,
  }),
  savePersistedAppState: jest.fn().mockResolvedValue(false),
  exportXmlDocument: jest
    .fn()
    .mockResolvedValue({ ok: false, available: false }),
  importXmlLayoutConfigFile: jest
    .fn()
    .mockResolvedValue({ ok: false, available: false }),
}));

function collectText(node: ReactTestRenderer.ReactTestInstance): string[] {
  return node
    .findAllByType(Text)
    .flatMap(textNode => textNode.props.children)
    .flatMap((child: unknown) => {
      if (typeof child === 'string') {
        return [child];
      }

      if (typeof child === 'number') {
        return [String(child)];
      }

      if (Array.isArray(child)) {
        return child
          .filter(
            (item): item is string | number =>
              typeof item === 'string' || typeof item === 'number',
          )
          .map(String);
      }

      return [];
    });
}

function getUseNativeScannerMock() {
  return jest.requireMock('../src/hooks/useNativeScanner')
    .useNativeScanner as jest.Mock;
}

function findPreviewAction(
  root: ReactTestRenderer.ReactTestInstance,
  previewText: string,
) {
  const previewAction = root.findAll(
    node =>
      typeof node.props.accessibilityLabel === 'string' &&
      node.props.accessibilityLabel.includes(previewText),
  )[0];

  if (!previewAction) {
    throw new Error(`Preview action not found for ${previewText}`);
  }

  return previewAction;
}

async function renderApp() {
  let renderer!: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<App />);
    await Promise.resolve();
  });

  return renderer;
}

async function openExpedition(renderer: ReactTestRenderer.ReactTestRenderer) {
  await ReactTestRenderer.act(async () => {
    renderer.root
      .findByProps({ accessibilityLabel: 'Nová expedice' })
      .props.onPress();
    await Promise.resolve();
  });
}

async function updateCameraFrame(
  renderer: ReactTestRenderer.ReactTestRenderer,
  frame: Partial<BarcodeDetectionsFrame>,
) {
  mockLatestFrame = {
    frameId: frame.frameId ?? `camera-${frame.timestampMs ?? 1710000000000}`,
    timestampMs: frame.timestampMs ?? 1710000000000,
    source: 'camera',
    rotationDegrees: 0,
    frameSize: { width: 360, height: 640 },
    detections: [mockCameraBarcode],
    ...frame,
  };

  await ReactTestRenderer.act(async () => {
    renderer.update(<App />);
    await Promise.resolve();
  });
}

describe('App', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLatestFrame = {
      frameId: 'frame-1',
      timestampMs: 1710000000000,
      source: 'mock',
      rotationDegrees: 0,
      frameSize: { width: 360, height: 320 },
      detections: MOCK_BARCODES,
    };
  });

  it('renders the start menu shell', async () => {
    const renderer = await renderApp();

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
    const renderer = await renderApp();

    expect(getUseNativeScannerMock()).toHaveBeenLastCalledWith({
      assistMode: true,
      mode: 'inactive',
      scannerRuntimeId: 'camera-x',
    });

    await openExpedition(renderer);

    expect(getUseNativeScannerMock()).toHaveBeenLastCalledWith({
      assistMode: true,
      mode: 'expedition',
      scannerRuntimeId: 'camera-x',
    });

    await ReactTestRenderer.act(() => {
      renderer.unmount();
    });
  });

  it('selects scanner preview labels and commits only with the trigger', async () => {
    const renderer = await renderApp();

    await openExpedition(renderer);

    await ReactTestRenderer.act(async () => {
      findPreviewAction(
        renderer.root,
        'https://example.com/alpha',
      ).props.onPress();
      await Promise.resolve();
    });

    expect(collectText(renderer.root).join('')).not.toContain('1 ks');

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ accessibilityLabel: 'Spoušť: přidat zaměřený kód' })
        .props.onPress();
      await Promise.resolve();
    });

    expect(collectText(renderer.root).join('')).toContain('1 ks');

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ accessibilityLabel: 'Spoušť: přidat zaměřený kód' })
        .props.onPress();
      await Promise.resolve();
    });

    expect(collectText(renderer.root).join('')).toContain('2 ks');

    await ReactTestRenderer.act(() => {
      renderer.unmount();
    });
  });

  it('targets a ready camera scan without committing until trigger is pressed', async () => {
    const renderer = await renderApp();

    await openExpedition(renderer);
    await updateCameraFrame(renderer, {
      frameId: 'camera-1',
      timestampMs: 1710000000000,
      detections: [mockCameraBarcode],
    });

    let texts = collectText(renderer.root).join('');
    expect(texts).toContain('AUTO-1');
    expect(texts).not.toContain('1 ks');

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ accessibilityLabel: 'Spoušť: přidat zaměřený kód' })
        .props.onPress();
      await Promise.resolve();
    });

    expect(collectText(renderer.root).join('')).toContain('1 ks');

    await updateCameraFrame(renderer, {
      frameId: 'camera-2',
      timestampMs: 1710000000500,
      detections: [{ ...mockCameraBarcode, id: 'CODE_128|AUTO-1|1' }],
    });

    texts = collectText(renderer.root).join('');
    expect(texts).toContain('1 ks');
    expect(texts).toContain('AUTO-1');

    await ReactTestRenderer.act(() => {
      renderer.unmount();
    });
  });

  it('does not mutate on ambiguous camera scans, while manual selection still adds', async () => {
    const renderer = await renderApp();
    const left = makeBarcode('CODE_128|AMB-L|0', 'AMB-L', 166);
    const right = makeBarcode('CODE_128|AMB-R|0', 'AMB-R', 194);

    await openExpedition(renderer);
    await updateCameraFrame(renderer, {
      frameId: 'camera-ambiguous',
      timestampMs: 1710000001000,
      detections: [left, right],
    });

    let texts = collectText(renderer.root).join('\n');
    expect(texts).toContain('Více kódů v zóně. Vyber kód ručně.');
    expect(texts).not.toContain('1 ks');

    await ReactTestRenderer.act(async () => {
      findPreviewAction(renderer.root, 'AMB-L').props.onPress();
      await Promise.resolve();
    });

    texts = collectText(renderer.root).join('');
    expect(texts).not.toContain('1 ks');

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ accessibilityLabel: 'Spoušť: přidat zaměřený kód' })
        .props.onPress();
      await Promise.resolve();
    });

    texts = collectText(renderer.root).join('');
    expect(texts).toContain('1 ks');
    expect(texts).toContain('Ručně přidáno');

    await ReactTestRenderer.act(() => {
      renderer.unmount();
    });
  });

  it('edits row quantity and removes rows from the expedition list', async () => {
    const renderer = await renderApp();

    await openExpedition(renderer);
    await ReactTestRenderer.act(async () => {
      findPreviewAction(renderer.root, 'https://example.com/alpha').props.onPress();
      await Promise.resolve();
    });
    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ accessibilityLabel: 'Spoušť: přidat zaměřený kód' })
        .props.onPress();
      await Promise.resolve();
    });

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ accessibilityLabel: 'Zvýšit množství https://example.com/alpha' })
        .props.onPress();
      await Promise.resolve();
    });

    let texts = collectText(renderer.root).join('');
    expect(texts).toContain('2 ks');
    expect(texts).toContain('Množství zvýšeno');

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ accessibilityLabel: 'Snížit množství https://example.com/alpha' })
        .props.onPress();
      await Promise.resolve();
    });

    texts = collectText(renderer.root).join('');
    expect(texts).toContain('1 ks');
    expect(texts).toContain('Množství sníženo');

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ accessibilityLabel: 'Odebrat položku https://example.com/alpha' })
        .props.onPress();
      await Promise.resolve();
    });

    texts = collectText(renderer.root).join('');
    expect(texts).toContain('Položka odebrána');
    expect(texts).not.toContain('1 ks');

    await ReactTestRenderer.act(() => {
      renderer.unmount();
    });
  });

  it('undoes the latest scan from the expedition dock', async () => {
    const renderer = await renderApp();

    await openExpedition(renderer);
    await ReactTestRenderer.act(async () => {
      findPreviewAction(renderer.root, 'https://example.com/alpha').props.onPress();
      await Promise.resolve();
    });
    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ accessibilityLabel: 'Spoušť: přidat zaměřený kód' })
        .props.onPress();
      await Promise.resolve();
    });
    await ReactTestRenderer.act(async () => {
      findPreviewAction(renderer.root, 'SKU-HEB-2026-001').props.onPress();
      await Promise.resolve();
    });
    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ accessibilityLabel: 'Spoušť: přidat zaměřený kód' })
        .props.onPress();
      await Promise.resolve();
    });

    expect(collectText(renderer.root).join('\n')).toContain('2');

    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ accessibilityLabel: 'Zpět poslední sken' }).props.onPress();
      await Promise.resolve();
    });

    const texts = collectText(renderer.root).join('\n');
    expect(texts).toContain('Poslední sken vrácen');
    expect(texts).toContain('1');

    await ReactTestRenderer.act(() => {
      renderer.unmount();
    });
  });
});
