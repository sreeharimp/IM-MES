import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import type { LabelPaperType, ProductionPlan, ProductionPlanLabel } from '../../../types';

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
}

export interface RenderLabelOptions {
  plan: ProductionPlan;
  labels: ProductionPlanLabel[];
  paper: LabelPaperType;
  productName: string;
  startRow?: number;
  startCol?: number;
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
      const pad = 1.8;
      const contentX = x + pad;
      const contentY = y + pad;
      const contentW = lW - pad * 2;

      // 1. Header: Company Name
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(6.8);
      doc.setTextColor(30, 41, 59);
      doc.text('AGNEY POLYSOFT INDIA PVT LTD', contentX, contentY + 2.5);

      // Subtle horizontal divider
      doc.setDrawColor(180, 185, 190);
      doc.line(contentX, contentY + 3.6, contentX + contentW, contentY + 3.6);

      // 2. Product Name
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(15, 23, 42);
      const pName = label.productName || 'Moulded Part';
      const truncatedName = pName.length > 24 ? pName.substring(0, 22) + '..' : pName;
      doc.text(truncatedName, contentX, contentY + 6.8);

      // 3. Batch Code & Case No (Case No shows strictly: CASE NO: #X)
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(51, 65, 85);
      doc.text(`BATCH: ${label.batchCode}`, contentX, contentY + 10.2);

      doc.setFont('Helvetica', 'bold');
      doc.text(`CASE NO: #${label.sequenceNumber}`, contentX, contentY + 13.6);

      // 4. Quantity (highlighted if partial)
      doc.setFontSize(7.2);
      if (label.isPartial) {
        doc.setTextColor(185, 28, 28);
        doc.text(`QTY: ${label.expectedQuantity} PCS (PARTIAL)`, contentX, contentY + 17.2);
      } else {
        doc.setTextColor(15, 23, 42);
        doc.text(`QTY: ${label.expectedQuantity} PCS`, contentX, contentY + 17.2);
      }

      // 5. QC Approval Area
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(5.5);
      doc.setTextColor(71, 85, 105);
      const qcY = y + lH - 4.2;
      doc.setDrawColor(100, 116, 139);
      doc.rect(contentX, qcY - 2.8, 2.8, 2.8);
      doc.text('QC APPROVED', contentX + 3.6, qcY - 0.7);
      doc.text('Sign: ____________', contentX, y + lH - 1.5);

      // 6. QR Code (QR payload format: batch_code-case_number)
      const qrSize = Math.min(16.5, lH - 9);
      const qrX = x + lW - qrSize - 2;
      const qrY = contentY + 4.5;
      const qrDataUrl = qrMap.get(label.id);
      if (qrDataUrl) {
        doc.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);
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

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = mL + c * (lW + gX);
      const y = mT + r * (lH + gY);

      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.2);
      doc.rect(x, y, lW, lH);

      doc.setDrawColor(180, 180, 180);
      doc.setLineWidth(0.1);
      doc.rect(x + 1.5, y + 1.5, lW - 3, lH - 3);

      const cx = x + lW / 2;
      const cy = y + lH / 2;
      doc.setDrawColor(220, 38, 38);
      doc.line(cx - 3, cy, cx + 3, cy);
      doc.line(cx, cy - 3, cx, cy + 3);

      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(6);
      doc.setTextColor(71, 85, 105);
      doc.text(`R${r + 1} C${c + 1}`, x + 2.5, y + 5);
      doc.text(`${lW} x ${lH} mm`, x + 2.5, y + 8.5);
      doc.text(`X: ${x.toFixed(1)} Y: ${y.toFixed(1)}`, x + 2.5, y + 12);
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
