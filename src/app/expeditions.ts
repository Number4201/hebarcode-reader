import type {DetectedBarcode} from '../scanner/types';
import type {ArchiveSummary, ExpeditionItem, ExpeditionRecord, ExpeditionSummary, SettingsState} from './models';

type XmlFieldSource =
  | 'expeditionId'
  | 'createdAt'
  | 'updatedAt'
  | 'text'
  | 'format'
  | 'contentType'
  | 'quantity'
  | 'lastScannedAt'
  | 'totalUnits'
  | 'distinctItems';

type XmlFieldMode = 'element' | 'attribute';

type XmlFieldConfig = {
  name: string;
  source: XmlFieldSource;
  mode: XmlFieldMode;
};

type XmlLayoutConfig = {
  rootTag: string;
  expeditionTag: string;
  expeditionFields: XmlFieldConfig[];
  itemsTag: string;
  itemTag: string;
  itemFields: XmlFieldConfig[];
  summaryTag: string | null;
  summaryFields: XmlFieldConfig[];
};

type XmlNode = {
  name: string;
  attributes?: Record<string, string>;
  text?: string;
  children?: XmlNode[];
};

export function createExpeditionRecord(): ExpeditionRecord {
  const timestamp = Date.now();

  return {
    id: `expedition-${timestamp}`,
    createdAtMs: timestamp,
    updatedAtMs: timestamp,
    items: [],
  };
}

export function recordExpeditionScan(
  expedition: ExpeditionRecord,
  barcode: DetectedBarcode,
): ExpeditionRecord {
  const timestamp = Date.now();
  const payload = resolveBarcodePayload(barcode);
  const scanId = `${barcode.format}|${payload}`;
  const existing = expedition.items.find(item => item.id === scanId);

  const nextItem: ExpeditionItem = existing
    ? {
        ...existing,
        quantity: existing.quantity + 1,
        lastScannedAtMs: timestamp,
      }
    : {
        id: scanId,
        format: barcode.format,
        text: payload,
        contentType: barcode.contentType,
        quantity: 1,
        lastScannedAtMs: timestamp,
      };

  return {
    ...expedition,
    updatedAtMs: timestamp,
    items: [nextItem, ...expedition.items.filter(item => item.id !== scanId)],
  };
}

export function summarizeExpedition(expedition: ExpeditionRecord | null): ExpeditionSummary {
  if (!expedition || expedition.items.length === 0) {
    return {
      distinctItems: 0,
      totalUnits: 0,
      isEmpty: true,
    };
  }

  return {
    distinctItems: expedition.items.length,
    totalUnits: expedition.items.reduce((sum, item) => sum + item.quantity, 0),
    isEmpty: false,
  };
}

export function summarizeArchive(archive: ExpeditionRecord[]): ArchiveSummary {
  return {
    totalRecords: archive.length,
    totalUnits: archive.reduce(
      (sum, record) => sum + record.items.reduce((inner, item) => inner + item.quantity, 0),
      0,
    ),
  };
}

export function buildExpeditionTitle(expedition: ExpeditionRecord | null): string {
  if (!expedition) {
    return 'Expedice připravena';
  }

  return `EXP-${new Date(expedition.createdAtMs).toISOString().slice(0, 10)}-${expedition.id.slice(-4)}`;
}

