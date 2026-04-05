import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {HebarcodeScannerView} from '../native/HebarcodeScannerView';
import type {BarcodeDetectionsFrame, DetectedBarcode, Point} from '../scanner/types';

type Props = {
  frame: BarcodeDetectionsFrame | null;
  detections: DetectedBarcode[];
  selectedId?: string;
  onSelect: (barcode: DetectedBarcode) => void;
};

const STAGE_WIDTH = 360;

export function ScannerStage({frame, detections, selectedId, onSelect}: Props) {
  const frameWidth = frame?.frameSize.width || 16;
  const frameHeight = frame?.frameSize.height || 9;
  const aspectRatio = frameWidth / frameHeight;
  const stageHeight = STAGE_WIDTH / aspectRatio;

  return (
    <View style={styles.stage}>
      <View style={[styles.cameraShell, {width: STAGE_WIDTH, height: stageHeight}]}> 
        <HebarcodeScannerView style={StyleSheet.absoluteFill} />
        <Text style={styles.cameraLabel}>Live camera preview</Text>
        {detections.map(barcode => {
          const polygon = barcode.points.map(point => mapToStage(point, frameWidth, frameHeight, STAGE_WIDTH, stageHeight));
          const left = Math.min(...polygon.map(point => point.x));
          const top = Math.min(...polygon.map(point => point.y));
          const right = Math.max(...polygon.map(point => point.x));
          const bottom = Math.max(...polygon.map(point => point.y));
          const selected = barcode.id === selectedId;

          return (
            <Pressable
              accessibilityRole="button"
              key={barcode.id}
              onPress={() => onSelect(barcode)}
              style={[
                styles.box,
                {
                  left,
                  top,
                  width: Math.max(36, right - left),
                  height: Math.max(28, bottom - top),
                  borderColor: selected ? '#ffb000' : '#33d17a',
                  backgroundColor: selected ? 'rgba(255,176,0,0.14)' : 'rgba(51,209,122,0.10)',
                },
              ]}>
              <Text style={styles.boxText}>{barcode.format}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function mapToStage(
  point: Point,
  frameWidth: number,
  frameHeight: number,
  stageWidth: number,
  stageHeight: number,
): Point {
  return {
    x: (point.x / Math.max(frameWidth, 1)) * stageWidth,
    y: (point.y / Math.max(frameHeight, 1)) * stageHeight,
  };
}

const styles = StyleSheet.create({
  stage: {
    alignItems: 'center',
  },
  cameraShell: {
    borderRadius: 18,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#0f1218',
    borderWidth: 1,
    borderColor: '#2f3644',
  },
  cameraLabel: {
    position: 'absolute',
    top: 12,
    left: 12,
    color: '#dbe4f5',
    fontSize: 12,
    zIndex: 1,
    backgroundColor: 'rgba(15,18,24,0.45)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  box: {
    position: 'absolute',
    borderWidth: 2,
    borderRadius: 12,
    padding: 6,
  },
  boxText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
})
