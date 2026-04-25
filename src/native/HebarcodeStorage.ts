import {NativeModules, Platform} from 'react-native';
import type {ExpeditionRecord, SettingsState} from '../app/models';

type NativeStorageSnapshot = {
  archiveJson?: string | null;
  activeExpeditionJson?: string | null;
  settingsJson?: string | null;
};

type NativeExportResult = {
  fileName?: string;
  path?: string;
  uri?: string;
};

type NativeImportResult = {
  fileName?: string;
  uri?: string;
  content?: string;
};

type NativeStorageModuleShape = {
  loadAppState?: () => Promise<NativeStorageSnapshot>;
  saveAppState?: (
    archiveJson: string,
    activeExpeditionJson: string | null,
    settingsJson: string,
  ) => Promise<void>;
  exportXml?: (fileName: string, xmlContent: string) => Promise<NativeExportResult>;
  importXmlLayoutConfig?: () => Promise<NativeImportResult>;
};

type PersistedAppState = {
  archive: ExpeditionRecord[];
  activeExpedition: ExpeditionRecord | null;
  settings: SettingsState;
  available: boolean;
};

type ExportXmlResult = {
  ok: boolean;
  available: boolean;
  fileName?: string;
  path?: string;
  uri?: string;
};

type ImportXmlLayoutResult = {
  ok: boolean;
  available: boolean;
  fileName?: string;
  uri?: string;
  content?: string;
};

const NativeStorageModule = NativeModules.HebarcodeStorage as NativeStorageModuleShape | undefined;

export async function loadPersistedAppState(
  fallbackSettings: SettingsState,
): Promise<PersistedAppState> {
  if (Platform.OS !== 'android' || !NativeStorageModule?.loadAppState) {
    return {
      archive: [],
      activeExpedition: null,
      settings: fallbackSettings,
      available: false,
    };
  }

  try {
    const snapshot = await NativeStorageModule.loadAppState();

    return {
      archive: parseArchive(snapshot.archiveJson),
      activeExpedition: parseActiveExpedition(snapshot.activeExpeditionJson),
      settings: parseSettings(snapshot.settingsJson, fallbackSettings),
      available: true,
    };
  } catch {
    return {
      archive: [],
      activeExpedition: null,
      settings: fallbackSettings,
      available: false,
    };
  }
}

export async function savePersistedAppState(params: {
  archive: ExpeditionRecord[];
  activeExpedition: ExpeditionRecord | null;
  settings: SettingsState;
}): Promise<boolean> {
  if (Platform.OS !== 'android' || !NativeStorageModule?.saveAppState) {
    return false;
  }

  try {
    await NativeStorageModule.saveAppState(
      JSON.stringify(params.archive),
      params.activeExpedition ? JSON.stringify(params.activeExpedition) : null,
      JSON.stringify(params.settings),
    );
    return true;
  } catch {
    return false;
  }
}

export async function exportXmlDocument(
  fileName: string,
  xmlContent: string,
): Promise<ExportXmlResult> {
  if (Platform.OS !== 'android' || !NativeStorageModule?.exportXml) {
    return {
      ok: false,
      available: false,
    };
  }

  try {
    const result = await NativeStorageModule.exportXml(fileName, xmlContent);
    return {
      ok: true,
      available: true,
      fileName: result.fileName,
      path: result.path,
      uri: result.uri,
    };
  } catch {
    return {
      ok: false,
      available: true,
    };
  }
}

export async function importXmlLayoutConfigFile(): Promise<ImportXmlLayoutResult> {
  if (Platform.OS !== 'android' || !NativeStorageModule?.importXmlLayoutConfig) {
    return {
      ok: false,
      available: false,
    };
  }

  try {
    const result = await NativeStorageModule.importXmlLayoutConfig();
    return {
      ok: Boolean(result.content),
      available: true,
      fileName: result.fileName,
      uri: result.uri,
      content: result.content,
    };
  } catch {
    return {
      ok: false,
      available: true,
    };
  }
}

function parseArchive(raw: string | null | undefined): ExpeditionRecord[] {
  const parsed = parseJson(raw);
  return Array.isArray(parsed) ? (parsed.filter(isExpeditionRecord) as ExpeditionRecord[]) : [];
}

function parseActiveExpedition(raw: string | null | undefined): ExpeditionRecord | null {
  const parsed = parseJson(raw);
  return isExpeditionRecord(parsed) ? parsed : null;
}

function parseSettings(
  raw: string | null | undefined,
  fallbackSettings: SettingsState,
): SettingsState {
  const parsed = parseJson(raw);

  if (!parsed || typeof parsed !== 'object') {
    return fallbackSettings;
  }

  const candidate = parsed as Partial<Record<keyof SettingsState, unknown>>;

  return {
    xmlRootTag:
      typeof candidate.xmlRootTag === 'string' && candidate.xmlRootTag.trim().length > 0
        ? candidate.xmlRootTag
        : fallbackSettings.xmlRootTag,
    xmlPrettyPrint:
      typeof candidate.xmlPrettyPrint === 'boolean'
        ? candidate.xmlPrettyPrint
        : fallbackSettings.xmlPrettyPrint,
    xmlIncludeTimestamp:
      typeof candidate.xmlIncludeTimestamp === 'boolean'
        ? candidate.xmlIncludeTimestamp
        : fallbackSettings.xmlIncludeTimestamp,
    xmlIncludeQuantityTotals:
      typeof candidate.xmlIncludeQuantityTotals === 'boolean'
        ? candidate.xmlIncludeQuantityTotals
        : fallbackSettings.xmlIncludeQuantityTotals,
    autoReturnToMenuAfterSave:
      typeof candidate.autoReturnToMenuAfterSave === 'boolean'
        ? candidate.autoReturnToMenuAfterSave
        : fallbackSettings.autoReturnToMenuAfterSave,
    scannerAssistMode:
      typeof candidate.scannerAssistMode === 'boolean'
        ? candidate.scannerAssistMode
        : fallbackSettings.scannerAssistMode,
    xmlLayoutConfigText:
      typeof candidate.xmlLayoutConfigText === 'string' &&
      candidate.xmlLayoutConfigText.trim().length > 0
        ? candidate.xmlLayoutConfigText
        : fallbackSettings.xmlLayoutConfigText,
  };
}

function parseJson(raw: string | null | undefined): unknown {
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isExpeditionRecord(value: unknown): value is ExpeditionRecord {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as ExpeditionRecord;

  return (
    typeof candidate.id === 'string' &&
    typeof candidate.createdAtMs === 'number' &&
    typeof candidate.updatedAtMs === 'number' &&
    Array.isArray(candidate.items)
  );
}
