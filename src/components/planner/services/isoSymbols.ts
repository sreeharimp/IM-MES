import type { jsPDF } from 'jspdf';

export interface IsoSymbolsConfig {
  showLot: boolean;                // ISO 15223-1 5.1.5 (LOT in box)
  showRef: boolean;                // ISO 15223-1 5.1.6 (REF in box)
  showSn: boolean;                 // ISO 15223-1 5.1.7 (SN in box)
  showMd: boolean;                 // ISO 15223-1 5.7.7 (MD in box - Medical Device)
  showManufacturer: boolean;       // ISO 15223-1 5.1.1 (Factory symbol)
  showMfgDate: boolean;            // ISO 15223-1 5.1.3 (Date of manufacture)
  showExpiryDate: boolean;         // ISO 15223-1 5.1.4 (Hourglass use-by date)
  showSingleUse: boolean;          // ISO 15223-1 5.4.2 (Do not re-use 2 in slashed circle)
  showSterile: boolean;            // ISO 15223-1 5.2.4 (STERILE | R / EO / STEAM)
  sterileType?: 'R' | 'EO' | 'STEAM' | 'NON-STERILE';
  showConsultIfu: boolean;         // ISO 15223-1 5.4.3 (Consult instructions for use)
  showCaution: boolean;            // ISO 15223-1 5.4.4 (Caution triangle)
  showKeepDry: boolean;            // ISO 15223-1 5.3.4 (Umbrella keep dry)
  showKeepAwaySunlight: boolean;   // ISO 15223-1 5.3.2 (Sunlight protection)
  showTempLimit: boolean;          // ISO 15223-1 5.3.7 (Temperature limit thermometer)
  tempMin?: string;
  tempMax?: string;
  showCeMark: boolean;             // CE mark
  notifiedBodyNumber?: string;     // e.g. 0123
}

export interface LabelTemplateConfig {
  id?: string;
  name: string;
  paper_type_id?: string;
  companyName: string;
  showCompanyName: boolean;
  subtitleText?: string;
  showSubtitle?: boolean;
  productNameSize?: 'small' | 'medium' | 'large';
  showProductCode: boolean;
  productCodeLabel?: string;
  showBatchCode: boolean;
  batchCodeLabel?: string;
  showCaseNumber: boolean;
  caseNumberPrefix?: string;
  showQuantity: boolean;
  quantityLabel?: string;
  showMouldDetails: boolean;
  showQcApproval: boolean;
  qcApprovalText?: string;
  showQrCode: boolean;
  qrCodePosition?: 'right' | 'bottom-right';
  qrSizeMm?: number;
  qrPayloadType?: 'batch-case' | 'json' | 'url';
  isoSymbols: IsoSymbolsConfig;
  customFooterText?: string;
  showFooterText?: boolean;
}

export const DEFAULT_LABEL_TEMPLATE: LabelTemplateConfig = {
  name: 'Default Medical Device Template',
  companyName: 'AGNEY POLYSOFT INDIA PVT LTD',
  showCompanyName: true,
  subtitleText: 'MEDICAL DEVICE COMPONENTS',
  showSubtitle: false,
  productNameSize: 'medium',
  showProductCode: true,
  productCodeLabel: 'REF',
  showBatchCode: true,
  batchCodeLabel: 'LOT',
  showCaseNumber: true,
  caseNumberPrefix: 'CASE NO: #',
  showQuantity: true,
  quantityLabel: 'QTY:',
  showMouldDetails: false,
  showQcApproval: true,
  qcApprovalText: 'QC APPROVED',
  showQrCode: true,
  qrCodePosition: 'right',
  qrSizeMm: 14,
  qrPayloadType: 'batch-case',
  customFooterText: '',
  showFooterText: false,
  isoSymbols: {
    showLot: true,
    showRef: true,
    showSn: false,
    showMd: true,
    showManufacturer: true,
    showMfgDate: true,
    showExpiryDate: false,
    showSingleUse: true,
    showSterile: false,
    sterileType: 'NON-STERILE',
    showConsultIfu: false,
    showCaution: false,
    showKeepDry: true,
    showKeepAwaySunlight: false,
    showTempLimit: false,
    tempMin: '15°C',
    tempMax: '25°C',
    showCeMark: false,
    notifiedBodyNumber: '',
  },
};

/**
 * Draws ISO 15223-1 symbols vectorially onto a jsPDF document with millimetric precision.
 */
