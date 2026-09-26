import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import type { LabelPaperType, ProductionPlan, ProductionPlanLabel } from '../../../types';
import {
  DEFAULT_LABEL_TEMPLATE,
  drawIsoSymbolOnPdf,
  type LabelTemplateConfig,
} from './isoSymbols';

export interface PrintableLabelItem {
  id: string;
  plan_id?: string; // for audit grouping
  productName: string;
  batchCode: string;
  sequenceNumber: number; // Case No
  expectedQuantity: number;
  isPartial: boolean;
  qrPayload: string; // format: batch_code-case_number
}

export interface QueueRenderOptions {
  labels: PrintableLabelItem[];
  paper: LabelPaperType;
  startRow?: number; // 1-indexed (e.g. 1..rows)
  startCol?: number; // 1-indexed (e.g. 1..cols)
  template?: LabelTemplateConfig;
}

export interface RenderLabelOptions {
  plan: ProductionPlan;
  labels: ProductionPlanLabel[];
  paper: LabelPaperType;
  productName: string;
  startRow?: number;
  startCol?: number;
  template?: LabelTemplateConfig;
}

/**
 * Safely downloads a jsPDF document ensuring .pdf extension and application/pdf MIME type.
 * Avoids browser downloading as .bin by using ArrayBuffer, explicit application/pdf Blob/File,
 * and delayed URL revocation.
 */
