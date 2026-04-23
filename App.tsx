import React from 'react';
import {PermissionsAndroid, Platform} from 'react-native';
import {SafeAreaProvider, useSafeAreaInsets} from 'react-native-safe-area-context';
import {ArchiveScreen} from './src/app/screens/ArchiveScreen';
import {ExpeditionScreen} from './src/app/screens/ExpeditionScreen';
import {HomeScreen} from './src/app/screens/HomeScreen';
import {SettingsScreen} from './src/app/screens/SettingsScreen';
import {
  buildExpeditionTitle,
  buildXmlFileName,
  buildXmlPreview,
  createExpeditionRecord,
  recordExpeditionScan,
  summarizeArchive,
  summarizeExpedition,
} from './src/app/expeditions';
import {
  DEFAULT_SETTINGS,
  type ExpeditionRecord,
  type Screen,
  type SettingsState,
  type StorageStatus,
} from './src/app/models';
import {useNativeScanner} from './src/hooks/useNativeScanner';
import {
  exportXmlDocument,
  importXmlLayoutConfigFile,
  loadPersistedAppState,
  savePersistedAppState,
} from './src/native/HebarcodeStorage';
import {MOCK_BARCODES} from './src/scanner/mockData';
import {useScannerSelection} from './src/scanner/useScannerSelection';
import type {DetectedBarcode} from './src/scanner/types';

