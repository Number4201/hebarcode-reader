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

  return {
    xmlRootTag:
      typeof parsed.xmlRootTag === 'string' && parsed.xmlRootTag.trim().length > 0
        ? parsed.xmlRootTag
        : fallbackSettings.xmlRootTag,
    xmlPrettyPrint:
      typeof parsed.xmlPrettyPrint === 'boolean'
        ? parsed.xmlPrettyPrint
        : fallbackSettings.xmlPrettyPrint,
    xmlIncludeTimestamp:
      typeof parsed.xmlIncludeTimestamp === 'boolean'
        ? parsed.xmlIncludeTimestamp
        : fallbackSettings.xmlIncludeTimestamp,
    xmlIncludeQuantityTotals:
      typeof parsed.xmlIncludeQuantityTotals === 'boolean'
        ? parsed.xmlIncludeQuantityTotals
        : fallbackSettings.xmlIncludeQuantityTotals,
    autoReturnToMenuAfterSave:
      typeof parsed.autoReturnToMenuAfterSave === 'boolean'
        ? parsed.autoReturnToMenuAfterSave
        : fallbackSettings.autoReturnToMenuAfterSave,
    scannerAssistMode:
      typeof parsed.scannerAssistMode === 'boolean'
        ? parsed.scannerAssistMode
        : fallbackSettings.scannerAssistMode,
    xmlLayoutConfigText:
      typeof parsed.xmlLayoutConfigText === 'string' && parsed.xmlLayoutConfigText.trim().length > 0
        ? parsed.xmlLayoutConfigText
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
