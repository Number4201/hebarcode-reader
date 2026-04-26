import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Image, Text } from 'react-native';
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
          source="mock"
        />,
      );
    });

    const texts = renderer.root
      .findAllByType(Text)
      .flatMap(node => node.props.children)
      .filter((child): child is string => typeof child === 'string');

    expect(texts).toContain('SAMPLE');
    expect(texts).toContain('QR_CODE');
    expect(texts).toContain('CODE_128');
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
          source="camera"
        />,
      );
    });

    const texts = renderer.root
      .findAllByType(Text)
      .flatMap(node => node.props.children)
      .filter((child): child is string => typeof child === 'string');

    expect(texts).toContain('WAIT');
    expect(renderer.root.findAllByType(Image)).toHaveLength(0);

    await ReactTestRenderer.act(() => {
      renderer.unmount();
    });
    nowSpy.mockRestore();
  });
});
