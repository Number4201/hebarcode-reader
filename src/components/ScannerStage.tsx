import React from 'react';
import {
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Line, Polygon } from 'react-native-svg';
import { HebarcodeScannerView } from '../native/HebarcodeScannerView';
import {
  hitTestStageDetections,
  layoutPreviewCards,
  mapDetectionsToStage,
  type StageInsets,
  type PreviewCardRectCache,
  type StageSize,
} from '../scanner/overlay';
import {
  buildLogicalBarcodeKey,
  hasBarcodePayload,
} from '../scanner/barcodeIdentity';
import type { ScanDecisionResult } from '../scanner/scanDecision';
import type {
  BarcodeDetectionsFrame,
  DetectedBarcode,
  DetectionSource,
} from '../scanner/types';

type Props = {
  frame: BarcodeDetectionsFrame | null;
  detections: DetectedBarcode[];
  decision?: ScanDecisionResult;
  source?: DetectionSource;
  selectedId?: string;
  onSelect: (barcode: DetectedBarcode) => void;
  stageWidth?: number;
  stageHeight?: number;
  reservedInsets?: StageInsets;
  cameraLive?: boolean;
  showCameraStateLabel?: boolean;
  showWaitingState?: boolean;
  showDetectionOverlays?: boolean;
  showPreviewCards?: boolean;
  cardLabelPrefix?: string;
  selectedCardLabelPrefix?: string;
};

const DEFAULT_STAGE_WIDTH = 360;
const DEFAULT_STAGE_HEIGHT = 640;
const ANALYZER_PREVIEW_STALE_MS = 2500;
const PREVIEW_CARD_GRACE_MS = 1400;
const PREVIEW_CARD_REACQUIRE_MIN_DISTANCE = 48;
const PREVIEW_CARD_REACQUIRE_MAX_DISTANCE = 160;
const PREVIEW_CARD_REACQUIRE_DISTANCE_RATIO = 0.12;

type RetainedPreviewDetection = {
  barcode: DetectedBarcode;
  lastSeenAtMs: number;
};

type CurrentPreviewIndex = {
  ids: Set<string>;
  logicalKeys: Map<string, DetectedBarcode[]>;
};