export function formatDateTime(timestampMs: number): string {
  return new Date(timestampMs).toLocaleString('cs-CZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function buildXmlPreview(
  settings: SettingsState,
  expedition: ExpeditionRecord | null,
): string {
  const previewExpedition = expedition ?? createPreviewExpedition();
  const layout = resolveXmlLayoutConfig(settings);
  const rootNode = buildXmlTree(previewExpedition, settings, layout.config);
  return renderXmlNode(rootNode, settings.xmlPrettyPrint);
}

export function buildXmlFileName(expedition: ExpeditionRecord | null): string {
  const baseName = buildExpeditionTitle(expedition).replace(/[^A-Za-z0-9_-]+/g, '_');
  return `${baseName || 'expedice'}.xml`;
}

export function describeXmlLayoutConfig(settings: SettingsState): {
  isValid: boolean;
  message: string;
} {
  const result = resolveXmlLayoutConfig(settings);
  return {
    isValid: result.isValid,
    message: result.message,
  };
}

function resolveBarcodePayload(barcode: DetectedBarcode): string {
  return barcode.text?.trim() || barcode.rawBytesBase64 || '<binary payload>';
}

function normalizeXmlTag(value: string): string {
  const sanitized = value.trim().replace(/[^A-Za-z0-9_-]+/g, '');

  if (!sanitized) {
    return 'Expedice';
  }

  return /^[A-Za-z_]/.test(sanitized) ? sanitized : `Tag_${sanitized}`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function createPreviewExpedition(): ExpeditionRecord {
  return {
    id: 'preview-expedition',
    createdAtMs: Date.parse('2026-04-23T08:00:00.000Z'),
    updatedAtMs: Date.parse('2026-04-23T08:10:00.000Z'),
    items: [
      {
        id: 'CODE_128|SKU-HEB-2026-001',
        format: 'CODE_128',
        text: 'SKU-HEB-2026-001',
        contentType: 'TEXT',
        quantity: 12,
        lastScannedAtMs: Date.parse('2026-04-23T08:09:00.000Z'),
      },
    ],
  };
}

function resolveXmlLayoutConfig(settings: SettingsState): {
  config: XmlLayoutConfig;
  isValid: boolean;
  message: string;
} {
  const fallback = createDefaultXmlLayoutConfig(settings);
  const raw = settings.xmlLayoutConfigText?.trim();

  if (!raw) {
    return {
      config: fallback,
      isValid: true,
      message: 'Používá se výchozí I6 profil.',
    };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<XmlLayoutConfig>;
    const config = normalizeXmlLayoutConfig(parsed, fallback);
    return {
      config,
      isValid: true,
      message: `Konfigurační soubor je validní. Root: <${config.rootTag}>.`,
    };
  } catch (error) {
    return {
      config: fallback,
      isValid: false,
      message:
        error instanceof Error
          ? `Konfigurační soubor je neplatný JSON. Používá se fallback. ${error.message}`
          : 'Konfigurační soubor je neplatný JSON. Používá se fallback.',
    };
  }
}

function createDefaultXmlLayoutConfig(settings: SettingsState): XmlLayoutConfig {
  return {
    rootTag: normalizeXmlTag(settings.xmlRootTag || 'I6Data'),
    expeditionTag: 'Shipment',
    expeditionFields: [
      {name: 'id', source: 'expeditionId', mode: 'attribute'},
      ...(settings.xmlIncludeTimestamp
        ? [
            {name: 'createdAt', source: 'createdAt', mode: 'attribute' as XmlFieldMode},
            {name: 'updatedAt', source: 'updatedAt', mode: 'attribute' as XmlFieldMode},
          ]
        : []),
    ],
    itemsTag: 'Rows',
    itemTag: 'Row',
    itemFields: [
      {name: 'Code', source: 'text', mode: 'element'},
      {name: 'Format', source: 'format', mode: 'element'},
      {name: 'Quantity', source: 'quantity', mode: 'element'},
      {name: 'ContentType', source: 'contentType', mode: 'element'},
    ],
    summaryTag: settings.xmlIncludeQuantityTotals ? 'Summary' : null,
    summaryFields: settings.xmlIncludeQuantityTotals
      ? [
          {name: 'totalUnits', source: 'totalUnits', mode: 'attribute'},
          {name: 'distinctItems', source: 'distinctItems', mode: 'attribute'},
        ]
      : [],
  };
}

function normalizeXmlLayoutConfig(
  parsed: Partial<XmlLayoutConfig>,
  fallback: XmlLayoutConfig,
): XmlLayoutConfig {
  return {
    rootTag: normalizeXmlTag(parsed.rootTag || fallback.rootTag),
    expeditionTag: normalizeXmlTag(parsed.expeditionTag || fallback.expeditionTag),
    expeditionFields: normalizeFieldConfigs(parsed.expeditionFields, fallback.expeditionFields),
    itemsTag: normalizeXmlTag(parsed.itemsTag || fallback.itemsTag),
    itemTag: normalizeXmlTag(parsed.itemTag || fallback.itemTag),
    itemFields: normalizeFieldConfigs(parsed.itemFields, fallback.itemFields),
    summaryTag:
      parsed.summaryTag === null
        ? null
        : normalizeXmlTag(parsed.summaryTag || fallback.summaryTag || 'Summary'),
    summaryFields: normalizeFieldConfigs(parsed.summaryFields, fallback.summaryFields),
  };
}

function normalizeFieldConfigs(
  parsedFields: unknown,
  fallbackFields: XmlFieldConfig[],
): XmlFieldConfig[] {
  if (!Array.isArray(parsedFields) || parsedFields.length === 0) {
    return fallbackFields;
  }

  const normalized = parsedFields.flatMap(field => {
    if (!field || typeof field !== 'object') {
      return [];
    }

    const candidate = field as Partial<XmlFieldConfig>;
    const mode = candidate.mode === 'attribute' ? 'attribute' : 'element';

    if (typeof candidate.name !== 'string' || typeof candidate.source !== 'string') {
      return [];
    }

    return [
      {
        name: normalizeXmlTag(candidate.name),
        source: candidate.source as XmlFieldSource,
        mode,
      },
    ];
  });

  return normalized.length > 0 ? normalized : fallbackFields;
}

function buildXmlTree(
  expedition: ExpeditionRecord,
  settings: SettingsState,
  config: XmlLayoutConfig,
): XmlNode {
  const summary = summarizeExpedition(expedition);
  const expeditionNode: XmlNode = {
    name: config.expeditionTag,
    attributes: mapFieldsToAttributes(config.expeditionFields, expedition, null, summary),
    children: [
      ...mapFieldsToElements(config.expeditionFields, expedition, null, summary),
      {
        name: config.itemsTag,
        children: expedition.items.map(item => ({
          name: config.itemTag,
          attributes: mapFieldsToAttributes(config.itemFields, expedition, item, summary),
          children: mapFieldsToElements(config.itemFields, expedition, item, summary),
        })),
      },
      ...(config.summaryTag
        ? [
            {
              name: config.summaryTag,
              attributes: mapFieldsToAttributes(config.summaryFields, expedition, null, summary),
              children: mapFieldsToElements(config.summaryFields, expedition, null, summary),
            } as XmlNode,
          ]
        : []),
    ],
  };

  return {
    name: config.rootTag,
    children: [expeditionNode],
  };
}

function mapFieldsToAttributes(
  fields: XmlFieldConfig[],
  expedition: ExpeditionRecord,
  item: ExpeditionItem | null,
  summary: ExpeditionSummary,
): Record<string, string> | undefined {
  const attributes = fields
    .filter(field => field.mode === 'attribute')
    .reduce<Record<string, string>>((result, field) => {
      result[field.name] = escapeXml(resolveFieldValue(field.source, expedition, item, summary));
      return result;
    }, {});

  return Object.keys(attributes).length > 0 ? attributes : undefined;
}

function mapFieldsToElements(
  fields: XmlFieldConfig[],
  expedition: ExpeditionRecord,
  item: ExpeditionItem | null,
  summary: ExpeditionSummary,
): XmlNode[] {
  return fields
    .filter(field => field.mode === 'element')
    .map(field => ({
      name: field.name,
      text: escapeXml(resolveFieldValue(field.source, expedition, item, summary)),
    }));
}

function resolveFieldValue(
  source: XmlFieldSource,
  expedition: ExpeditionRecord,
  item: ExpeditionItem | null,
  summary: ExpeditionSummary,
): string {
  switch (source) {
    case 'expeditionId':
      return expedition.id;
    case 'createdAt':
      return new Date(expedition.createdAtMs).toISOString();
    case 'updatedAt':
      return new Date(expedition.updatedAtMs).toISOString();
    case 'text':
      return item?.text ?? '';
    case 'format':
      return item?.format ?? '';
    case 'contentType':
      return item?.contentType ?? '';
    case 'quantity':
      return String(item?.quantity ?? 0);
    case 'lastScannedAt':
      return item ? new Date(item.lastScannedAtMs).toISOString() : '';
    case 'totalUnits':
      return String(summary.totalUnits);
    case 'distinctItems':
      return String(summary.distinctItems);
    default:
      return '';
  }
}

function renderXmlNode(node: XmlNode, prettyPrint: boolean, level = 0): string {
  const indent = prettyPrint ? '  '.repeat(level) : '';
  const childIndent = prettyPrint ? '  '.repeat(level + 1) : '';
  const attributes = node.attributes
    ? Object.entries(node.attributes)
        .map(([key, value]) => ` ${key}="${value}"`)
        .join('')
    : '';

  if (node.text !== undefined) {
    return `${indent}<${node.name}${attributes}>${node.text}</${node.name}>`;
  }

  const children = node.children ?? [];

  if (children.length === 0) {
    return `${indent}<${node.name}${attributes} />`;
  }

  const renderedChildren = children
    .map(child => renderXmlNode(child, prettyPrint, level + 1))
    .join(prettyPrint ? '\n' : '');

  if (!prettyPrint) {
    return `<${node.name}${attributes}>${renderedChildren}</${node.name}>`;
  }

  return `${indent}<${node.name}${attributes}>\n${renderedChildren}\n${indent}</${node.name}>`;
}
