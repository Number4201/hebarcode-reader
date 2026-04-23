import React from 'react';
import {StyleSheet, View} from 'react-native';

type Props = {
  size?: number;
  compact?: boolean;
};

export function AppLogo({size = 56, compact = false}: Props) {
  const shellSize = size;
  const radius = shellSize * (compact ? 0.32 : 0.36);
  const barWidth = Math.max(3, Math.round(shellSize * 0.08));
  const dotSize = Math.max(6, Math.round(shellSize * 0.16));

  return (
    <View
      style={[
        styles.shell,
        {
          width: shellSize,
          height: shellSize,
          borderRadius: radius,
        },
      ]}>
      <View style={styles.glow} />
      <View style={styles.barcodeCluster}>
        <View style={[styles.bar, {width: barWidth, height: shellSize * 0.46}]} />
        <View style={[styles.bar, styles.tallBar, {width: barWidth, height: shellSize * 0.58}]} />
        <View style={[styles.bar, {width: barWidth, height: shellSize * 0.4}]} />
      </View>
      <View
        style={[
          styles.dot,
          {
            width: dotSize,
            height: dotSize,
            borderRadius: dotSize / 2,
          },
        ]}
      />
      <View style={[styles.scanLine, {top: shellSize * 0.24}]} />
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    overflow: 'hidden',
    backgroundColor: 'rgba(7, 16, 23, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(148, 221, 255, 0.18)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  glow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(54, 209, 255, 0.08)',
  },
  barcodeCluster: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
  },
  bar: {
    borderRadius: 999,
    backgroundColor: '#d8f6ff',
    opacity: 0.95,
  },
  tallBar: {
    backgroundColor: '#7ef2ca',
  },
  dot: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    backgroundColor: '#ffc76b',
  },
  scanLine: {
    position: 'absolute',
    left: 10,
    right: 10,
    height: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(126, 242, 202, 0.9)',
  },
});