export const ScannerStage = React.memo(function ScannerStage({
  frame,
  detections,
  decision,
  source = 'camera',
  selectedId,
  onSelect,
  stageWidth = DEFAULT_STAGE_WIDTH,
  stageHeight = DEFAULT_STAGE_HEIGHT,
  reservedInsets,
  cameraLive = source !== 'camera',
  showCameraStateLabel = false,
  showWaitingState = false,
  showDetectionOverlays = true,
  showPreviewCards = true,
  cardLabelPrefix,
  selectedCardLabelPrefix,
}: Props) {
  const previousCardRectsRef = React.useRef<PreviewCardRectCache>({});
  const frameWidth = frame?.frameSize.width || stageWidth;
  const frameHeight = frame?.frameSize.height || stageHeight;
  const previewImageAgeMs = frame?.previewImageBase64
    ? Math.max(
        0,
        Date.now() - (frame.previewImageTimestampMs ?? frame.timestampMs),
      )
    : Number.POSITIVE_INFINITY;
  const analyzerPreviewUri = React.useMemo(
    () =>
      frame?.previewImageBase64
        ? `data:${frame.previewImageMimeType ?? 'image/jpeg'};base64,${
            frame.previewImageBase64
          }`
        : null,
    [frame?.previewImageBase64, frame?.previewImageMimeType],
  );
  const analyzerPreviewFresh =
    Platform.OS !== 'android' &&
    source === 'camera' &&
    cameraLive &&
    Boolean(analyzerPreviewUri) &&
    previewImageAgeMs <= ANALYZER_PREVIEW_STALE_MS;
  const previewDetectionGeometryKey = `${source}|${
    frame?.rotationDegrees ?? 0
  }|${frameWidth}x${frameHeight}`;
  const previewDetections = usePreviewCardDetections(
    detections,
    frame?.timestampMs,
    previewDetectionGeometryKey,
    { width: frameWidth, height: frameHeight },
  );
  const stageSize = React.useMemo<StageSize>(
    () => ({ width: stageWidth, height: stageHeight }),
    [stageHeight, stageWidth],
  );
  const shellStyle = React.useMemo(
    () => buildShellStyle(stageWidth, stageHeight),
    [stageHeight, stageWidth],
  );
  const mappedDetections = React.useMemo(
    () =>
      mapDetectionsToStage(
        previewDetections,
        { width: frameWidth, height: frameHeight },
        stageSize,
      ),
    [frameHeight, frameWidth, previewDetections, stageSize],
  );
  const selectableMappedDetections = React.useMemo(
    () => mappedDetections.filter(item => hasBarcodePayload(item.barcode)),
    [mappedDetections],
  );
  const previewCardPreviousRects = React.useMemo(
    () => resolvePreviewCardPreviousRects(
      selectableMappedDetections,
      previousCardRectsRef.current,
    ),
    [selectableMappedDetections],
  );
  const previewCards = React.useMemo(
    () =>
      layoutPreviewCards(
        selectableMappedDetections,
        stageSize,
        selectedId,
        reservedInsets,
        previewCardPreviousRects,
      ),
    [
      previewCardPreviousRects,
      reservedInsets,
      selectedId,
      selectableMappedDetections,
      stageSize,
    ],
  );
  React.useEffect(() => {
    const nextRects: PreviewCardRectCache = {};
    const logicalKeyCounts = new Map<string, number>();

    for (const card of previewCards) {
      const logicalKey = buildLogicalBarcodeKey(card.barcode);
      logicalKeyCounts.set(logicalKey, (logicalKeyCounts.get(logicalKey) ?? 0) + 1);
    }

    for (const card of previewCards) {
      const logicalKey = buildLogicalBarcodeKey(card.barcode);
      nextRects[card.barcode.id] = card.rect;
      if (logicalKeyCounts.get(logicalKey) === 1) {
        nextRects[logicalKey] = card.rect;
      }
    }

    previousCardRectsRef.current = nextRects;
  }, [previewCards]);

  const handleStagePress = React.useCallback(
    (event: { nativeEvent: { locationX: number; locationY: number } }) => {
      const barcode = hitTestStageDetections(selectableMappedDetections, {
        x: event.nativeEvent.locationX,
        y: event.nativeEvent.locationY,
      });

      if (barcode) {
        onSelect(barcode);
      }
    },
    [onSelect, selectableMappedDetections],
  );

  return (
    <View style={styles.stage}>
      <View style={[styles.cameraShell, shellStyle]}>
        {Platform.OS === 'android' && source === 'camera' ? (
          <HebarcodeScannerView style={StyleSheet.absoluteFill} />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.placeholderPreview]} />
        )}
        {analyzerPreviewFresh && analyzerPreviewUri ? (
          <>
            <Image
              accessibilityIgnoresInvertColors
              fadeDuration={0}
              resizeMode="cover"
              source={{ uri: analyzerPreviewUri }}
              style={styles.analyzerPreviewImage}
            />
            {showCameraStateLabel ? (
              <Text style={styles.analyzerPreviewLabel}>ANALYZER OBRAZ</Text>
            ) : null}
          </>
        ) : null}
        {showWaitingState &&
        source === 'camera' &&
        !cameraLive &&
        !analyzerPreviewFresh ? (
          <View pointerEvents="none" style={styles.waitingPreviewOverlay}>
            <Text style={styles.waitingPreviewTitle}>ČEKÁM NA OBRAZ</Text>
            <Text style={styles.waitingPreviewText}>
              native preview zůstává odkrytý
            </Text>
          </View>
        ) : null}

        <Pressable
          accessibilityLabel="Skenovací plocha"
          accessibilityRole="button"
          onPress={handleStagePress}
          style={StyleSheet.absoluteFill}
        >
          {showCameraStateLabel ? (
            <Text style={styles.cameraLabel}>
              {source === 'camera' ? (cameraLive ? 'LIVE' : 'WAIT') : 'SAMPLE'}
            </Text>
          ) : null}
          <View pointerEvents="none" style={styles.scanGuide}>
            <View style={styles.scanGuideCornerTopLeft} />
            <View style={styles.scanGuideCornerTopRight} />
            <View style={styles.scanGuideCornerBottomLeft} />
            <View style={styles.scanGuideCornerBottomRight} />
          </View>
          {decision ? (
            <View
              accessibilityLiveRegion="polite"
              pointerEvents="none"
              style={[
                styles.decisionBadge,
                buildDecisionBadgeStyle(decision.status),
              ]}
            >
              <Text style={styles.decisionBadgeText}>{decision.message}</Text>
            </View>
          ) : null}
          {showDetectionOverlays ? (
            <Svg
              height={stageHeight}
              pointerEvents="none"
              style={StyleSheet.absoluteFill}
              width={stageWidth}
            >
              {mappedDetections.map(item => (
                <React.Fragment key={item.barcode.id}>
                  {item.barcode.id === selectedId ? (
                    <Polygon
                      fill="rgba(255,176,0,0.10)"
                      points={item.polygonPoints}
                      stroke="rgba(255,208,102,0.45)"
                      strokeWidth={10}
                    />
                  ) : null}
                  <Polygon
                    {...buildDetectionPolygonStyle(item.barcode, selectedId)}
                    points={item.polygonPoints}
                  />
                </React.Fragment>
              ))}

              {showPreviewCards
                ? previewCards.map(card => (
                    <Line
                      key={`${card.barcode.id}-leader`}
                      opacity={0.85}
                      stroke={card.selected ? '#ffb000' : '#95f3bb'}
                      strokeWidth={card.selected ? 2.5 : 1.5}
                      x1={card.leaderStart.x}
                      x2={card.leaderEnd.x}
                      y1={card.leaderStart.y}
                      y2={card.leaderEnd.y}
                    />
                  ))
                : null}
            </Svg>
          ) : null}
        </Pressable>

        {showPreviewCards
          ? previewCards.map(card => {
              const priority = resolvePreviewCardPriority(card.barcode, decision);
              const formatLabel = buildPreviewFormatLabel(
                card.barcode.format,
                card.selected,
                cardLabelPrefix,
                selectedCardLabelPrefix,
                priority,
              );

              return (
                <Pressable
                  accessibilityLabel={`${formatLabel} ${card.previewText}`}
                  accessibilityRole="button"
                  key={`${card.barcode.id}-card`}
                  onPress={() => onSelect(card.barcode)}
                  style={[styles.previewCard, buildCardStyle(card, priority)]}
                >
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.previewFormat,
                      card.selected ? styles.previewFormatSelected : null,
                    ]}
                  >
                    {formatLabel}
                  </Text>
                  <Text numberOfLines={1} style={styles.previewText}>
                    {card.previewText}
                  </Text>
                </Pressable>
              );
            })
          : null}
      </View>
    </View>
  );
});

