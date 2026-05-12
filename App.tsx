import React from 'react';
import { PermissionsAndroid, Platform, useWindowDimensions } from 'react-native';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { ArchiveScreen } from './src/app/screens/ArchiveScreen';
import { DiagnosticsScreen } from './src/app/screens/DiagnosticsScreen';
import { ExpeditionScreen } from './src/app/screens/ExpeditionScreen';
import { HomeScreen } from './src/app/screens/HomeScreen';
import { SettingsScreen } from './src/app/screens/SettingsScreen';
import {
  buildExpeditionTitle,
  buildXmlFileName,
  buildXmlPreview,
  createExpeditionRecord,
  decrementExpeditionItem,
  incrementExpeditionItem,
  recordExpeditionScan,
  removeExpeditionItem,
  summarizeArchive,
  summarizeExpedition,
  undoLastExpeditionScan,
} from './src/app/expeditions';
import {
  DEFAULT_SETTINGS,
  type ExpeditionRecord,
  type ScanFeedback,
  type Screen,
  type SettingsState,
  type StorageStatus,
} from './src/app/models';
import { useNativeScanner } from './src/hooks/useNativeScanner';
import {
  exportXmlDocument,
  importXmlLayoutConfigFile,
  loadPersistedAppState,
  savePersistedAppState,
} from './src/native/HebarcodeStorage';
import {
  buildLogicalBarcodeKey,
} from './src/scanner/barcodeIdentity';
import { MOCK_BARCODES } from './src/scanner/mockData';
import {
  decideScanTarget,
  type RecentScanCommit,
  type ScanCommitIntent,
} from './src/scanner/scanDecision';
import { useScannerSelection } from './src/scanner/useScannerSelection';
import type { DetectedBarcode } from './src/scanner/types';

const AUTO_COMMIT_DUPLICATE_COOLDOWN_MS = 1800;
const MAX_RECENT_SCAN_COMMITS = 20;

