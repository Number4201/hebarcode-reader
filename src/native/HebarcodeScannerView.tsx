import React from 'react';
import {Platform, View, requireNativeComponent, type ViewProps} from 'react-native';

export type HebarcodeScannerViewProps = ViewProps;

const NativeHebarcodeScannerView =
  Platform.OS === 'android'
    ? requireNativeComponent<HebarcodeScannerViewProps>('HebarcodeScannerView')
    : null;

export function HebarcodeScannerView(props: HebarcodeScannerViewProps) {
  if (!NativeHebarcodeScannerView) {
    return <View {...props} />;
  }

  return <NativeHebarcodeScannerView {...props} />;
}
