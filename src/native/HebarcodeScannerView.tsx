import {requireNativeComponent, type ViewProps} from 'react-native';

export type HebarcodeScannerViewProps = ViewProps;

export const HebarcodeScannerView =
  requireNativeComponent<HebarcodeScannerViewProps>('HebarcodeScannerView');
