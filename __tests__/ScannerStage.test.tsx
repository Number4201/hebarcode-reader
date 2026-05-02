import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Image, Platform, Text } from 'react-native';
import { ScannerStage } from '../src/components/ScannerStage';
import { MOCK_BARCODES } from '../src/scanner/mockData';

jest.mock('../src/native/HebarcodeScannerView', () => ({
  HebarcodeScannerView: 'HebarcodeScannerView',
}));

jest.mock('react-native-svg', () => ({
  __esModule: true,
  default: 'Svg',
  Line: 'Line',
  Polygon: 'Polygon',
}));

function collectText(root: ReactTestRenderer.ReactTestInstance): string[] {
  return root
    .findAllByType(Text)
    .flatMap(node => node.props.children)
    .filter((child): child is string => typeof child === 'string');
}

function shiftBarcode(
  barcode: typeof MOCK_BARCODES[number],
  id: string,
  deltaX: number,
): typeof MOCK_BARCODES[number] {
  return {
    ...barcode,
    id,
    points: barcode.points.map(point => ({ ...point, x: point.x + deltaX })),
  };
}

function getPreviewCardPosition(
  root: ReactTestRenderer.ReactTestInstance,
  labelPart: string,
): { left: number; top: number } {
  const node = root.findAll(item => {
    const label = item.props.accessibilityLabel;
    return (
      item.props.accessibilityRole === 'button' &&
      typeof label === 'string' &&
      label.includes(labelPart)
    );
  })[0];
  const flattenedStyle = Object.assign(
    {},
    ...(Array.isArray(node?.props.style)
      ? node.props.style
      : [node?.props.style]),
  );

  return {
    left: flattenedStyle.left,
    top: flattenedStyle.top,
  };
}

function makeCandidateBarcode() {
  return {
    id: 'UNKNOWN|candidate|1',
    format: 'UNKNOWN',
    text: null,
    contentType: 'POTENTIAL',
    confidence: 0.18,
    trackingState: 'candidate' as const,
    points: [
      { x: 40, y: 60 },
      { x: 140, y: 60 },
      { x: 140, y: 140 },
      { x: 40, y: 140 },
    ],
    frameSize: { width: 360, height: 320 },
  };
}

