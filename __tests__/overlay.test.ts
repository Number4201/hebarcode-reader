import {
  hitTestStageDetections,
  layoutPreviewCards,
  mapDetectionsToStage,
} from '../src/scanner/overlay';
import {MOCK_BARCODES} from '../src/scanner/mockData';

describe('scanner overlay helpers', () => {
  const stageSize = {width: 360, height: 320};
  const frameSize = {width: 360, height: 320};

  it('maps barcodes into stage polygons and bounds', () => {
    const mapped = mapDetectionsToStage(MOCK_BARCODES, frameSize, stageSize);

    expect(mapped).toHaveLength(3);
    expect(mapped[0]?.bounds.left).toBeGreaterThan(0);
    expect(mapped[0]?.previewText).toContain('example');
  });

  it('selects the barcode touched inside its polygon', () => {
    const mapped = mapDetectionsToStage(MOCK_BARCODES, frameSize, stageSize);
    const barcode = hitTestStageDetections(mapped, {x: 90, y: 120});

    expect(barcode?.id).toBe(MOCK_BARCODES[0]?.id);
  });

  it('selects inside slanted polygons regardless of edge direction', () => {
    const mapped = mapDetectionsToStage(
      [
        {
          id: 'skewed',
          format: 'QR_CODE',
          text: 'skewed',
          contentType: 'TEXT',
          points: [
            {x: 40, y: 60},
            {x: 170, y: 90},
            {x: 130, y: 210},
            {x: 20, y: 170},
          ],
        },
      ],
      frameSize,
      stageSize,
    );

    const barcode = hitTestStageDetections(mapped, {x: 92, y: 132});

    expect(barcode?.id).toBe('skewed');
  });

  it('lays out preview cards without overlap for the mock frame', () => {
    const mapped = mapDetectionsToStage(MOCK_BARCODES, frameSize, stageSize);
    const cards = layoutPreviewCards(mapped, stageSize);

    expect(cards).toHaveLength(3);

    for (let index = 0; index < cards.length; index += 1) {
      for (let nextIndex = index + 1; nextIndex < cards.length; nextIndex += 1) {
        const left = cards[index];
        const right = cards[nextIndex];

        const overlapWidth = Math.max(
          0,
          Math.min(left!.rect.right, right!.rect.right) -
            Math.max(left!.rect.left, right!.rect.left),
        );
        const overlapHeight = Math.max(
          0,
          Math.min(left!.rect.bottom, right!.rect.bottom) -
            Math.max(left!.rect.top, right!.rect.top),
        );

        expect(overlapWidth * overlapHeight).toBe(0);
      }
    }
  });
});
