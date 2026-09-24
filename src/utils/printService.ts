import { Capacitor, registerPlugin } from '@capacitor/core';
import type { Crate, Machine, Packet } from '../types';
import { formatUnitId } from './batchUtils';

// Interface for our custom native plugin
interface PrinterPlugin {
  printRawBT(options: { data: string }): Promise<void>;
  printUrovo(options: { text: string }): Promise<void>;
}

// Get the auto-discovered printer plugin; only register if not auto-discovered
export let NativePrinter: PrinterPlugin;
try {
  // Try to get the already auto-discovered plugin
  const plugins = (window as any).Capacitor?.Plugins;
  if (plugins && plugins.PrinterPlugin) {
    NativePrinter = plugins.PrinterPlugin;
  } else {
    // Fallback to manual registration (should not happen with proper @CapacitorPlugin)
    NativePrinter = registerPlugin<PrinterPlugin>('PrinterPlugin');
  }
} catch (e) {
  // If all fails, manually register
  NativePrinter = registerPlugin<PrinterPlugin>('PrinterPlugin');
}

// ESC/POS Commands
export const BOLD_ON = "\x1bE\x01";
export const BOLD_OFF = "\x1bE\x00";
export const CENTER = "\x1ba\x01";
export const LEFT = "\x1ba\x00";

export const formatDateDMY = (dateInput: Date | string | number) => {
  const d = new Date(dateInput);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
};