export function downloadPDFDoc(doc: jsPDF, filename: string): void {
  const cleanName = filename.replace(/[/\\?%*:|"<>]/g, '_');
  const safeFilename = cleanName.toLowerCase().endsWith('.pdf') ? cleanName : `${cleanName}.pdf`;

  // Get raw binary buffer
  const buffer = doc.output('arraybuffer');
  const blob = new Blob([buffer], { type: 'application/pdf' });

  // Use File constructor if available to explicitly enforce filename and MIME type
  let downloadItem: Blob = blob;
  try {
    downloadItem = new File([buffer], safeFilename, { type: 'application/pdf' });
  } catch (_) {
    downloadItem = blob;
  }

  const url = URL.createObjectURL(downloadItem);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = safeFilename;
  document.body.appendChild(a);
  a.click();

  // Retain blob URL for 45 seconds so browser download manager finishes streaming
  setTimeout(() => {
    try {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (_) {}
  }, 45000);
}

/**
 * Opens a jsPDF document in a new browser tab for immediate viewing / native printing.
 */
export function openPDFDocInNewTab(doc: jsPDF): void {
  const buffer = doc.output('arraybuffer');
  const blob = new Blob([buffer], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
}

/**
 * Calculates slot offset (0-indexed) based on startRow (1-based), startCol (1-based), and fill order.
 */
export function getSlotOffset(
  startRow: number,
  startCol: number,
  rows: number,
  cols: number,
  fillOrder: string
): number {
  const r = Math.max(0, Math.min(rows - 1, (startRow || 1) - 1));
  const c = Math.max(0, Math.min(cols - 1, (startCol || 1) - 1));

  if (fillOrder === 'column-major') {
    return c * rows + r;
  }
  return r * cols + c;
}

/**
 * Builds the jsPDF document object for queue or multi-product printing,
 * supporting partial sheet reuse (startRow and startCol offset on Sheet #1).
 */
export async function buildQueuePDFDoc(options: QueueRenderOptions): Promise<jsPDF> {
  const { labels, paper, startRow = 1, startCol = 1 } = options;

  let tpl: LabelTemplateConfig = options.template || DEFAULT_LABEL_TEMPLATE;
  if (!options.template && paper?.id) {
    try {
      const saved =
        localStorage.getItem(`label_template_${paper.id}`) ||
        localStorage.getItem('label_template_global');
      if (saved) tpl = JSON.parse(saved);
    } catch (_) {}
  }

  const pW = Number(paper.page_width_mm) || 210;
  const pH = Number(paper.page_height_mm) || 297;
  const rows = Number(paper.rows) || 8;
  const cols = Number(paper.columns) || 3;
  const lW = Number(paper.label_width_mm) || 70;
  const lH = Number(paper.label_height_mm) || 37;
  const mT = Number(paper.margin_top_mm) || 0.5;
  const mL = Number(paper.margin_left_mm) || 0;
  const gX = Number(paper.gutter_x_mm) || 0;
  const gY = Number(paper.gutter_y_mm) || 0;
  const fillOrder = paper.fill_order || 'row-major';

  const doc = new jsPDF({
    orientation: pW > pH ? 'landscape' : 'portrait',
    unit: 'mm',
    format: [pW, pH],
    compress: true,
  });

  const slotsPerPage = rows * cols;
  const skipSlotsSheet1 = getSlotOffset(startRow, startCol, rows, cols, fillOrder);
  const sheet1Capacity = Math.max(0, slotsPerPage - skipSlotsSheet1);

  let totalSheets = 1;
  if (labels.length > sheet1Capacity) {
    const remainingAfterSheet1 = labels.length - sheet1Capacity;
    totalSheets = 1 + Math.ceil(remainingAfterSheet1 / slotsPerPage);
  }

  // Pre-generate QR code data URLs asynchronously
  const qrMap = new Map<string, string>();
  for (const label of labels) {
    try {
      const dataUrl = await QRCode.toDataURL(label.qrPayload, {
        width: 140,
        margin: 0,
        errorCorrectionLevel: 'M',
      });
      qrMap.set(label.id, dataUrl);
    } catch (err) {
      console.warn('QR generation error for label', label.id, err);
    }
  }

  let labelCursor = 0;

  for (let sheetIdx = 0; sheetIdx < totalSheets; sheetIdx++) {
    if (sheetIdx > 0) {
      doc.addPage([pW, pH]);
    }

    const startSlot = sheetIdx === 0 ? skipSlotsSheet1 : 0;

    for (let slot = startSlot; slot < slotsPerPage; slot++) {
      if (labelCursor >= labels.length) {
        break; // All labels printed
      }

      const label = labels[labelCursor];
      labelCursor++;

      // Determine row and col for this slot
      let r = 0;
      let c = 0;
      if (fillOrder === 'column-major') {
        r = slot % rows;
        c = Math.floor(slot / rows);
      } else {
        r = Math.floor(slot / cols);
        c = slot % cols;
      }

      // Exact millimetric coordinates
      const x = mL + c * (lW + gX);
      const y = mT + r * (lH + gY);

      // Draw light guide boundary
      doc.setDrawColor(210, 215, 220);
      doc.setLineWidth(0.15);
      doc.rect(x, y, lW, lH);

      // Inner padding
      const padTop = Number(paper.padding_top_mm ?? paper.internal_padding_mm ?? 1.8);
      const padLeft = Number(paper.padding_left_mm ?? paper.internal_padding_mm ?? 1.8);
      const padRight = Number(paper.padding_right_mm ?? paper.internal_padding_mm ?? 1.8);
      const padBottom = Number(paper.padding_bottom_mm ?? paper.internal_padding_mm ?? 1.8);

      const contentX = x + padLeft;
      let contentY = y + padTop;
      const contentW = Math.max(10, lW - (padLeft + padRight));
      const contentH = Math.max(10, lH - (padTop + padBottom));

      // 1. Header: Company Name
      if (tpl.showCompanyName) {
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(Math.min(6.8, Math.max(5, contentW / 8)));
        doc.setTextColor(0, 0, 0);
        doc.text(tpl.companyName || 'AGNEY POLYSOFT INDIA PVT LTD', contentX, contentY + 2.5);

        // Subtle horizontal divider
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.2);
        doc.line(contentX, contentY + 3.4, contentX + contentW, contentY + 3.4);
        contentY += 4.2;
      }

      // Subtitle if enabled
      if (tpl.showSubtitle && tpl.subtitleText) {
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(4.5);
        doc.setTextColor(0, 0, 0);
        doc.text(tpl.subtitleText, contentX, contentY + 1.8);
        contentY += 3.0;
      }

      // 2. Product Name
      doc.setFont('Helvetica', 'bold');
      const pSize =
        tpl.productNameSize === 'large'
          ? Math.min(8.5, contentW / 6.5)
          : tpl.productNameSize === 'small'
          ? Math.min(6.2, contentW / 8)
          : Math.min(7.2, contentW / 7);
      doc.setFontSize(pSize);
      doc.setTextColor(0, 0, 0);
      const pName = label.productName || 'Product Name';
      const truncatedName = pName.length > 26 ? pName.substring(0, 24) + '..' : pName;
      doc.text(truncatedName, contentX, contentY + 3.0);
      contentY += 4.0;

      // 3. Batch / LOT Number
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(6.2);
      doc.setTextColor(0, 0, 0);

      if (tpl.showBatchCode) {
        if (tpl.isoSymbols.showLot) {
          drawIsoSymbolOnPdf(doc, 'LOT', contentX, contentY, 5.5, 2.8, tpl.isoSymbols);
          doc.setFont('Helvetica', 'bold');
          doc.setTextColor(0, 0, 0);
          doc.text(` ${label.batchCode || 'LOT-2409'}`, contentX + 6.2, contentY + 2.1);
        } else {
          doc.text(`${tpl.batchCodeLabel || 'LOT'}: ${label.batchCode || 'LOT-2409'}`, contentX, contentY + 2.1);
        }
        contentY += 3.6;
      }

      // 4. Case Number
      if (tpl.showCaseNumber) {
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.setTextColor(0, 0, 0);
        doc.text(`${tpl.caseNumberPrefix || 'CASE NO: #'}${label.sequenceNumber || 1}`, contentX, contentY + 2.2);
        contentY += 3.6;
      }

      // 5. Quantity (highlighted if partial)
      if (tpl.showQuantity) {
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(7.0);
        if (label.isPartial) {
          doc.setTextColor(185, 28, 28);
          doc.text(`${tpl.quantityLabel || 'QTY:'} ${label.expectedQuantity || 500} PCS (PARTIAL)`, contentX, contentY + 2.4);
        } else {
          doc.setTextColor(0, 0, 0);
          doc.text(`${tpl.quantityLabel || 'QTY:'} ${label.expectedQuantity || 500} PCS`, contentX, contentY + 2.4);
        }
      }

      // 6. ISO 15223-1 Symbols Tray
      let isoX = contentX;
      const isoY = y + lH - padBottom - (tpl.showQcApproval ? 5.2 : 4.5);
      const symH = 3.4;

      if (tpl.isoSymbols.showMd) {
        drawIsoSymbolOnPdf(doc, 'MD', isoX, isoY, 5.2, symH, tpl.isoSymbols);
        isoX += 6.0;
      }
      if (tpl.isoSymbols.showSingleUse) {
        drawIsoSymbolOnPdf(doc, 'SINGLE_USE', isoX, isoY, 3.6, symH, tpl.isoSymbols);
        isoX += 4.5;
      }
      if (tpl.isoSymbols.showManufacturer) {
        drawIsoSymbolOnPdf(doc, 'MANUFACTURER', isoX, isoY, 3.6, symH, tpl.isoSymbols);
        isoX += 4.5;
      }
      if (tpl.isoSymbols.showExpiryDate) {
        drawIsoSymbolOnPdf(doc, 'EXPIRY', isoX, isoY, 3.2, symH, tpl.isoSymbols);
        isoX += 4.0;
      }
      if (tpl.isoSymbols.showKeepDry) {
        drawIsoSymbolOnPdf(doc, 'KEEP_DRY', isoX, isoY, 3.4, symH, tpl.isoSymbols);
        isoX += 4.2;
      }
      if (tpl.isoSymbols.showSterile) {
        drawIsoSymbolOnPdf(doc, 'STERILE', isoX, isoY, 13.0, symH, tpl.isoSymbols);
        isoX += 14.0;
      }
      if (tpl.isoSymbols.showCeMark) {
        drawIsoSymbolOnPdf(doc, 'CE', isoX, isoY, 5.0, symH, tpl.isoSymbols);
        isoX += 6.0;
      }

      // 7. QC Status Line (Single Line: QC STATUS: APPROVED │ Inspected by :)
      if (tpl.showQcApproval) {
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(5.0);
        doc.setTextColor(0, 0, 0);
        const qcY = y + lH - padBottom - 0.8;
        const statusText = `QC STATUS: ${tpl.qcApprovalText || 'APPROVED'}`;
        doc.text(statusText, contentX, qcY);

        // Vertical divider
        const sepX = contentX + Math.max(26, contentW * 0.44);
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.2);
        doc.line(sepX, qcY - 2.0, sepX, qcY + 0.3);

        doc.text('Inspected by : ', sepX + 2.5, qcY);
      }

      // 8. QR Code (QR payload format: batch_code-case_number)
      if (tpl.showQrCode) {
        const qrSize = Math.max(8, Math.min(tpl.qrSizeMm || 14, contentH - 4.5, lW - 35));
        const qrX = x + lW - padRight - qrSize;
        const qrY =
          tpl.qrCodePosition === 'bottom-right'
            ? y + lH - padBottom - qrSize
            : y + padTop + 4.5;
        const qrDataUrl = qrMap.get(label.id);
        if (qrDataUrl) {
          doc.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);
        }
      }
    }
  }

  return doc;
}

/**
 * Builds the jsPDF document object for single-plan production labels (adapter to buildQueuePDFDoc).
 */
export async function buildLabelsPDFDoc(options: RenderLabelOptions): Promise<jsPDF> {
  const { plan, labels, paper, productName, startRow = 1, startCol = 1 } = options;
  const items: PrintableLabelItem[] = labels.map((l) => ({
    id: l.id,
    productName: productName || plan.product_name || 'Moulded Part',
    batchCode: (l as any).batch_code || plan.batch_code || '',
    sequenceNumber: l.sequence_number,
    expectedQuantity: l.expected_quantity,
    isPartial: l.is_partial,
    qrPayload: l.qr_payload,
  }));

  return buildQueuePDFDoc({
    labels: items,
    paper,
    startRow,
    startCol,
    template: options.template,
  });
}

export async function saveLabelsPDF(options: RenderLabelOptions, filename: string): Promise<void> {
  const doc = await buildLabelsPDFDoc(options);
  downloadPDFDoc(doc, filename);
}

export async function previewLabelsPDF(options: RenderLabelOptions): Promise<void> {
  const doc = await buildLabelsPDFDoc(options);
  openPDFDocInNewTab(doc);
}

export async function saveQueuePDF(options: QueueRenderOptions, filename: string): Promise<void> {
  const doc = await buildQueuePDFDoc(options);
  downloadPDFDoc(doc, filename);
}

export async function previewQueuePDF(options: QueueRenderOptions): Promise<void> {
  const doc = await buildQueuePDFDoc(options);
  openPDFDocInNewTab(doc);
}

export function buildCalibrationPDFDoc(paper: LabelPaperType): jsPDF {
  const pW = Number(paper.page_width_mm) || 210;
  const pH = Number(paper.page_height_mm) || 297;
  const rows = Number(paper.rows) || 8;
  const cols = Number(paper.columns) || 3;
  const lW = Number(paper.label_width_mm) || 70;
  const lH = Number(paper.label_height_mm) || 37;
  const mT = Number(paper.margin_top_mm) || 0.5;
  const mL = Number(paper.margin_left_mm) || 0;
  const gX = Number(paper.gutter_x_mm) || 0;
  const gY = Number(paper.gutter_y_mm) || 0;

  const doc = new jsPDF({
    orientation: pW > pH ? 'landscape' : 'portrait',
    unit: 'mm',
    format: [pW, pH],
    compress: true,
  });

  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(30, 41, 59);

  doc.text(
    `CALIBRATION SHEET: ${paper.name} (${cols}x${rows}) - Page: ${pW}x${pH}mm`,
    mL + 2,
    Math.max(5, mT - 2)
  );

  const padTop = Number(paper.padding_top_mm ?? paper.internal_padding_mm ?? 1.8);
  const padLeft = Number(paper.padding_left_mm ?? paper.internal_padding_mm ?? 1.8);
  const padRight = Number(paper.padding_right_mm ?? paper.internal_padding_mm ?? 1.8);
  const padBottom = Number(paper.padding_bottom_mm ?? paper.internal_padding_mm ?? 1.8);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = mL + c * (lW + gX);
      const y = mT + r * (lH + gY);

      // Outer die-cut edge
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.2);
      doc.rect(x, y, lW, lH);

      // Inner padding / printable boundary
      doc.setDrawColor(14, 165, 233);
      doc.setLineWidth(0.12);
      doc.rect(
        x + padLeft,
        y + padTop,
        Math.max(1, lW - (padLeft + padRight)),
        Math.max(1, lH - (padTop + padBottom))
      );

      const cx = x + lW / 2;
      const cy = y + lH / 2;
      doc.setDrawColor(220, 38, 38);
      doc.line(cx - 3, cy, cx + 3, cy);
      doc.line(cx, cy - 3, cx, cy + 3);

      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(6);
      doc.setTextColor(71, 85, 105);
      doc.text(`R${r + 1} C${c + 1}`, x + padLeft + 1.5, y + padTop + 4);
      doc.text(`${lW} x ${lH} mm`, x + padLeft + 1.5, y + padTop + 7.5);
      doc.text(`Pad: ${padTop}/${padLeft}mm`, x + padLeft + 1.5, y + padTop + 11);
    }
  }

  return doc;
}

export function saveCalibrationPDF(paper: LabelPaperType, filename: string): void {
  const doc = buildCalibrationPDFDoc(paper);
  downloadPDFDoc(doc, filename);
}

export function openCalibrationPDF(paper: LabelPaperType): void {
  const doc = buildCalibrationPDFDoc(paper);
  openPDFDocInNewTab(doc);
}