function ScannerApp(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const [screen, setScreen] = React.useState<Screen>('home');
  const [archive, setArchive] = React.useState<ExpeditionRecord[]>([]);
  const [activeExpedition, setActiveExpedition] = React.useState<ExpeditionRecord | null>(null);
  const [settings, setSettings] = React.useState<SettingsState>(DEFAULT_SETTINGS);
  const [storageStatus, setStorageStatus] = React.useState<StorageStatus>('idle');
  const [storageLabel, setStorageLabel] = React.useState('Načítám lokální data');
  const [storageHydrated, setStorageHydrated] = React.useState(false);
  const [exportStatus, setExportStatus] = React.useState<string | null>(null);
  const [importStatus, setImportStatus] = React.useState<string | null>(null);
  const {status, statusLabel, capabilities, latestFrame, start, refreshStatus} = useNativeScanner({
    assistMode: settings.scannerAssistMode,
  });

  const shouldUseStaticMockFallback =
    Platform.OS !== 'android' || status?.nativeModulePresent === false;
  const detectionSource = latestFrame?.source ?? (shouldUseStaticMockFallback ? 'mock' : 'camera');
  const detections = latestFrame?.detections ?? (shouldUseStaticMockFallback ? MOCK_BARCODES : []);
  const {selectedBarcode, selectBarcode, clearSelection} = useScannerSelection(detections);

  const expeditionSummary = React.useMemo(
    () => summarizeExpedition(activeExpedition),
    [activeExpedition],
  );
  const archiveSummary = React.useMemo(() => summarizeArchive(archive), [archive]);
  const exportableExpedition = activeExpedition ?? archive[0] ?? null;

  const stackLabel = React.useMemo(() => {
    if (detectionSource === 'mock') {
      return 'Ukázkový režim pro návrh toku a test UI';
    }

    if (capabilities && capabilities.engine !== 'unavailable' && capabilities.cameraStack !== 'unavailable') {
      return `${capabilities.cameraStack} + ${capabilities.engine}`;
    }

    return 'Nativní skener se připravuje';
  }, [capabilities, detectionSource]);

  const showPermissionCta =
    Platform.OS === 'android' &&
    status?.nativeModulePresent !== false &&
    !status?.cameraPermissionGranted;
  const showCameraWarmup =
    screen === 'expedition' &&
    Platform.OS === 'android' &&
    status?.nativeModulePresent === true &&
    status?.cameraPermissionGranted &&
    !status?.previewAttached;

  const scannerBadgeLabel = React.useMemo(() => {
    if (!status) {
      return 'Načítám stav skeneru';
    }

    if (!status.nativeModulePresent) {
      return 'Ukázkový režim';
    }

    if (showPermissionCta) {
      return 'Kamera čeká na povolení';
    }

    if (status.streaming) {
      return status.torchEnabled ? 'Skener běží živě + přisvícení' : 'Skener běží živě';
    }

    if (status.previewAttached) {
      return 'Preview připraveno';
    }

    return 'Připravuji skenovací plochu';
  }, [showPermissionCta, status]);

  const stageReservedInsets = React.useMemo(
    () => ({
      top: insets.top + 104,
      right: 18,
      bottom: insets.bottom + 248,
      left: 18,
    }),
    [insets.bottom, insets.top],
  );

  const patchSettings = React.useCallback((patch: Partial<SettingsState>) => {
    setSettings(current => ({...current, ...patch}));
  }, []);

  React.useEffect(() => {
    let mounted = true;

    loadPersistedAppState(DEFAULT_SETTINGS)
      .then(snapshot => {
        if (!mounted) {
          return;
        }

        setArchive(snapshot.archive);
        setActiveExpedition(snapshot.activeExpedition);
        setSettings(snapshot.settings);
        setStorageStatus(snapshot.available ? 'ready' : 'unavailable');
        setStorageLabel(
          snapshot.available
            ? 'Archiv a nastavení se ukládají lokálně do zařízení.'
            : 'Lokální úložiště není dostupné, změny zůstávají jen v paměti.',
        );
        setStorageHydrated(true);
      })
      .catch(() => {
        if (!mounted) {
          return;
        }

        setStorageStatus('error');
        setStorageLabel('Lokální data se nepodařilo načíst.');
        setStorageHydrated(true);
      });

    return () => {
      mounted = false;
    };
  }, []);

  React.useEffect(() => {
    if (!storageHydrated) {
      return;
    }

    setStorageStatus(current => (current === 'unavailable' ? current : 'saving'));

    const timeout = setTimeout(() => {
      savePersistedAppState({
        archive,
        activeExpedition,
        settings,
      })
        .then(saved => {
          setStorageStatus(saved ? 'ready' : 'unavailable');
          setStorageLabel(
            saved
              ? 'Archiv a nastavení se ukládají lokálně do zařízení.'
              : 'Lokální úložiště není dostupné, změny zůstávají jen v paměti.',
          );
        })
        .catch(() => {
          setStorageStatus('error');
          setStorageLabel('Lokální data se nepodařilo uložit.');
        });
    }, 250);

    return () => clearTimeout(timeout);
  }, [activeExpedition, archive, settings, storageHydrated]);

  const requestCameraPermission = React.useCallback(async () => {
    if (Platform.OS !== 'android') {
      return;
    }

    const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);

    if (result === PermissionsAndroid.RESULTS.GRANTED) {
      await refreshStatus();
      await start();
    }
  }, [refreshStatus, start]);

  const openExpedition = React.useCallback(() => {
    setActiveExpedition(current => current ?? createExpeditionRecord());
    setScreen('expedition');

    if (Platform.OS === 'android' && status?.cameraPermissionGranted) {
      start().catch(() => undefined);
    }
  }, [start, status?.cameraPermissionGranted]);

  const handleSelect = React.useCallback(
    (barcode: DetectedBarcode) => {
      selectBarcode(barcode);
      setActiveExpedition(current => recordExpeditionScan(current ?? createExpeditionRecord(), barcode));
    },
    [selectBarcode],
  );

  const finishExpedition = React.useCallback(() => {
    if (!activeExpedition || expeditionSummary.isEmpty) {
      return;
    }

    const finalized = {
      ...activeExpedition,
      updatedAtMs: Date.now(),
    };

    setArchive(previous =>
      [finalized, ...previous.filter(item => item.id !== finalized.id)].slice(0, 48),
    );
    setActiveExpedition(null);
    clearSelection();
    setScreen(settings.autoReturnToMenuAfterSave ? 'home' : 'archive');
  }, [activeExpedition, clearSelection, expeditionSummary.isEmpty, settings.autoReturnToMenuAfterSave]);

  const resetDraftExpedition = React.useCallback(() => {
    setActiveExpedition(createExpeditionRecord());
    clearSelection();
  }, [clearSelection]);

  const goHome = React.useCallback(() => {
    setScreen('home');
  }, []);

  const handleExportXml = React.useCallback(async () => {
    if (!exportableExpedition) {
      setExportStatus('Není co exportovat.');
      return;
    }

    const xmlContent = buildXmlPreview(settings, exportableExpedition);
    const exportResult = await exportXmlDocument(
      buildXmlFileName(exportableExpedition),
      xmlContent,
    );

    if (!exportResult.available) {
      setExportStatus('XML export není na tomhle zařízení dostupný.');
      return;
    }

    if (!exportResult.ok) {
      setExportStatus('XML soubor se nepodařilo vytvořit.');
      return;
    }

    setExportStatus(
      `XML uloženo jako ${exportResult.fileName ?? 'expedice.xml'}${
        exportResult.path ? ` • ${exportResult.path}` : ''
      }`,
    );
  }, [exportableExpedition, settings]);

  const handleImportXmlConfig = React.useCallback(async () => {
    const result = await importXmlLayoutConfigFile();

    if (!result.available) {
      setImportStatus('Import config souboru není na tomhle zařízení dostupný.');
      return;
    }

    if (!result.ok || !result.content) {
      setImportStatus('Konfigurační soubor se nepodařilo načíst.');
      return;
    }

    patchSettings({xmlLayoutConfigText: result.content});
    setImportStatus(
      `Načten config ${result.fileName ?? 'soubor'}.${result.uri ? ` • ${result.uri}` : ''}`,
    );
  }, [patchSettings]);

  if (screen === 'expedition') {
    return (
      <ExpeditionScreen
        activeExpedition={activeExpedition}
        detectionSource={detectionSource}
        detections={detections}
        expeditionSummary={expeditionSummary}
        expeditionTitle={buildExpeditionTitle(activeExpedition)}
        frame={latestFrame}
        insets={insets}
        onBack={goHome}
        onClearSelection={clearSelection}
        onFinishExpedition={finishExpedition}
        onRequestPermission={requestCameraPermission}
        onResetDraft={resetDraftExpedition}
        onSelectBarcode={handleSelect}
        selectedBarcode={selectedBarcode}
        selectedId={selectedBarcode?.id}
        showAssistDetails={settings.scannerAssistMode}
        showCameraWarmup={showCameraWarmup}
        showPermissionCta={showPermissionCta}
        stageReservedInsets={stageReservedInsets}
        scannerBadgeLabel={scannerBadgeLabel}
        stackLabel={stackLabel}
        statusLabel={statusLabel}
      />
    );
  }

  if (screen === 'archive') {
    return (
      <ArchiveScreen
        activeExpeditionPresent={!expeditionSummary.isEmpty}
        archive={archive}
        archiveSummary={archiveSummary}
        onBack={goHome}
        xmlRootTag={settings.xmlRootTag}
      />
    );
  }

  if (screen === 'settings') {
    return (
      <SettingsScreen
        activeExpedition={activeExpedition}
        exportStatus={exportStatus}
        hasExportableData={Boolean(exportableExpedition)}
        importStatus={importStatus}
        onBack={goHome}
        onExportXml={handleExportXml}
        onImportXmlConfig={handleImportXmlConfig}
        onPatchSettings={patchSettings}
        settings={settings}
        storageLabel={storageLabel}
        storageStatus={storageStatus}
      />
    );
  }

  return (
    <HomeScreen
      activeExpeditionLabel={
        expeditionSummary.isEmpty
          ? 'Spusť skenování a založ novou expedici'
          : `Rozpracovaná expedice • ${expeditionSummary.totalUnits} ks`
      }
      archiveCount={archive.length}
      detectionSource={detectionSource}
      onOpenArchive={() => setScreen('archive')}
      onOpenExpedition={openExpedition}
      onOpenSettings={() => setScreen('settings')}
      scannerBadgeLabel={scannerBadgeLabel}
    />
  );
}

function App(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <ScannerApp />
    </SafeAreaProvider>
  );
}

export default App;