type PreviewCardPriority = 'primary' | 'ambiguous' | 'secondary' | 'neutral';

function buildPreviewFormatLabel(
  format: string,
  selected: boolean,
  cardLabelPrefix?: string,
  selectedCardLabelPrefix?: string,
  priority: PreviewCardPriority = 'neutral',
): string {
  const priorityLabel = buildPreviewPriorityLabel(priority);
  const baseLabel = selected
    ? `${selectedCardLabelPrefix ?? 'VYBRÁNO'} · ${format}`
    : cardLabelPrefix
    ? `${cardLabelPrefix} · ${format}`
    : format;

  return priorityLabel ? `${baseLabel} · ${priorityLabel}` : baseLabel;
}

function buildPreviewPriorityLabel(priority: PreviewCardPriority): string | null {
  switch (priority) {
    case 'primary':
      return 'HLAVNÍ CÍL';
    case 'ambiguous':
      return 'NEJISTÝ VÝBĚR';
    case 'secondary':
      return 'NIŽŠÍ PRIORITA';
    default:
      return null;
  }
}

function resolvePreviewCardPriority(
  barcode: DetectedBarcode,
  decision?: ScanDecisionResult,
): PreviewCardPriority {
  if (!decision || decision.ranked.length === 0) {
    return 'neutral';
  }

  if (decision.primary?.id === barcode.id) {
    return decision.status === 'ambiguous' ? 'ambiguous' : 'primary';
  }

  if (decision.ambiguousCandidates.some(candidate => candidate.barcode.id === barcode.id)) {
    return 'ambiguous';
  }

  if (decision.ranked.some(candidate => candidate.barcode.id === barcode.id)) {
    return 'secondary';
  }

  return 'neutral';
}

