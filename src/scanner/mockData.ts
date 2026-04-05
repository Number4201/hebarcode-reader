import type {DetectedBarcode} from './types';
import {buildBarcodeId} from './selection';

export const MOCK_BARCODES: DetectedBarcode[] = [
  {
    id: buildBarcodeId('QR_CODE', 'https://example.com/alpha', 0),
    format: 'QR_CODE',
    text: 'https://example.com/alpha',
    contentType: 'TEXT',
    points: [
      {x: 34, y: 70},
      {x: 144, y: 70},
      {x: 144, y: 180},
      {x: 34, y: 180},
    ],
  },
  {
    id: buildBarcodeId('CODE_128', 'SKU-HEB-2026-001', 1),
    format: 'CODE_128',
    text: 'SKU-HEB-2026-001',
    contentType: 'TEXT',
    points: [
      {x: 178, y: 92},
      {x: 334, y: 92},
      {x: 334, y: 162},
      {x: 178, y: 162},
    ],
  },
  {
    id: buildBarcodeId('EAN_13', '8591234567890', 2),
    format: 'EAN_13',
    text: '8591234567890',
    contentType: 'TEXT',
    points: [
      {x: 92, y: 214},
      {x: 314, y: 214},
      {x: 314, y: 278},
      {x: 92, y: 278},
    ],
  },
];
