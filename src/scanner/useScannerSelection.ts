import { useMemo, useState } from 'react';
import { createSelectionLock, resolveSelectedBarcode } from './selection';
import type { DetectedBarcode, SelectionLock } from './types';

export function useScannerSelection(detections: DetectedBarcode[]) {
  const [selectionLock, setSelectionLock] = useState<SelectionLock | null>(
    null,
  );

  const selectedBarcode = useMemo(() => {
    if (!selectionLock) {
      return null;
    }

    return (
      resolveSelectedBarcode(detections, selectionLock) ?? selectionLock.barcode
    );
  }, [detections, selectionLock]);

  function selectBarcode(barcode: DetectedBarcode) {
    setSelectionLock(createSelectionLock(barcode));
  }

  function clearSelection() {
    setSelectionLock(null);
  }

  return {
    selectionLock,
    selectedBarcode,
    selectBarcode,
    clearSelection,
  };
}
