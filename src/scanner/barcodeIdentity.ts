import type { DetectedBarcode } from './types';

export function normalizeBarcodeFormat(format: string): string {
  const compact = format.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

  switch (compact) {
    case 'CODE128':
      return 'CODE_128';
    case 'CODE39':
      return 'CODE_39';
    case 'CODE93':
      return 'CODE_93';
    case 'EAN13':
      return 'EAN_13';
    case 'EAN8':
      return 'EAN_8';
    case 'UPCA':
      return 'UPC_A';
    case 'UPCE':
      return 'UPC_E';
    case 'QRCODE':
      return 'QR_CODE';
    case 'PDF417':
      return 'PDF_417';
    case 'DATAMATRIX':
      return 'DATA_MATRIX';
    default:
      return compact || 'UNKNOWN';
  }
}

export function resolveBarcodePayload(barcode: DetectedBarcode): string {
  return barcode.text?.trim() || barcode.rawBytesBase64 || '<binary payload>';
}

export function hasBarcodePayload(barcode: DetectedBarcode): boolean {
  return Boolean(barcode.text?.trim() || barcode.rawBytesBase64);
}

export function buildLogicalBarcodeKey(barcode: DetectedBarcode): string {
  return `${normalizeBarcodeFormat(barcode.format)}|${resolveBarcodePayload(
    barcode,
  )}`;
}
