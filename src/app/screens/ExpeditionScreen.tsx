import React from 'react';
import {
  FlatList,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, type EdgeInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { type ExpeditionRecord, type ExpeditionSummary } from '../models';
import { styles } from '../styles';
import { ScannerStage } from '../../components/ScannerStage';
import type {
  BarcodeDetectionsFrame,
  DetectedBarcode,
  DetectionSource,
} from '../../scanner/types';
import type { StageInsets } from '../../scanner/overlay';

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
  onBack: () => void;
  onAddSelectedBarcode: () => void;
  onClearSelection: () => void;
  onFinishExpedition: () => void;
  onRequestPermission: () => void;
  onResetDraft: () => void;
  onRetryScanner: () => void;
  onSelectBarcode: (barcode: DetectedBarcode) => void;
  onToggleTorch: () => void;
  selectedBarcode: DetectedBarcode | null;
  selectedId?: string;
  showCameraWarmup: boolean;
  showPermissionCta: boolean;
  stageReservedInsets: StageInsets;
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
  onBack,
  onAddSelectedBarcode,
  onClearSelection,
  onFinishExpedition,
  onRequestPermission,
  onResetDraft,
  onRetryScanner,
  onSelectBarcode,
  onToggleTorch,
  selectedBarcode,
  selectedId,
  showCameraWarmup,
  showPermissionCta,
  stageReservedInsets,
  torchAvailable,
  torchEnabled,
}: Props) {
  const { width, height } = useWindowDimensions();

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
        detections={detections}
        frame={frame}
        onSelect={onSelectBarcode}
        reservedInsets={stageReservedInsets}
        selectedId={selectedId}
        source={detectionSource}
        stageHeight={height}
        stageWidth={width}
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
                <Text style={styles.scannerDockEyebrow}>VYBRANÝ KÓD</Text>
                <Text numberOfLines={1} style={styles.scannerDockTitle}>
                  {selectedBarcode?.text?.trim() ||
                    'Namíř na kód a klepni na správnou etiketu'}
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

            {selectedBarcode ? (
              <View style={styles.selectedActionRow}>
                <Pressable
                  accessibilityLabel="Přidat do expedice"
                  accessibilityRole="button"
                  onPress={onAddSelectedBarcode}
                  style={[
                    styles.primaryButton,
                    styles.scannerDockButton,
                    styles.selectedAddButton,
                  ]}
                >
                  <Text style={styles.primaryButtonText}>
                    Přidat do seznamu
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityLabel="Zrušit výběr"
                  accessibilityRole="button"
                  onPress={onClearSelection}
                  style={[
                    styles.ghostButton,
                    styles.scannerDockButton,
                    styles.selectedClearButton,
                  ]}
                >
                  <Text style={styles.ghostButtonText}>Zrušit</Text>
                </Pressable>
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
                horizontal
                keyExtractor={item => item.id}
                renderItem={({ item }) => (
                  <View style={styles.scanChip}>
                    <Text style={styles.scanChipFormat}>{item.format}</Text>
                    <Text numberOfLines={1} style={styles.scanChipText}>
                      {item.text}
                    </Text>
                    <Text style={styles.scanChipMeta}>{item.quantity} ks</Text>
                  </View>
                )}
                showsHorizontalScrollIndicator={false}
              />
            ) : null}
          </View>
        </View>

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