export const printProductionSlip = async (
  crate: Crate, 
  _machine: Machine, 
  operatorName?: string, 
  isReprint?: boolean, 
  productName?: string, 
  supervisorName?: string, 
  labels?: any,
  rawMaterialName?: string,
  rawMaterialBatch?: string
) => {
  const method = localStorage.getItem('print_method');
  const isNative = Capacitor.getPlatform() !== 'web';

  console.log('Printing slip:', { crateId: crate.id, method, isNative, isReprint, rawMaterialName, rawMaterialBatch });

  if (!method && isNative) {
    alert("Printer not configured! Please go to Admin Dashboard > Printer Setup to select 'Direct Thermal'.");
    return;
  }

  const activeMethod = method || 'system';
  
  if (activeMethod === 'rawbt' || activeMethod === 'urovo') {
    // Custom Labels from DB or Defaults
    const L = labels?.production_slip || {};
    const labelTitle = L.title || 'PRODUCTION SLIP';
    const labelReprintTitle = L.reprint_title || 'PRODUCTION SLIP (REPRINT)';
    const labelDate = L.date_label || 'Date/Time';
    const labelShift = L.shift_label || 'SHIFT';
    const labelMC = L.mc_label || 'MC';
    const labelProduct = L.product_label || 'PRODUCT';
    const labelRM = L.rm_label || 'RAW MATERIAL';
    const labelRMBatch = L.rm_batch_label || 'RM LOT / BATCH';
    const labelBatch = L.batch_label || 'BATCH';
    const labelBin = L.bin_label || 'BIN';
    const labelOperator = L.operator_label || 'OPERATOR';
    const labelSupervisor = L.supervisor_label || 'SUPERVISOR';
    const labelGross = L.gross_qty_label || 'GROSS QTY';
    const labelStartup = L.startup_scrap_label || 'STARTUP SCRAP';
    const labelQC = L.qc_sample_label || 'QC SAMPLES';
    const labelNet = L.net_qty_label || 'NET QUANTITY';
    const labelUnit = L.unit_id_label || 'UNIT ID';

    const effectiveRM = rawMaterialName || (crate as any).materialGrade || (crate as any).material_grade || (_machine as any)?.materialGrade || 'N/A';
    const effectiveRMBatch = rawMaterialBatch || crate.materialBatch || (crate as any).material_batch || (_machine as any)?.materialBatch || 'N/A';

    // Format for Thermal Printer (ESC/POS compatible text)
    const titleText = isReprint ? labelReprintTitle : labelTitle;
    const date = formatDateDMY(crate.endTime);
    const time = new Date(crate.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    let quantitiesText = "";
    if (crate.grossQty > 0) quantitiesText += `${labelGross}: ${crate.grossQty}\n`;
    if (crate.startupScrap > 0) quantitiesText += `${labelStartup}: ${crate.startupScrap}\n`;
    if (crate.qcSample > 0) quantitiesText += `${labelQC}: ${crate.qcSample}\n`;

    const slipText = [
      CENTER + "--------------------------------",
      CENTER + BOLD_ON + titleText + BOLD_OFF,
      CENTER + "--------------------------------",
      LEFT + labelDate + ": " + date + " " + time,
      LEFT + labelShift + ": " + (crate.shiftId || 'A') + "  " + labelMC + ": " + crate.machineId,
      LEFT + labelProduct + ": " + (productName || 'N/A'),
      LEFT + labelRM + ": " + effectiveRM,
      LEFT + labelRMBatch + ": " + effectiveRMBatch,
      LEFT + BOLD_ON + labelBatch + ": " + crate.batchId.split('-')[0] + "  " + labelBin + ": #" + crate.binNumber + BOLD_OFF,
      LEFT + labelOperator + ": " + (operatorName || 'N/A'),
      LEFT + labelSupervisor + ": " + (supervisorName || 'N/A'),
      CENTER + "--------------------------------",
      LEFT + quantitiesText + labelNet + ": " + crate.netQty,
      CENTER + "--------------------------------",
      CENTER + labelUnit + ": " + formatUnitId(crate.id, crate.machineId),
      "",
      CENTER + "[QRCODE:" + formatUnitId(crate.id, crate.machineId) + "]",
      "\n\n\n\n"
    ].join("\n");

    try {
      if (isNative) {
        if (activeMethod === 'urovo') {
          await NativePrinter.printUrovo({ text: slipText });
          console.log('Urovo SDK Print Command Sent');
        } else {
          await NativePrinter.printRawBT({ data: btoa(slipText) });
          console.log('RawBT Native Print Command Sent');
        }
      } else {
        // Fallback for web testing
        window.location.href = `rawbt:base64:${btoa(slipText)}`;
      }
      
      // Also copy to clipboard as a "fail-safe" backup
      const textArea = document.createElement("textarea");
      textArea.value = slipText;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    } catch (e) {
      console.error('Printing failed:', e);
      window.print();
    }
  } else {
    window.print();
  }
};

export const printPacketLabel = async (
  packet: Packet,
  isReprint?: boolean,
  supervisorName?: string,
  labels?: any
) => {
  const method = localStorage.getItem('print_method');
  const isNative = Capacitor.getPlatform() !== 'web';

  console.log('Printing packet label:', { packetId: packet.id, method, isNative, isReprint });

  if (!method && isNative) {
    alert("Printer not configured! Please go to Admin Dashboard > Printer Setup to select 'Direct Thermal'.");
    return;
  }

  const activeMethod = method || 'system';

  if (activeMethod === 'rawbt' || activeMethod === 'urovo') {
    const L = labels?.packet_label || {};
    const labelTitle = L.title || 'PACKET / BOX LABEL';
    const labelReprintTitle = L.reprint_title || 'PACKET LABEL (REPRINT)';
    const titleText = isReprint ? labelReprintTitle : labelTitle;
    const date = formatDateDMY(packet.packedAt);
    const time = new Date(packet.packedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Format crate sources list
    let sourcesText = "CRATE SOURCES:\n";
    if (packet.crateSources && packet.crateSources.length > 0) {
      packet.crateSources.forEach((s) => {
        sourcesText += ` - Bin #${s.binNumber} (${s.crateId.slice(-8)}): ${s.qty.toLocaleString()} pcs\n`;
      });
    } else {
      sourcesText += " - Standard fulfillment\n";
    }

    const slipText = [
      CENTER + "================================",
      CENTER + BOLD_ON + titleText + BOLD_OFF,
      CENTER + "================================",
      LEFT + "DATE: " + date + " " + time + "  SHIFT: " + (packet.shiftId || 'A'),
      LEFT + "PRODUCT: " + (packet.productName || 'N/A'),
      packet.productCode ? LEFT + "ITEM CODE: " + packet.productCode : "",
      LEFT + BOLD_ON + "BATCH: " + packet.batchId.split('-')[0] + BOLD_OFF,
      CENTER + "--------------------------------",
      CENTER + BOLD_ON + "PACK QTY: " + packet.quantity.toLocaleString() + " PCS" + BOLD_OFF,
      CENTER + "--------------------------------",
      LEFT + sourcesText,
      CENTER + "--------------------------------",
      LEFT + "PACKED BY: " + (packet.packedBy || 'Operator'),
      supervisorName ? LEFT + "SUPERVISOR: " + supervisorName : "",
      CENTER + "--------------------------------",
      CENTER + "PACKET ID: " + packet.id,
      "",
      CENTER + "[QRCODE:" + packet.id + "]",
      "\n\n\n\n"
    ].filter(Boolean).join("\n");

    try {
      if (isNative) {
        if (activeMethod === 'urovo') {
          await NativePrinter.printUrovo({ text: slipText });
          console.log('Urovo SDK Print Command Sent');
        } else {
          await NativePrinter.printRawBT({ data: btoa(slipText) });
          console.log('RawBT Native Print Command Sent');
        }
      } else {
        window.location.href = `rawbt:base64:${btoa(slipText)}`;
      }

      const textArea = document.createElement("textarea");
      textArea.value = slipText;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    } catch (e) {
      console.error('Packet printing failed:', e);
      window.print();
    }
  } else {
    try {
      if (isNative) {
        alert("i9100 Tip: Use 'Direct Thermal' mode for this handheld device.");
      }
      window.print();
    } catch (e) {
      console.error('System print failed:', e);
    }
  }
};

