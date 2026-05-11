import React from 'react';
import {
  FlatList,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, type EdgeInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import {
  type ExpeditionRecord,
  type ExpeditionSummary,
  type ScanFeedback,
} from '../models';
import { styles } from '../styles';
import { ScannerStage } from '../../components/ScannerStage';
import type {
  BarcodeDetectionsFrame,
  DetectedBarcode,
  DetectionSource,
} from '../../scanner/types';
import type { StageInsets, StageSize } from '../../scanner/overlay';
import type { ScanDecisionResult } from '../../scanner/scanDecision';

type CameraIssue = {
  title: string;
  message: string;
};

type Props = {
  activeExpedition: ExpeditionRecord | null;
  cameraIssue: CameraIssue | null;
  cameraLive: boolean;
  detectionSource: DetectionSource;
  detections: DetectedBarcode[];
  expeditionSummary: ExpeditionSummary;
  expeditionTitle: string;
  frame: BarcodeDetectionsFrame | null;
  insets: EdgeInsets;
  scanDecision: ScanDecisionResult;
  scanFeedback: ScanFeedback | null;
  onBack: () => void;
  onFinishExpedition: () => void;
  onRequestPermission: () => void;
  onDecrementItem: (itemId: string) => void;
  onIncrementItem: (itemId: string) => void;
  onRemoveItem: (itemId: string) => void;
  onResetDraft: () => void;
  onRetryScanner: () => void;
  onSelectBarcode: (barcode: DetectedBarcode) => void;
  onToggleTorch: () => void;
  onTriggerScan: () => void;
  onUndoLastScan: () => void;
  selectedBarcode: DetectedBarcode | null;
  selectedId?: string;
  showCameraWarmup: boolean;
  showPermissionCta: boolean;
  stageReservedInsets: StageInsets;
  stageSize: StageSize;
  torchAvailable: boolean;
  torchEnabled: boolean;
};

export function ExpeditionScreen({
  activeExpedition,
  cameraIssue,
  cameraLive,
  detectionSource,
  detections,
  expeditionSummary,
  expeditionTitle,
  frame,
  insets,
  scanDecision,
  scanFeedback,
  onBack,
  onFinishExpedition,
  onRequestPermission,
  onDecrementItem,
  onIncrementItem,
  onRemoveItem,
  onResetDraft,
  onRetryScanner,
  onSelectBarcode,
  onToggleTorch,
  onTriggerScan,
  onUndoLastScan,
  selectedBarcode,
  selectedId,
  showCameraWarmup,
  showPermissionCta,
  stageReservedInsets,
  stageSize,
  torchAvailable,
  torchEnabled,
}: Props) {
  return (
    <View style={styles.root}>
      <StatusBar
        animated
        backgroundColor="transparent"
        barStyle="light-content"
        translucent
      />
      <ScannerStage
        cameraLive={cameraLive}
        cardLabelPrefix="PŘIDAT"
        detections={detections}
        decision={scanDecision}
        frame={frame}
        onSelect={onSelectBarcode}
        reservedInsets={stageReservedInsets}
        selectedId={selectedId}
        selectedCardLabelPrefix="CÍL"
        source={detectionSource}
        stageHeight={stageSize.height}
        stageWidth={stageSize.width}
      />

      <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
        <SafeAreaView pointerEvents="box-none" style={styles.overlaySafeArea}>
          <View style={styles.expeditionTopBar}>
            <Pressable onPress={onBack} style={styles.topActionButton}>
              <Text style={styles.topActionText}>Zpět</Text>
            </Pressable>
            <View style={styles.headerCenterBlock}>
              <Text style={styles.headerEyebrow}>AKTIVNÍ EXPEDICE</Text>
              <Text numberOfLines={1} style={styles.headerTitle}>
                {expeditionTitle}
              </Text>
            </View>
            <Pressable
              accessibilityLabel={
                torchEnabled ? 'Vypnout svítilnu' : 'Zapnout svítilnu'
              }
              accessibilityRole="button"
              disabled={!torchAvailable}
              hitSlop={8}
              onPress={onToggleTorch}
              style={[
                styles.torchButton,
                torchEnabled ? styles.torchButtonActive : null,
                !torchAvailable ? styles.torchButtonDisabled : null,
              ]}
            >
              <TorchIcon active={torchEnabled} />
            </Pressable>
          </View>
        </SafeAreaView>

        <View
          pointerEvents="box-none"
          style={[
            styles.expeditionBottomWrap,
            { paddingBottom: insets.bottom + 10 },
          ]}
        >
          <View style={styles.scannerDock}>
            <View style={styles.scannerDockHeader}>
              <View style={styles.scannerDockTitleWrap}>
                <Text style={styles.scannerDockEyebrow}>ZAMĚŘENÝ KÓD</Text>
                <Text numberOfLines={1} style={styles.scannerDockTitle}>
                  {selectedBarcode?.text?.trim() ||
                    'Zatím bez položky'}
                </Text>
              </View>
              <View style={styles.scannerDockStats}>
                <View style={styles.scannerDockStat}>
                  <Text style={styles.scannerDockStatLabel}>Kusy</Text>
                  <Text style={styles.scannerDockStatValue}>
                    {expeditionSummary.totalUnits}
                  </Text>
                </View>
                <View style={styles.scannerDockStat}>
                  <Text style={styles.scannerDockStatLabel}>Kódy</Text>
                  <Text style={styles.scannerDockStatValue}>
                    {expeditionSummary.distinctItems}
                  </Text>
                </View>
              </View>
            </View>

            {selectedBarcode ? (
              <Text numberOfLines={1} style={styles.scannerDockMeta}>
                {selectedBarcode.format} • {selectedBarcode.contentType}
              </Text>
            ) : null}

            {scanFeedback ? (
              <View
                accessibilityLabel={`Stav skenu: ${scanFeedback.text}`}
                style={localStyles.feedbackBanner}
              >
                <Text style={localStyles.feedbackText}>{scanFeedback.text}</Text>
                {scanFeedback.quantity ? (
                  <Text style={localStyles.feedbackMeta}>{scanFeedback.quantity} ks</Text>
                ) : null}
              </View>
            ) : null}

            <View style={styles.scannerDockActionRow}>
              {showPermissionCta ? (
                <Pressable
                  onPress={onRequestPermission}
                  style={[
                    styles.primaryButton,
                    styles.flexButton,
                    styles.scannerDockButton,
                  ]}
                >
                  <Text style={styles.primaryButtonText}>Povolit kameru</Text>
                </Pressable>
              ) : null}
              <Pressable
                disabled={expeditionSummary.isEmpty}
                onPress={onFinishExpedition}
                style={[
                  styles.primaryButton,
                  styles.flexButton,
                  styles.scannerDockButton,
                  expeditionSummary.isEmpty
                    ? styles.primaryButtonDisabled
                    : null,
                ]}
              >
                <Text style={styles.primaryButtonText}>Dokončit expedici</Text>
              </Pressable>
              <Pressable
                accessibilityLabel="Zpět poslední sken"
                accessibilityRole="button"
                disabled={!activeExpedition?.scanJournal?.length}
                onPress={onUndoLastScan}
                style={[
                  styles.secondaryButton,
                  styles.flexButton,
                  styles.scannerDockButton,
                  !activeExpedition?.scanJournal?.length
                    ? styles.primaryButtonDisabled
                    : null,
                ]}
              >
                <Text style={styles.secondaryButtonText}>Zpět poslední</Text>
              </Pressable>
              <Pressable
                onPress={onResetDraft}
                style={[
                  styles.secondaryButton,
                  styles.flexButton,
                  styles.scannerDockButton,
                ]}
              >
                <Text style={styles.secondaryButtonText}>Vyčistit návrh</Text>
              </Pressable>
            </View>

            {activeExpedition?.items.length ? (
              <FlatList
                contentContainerStyle={styles.scanListContent}
                data={activeExpedition.items}
                keyExtractor={item => item.id}
                renderItem={({ item }) => (
                  <View style={styles.scanRow}>
                    <View style={styles.scanRowTextWrap}>
                      <Text style={styles.scanChipFormat}>{item.format}</Text>
                      <Text numberOfLines={1} style={styles.scanChipText}>
                        {item.text}
                      </Text>
                    </View>
                    <View style={styles.scanRowControls}>
                      <Pressable
                        accessibilityLabel={`Snížit množství ${item.text}`}
                        accessibilityRole="button"
                        onPress={() => onDecrementItem(item.id)}
                        style={styles.quantityStepButton}
                      >
                        <Text style={styles.quantityStepButtonText}>−</Text>
                      </Pressable>
                      <Pressable
                        accessibilityLabel={`Zvýšit množství ${item.text}`}
                        accessibilityRole="button"
                        onPress={() => onIncrementItem(item.id)}
                        style={styles.quantityPill}
                      >
                        <Text style={styles.quantityPillText}>{item.quantity} ks</Text>
                      </Pressable>
                      <Pressable
                        accessibilityLabel={`Odebrat položku ${item.text}`}
                        accessibilityRole="button"
                        onPress={() => onRemoveItem(item.id)}
                        style={styles.trashButton}
                      >
                        <TrashIcon />
                      </Pressable>
                    </View>
                  </View>
                )}
                showsVerticalScrollIndicator={false}
              />
            ) : null}
          </View>
        </View>

        <Pressable
          accessibilityHint="Uloží aktuálně zaměřený kód do seznamu"
          accessibilityLabel="Spoušť: přidat zaměřený kód"
          accessibilityRole="button"
          disabled={!selectedBarcode}
          onPress={onTriggerScan}
          style={[
            styles.floatingTriggerButton,
            { bottom: insets.bottom + 18 },
            !selectedBarcode ? styles.floatingTriggerButtonDisabled : null,
          ]}
        >
          <Text style={styles.floatingTriggerEmoji}>🔫</Text>
        </Pressable>

        {cameraIssue ? (
          <View
            style={[
              styles.warmupBanner,
              styles.warmupBannerIssue,
              { top: insets.top + 72 },
            ]}
          >
            <Text style={styles.warmupTitle}>{cameraIssue.title}</Text>
            <Text style={styles.warmupText}>{cameraIssue.message}</Text>
            <Pressable
              accessibilityLabel="Zkusit skener znovu"
              accessibilityRole="button"
              onPress={onRetryScanner}
              style={styles.warmupRetryButton}
            >
              <Text style={styles.warmupRetryButtonText}>Zkusit znovu</Text>
            </Pressable>
          </View>
        ) : showCameraWarmup ? (
          <View
            pointerEvents="none"
            style={[styles.warmupBanner, { top: insets.top + 72 }]}
          >
            <Text style={styles.warmupTitle}>Kamera se připojuje</Text>
            <Text style={styles.warmupText}>
              Preview se inicializuje, skenování začne hned potom.
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const localStyles = StyleSheet.create({
  feedbackBanner: {
    marginTop: 8,
    marginBottom: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(126,242,202,0.55)',
    backgroundColor: 'rgba(5,32,24,0.82)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  feedbackText: {
    color: '#effff8',
    fontSize: 13,
    fontWeight: '900',
  },
  feedbackMeta: {
    color: '#7ef2ca',
    fontSize: 12,
    fontWeight: '900',
  },
});

function TrashIcon() {
  return (
    <Svg height={18} viewBox="0 0 24 24" width={18}>
      <Path
        d="M9 4h6l1 2h4"
        fill="none"
        stroke="#ffdada"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
      />
      <Path
        d="M4 6h16"
        fill="none"
        stroke="#ffdada"
        strokeLinecap="round"
        strokeWidth={2}
      />
      <Path
        d="M7 9l1 11h8l1-11"
        fill="none"
        stroke="#ffdada"
        strokeLinejoin="round"
        strokeWidth={2}
      />
      <Path
        d="M10 11v6M14 11v6"
        fill="none"
        stroke="rgba(255,218,218,0.82)"
        strokeLinecap="round"
        strokeWidth={1.8}
      />
    </Svg>
  );
}

function TorchIcon({ active }: { active: boolean }) {
  const stroke = active ? '#052018' : '#eff8ff';
  const beam = active ? '#7ef2ca' : 'rgba(239,248,255,0.42)';

  return (
    <Svg height={22} viewBox="0 0 24 24" width={22}>
      <Path
        d="M9 2h6l1 4H8l1-4Z"
        fill="none"
        stroke={stroke}
        strokeLinejoin="round"
        strokeWidth={2}
      />
      <Path
        d="M8 6h8l-1.5 4v9a3 3 0 0 1-3 3h-1a3 3 0 0 1-3-3v-9L8 6Z"
        fill="none"
        stroke={stroke}
        strokeLinejoin="round"
        strokeWidth={2}
      />
      <Path
        d="M12 11v5"
        fill="none"
        stroke={beam}
        strokeLinecap="round"
        strokeWidth={2}
      />
    </Svg>
  );
}
