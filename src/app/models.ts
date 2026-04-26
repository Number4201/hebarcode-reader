export type Screen = 'home' | 'expedition' | 'archive' | 'settings' | 'diagnostics';

export type ExpeditionItem = {
  id: string;
  format: string;
  text: string;
  contentType: string;
  quantity: number;
  lastScannedAtMs: number;
};

export type ExpeditionRecord = {
  id: string;
  createdAtMs: number;
  updatedAtMs: number;
  items: ExpeditionItem[];
};

export type ExpeditionSummary = {
  distinctItems: number;
  totalUnits: number;
  isEmpty: boolean;
};

export type ArchiveSummary = {
  totalRecords: number;
  totalUnits: number;
};

export type SettingsState = {
  xmlRootTag: string;
  xmlPrettyPrint: boolean;
  xmlIncludeTimestamp: boolean;
  xmlIncludeQuantityTotals: boolean;
  autoReturnToMenuAfterSave: boolean;
  scannerAssistMode: boolean;
  xmlLayoutConfigText: string;
};

export type StorageStatus = 'idle' | 'ready' | 'unavailable' | 'saving' | 'error';

export const DEFAULT_SETTINGS: SettingsState = {
  xmlRootTag: 'Expedice',
  xmlPrettyPrint: true,
  xmlIncludeTimestamp: true,
  xmlIncludeQuantityTotals: true,
  autoReturnToMenuAfterSave: false,
  scannerAssistMode: true,
  xmlLayoutConfigText: `{
  "rootTag": "I6Data",
  "expeditionTag": "Shipment",
  "expeditionFields": [
    {"name": "id", "source": "expeditionId", "mode": "attribute"},
    {"name": "createdAt", "source": "createdAt", "mode": "attribute"},
    {"name": "updatedAt", "source": "updatedAt", "mode": "attribute"}
  ],
  "itemsTag": "Rows",
  "itemTag": "Row",
  "itemFields": [
    {"name": "Code", "source": "text"},
    {"name": "Format", "source": "format"},
    {"name": "Quantity", "source": "quantity"},
    {"name": "ContentType", "source": "contentType"}
  ],
  "summaryTag": "Summary",
  "summaryFields": [
    {"name": "totalUnits", "source": "totalUnits", "mode": "attribute"},
    {"name": "distinctItems", "source": "distinctItems", "mode": "attribute"}
  ]
}`,
};