function resolvePreviewCardPreviousRects(
  mappedDetections: ReturnType<typeof mapDetectionsToStage>,
  previousRects: PreviewCardRectCache,
): PreviewCardRectCache {
  const nextRects: PreviewCardRectCache = { ...previousRects };
  const logicalKeyCounts = new Map<string, number>();

  for (const item of mappedDetections) {
    const logicalKey = buildLogicalBarcodeKey(item.barcode);
    logicalKeyCounts.set(logicalKey, (logicalKeyCounts.get(logicalKey) ?? 0) + 1);
  }

  for (const item of mappedDetections) {
    if (nextRects[item.barcode.id]) {
      continue;
    }

    const logicalKey = buildLogicalBarcodeKey(item.barcode);
    const previousRect = previousRects[logicalKey];
    if (previousRect && logicalKeyCounts.get(logicalKey) === 1) {
      nextRects[item.barcode.id] = previousRect;
    }
  }

  return nextRects;
}

function usePreviewCardDetections(
  detections: DetectedBarcode[],
  frameTimestampMs: number | undefined,
  geometryKey: string,
  frameSize: StageSize,
): DetectedBarcode[] {
  const retainedDetectionsRef = React.useRef<RetainedPreviewDetection[]>([]);
  const geometryKeyRef = React.useRef<string | null>(null);

  return React.useMemo(() => {
    const now = frameTimestampMs ?? Date.now();
    const previousDetections =
      geometryKeyRef.current === geometryKey ? retainedDetectionsRef.current : [];
    const currentIndex = buildCurrentPreviewIndex(detections);
    const nextDetections: RetainedPreviewDetection[] = detections.map(
      barcode => ({
        barcode,
        lastSeenAtMs: barcode.lastSeenTimestampMs ?? now,
      }),
    );

    for (const retained of previousDetections) {
      if (
        !hasCurrentPreviewMatch(
          retained.barcode,
          currentIndex,
          frameSize,
        ) &&
        now - retained.lastSeenAtMs <= PREVIEW_CARD_GRACE_MS
      ) {
        nextDetections.push(retained);
      }
    }

    geometryKeyRef.current = geometryKey;
    retainedDetectionsRef.current = nextDetections;

    return nextDetections.map(item => item.barcode);
  }, [detections, frameSize, frameTimestampMs, geometryKey]);
}

function buildCurrentPreviewIndex(
  detections: DetectedBarcode[],
): CurrentPreviewIndex {
  const ids = new Set<string>();
  const logicalKeys = new Map<string, DetectedBarcode[]>();

  for (const detection of detections) {
    ids.add(detection.id);

    const logicalKey = buildLogicalBarcodeKey(detection);
    const matchingDetections = logicalKeys.get(logicalKey);

    if (matchingDetections) {
      matchingDetections.push(detection);
    } else {
      logicalKeys.set(logicalKey, [detection]);
    }
  }

  return { ids, logicalKeys };
}

