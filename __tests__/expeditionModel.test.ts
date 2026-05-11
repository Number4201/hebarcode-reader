import {
  buildXmlPreview,
  createExpeditionRecord,
  describeXmlLayoutConfig,
  recordExpeditionScan,
  summarizeExpedition,
  undoLastExpeditionScan,
} from '../src/app/expeditions';
import {
  DEFAULT_SETTINGS,
  XML_LAYOUT_CONFIG_SCHEMA_VERSION,
} from '../src/app/models';
import type {DetectedBarcode} from '../src/scanner/types';

function makeBarcode(text: string, format = 'CODE_128'): DetectedBarcode {
  return {
    id: `${format}|${text}|0`,
    format,
    text,
    contentType: 'TEXT',
    points: [
      {x: 0, y: 0},
      {x: 10, y: 0},
      {x: 10, y: 10},
      {x: 0, y: 10},
    ],
  };
}

describe('expedition model utilities', () => {
  it('aggregates repeated scans into one expedition item', () => {
    const expedition = createExpeditionRecord();
    const once = recordExpeditionScan(expedition, makeBarcode('SKU-1'));
    const twice = recordExpeditionScan(once, makeBarcode('SKU-1'));

    expect(twice.items).toHaveLength(1);
    expect(twice.items[0]?.quantity).toBe(2);
    expect(twice.scanJournal).toHaveLength(2);
    expect(summarizeExpedition(twice).totalUnits).toBe(2);
  });

  it('creates scan journal entries and supports undo', () => {
    const base = createExpeditionRecord();
    const nowSpy = jest.spyOn(Date, 'now');
    nowSpy.mockReturnValueOnce(1000);
    const once = recordExpeditionScan(base, makeBarcode('SKU-UNDO'));
    nowSpy.mockReturnValueOnce(2000);
    const twice = recordExpeditionScan(once, makeBarcode('SKU-UNDO'));
    nowSpy.mockReturnValueOnce(3000);
    const undone = undoLastExpeditionScan(twice);

    expect(once.scanJournal?.[0]).toMatchObject({
      logicalKey: 'CODE_128|SKU-UNDO',
      format: 'CODE_128',
      text: 'SKU-UNDO',
      operation: 'add',
    });
    expect(undone.items[0]?.quantity).toBe(1);
    expect(undone.items[0]?.lastScannedAtMs).toBe(once.scanJournal?.[0]?.scannedAtMs);
    expect(undone.scanJournal).toHaveLength(1);
    nowSpy.mockRestore();
  });

  it('removes an item when undo reaches zero and leaves empty undo as a no-op', () => {
    const expedition = recordExpeditionScan(createExpeditionRecord(), makeBarcode('SKU-ZERO'));
    const empty = undoLastExpeditionScan(expedition);
    const stillEmpty = undoLastExpeditionScan(empty);

    expect(empty.items).toHaveLength(0);
    expect(empty.scanJournal).toHaveLength(0);
    expect(stillEmpty.items).toHaveLength(0);
  });

  it('safely records scans on old expeditions without scanJournal', () => {
    const legacy = createExpeditionRecord();
    delete legacy.scanJournal;

    const scanned = recordExpeditionScan(legacy, makeBarcode('SKU-LEGACY'));

    expect(scanned.items).toHaveLength(1);
    expect(scanned.scanJournal).toHaveLength(1);
  });

  it('aggregates equivalent scanner engine format aliases into one item', () => {
    const expedition = createExpeditionRecord();
    const once = recordExpeditionScan(expedition, makeBarcode('SKU-2', 'PDF417'));
    const twice = recordExpeditionScan(once, makeBarcode('SKU-2', 'PDF_417'));

    expect(twice.items).toHaveLength(1);
    expect(twice.items[0]?.format).toBe('PDF_417');
    expect(twice.items[0]?.quantity).toBe(2);
  });

  it('builds xml preview with escaped values', () => {
    const expedition = recordExpeditionScan(createExpeditionRecord(), makeBarcode('A&B < 42'));
    const xml = buildXmlPreview(DEFAULT_SETTINGS, expedition);

    expect(xml).toContain('&amp;');
    expect(xml).toContain('&lt;');
    expect(xml).toContain('<I6Data>');
  });

  it('applies custom layout config from inserted config file', () => {
    const expedition = recordExpeditionScan(createExpeditionRecord(), makeBarcode('SKU-77'));
    const xml = buildXmlPreview(
      {
        ...DEFAULT_SETTINGS,
        xmlLayoutConfigText: `{
  "rootTag": "Envelope",
  "expeditionTag": "Batch",
  "itemsTag": "Lines",
  "itemTag": "Line",
  "itemFields": [
    {"name": "code", "source": "text", "mode": "attribute"},
    {"name": "qty", "source": "quantity"}
  ],
  "summaryTag": null
}`,
      },
      expedition,
    );

    expect(xml).toContain('<Envelope>');
    expect(xml).toContain('<Batch');
    expect(xml).toContain('<Lines>');
    expect(xml).toContain('<Line code="SKU-77">');
    expect(xml).toContain('<qty>1</qty>');
  });

  it('falls back cleanly when config file content is invalid', () => {
    const result = describeXmlLayoutConfig({
      ...DEFAULT_SETTINGS,
      xmlLayoutConfigText: '{invalid-json',
    });

    expect(result.isValid).toBe(false);
    expect(result.message).toContain('fallback');
  });

  it('rejects unsupported future xml layout config schema versions', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      xmlLayoutConfigText: `{
  "schemaVersion": ${XML_LAYOUT_CONFIG_SCHEMA_VERSION + 1},
  "rootTag": "FutureEnvelope"
}`,
    };
    const result = describeXmlLayoutConfig(settings);
    const xml = buildXmlPreview(
      settings,
      recordExpeditionScan(createExpeditionRecord(), makeBarcode('SKU-99')),
    );

    expect(result.isValid).toBe(false);
    expect(result.message).toContain('nepodporované schema');
    expect(xml).not.toContain('<FutureEnvelope>');
    expect(xml).toContain('<Expedice>');
  });

  it('drops invalid custom field sources instead of rendering empty fields', () => {
    const expedition = recordExpeditionScan(createExpeditionRecord(), makeBarcode('SKU-88'));
    const xml = buildXmlPreview(
      {
        ...DEFAULT_SETTINGS,
        xmlLayoutConfigText: `{
  "itemFields": [
    {"name": "bad", "source": "sku"},
    {"name": "code", "source": "text"}
  ]
}`,
      },
      expedition,
    );

    expect(xml).not.toContain('<bad>');
    expect(xml).toContain('<code>SKU-88</code>');
  });
});
