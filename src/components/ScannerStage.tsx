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
  type StageSize,
} from '../scanner/overlay';
import type {
  BarcodeDetectionsFrame,
  DetectedBarcode,
  DetectionSource,
} from '../scanner/types';

type Props = {
  frame: BarcodeDetectionsFrame | null;
  detections: DetectedBarcode[];
  source?: DetectionSource;
  selectedId?: string;
  onSelect: (barcode: DetectedBarcode) => void;
  stageWidth?: number;
  stageHeight?: number;
  reservedInsets?: StageInsets;
  cameraLive?: boolean;
};

const DEFAULT_STAGE_WIDTH = 360;
const DEFAULT_STAGE_HEIGHT = 640;
const ANALYZER_PREVIEW_STALE_MS = 2500;

export const ScannerStage = React.memo(function ScannerStage({
  frame,
  detections,
  source = 'camera',
  selectedId,
  onSelect,
  stageWidth = DEFAULT_STAGE_WIDTH,
  stageHeight = DEFAULT_STAGE_HEIGHT,
  reservedInsets,
  cameraLive = source !== 'camera',
}: Props) {
  const frameWidth = frame?.frameSize.width || stageWidth;
  const frameHeight = frame?.frameSize.height || stageHeight;
  const previewImageAgeMs =
    frame?.previewImageBase64
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
        detections,
        { width: frameWidth, height: frameHeight },
        stageSize,
      ),
    [detections, frameHeight, frameWidth, stageSize],
  );
  const previewCards = React.useMemo(
    () =>
      layoutPreviewCards(
        mappedDetections,
        stageSize,
        selectedId,
        reservedInsets,
      ),
    [mappedDetections, reservedInsets, selectedId, stageSize],
  );

  const handleStagePress = React.useCallback(
    (event: { nativeEvent: { locationX: number; locationY: number } }) => {
      const barcode = hitTestStageDetections(mappedDetections, {
        x: event.nativeEvent.locationX,
        y: event.nativeEvent.locationY,
      });

      if (barcode) {
        onSelect(barcode);
      }
    },
    [mappedDetections, onSelect],
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
            <Text style={styles.analyzerPreviewLabel}>ANALYZER OBRAZ</Text>
          </>
        ) : null}
        {source === 'camera' && !cameraLive && !analyzerPreviewFresh ? (
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
          <Text style={styles.cameraLabel}>
            {source === 'camera' ? (cameraLive ? 'LIVE' : 'WAIT') : 'SAMPLE'}
          </Text>
          <View pointerEvents="none" style={styles.scanGuide}>
            <View style={styles.scanGuideCornerTopLeft} />
            <View style={styles.scanGuideCornerTopRight} />
            <View style={styles.scanGuideCornerBottomLeft} />
            <View style={styles.scanGuideCornerBottomRight} />
          </View>
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
                  fill={
                    item.barcode.id === selectedId
                      ? 'rgba(255,176,0,0.18)'
                      : 'rgba(51,209,122,0.10)'
                  }
                  points={item.polygonPoints}
                  stroke={
                    item.barcode.id === selectedId ? '#ffb000' : '#33d17a'
                  }
                  strokeWidth={item.barcode.id === selectedId ? 3 : 2}
                />
              </React.Fragment>
            ))}

            {previewCards.map(card => (
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
            ))}
          </Svg>
        </Pressable>

        {previewCards.map(card => (
          <Pressable
            accessibilityLabel={`${card.barcode.format} ${card.previewText}`}
            accessibilityRole="button"
            key={`${card.barcode.id}-card`}
            onPress={() => onSelect(card.barcode)}
            style={[styles.previewCard, buildCardStyle(card)]}
          >
            <Text
              style={[
                styles.previewFormat,
                card.selected ? styles.previewFormatSelected : null,
              ]}
            >
              {card.barcode.format}
            </Text>
            <Text numberOfLines={2} style={styles.previewText}>
              {card.previewText}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
});

function buildShellStyle(width: number, height: number) {
  return {
    width,
    height,
  } as const;
}

function buildCardStyle(card: ReturnType<typeof layoutPreviewCards>[number]) {
  return {
    left: card.rect.left,
    top: card.rect.top,
    width: card.rect.width,
    minHeight: card.rect.height,
    borderColor: 'rgba(149,243,187,0.72)',
    backgroundColor: 'rgba(18,24,33,0.92)',
  } as const;
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
    ...StyleSheet.absoluteFillObject,
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
    ...StyleSheet.absoluteFillObject,
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
    left: '18%',
    right: '18%',
    top: '28%',
    height: 150,
    borderRadius: 8,
    opacity: 0.66,
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
  previewCard: {
    position: 'absolute',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
    shadowColor: '#020407',
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  previewFormat: {
    color: '#95f3bb',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 4,
  },
  previewFormatSelected: {
    color: '#95f3bb',
  },
  previewText: {
    color: '#eff6ff',
    fontSize: 12,
    lineHeight: 16,
  },
});
