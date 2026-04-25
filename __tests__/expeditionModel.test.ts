import {
  buildXmlPreview,
  createExpeditionRecord,
  describeXmlLayoutConfig,
  recordExpeditionScan,
  summarizeExpedition,
} from '../src/app/expeditions';
import {DEFAULT_SETTINGS} from '../src/app/models';
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
    expect(summarizeExpedition(twice).totalUnits).toBe(2);
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