function hasCurrentPreviewMatch(
  retained: DetectedBarcode,
  currentIndex: CurrentPreviewIndex,
  frameSize: StageSize,
): boolean {
  if (currentIndex.ids.has(retained.id)) {
    return true;
  }

  const candidates =
    currentIndex.logicalKeys.get(buildLogicalBarcodeKey(retained)) ?? [];

  for (const candidate of candidates) {
    if (isSamePhysicalPreviewCard(retained, candidate, frameSize)) {
      return true;
    }
  }

  return false;
}

function isSamePhysicalPreviewCard(
  retained: DetectedBarcode,
  current: DetectedBarcode,
  frameSize: StageSize,
): boolean {
  if (retained.points.length === 0 || current.points.length === 0) {
    return true;
  }

  const threshold = resolvePreviewReacquireDistance(frameSize);
  const retainedCenter = barcodeCenter(retained);
  const currentCenter = barcodeCenter(current);
  const deltaX = retainedCenter.x - currentCenter.x;
  const deltaY = retainedCenter.y - currentCenter.y;

  return deltaX * deltaX + deltaY * deltaY <= threshold * threshold;
}

function resolvePreviewReacquireDistance(frameSize: StageSize): number {
  const scaledDistance =
    Math.max(frameSize.width, frameSize.height) *
    PREVIEW_CARD_REACQUIRE_DISTANCE_RATIO;

  return Math.max(
    PREVIEW_CARD_REACQUIRE_MIN_DISTANCE,
    Math.min(scaledDistance, PREVIEW_CARD_REACQUIRE_MAX_DISTANCE),
  );
}

function barcodeCenter(barcode: DetectedBarcode): { x: number; y: number } {
  if (barcode.points.length === 0) {
    return { x: 0, y: 0 };
  }

  const sums = barcode.points.reduce(
    (acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }),
    { x: 0, y: 0 },
  );

  return {
    x: sums.x / barcode.points.length,
    y: sums.y / barcode.points.length,
  };
}

function buildShellStyle(width: number, height: number) {
  return {
    width,
    height,
  } as const;
}

function buildDetectionPolygonStyle(
  barcode: DetectedBarcode,
  selectedId?: string,
) {
  if (barcode.id === selectedId) {
    return {
      fill: 'rgba(255,176,0,0.18)',
      stroke: '#ffb000',
      strokeWidth: 3,
    } as const;
  }

  if (!hasBarcodePayload(barcode)) {
    return {
      fill: 'rgba(125,226,255,0.035)',
      stroke: 'rgba(125,226,255,0.38)',
      strokeDasharray: '7 7',
      strokeWidth: 1.5,
    } as const;
  }

  if (barcode.trackingState === 'memory') {
    return {
      fill: 'rgba(125,226,255,0.10)',
      stroke: '#7de2ff',
      strokeWidth: 2,
    } as const;
  }

  return {
    fill: 'rgba(51,209,122,0.10)',
    stroke: '#33d17a',
    strokeWidth: 2,
  } as const;
}

function buildCardStyle(
  card: ReturnType<typeof layoutPreviewCards>[number],
  priority: PreviewCardPriority = 'neutral',
) {
  const memory = card.barcode.trackingState === 'memory';
  const primary = priority === 'primary';
  const ambiguous = priority === 'ambiguous';
  const secondary = priority === 'secondary';

  return {
    left: card.rect.left,
    top: card.rect.top,
    width: card.rect.width,
    height: card.rect.height,
    opacity: secondary ? 0.66 : 1,
    borderColor: card.selected
      ? 'rgba(255,176,0,0.88)'
      : primary
      ? 'rgba(149,243,187,0.96)'
      : ambiguous
      ? 'rgba(255,207,102,0.86)'
      : memory
      ? 'rgba(125,226,255,0.76)'
      : 'rgba(149,243,187,0.72)',
    backgroundColor: card.selected
      ? 'rgba(41,31,13,0.95)'
      : primary
      ? 'rgba(10,64,38,0.94)'
      : ambiguous
      ? 'rgba(91,59,10,0.92)'
      : memory
      ? 'rgba(11,31,39,0.93)'
      : 'rgba(18,24,33,0.92)',
  } as const;
}