describe('ScannerStage', () => {
  it('renders barcode labels for detections', async () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <ScannerStage
          detections={MOCK_BARCODES}
          frame={null}
          onSelect={jest.fn()}
          selectedId={undefined}
          showCameraStateLabel
          source="mock"
        />,
      );
    });

    const texts = collectText(renderer.root);

    expect(texts).toContain('SAMPLE');
    expect(texts).toContain('QR_CODE');
    expect(texts).toContain('CODE_128');
  });

  it('keeps camera state labels hidden by default for the clean scanner view', async () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <ScannerStage
          cameraLive
          detections={[]}
          frame={null}
          onSelect={jest.fn()}
          source="camera"
        />,
      );
    });

    const texts = collectText(renderer.root);

    expect(texts).not.toContain('LIVE');
    expect(texts).not.toContain('WAIT');

    await ReactTestRenderer.act(() => {
      renderer.unmount();
    });
  });

  it('does not cover native preview with a stale analyzer frame', async () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1710000006000);
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <ScannerStage
          cameraLive={false}
          detections={[]}
          frame={{
            frameId: 'camera-old',
            timestampMs: 1710000000000,
            source: 'camera',
            rotationDegrees: 0,
            frameSize: { width: 320, height: 240 },
            detections: [],
            previewImageBase64: 'abc123',
            previewImageMimeType: 'image/jpeg',
          }}
          onSelect={jest.fn()}
          showCameraStateLabel
          showWaitingState
          source="camera"
        />,
      );
    });

    const texts = collectText(renderer.root);

    expect(texts).toContain('WAIT');
    expect(renderer.root.findAllByType(Image)).toHaveLength(0);

    await ReactTestRenderer.act(() => {
      renderer.unmount();
    });
    nowSpy.mockRestore();
  });

  it('keeps preview cards briefly usable after a detector dropout', async () => {
    const barcode = MOCK_BARCODES[0]!;
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <ScannerStage
          detections={[barcode]}
          frame={{
            frameId: 'mock-1000',
            timestampMs: 1000,
            source: 'mock',
            rotationDegrees: 0,
            frameSize: { width: 360, height: 320 },
            detections: [barcode],
          }}
          onSelect={jest.fn()}
          source="mock"
        />,
      );
    });

    expect(collectText(renderer.root)).toContain('QR_CODE');

    await ReactTestRenderer.act(() => {
      renderer.update(
        <ScannerStage
          detections={[]}
          frame={{
            frameId: 'mock-2200',
            timestampMs: 2200,
            source: 'mock',
            rotationDegrees: 0,
            frameSize: { width: 360, height: 320 },
            detections: [],
          }}
          onSelect={jest.fn()}
          source="mock"
        />,
      );
    });

    expect(collectText(renderer.root)).toContain('QR_CODE');

    await ReactTestRenderer.act(() => {
      renderer.update(
        <ScannerStage
          detections={[]}
          frame={{
            frameId: 'mock-2600',
            timestampMs: 2600,
            source: 'mock',
            rotationDegrees: 0,
            frameSize: { width: 360, height: 320 },
            detections: [],
          }}
          onSelect={jest.fn()}
          source="mock"
        />,
      );
    });

    expect(collectText(renderer.root)).not.toContain('QR_CODE');

    await ReactTestRenderer.act(() => {
      renderer.unmount();
    });
  });

  it('merges a retained card when the same physical code is reacquired with a new id', async () => {
    const barcode = MOCK_BARCODES[0]!;
    const reacquiredBarcode = shiftBarcode(barcode, 'QR_CODE|alpha-new|9', 8);
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <ScannerStage
          detections={[barcode]}
          frame={{
            frameId: 'mock-1000',
            timestampMs: 1000,
            source: 'mock',
            rotationDegrees: 0,
            frameSize: { width: 360, height: 320 },
            detections: [barcode],
          }}
          onSelect={jest.fn()}
          source="mock"
        />,
      );
    });

    await ReactTestRenderer.act(() => {
      renderer.update(
        <ScannerStage
          detections={[]}
          frame={{
            frameId: 'mock-1500',
            timestampMs: 1500,
            source: 'mock',
            rotationDegrees: 0,
            frameSize: { width: 360, height: 320 },
            detections: [],
          }}
          onSelect={jest.fn()}
          source="mock"
        />,
      );
    });

    await ReactTestRenderer.act(() => {
      renderer.update(
        <ScannerStage
          detections={[reacquiredBarcode]}
          frame={{
            frameId: 'mock-1700',
            timestampMs: 1700,
            source: 'mock',
            rotationDegrees: 0,
            frameSize: { width: 360, height: 320 },
            detections: [reacquiredBarcode],
          }}
          onSelect={jest.fn()}
          source="mock"
        />,
      );
    });

    expect(collectText(renderer.root).filter(text => text === 'QR_CODE')).toHaveLength(1);

    await ReactTestRenderer.act(() => {
      renderer.unmount();
    });
  });

  it('keeps two cards for matching payloads when they are spatially separate labels', async () => {
    const barcode = MOCK_BARCODES[0]!;
    const separateBarcode = shiftBarcode(barcode, 'QR_CODE|alpha-far|9', 220);
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <ScannerStage
          detections={[barcode]}
          frame={{
            frameId: 'mock-1000',
            timestampMs: 1000,
            source: 'mock',
            rotationDegrees: 0,
            frameSize: { width: 360, height: 320 },
            detections: [barcode],
          }}
          onSelect={jest.fn()}
          source="mock"
        />,
      );
    });

    await ReactTestRenderer.act(() => {
      renderer.update(
        <ScannerStage
          detections={[separateBarcode]}
          frame={{
            frameId: 'mock-1400',
            timestampMs: 1400,
            source: 'mock',
            rotationDegrees: 0,
            frameSize: { width: 360, height: 320 },
            detections: [separateBarcode],
          }}
          onSelect={jest.fn()}
          source="mock"
        />,
      );
    });

    expect(collectText(renderer.root).filter(text => text === 'QR_CODE')).toHaveLength(2);

    await ReactTestRenderer.act(() => {
      renderer.unmount();
    });
  });

  it('keeps the preview card slot across engine id and format alias changes', async () => {
    const barcode = {
      ...MOCK_BARCODES[0]!,
      id: 'PDF417|target|zxing-0',
      format: 'PDF417',
      text: 'target',
    };
    const reacquiredBarcode = {
      ...barcode,
      id: 'PDF_417|target|mlkit-0',
      format: 'PDF_417',
      points: barcode.points.map(point => ({
        x: point.x + 4,
        y: point.y + 4,
      })),
    };
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <ScannerStage
          detections={[barcode]}
          frame={{
            frameId: 'mock-1000',
            timestampMs: 1000,
            source: 'mock',
            rotationDegrees: 0,
            frameSize: { width: 360, height: 320 },
            detections: [barcode],
          }}
          onSelect={jest.fn()}
          source="mock"
        />,
      );
    });

    const firstPosition = getPreviewCardPosition(renderer.root, 'target');

    await ReactTestRenderer.act(() => {
      renderer.update(
        <ScannerStage
          detections={[reacquiredBarcode]}
          frame={{
            frameId: 'mock-1200',
            timestampMs: 1200,
            source: 'mock',
            rotationDegrees: 0,
            frameSize: { width: 360, height: 320 },
            detections: [reacquiredBarcode],
          }}
          onSelect={jest.fn()}
          source="mock"
        />,
      );
    });

    expect(getPreviewCardPosition(renderer.root, 'target')).toEqual(firstPosition);

    await ReactTestRenderer.act(() => {
      renderer.unmount();
    });
  });

  it('draws unreadable candidate boxes without exposing them as selectable preview cards', async () => {
    const onSelect = jest.fn();
    const candidate = makeCandidateBarcode();
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <ScannerStage
          detections={[candidate]}
          frame={{
            frameId: 'mock-candidate',
            timestampMs: 1000,
            source: 'mock',
            rotationDegrees: 0,
            frameSize: { width: 360, height: 320 },
            detections: [candidate],
          }}
          onSelect={onSelect}
          source="mock"
        />,
      );
    });

    expect(collectText(renderer.root)).not.toContain('<binary payload>');

    const stagePressable = renderer.root.findByProps({
      accessibilityLabel: 'Skenovací plocha',
    });
    await ReactTestRenderer.act(() => {
      stagePressable.props.onPress({
        nativeEvent: { locationX: 90, locationY: 100 },
      });
    });

    expect(onSelect).not.toHaveBeenCalled();

    await ReactTestRenderer.act(() => {
      renderer.unmount();
    });
  });

  it('does not cover Android native preview with bridge preview frames', async () => {
    const originalPlatform = Platform.OS;
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: 'android',
    });
    jest.spyOn(Date, 'now').mockReturnValue(1710000000100);
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <ScannerStage
          cameraLive
          detections={[]}
          frame={{
            frameId: 'camera-preview',
            timestampMs: 1710000000000,
            source: 'camera',
            rotationDegrees: 90,
            frameSize: { width: 1280, height: 720 },
            detections: [],
            previewImageBase64: 'fresh-preview',
            previewImageMimeType: 'image/jpeg',
            previewImageTimestampMs: 1710000000000,
          }}
          onSelect={jest.fn()}
          source="camera"
        />,
      );
    });

    expect(renderer.root.findAllByType(Image)).toHaveLength(0);

    await ReactTestRenderer.act(() => {
      renderer.unmount();
    });
    jest.restoreAllMocks();
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: originalPlatform,
    });
  });
});