export function drawIsoSymbolOnPdf(
  doc: jsPDF,
  symbolKey: string,
  x: number,
  y: number,
  width: number,
  height: number,
  config?: IsoSymbolsConfig
): void {
  doc.setDrawColor(30, 41, 59);
  doc.setTextColor(30, 41, 59);
  doc.setLineWidth(0.18);

  switch (symbolKey) {
    case 'MD': {
      // ISO 15223-1 5.7.7 Medical Device: box with "MD"
      doc.rect(x, y, width, height);
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(width > 6 ? 6 : 4.5);
      doc.text('MD', x + width / 2, y + height * 0.72, { align: 'center' });
      break;
    }
    case 'LOT': {
      // ISO 15223-1 5.1.5 Batch code: box with "LOT"
      doc.rect(x, y, width, height);
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(width > 7 ? 5.5 : 4.2);
      doc.text('LOT', x + width / 2, y + height * 0.72, { align: 'center' });
      break;
    }
    case 'REF': {
      // ISO 15223-1 5.1.6 Catalogue number: box with "REF"
      doc.rect(x, y, width, height);
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(width > 7 ? 5.5 : 4.2);
      doc.text('REF', x + width / 2, y + height * 0.72, { align: 'center' });
      break;
    }
    case 'SN': {
      // ISO 15223-1 5.1.7 Serial number: box with "SN"
      doc.rect(x, y, width, height);
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(width > 6 ? 5.5 : 4.2);
      doc.text('SN', x + width / 2, y + height * 0.72, { align: 'center' });
      break;
    }
    case 'SINGLE_USE': {
      // ISO 15223-1 5.4.2 Do not re-use: circle with "2" slashed
      const r = Math.min(width, height) / 2;
      const cx = x + width / 2;
      const cy = y + height / 2;
      doc.circle(cx, cy, r);
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(r * 2.2);
      doc.text('2', cx, cy + r * 0.35, { align: 'center' });
      // 45-degree slash through circle
      const offset = r * 0.7;
      doc.line(cx - offset, cy + offset, cx + offset, cy - offset);
      break;
    }
    case 'MANUFACTURER': {
      // ISO 15223-1 5.1.1 Manufacturer: factory icon
      const w = width;
      const h = height;
      // Roof with saw teeth and chimney
      doc.line(x, y + h, x, y + h * 0.5);
      doc.line(x, y + h * 0.5, x + w * 0.35, y + h * 0.2);
      doc.line(x + w * 0.35, y + h * 0.2, x + w * 0.35, y + h * 0.45);
      doc.line(x + w * 0.35, y + h * 0.45, x + w * 0.7, y + h * 0.15);
      doc.line(x + w * 0.7, y + h * 0.15, x + w * 0.7, y + h * 0.45);
      doc.line(x + w * 0.7, y + h * 0.45, x + w, y + h * 0.45);
      doc.line(x + w, y + h * 0.45, x + w, y + h);
      doc.line(x + w, y + h, x, y + h);
      break;
    }
    case 'EXPIRY': {
      // ISO 15223-1 5.1.4 Use-by date: Hourglass
      const w = width;
      const h = height;
      doc.line(x, y, x + w, y); // top bar
      doc.line(x, y + h, x + w, y + h); // bottom bar
      doc.line(x, y, x + w, y + h); // diagonal
      doc.line(x + w, y, x, y + h); // diagonal
      break;
    }
    case 'CAUTION': {
      // ISO 15223-1 5.4.4 Caution: Triangle with exclamation
      const cx = x + width / 2;
      doc.line(x, y + height, cx, y);
      doc.line(cx, y, x + width, y + height);
      doc.line(x + width, y + height, x, y + height);
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(height * 1.5);
      doc.text('!', cx, y + height * 0.85, { align: 'center' });
      break;
    }
    case 'KEEP_DRY': {
      // ISO 15223-1 5.3.4 Keep dry: Umbrella
      const cx = x + width / 2;
      const r = width / 2;
      // Umbrella canopy arc
      doc.line(x, y + height * 0.5, x + width, y + height * 0.5);
      doc.line(x, y + height * 0.5, cx, y);
      doc.line(x + width, y + height * 0.5, cx, y);
      // Umbrella handle
      doc.line(cx, y + height * 0.5, cx, y + height * 0.9);
      doc.line(cx, y + height * 0.9, cx - r * 0.35, y + height);
      break;
    }
    case 'STERILE': {
      // ISO 15223-1 5.2.4 Sterile symbol
      const st = config?.sterileType || 'NON-STERILE';
      doc.rect(x, y, width, height);
      doc.setFont('Helvetica', 'bold');
      if (st === 'NON-STERILE') {
        doc.setFontSize(3.8);
        doc.text('NON-STERILE', x + width / 2, y + height * 0.7, { align: 'center' });
      } else {
        const divX = x + width * 0.65;
        doc.line(divX, y, divX, y + height);
        doc.setFontSize(3.8);
        doc.text('STERILE', x + width * 0.32, y + height * 0.7, { align: 'center' });
        doc.text(st, divX + (x + width - divX) / 2, y + height * 0.7, { align: 'center' });
      }
      break;
    }
    case 'CE': {
      // CE Mark
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(height * 2.2);
      doc.text('CE', x + width / 2, y + height * 0.8, { align: 'center' });
      if (config?.notifiedBodyNumber) {
        doc.setFontSize(3.2);
        doc.text(config.notifiedBodyNumber, x + width / 2, y + height + 2.2, { align: 'center' });
      }
      break;
    }
    case 'TEMP_LIMIT': {
      // ISO 15223-1 5.3.7 Temperature limit: Thermometer
      const tMin = config?.tempMin || '';
      const tMax = config?.tempMax || '';
      doc.rect(x + width * 0.3, y, width * 0.4, height * 0.7);
      doc.circle(x + width / 2, y + height * 0.85, width * 0.3);
      if (tMin || tMax) {
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(3.2);
        if (tMax) doc.text(tMax, x + width + 0.5, y + 2.5);
        if (tMin) doc.text(tMin, x + width + 0.5, y + height);
      }
      break;
    }
    default:
      break;
  }
}