function buildDecisionBadgeStyle(status: ScanDecisionResult['status']) {
  switch (status) {
    case 'ready':
      return styles.decisionBadgeReady;
    case 'ambiguous':
      return styles.decisionBadgeAmbiguous;
    case 'duplicateSuppressed':
      return styles.decisionBadgeDuplicate;
    default:
      return styles.decisionBadgeNeutral;
  }
}

const styles = StyleSheet.create({
  stage: {
    flex: 1,
  },
  cameraShell: {
    flex: 1,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#0f1218',
  },
  placeholderPreview: {
    backgroundColor: '#16202d',
  },
  analyzerPreviewImage: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: '#070b10',
  },
  analyzerPreviewLabel: {
    position: 'absolute',
    top: 18,
    right: 16,
    color: '#06100c',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.6,
    zIndex: 2,
    backgroundColor: 'rgba(149,243,187,0.88)',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 8,
  },
  waitingPreviewOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(126, 242, 202, 0.18)',
  },
  waitingPreviewTitle: {
    color: '#e8fbff',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
    backgroundColor: 'rgba(7,11,17,0.72)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  waitingPreviewText: {
    marginTop: 6,
    color: 'rgba(232,251,255,0.84)',
    fontSize: 11,
    fontWeight: '700',
    backgroundColor: 'rgba(7,11,17,0.58)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  cameraLabel: {
    position: 'absolute',
    top: 18,
    left: 16,
    color: '#e8fbff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
    zIndex: 1,
    backgroundColor: 'rgba(7,11,17,0.42)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(190,244,255,0.12)',
  },
  scanGuide: {
    position: 'absolute',
    left: '16%',
    right: '16%',
    top: '21%',
    height: 140,
    borderRadius: 10,
    opacity: 0.94,
  },
  scanGuideCornerTopLeft: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 28,
    height: 28,
    borderLeftWidth: 2,
    borderTopWidth: 2,
    borderColor: 'rgba(126,242,202,0.82)',
  },
  scanGuideCornerTopRight: {
    position: 'absolute',
    right: 0,
    top: 0,
    width: 28,
    height: 28,
    borderRightWidth: 2,
    borderTopWidth: 2,
    borderColor: 'rgba(126,242,202,0.82)',
  },
  scanGuideCornerBottomLeft: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    width: 28,
    height: 28,
    borderLeftWidth: 2,
    borderBottomWidth: 2,
    borderColor: 'rgba(126,242,202,0.82)',
  },
  scanGuideCornerBottomRight: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 28,
    height: 28,
    borderRightWidth: 2,
    borderBottomWidth: 2,
    borderColor: 'rgba(126,242,202,0.82)',
  },
  decisionBadge: {
    position: 'absolute',
    alignSelf: 'center',
    top: '52%',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 7,
    zIndex: 3,
  },
  decisionBadgeNeutral: {
    backgroundColor: 'rgba(7,11,17,0.70)',
    borderColor: 'rgba(190,244,255,0.28)',
  },
  decisionBadgeReady: {
    backgroundColor: 'rgba(10,64,38,0.84)',
    borderColor: 'rgba(149,243,187,0.72)',
  },
  decisionBadgeAmbiguous: {
    backgroundColor: 'rgba(91,59,10,0.88)',
    borderColor: 'rgba(255,207,102,0.72)',
  },
  decisionBadgeDuplicate: {
    backgroundColor: 'rgba(48,58,75,0.88)',
    borderColor: 'rgba(125,226,255,0.62)',
  },
  decisionBadgeText: {
    color: '#eff6ff',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  previewCard: {
    position: 'absolute',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 6,
    shadowColor: '#020407',
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  previewFormat: {
    color: '#95f3bb',
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 2,
  },
  previewFormatSelected: {
    color: '#ffcf66',
  },
  previewText: {
    color: '#eff6ff',
    fontSize: 11,
    lineHeight: 14,
  },
});
