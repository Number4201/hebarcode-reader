import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import type {DetectedBarcode} from '../scanner/types';

type Props = {
  detections: DetectedBarcode[];
  selectedId?: string;
  onSelect: (barcode: DetectedBarcode) => void;
};

export function PrototypeOverlay({detections, selectedId, onSelect}: Props) {
  return (
    <View style={styles.stage}>
      <View style={styles.cameraPlaceholder}>
        <Text style={styles.cameraLabel}>Prototype camera plane</Text>
        {detections.map(barcode => {
          const [topLeft, topRight, bottomRight, bottomLeft] = barcode.points;
          const width = topRight.x - topLeft.x;
          const height = bottomLeft.y - topLeft.y;
          const selected = barcode.id === selectedId;

          return (
            <Pressable
              accessibilityRole="button"
              key={barcode.id}
              onPress={() => onSelect(barcode)}
              style={[
                styles.box,
                {
                  left: topLeft.x,
                  top: topLeft.y,
                  width,
                  height,
                  borderColor: selected ? '#ffb000' : '#33d17a',
                  backgroundColor: selected ? 'rgba(255,176,0,0.15)' : 'rgba(51,209,122,0.10)',
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

const styles = StyleSheet.create({
  stage: {
    alignItems: 'center',
  },
  cameraPlaceholder: {
    width: 360,
    height: 320,
    borderRadius: 18,
    backgroundColor: '#0f1218',
    borderWidth: 1,
    borderColor: '#2f3644',
    position: 'relative',
    overflow: 'hidden',
  },
  cameraLabel: {
    position: 'absolute',
    top: 12,
    left: 12,
    color: '#dbe4f5',
    fontSize: 12,
    zIndex: 1,
  },
  box: {
    position: 'absolute',
    borderWidth: 2,
    borderRadius: 12,
    justifyContent: 'flex-start',
    padding: 6,
  },
  boxText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
});
