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
import {SafeAreaView, type EdgeInsets} from 'react-native-safe-area-context';
import {InfoCard, MetricCard} from '../components';
import {type ExpeditionRecord, type ExpeditionSummary} from '../models';
import {styles} from '../styles';
import {ScannerStage} from '../../components/ScannerStage';
import type {BarcodeDetectionsFrame, DetectedBarcode, DetectionSource} from '../../scanner/types';
import type {StageInsets} from '../../scanner/overlay';

type Props = {
  activeExpedition: ExpeditionRecord | null;
  detectionSource: DetectionSource;
  detections: DetectedBarcode[];
  expeditionSummary: ExpeditionSummary;
  expeditionTitle: string;
  frame: BarcodeDetectionsFrame | null;
  insets: EdgeInsets;
  onBack: () => void;
  onClearSelection: () => void;
  onFinishExpedition: () => void;
  onRequestPermission: () => void;
  onResetDraft: () => void;
  onSelectBarcode: (barcode: DetectedBarcode) => void;
  selectedBarcode: DetectedBarcode | null;
  selectedId?: string;
  showAssistDetails: boolean;
  showCameraWarmup: boolean;
  showPermissionCta: boolean;
  stageReservedInsets: StageInsets;
  scannerBadgeLabel: string;
  stackLabel: string;
  statusLabel: string;
};

export function ExpeditionScreen({
  activeExpedition,
  detectionSource,
  detections,
  expeditionSummary,
  expeditionTitle,
  frame,
  insets,
  onBack,
  onClearSelection,
  onFinishExpedition,
  onRequestPermission,
  onResetDraft,
  onSelectBarcode,
  selectedBarcode,
  selectedId,
  showAssistDetails,
  showCameraWarmup,
  showPermissionCta,
  stageReservedInsets,
  scannerBadgeLabel,
  stackLabel,
  statusLabel,
}: Props) {
  const {width, height} = useWindowDimensions();
  const isMockMode = detectionSource === 'mock';

  return (
    <View style={styles.root}>
      <StatusBar animated backgroundColor="transparent" barStyle="light-content" translucent />
      <ScannerStage
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
              <Text style={styles.headerTitle}>{expeditionTitle}</Text>
            </View>
            <View style={[styles.liveBadge, isMockMode ? styles.liveBadgeMock : null]}>
              <View style={[styles.liveDot, isMockMode ? styles.liveDotMock : null]} />
              <Text style={styles.liveBadgeText}>{scannerBadgeLabel}</Text>
            </View>
          </View>

          <View style={styles.metricsStrip}>
            <MetricCard label="Položky" value={String(expeditionSummary.distinctItems)} />
            <MetricCard label="Kusy" value={String(expeditionSummary.totalUnits)} />
            <MetricCard label="Režim" value={isMockMode ? 'SAMPLE' : 'LIVE'} />
          </View>
        </SafeAreaView>

        <View
          pointerEvents="box-none"
          style={[styles.expeditionBottomWrap, {paddingBottom: insets.bottom + 16}]}>
          <View style={styles.bottomSheet}>
            <View style={styles.bottomSheetHeader}>
              <View>
                <Text style={styles.bottomSheetEyebrow}>VYBRANÝ KÓD</Text>
                <Text numberOfLines={2} style={styles.bottomSheetTitle}>
                  {selectedBarcode?.text?.trim() || 'Namíř na kód a klepni na správnou etiketu'}
                </Text>
              </View>
              <Text style={styles.statusPill}>{isMockMode ? 'Ukázka' : 'Skenování'}</Text>
            </View>

            <Text style={styles.bottomSheetSecondary}>
              {selectedBarcode
                ? `${selectedBarcode.format} • ${selectedBarcode.contentType}`
                : 'Výběr zůstává přesný i když je v záběru víc kódů současně.'}
            </Text>

            <View style={styles.actionRow}>
              {showPermissionCta ? (
                <Pressable
                  onPress={onRequestPermission}
                  style={[styles.primaryButton, styles.flexButton]}>
                  <Text style={styles.primaryButtonText}>Povolit kameru</Text>
                </Pressable>
              ) : null}
              <Pressable
                disabled={expeditionSummary.isEmpty}
                onPress={onFinishExpedition}
                style={[
                  styles.primaryButton,
                  styles.flexButton,
                  expeditionSummary.isEmpty ? styles.primaryButtonDisabled : null,
                ]}>
                <Text style={styles.primaryButtonText}>Dokončit expedici</Text>
              </Pressable>
              <Pressable onPress={onResetDraft} style={[styles.secondaryButton, styles.flexButton]}>
                <Text style={styles.secondaryButtonText}>Vyčistit návrh</Text>
              </Pressable>
              {selectedBarcode ? (
                <Pressable onPress={onClearSelection} style={[styles.ghostButton, styles.flexButton]}>
                  <Text style={styles.ghostButtonText}>Zrušit výběr</Text>
                </Pressable>
              ) : null}
            </View>

            {showAssistDetails ? (
              <View style={styles.infoGrid}>
                <InfoCard label="Stack" value={stackLabel} />
                <InfoCard label="Status" value={statusLabel} />
              </View>
            ) : null}

            <FlatList
              contentContainerStyle={styles.scanListContent}
              data={activeExpedition?.items ?? []}
              horizontal
              keyExtractor={item => item.id}
              renderItem={({item}) => (
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
          </View>
        </View>

        {showCameraWarmup ? (
          <View pointerEvents="none" style={[styles.warmupBanner, {top: insets.top + 90}]}>
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