function ScannerApp(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [screen, setScreen] = React.useState<Screen>('home');
  const [archive, setArchive] = React.useState<ExpeditionRecord[]>([]);
  const [activeExpedition, setActiveExpedition] =
    React.useState<ExpeditionRecord | null>(null);
  const [settings, setSettings] =
    React.useState<SettingsState>(DEFAULT_SETTINGS);
  const [storageStatus, setStorageStatus] =
    React.useState<StorageStatus>('idle');
  const [storageLabel, setStorageLabel] = React.useState(
    'Načítám lokální data',
  );
  const [storageHydrated, setStorageHydrated] = React.useState(false);
  const [exportStatus, setExportStatus] = React.useState<string | null>(null);
  const [importStatus, setImportStatus] = React.useState<string | null>(null);
  const [scanFeedback, setScanFeedback] = React.useState<ScanFeedback | null>(null);
  const activeExpeditionRef = React.useRef<ExpeditionRecord | null>(null);
  const recentCommitsRef = React.useRef<RecentScanCommit[]>([]);
  const lastAimedTargetIdRef = React.useRef<string | null>(null);
  const scannerMode =
    screen === 'expedition'
      ? 'expedition'
      : screen === 'diagnostics'
      ? 'diagnostics'
      : 'inactive';
  const scannerActive = scannerMode !== 'inactive';
  const {
    status,
    statusLabel,
    capabilities,
    latestFrame,
    start,
    retry,
    setTorchEnabled,
    refreshStatus,
    startupTimedOut,
  } = useNativeScanner({
    assistMode: settings.scannerAssistMode,
    mode: scannerMode,
    scannerRuntimeId: settings.scannerRuntimeId,
  });

  const shouldUseStaticMockFallback = Platform.OS !== 'android';
  const cameraPreviewLive =
    status?.previewStreaming === true || status?.streaming === true;
  const torchActive = Boolean(status?.torchEnabled || status?.torchRequested);
  const torchAvailable =
    Platform.OS === 'android' &&
    status?.nativeModulePresent !== false &&
    capabilities?.torchControl !== false &&
    status?.cameraPermissionGranted === true;
  const detectionSource =
    latestFrame?.source ?? (shouldUseStaticMockFallback ? 'mock' : 'camera');
  const detections = React.useMemo(
    () => latestFrame?.detections ?? (shouldUseStaticMockFallback ? MOCK_BARCODES : []),
    [latestFrame?.detections, shouldUseStaticMockFallback],
  );
  const { selectedBarcode, selectBarcode, clearSelection } =
    useScannerSelection(detections);

  const expeditionSummary = React.useMemo(
    () => summarizeExpedition(activeExpedition),
    [activeExpedition],
  );
  const archiveSummary = React.useMemo(
    () => summarizeArchive(archive),
    [archive],
  );
  const exportableExpedition = activeExpedition ?? archive[0] ?? null;

  const stackLabel = React.useMemo(() => {
    if (detectionSource === 'mock') {
      return 'Ukázkový režim pro návrh toku a test UI';
    }

    if (
      capabilities &&
      capabilities.engine !== 'unavailable' &&
      capabilities.cameraStack !== 'unavailable'
    ) {
      return `${capabilities.cameraStack} + ${capabilities.engine}`;
    }

    return 'Nativní skener se připravuje';
  }, [capabilities, detectionSource]);

  const showPermissionCta =
    Platform.OS === 'android' &&
    status?.nativeModulePresent !== false &&
    !status?.cameraPermissionGranted;
  const scannerStartupIssue = React.useMemo(() => {
    if (
      !scannerActive ||
      Platform.OS !== 'android' ||
      status?.nativeModulePresent !== true ||
      status.cameraPermissionGranted !== true ||
      status.streaming === true
    ) {
      return null;
    }

    if (status.lastErrorCode) {
      return {
        title: 'Kamera se nespustila',
        message:
          status.lastErrorMessage ??
          'CameraX nedokázal připojit kameru. Zavři jiné aplikace s kamerou a zkus skener spustit znovu.',
      };
    }

    if (startupTimedOut) {
      return {
        title: status.previewStreaming
          ? 'Analyzer nedostává snímky'
          : 'Kamera stále neodpovídá',
        message: status.previewAttached
          ? status.previewStreaming
            ? 'CameraX preview streamuje, ale ImageAnalysis neposílá snímky pro skenování. Restart skeneru přepne analyzer na kompatibilnější profil.'
            : 'Preview view je připojený, ale CameraX preview ani analyzer zatím nestreamují. Zkus restart skeneru.'
          : 'Preview se zatím nepřipojilo k aktivitě. Zkus restart skeneru nebo se vrať do menu a otevři expedici znovu.',
      };
    }

    return null;
  }, [
    scannerActive,
    startupTimedOut,
    status?.cameraPermissionGranted,
    status?.lastErrorCode,
    status?.lastErrorMessage,
    status?.nativeModulePresent,
    status?.previewAttached,
    status?.previewStreaming,
    status?.streaming,
  ]);
  const showCameraWarmup =
    scannerActive &&
    Platform.OS === 'android' &&
    status?.nativeModulePresent === true &&
    status.cameraPermissionGranted === true &&
    status.streaming !== true &&
    !scannerStartupIssue;

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

    if (scannerStartupIssue) {
      return 'Kamera vyžaduje zásah';
    }

    if (status.streaming) {
      return status.torchEnabled
        ? 'Skener běží živě + svítilna'
        : 'Skener běží živě';
    }

    if (status.previewStreaming) {
      return 'Preview běží, čekám na analyzér';
    }

    if (status.previewAttached) {
      return 'Preview připojeno';
    }

    return 'Připravuji skenovací plochu';
  }, [scannerStartupIssue, showPermissionCta, status]);

  const stageReservedInsets = React.useMemo(
    () => ({
      top: insets.top + 70,
      right: 12,
      bottom: insets.bottom + 168,
      left: 12,
    }),
    [insets.bottom, insets.top],
  );
  const stageSize = React.useMemo(
    () => ({ width: windowWidth, height: windowHeight }),
    [windowHeight, windowWidth],
  );

  const scanDecision = React.useMemo(
    () =>
      decideScanTarget({
        detections,
        duplicateCooldownMs: AUTO_COMMIT_DUPLICATE_COOLDOWN_MS,
        frameSize: latestFrame?.frameSize,
        nowMs: latestFrame?.timestampMs ?? Date.now(),
        recentCommits: [],
        reservedInsets: stageReservedInsets,
        selectedBarcode: null,
        stageSize,
      }),
    [
      detections,
      latestFrame?.frameSize,
      latestFrame?.timestampMs,
      stageReservedInsets,
      stageSize,
    ],
  );

  React.useEffect(() => {
    activeExpeditionRef.current = activeExpedition;
  }, [activeExpedition]);

  const patchSettings = React.useCallback((patch: Partial<SettingsState>) => {
    setSettings(current => ({ ...current, ...patch }));
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

    setStorageStatus(current =>
      current === 'unavailable' ? current : 'saving',
    );

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

    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.CAMERA,
    );

    if (result === PermissionsAndroid.RESULTS.GRANTED) {
      await refreshStatus();
      await start();
    }
  }, [refreshStatus, start]);

  const retryScanner = React.useCallback(async () => {
    try {
      await retry();
    } catch {
      await refreshStatus();
    }
  }, [refreshStatus, retry]);

  const toggleTorch = React.useCallback(async () => {
    try {
      await setTorchEnabled(!torchActive);
    } catch {
      await refreshStatus();
    }
  }, [refreshStatus, setTorchEnabled, torchActive]);

  const openExpedition = React.useCallback(() => {
    setActiveExpedition(current => current ?? createExpeditionRecord());
    setScreen('expedition');
  }, []);

  const commitScan = React.useCallback((intent: ScanCommitIntent): boolean => {
    const nowMs = Number.isFinite(intent.decidedAtMs)
      ? intent.decidedAtMs
      : Date.now();

    if (intent.reason !== 'manual') {
      const duplicate = recentCommitsRef.current.some(
        commit =>
          commit.logicalKey === intent.logicalKey &&
          nowMs - commit.committedAtMs < AUTO_COMMIT_DUPLICATE_COOLDOWN_MS,
      );

      if (duplicate) {
        setScanFeedback({
          kind: 'duplicate',
          text: 'Duplicitní sken potlačen',
          format: intent.barcode.format,
          timestampMs: nowMs,
        });
        return false;
      }
    }

    const baseExpedition = activeExpeditionRef.current ?? createExpeditionRecord();
    const nextExpedition = recordExpeditionScan(baseExpedition, intent.barcode);
    const nextQuantity =
      nextExpedition.items.find(item => item.id === intent.logicalKey)?.quantity ?? 1;
    activeExpeditionRef.current = nextExpedition;
    setActiveExpedition(nextExpedition);

    recentCommitsRef.current = [
      { logicalKey: intent.logicalKey, committedAtMs: nowMs, barcode: intent.barcode },
      ...recentCommitsRef.current.filter(
        commit => nowMs - commit.committedAtMs < AUTO_COMMIT_DUPLICATE_COOLDOWN_MS * 4,
      ),
    ].slice(0, MAX_RECENT_SCAN_COMMITS);

    setScanFeedback({
      kind: 'committed',
      text: intent.reason === 'manual' ? 'Ručně přidáno' : 'Sken přidán',
      format: intent.barcode.format,
      quantity: nextQuantity,
      timestampMs: nowMs,
    });
    return true;
  }, []);

  const handleExpeditionBarcodePress = React.useCallback(
    (barcode: DetectedBarcode) => {
      selectBarcode(barcode);
    },
    [selectBarcode],
  );

  const handleTriggerScan = React.useCallback(() => {
    if (scanDecision.status === 'ambiguous' && !selectedBarcode) {
      setScanFeedback({
        kind: 'ambiguous',
        text: 'Více kódů v zóně – zpřesni zamíření',
        timestampMs: Date.now(),
      });
      return;
    }

    const barcode = selectedBarcode ?? scanDecision.primary;
    if (!barcode) {
      setScanFeedback({
        kind: 'ambiguous',
        text: 'Nejdřív namiř nebo vyber kód',
        timestampMs: Date.now(),
      });
      return;
    }

    commitScan({
      barcode,
      decidedAtMs: Date.now(),
      logicalKey:
        scanDecision.ranked.find(candidate => candidate.barcode.id === barcode.id)
          ?.logicalKey ?? buildLogicalBarcodeKey(barcode),
      reason: 'manual',
    });
  }, [
    commitScan,
    scanDecision.primary,
    scanDecision.ranked,
    scanDecision.status,
    selectedBarcode,
  ]);

  const handleUndoLastScan = React.useCallback(() => {
    const currentJournal = activeExpedition?.scanJournal ?? [];
    const lastEntry = currentJournal[currentJournal.length - 1];
    if (!activeExpedition || !lastEntry) {
      return;
    }

    const nextExpedition = undoLastExpeditionScan(activeExpedition);
    activeExpeditionRef.current = nextExpedition;
    setActiveExpedition(nextExpedition);
    setScanFeedback({
      kind: 'undone',
      text: 'Poslední sken vrácen',
      format: lastEntry.format,
      timestampMs: Date.now(),
    });
  }, [activeExpedition]);

  React.useEffect(() => {
    if (screen === 'expedition' && scanDecision.status === 'ambiguous') {
      setScanFeedback({
        kind: 'ambiguous',
        text: 'Více kódů v zóně – vyber ručně',
        timestampMs: Date.now(),
      });
    }

    if (screen === 'expedition' && scanDecision.status === 'duplicateSuppressed') {
      setScanFeedback({
        kind: 'duplicate',
        text: 'Duplicitní sken potlačen',
        format: scanDecision.commitIntent?.barcode.format,
        timestampMs: Date.now(),
      });
    }
  }, [scanDecision.commitIntent?.barcode.format, scanDecision.status, screen]);

  React.useEffect(() => {
    if (
      screen !== 'expedition' ||
      !scanDecision.primary ||
      scanDecision.status === 'ambiguous'
    ) {
      return;
    }

    if (lastAimedTargetIdRef.current === scanDecision.primary.id) {
      return;
    }

    lastAimedTargetIdRef.current = scanDecision.primary.id;
    selectBarcode(scanDecision.primary);
  }, [
    scanDecision.primary,
    scanDecision.status,
    screen,
    selectBarcode,
  ]);

  const handleRemoveExpeditionItem = React.useCallback((itemId: string) => {
    setActiveExpedition(current => {
      if (!current) {
        return current;
      }

      const item = current.items.find(entry => entry.id === itemId);
      const nextExpedition = removeExpeditionItem(current, itemId);
      activeExpeditionRef.current = nextExpedition;
      if (item) {
        setScanFeedback({
          kind: 'removed',
          text: 'Položka odebrána',
          format: item.format,
          timestampMs: Date.now(),
        });
      }
      return nextExpedition;
    });
  }, []);

  const handleIncrementExpeditionItem = React.useCallback((itemId: string) => {
    setActiveExpedition(current => {
      if (!current) {
        return current;
      }

      const nextExpedition = incrementExpeditionItem(current, itemId);
      const item = nextExpedition.items.find(entry => entry.id === itemId);
      activeExpeditionRef.current = nextExpedition;
      if (item) {
        setScanFeedback({
          kind: 'quantityChanged',
          text: 'Množství zvýšeno',
          format: item.format,
          quantity: item.quantity,
          timestampMs: Date.now(),
        });
      }
      return nextExpedition;
    });
  }, []);

  const handleDecrementExpeditionItem = React.useCallback((itemId: string) => {
    setActiveExpedition(current => {
      if (!current) {
        return current;
      }

      const before = current.items.find(entry => entry.id === itemId);
      const nextExpedition = decrementExpeditionItem(current, itemId);
      const after = nextExpedition.items.find(entry => entry.id === itemId);
      activeExpeditionRef.current = nextExpedition;
      if (before) {
        setScanFeedback({
          kind: after ? 'quantityChanged' : 'removed',
          text: after ? 'Množství sníženo' : 'Položka odebrána',
          format: before.format,
          quantity: after?.quantity,
          timestampMs: Date.now(),
        });
      }
      return nextExpedition;
    });
  }, []);

  const finishExpedition = React.useCallback(() => {
    if (!activeExpedition || expeditionSummary.isEmpty) {
      return;
    }

    const finalized = {
      ...activeExpedition,
      updatedAtMs: Date.now(),
    };

    setArchive(previous =>
      [finalized, ...previous.filter(item => item.id !== finalized.id)].slice(
        0,
        48,
      ),
    );
    setActiveExpedition(null);
    clearSelection();
    setScreen(settings.autoReturnToMenuAfterSave ? 'home' : 'archive');
  }, [
    activeExpedition,
    clearSelection,
    expeditionSummary.isEmpty,
    settings.autoReturnToMenuAfterSave,
  ]);

  const resetDraftExpedition = React.useCallback(() => {
    setActiveExpedition(createExpeditionRecord());
    clearSelection();
  }, [clearSelection]);

  const selectDiagnosticBarcode = React.useCallback(
    (barcode: DetectedBarcode) => {
      selectBarcode(barcode);
    },
    [selectBarcode],
  );

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
      setImportStatus(
        'Import config souboru není na tomhle zařízení dostupný.',
      );
      return;
    }

    if (!result.ok || !result.content) {
      setImportStatus('Konfigurační soubor se nepodařilo načíst.');
      return;
    }

    patchSettings({ xmlLayoutConfigText: result.content });
    setImportStatus(
      `Načten config ${result.fileName ?? 'soubor'}.${
        result.uri ? ` • ${result.uri}` : ''
      }`,
    );
  }, [patchSettings]);

  if (screen === 'expedition') {
    return (
      <ExpeditionScreen
        activeExpedition={activeExpedition}
        cameraLive={cameraPreviewLive}
        detectionSource={detectionSource}
        detections={detections}
        expeditionSummary={expeditionSummary}
        expeditionTitle={buildExpeditionTitle(activeExpedition)}
        frame={latestFrame}
        insets={insets}
        scanDecision={scanDecision}
        scanFeedback={scanFeedback}
        cameraIssue={scannerStartupIssue}
        onBack={goHome}
        onFinishExpedition={finishExpedition}
        onRequestPermission={requestCameraPermission}
        onDecrementItem={handleDecrementExpeditionItem}
        onIncrementItem={handleIncrementExpeditionItem}
        onRemoveItem={handleRemoveExpeditionItem}
        onResetDraft={resetDraftExpedition}
        onRetryScanner={retryScanner}
        onSelectBarcode={handleExpeditionBarcodePress}
        onToggleTorch={toggleTorch}
        onTriggerScan={handleTriggerScan}
        onUndoLastScan={handleUndoLastScan}
        selectedBarcode={selectedBarcode}
        selectedId={selectedBarcode?.id}
        showCameraWarmup={showCameraWarmup}
        showPermissionCta={showPermissionCta}
        stageReservedInsets={stageReservedInsets}
        stageSize={stageSize}
        torchAvailable={torchAvailable}
        torchEnabled={torchActive}
      />
    );
  }

  if (screen === 'diagnostics') {
    return (
      <DiagnosticsScreen
        cameraIssue={scannerStartupIssue}
        detectionSource={detectionSource}
        detections={detections}
        frame={latestFrame}
        insets={insets}
        onBack={goHome}
        onRefreshScanner={refreshStatus}
        onRequestPermission={requestCameraPermission}
        onRetryScanner={retryScanner}
        onSelectBarcode={selectDiagnosticBarcode}
        selectedId={selectedBarcode?.id}
        showCameraWarmup={showCameraWarmup}
        showPermissionCta={showPermissionCta}
        stackLabel={stackLabel}
        status={status}
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
      onOpenDiagnostics={() => setScreen('diagnostics')}
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
