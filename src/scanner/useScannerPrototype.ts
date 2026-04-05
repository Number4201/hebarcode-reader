import {useMemo, useState} from 'react';
import {centroid, resolveSelectedBarcode} from './selection';
import type {DetectedBarcode, SelectionLock} from './types';

export function useScannerPrototype(detections: DetectedBarcode[]) {
  const [selectionLock, setSelectionLock] = useState<SelectionLock | null>(null);

  const selectedBarcode = useMemo(
    () => resolveSelectedBarcode(detections, selectionLock),
    [detections, selectionLock],
  );

  function selectBarcode(barcode: DetectedBarcode) {
    setSelectionLock({
      format: barcode.format,
      text: barcode.text,
      centroid: centroid(barcode.points),
    });
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
