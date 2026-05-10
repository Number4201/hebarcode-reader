export type ScannerRuntimeId = 'camera-x' | 'datawedge' | 'honeywell';

export type ScannerRuntimeDescriptor = {
  id: ScannerRuntimeId;
  label: string;
  description: string;
  implemented: boolean;
};

export const DEFAULT_SCANNER_RUNTIME_ID: ScannerRuntimeId = 'camera-x';

export const SCANNER_RUNTIME_DESCRIPTORS: Record<
  ScannerRuntimeId,
  ScannerRuntimeDescriptor
> = {
  'camera-x': {
    id: 'camera-x',
    label: 'CameraX',
    description: 'Built-in Android camera scanner runtime.',
    implemented: true,
  },
  datawedge: {
    id: 'datawedge',
    label: 'Zebra DataWedge',
    description: 'Enterprise hardware scanner intent adapter boundary.',
    implemented: false,
  },
  honeywell: {
    id: 'honeywell',
    label: 'Honeywell',
    description: 'Enterprise hardware scanner SDK adapter boundary.',
    implemented: false,
  },
};

export function normalizeScannerRuntimeId(
  id: string | null | undefined,
): ScannerRuntimeId {
  return isScannerRuntimeId(id) ? id : DEFAULT_SCANNER_RUNTIME_ID;
}

export function getScannerRuntimeDescriptor(
  id: ScannerRuntimeId,
): ScannerRuntimeDescriptor {
  return SCANNER_RUNTIME_DESCRIPTORS[id];
}

export function isImplementedScannerRuntime(id: ScannerRuntimeId): boolean {
  return getScannerRuntimeDescriptor(id).implemented;
}

function isScannerRuntimeId(id: unknown): id is ScannerRuntimeId {
  return (
    typeof id === 'string' &&
    Object.prototype.hasOwnProperty.call(SCANNER_RUNTIME_DESCRIPTORS, id)
  );
}
