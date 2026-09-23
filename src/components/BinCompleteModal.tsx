import React, { useState } from 'react';
import { X, Printer } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import type { Machine, AppSettings } from '../types';
import { formatDateDMY } from '../utils/printService';
import { formatUnitId } from '../utils/batchUtils';

interface BinCompleteModalProps {
  machine: Machine;
  binNumber: number;
  operatorName?: string;
  operatorCode?: string;
  shift?: string;
  productName?: string;
  supervisorName?: string;
  rawMaterialName?: string;
  rawMaterialBatch?: string;
  appSettings?: AppSettings | null;
  defaultBinQty?: number;
  onClose: () => void;
  onConfirm: (data: { grossQty: number, startupScrap: number, qcSample: number, netQty: number }) => Promise<boolean>;
}

const BinCompleteModal: React.FC<BinCompleteModalProps> = ({ 
  machine, 
  binNumber, 
  operatorName, 
  operatorCode: _operatorCode, 
  shift, 
  productName, 
  supervisorName, 
  rawMaterialName,
  rawMaterialBatch,
  appSettings, 
  defaultBinQty, 
  onClose, 
  onConfirm 
}) => {
  const [grossQty, setGrossQty] = useState<number | string>(machine.binTarget || defaultBinQty || 4000);
  const [startupScrap, setStartupScrap] = useState<number | string>("");
  const [qcSample, setQcSample] = useState<number | string>("");

  const [isSubmitting, setIsSubmitting] = useState(false);

  const grossNum = Number(grossQty) || 0;
  const scrapNum = Number(startupScrap) || 0;
  const qcNum = Number(qcSample) || 0;
  const netQty = grossNum - scrapNum - qcNum;
  
  const rawBatch = machine.activeBatchId || 'BATCH';
  const cleanBatch = rawBatch.endsWith(`-${machine.id}`) ? rawBatch : `${rawBatch}-${machine.id}`;
  const unitId = formatUnitId(`${cleanBatch}-${binNumber}`, machine.id);

  const handleConfirm = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    
    try {
      const success = await onConfirm({ grossQty: grossNum, startupScrap: scrapNum, qcSample: qcNum, netQty });
      if (!success) {
        setIsSubmitting(false);
      }
    } catch (error) {
      console.error("Bin complete confirm error:", error);
      setIsSubmitting(false);
    }
  };

    const L = appSettings?.printLabels?.production_slip || {};
    const labelTitle = L.title || 'PRODUCTION SLIP';
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
    const labelGross = L.gross_qty_label || 'Gross Qty';
    const labelStartup = L.startup_scrap_label || 'Startup Scrap';
    const labelQC = L.qc_sample_label || 'QC Samples';
    const labelNet = L.net_qty_label || 'NET QTY';
    const labelUnit = L.unit_id_label || 'UNIT ID';

    const effectiveRM = rawMaterialName || machine.materialGrade || 'N/A';
    const effectiveRMBatch = rawMaterialBatch || machine.materialBatch || 'N/A';

    return (
      <div className="ov" style={{ alignItems: 'flex-start', paddingTop: '10px' }}>
        <div className="modal animate-scale-in" style={{ display: 'flex', flexDirection: 'column', maxHeight: '95vh', maxWidth: '400px', position: 'relative', bottom: 'auto', top: '0', margin: '0 auto', borderRadius: '16px' }}>
          <div className="mhd" style={{ padding: '12px 16px 8px' }}>
            <div>
              <div className="mtit" style={{ fontSize: '16px' }}>Complete Bin #{binNumber}</div>
              <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '2px' }}>{machine.name} • {machine.model}</div>
            </div>
            <button onClick={onClose} className="mcl" disabled={isSubmitting}>
              <X size={18} />
            </button>
          </div>
  
          <div className="mbd" style={{ flex: 1, overflowY: 'auto', padding: '0 16px 70px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
              <div className="fg" style={{ marginBottom: 0, gridColumn: '1 / 3' }}>
                <label className="fl" style={{ fontSize: '11px', marginBottom: '4px' }}>Gross Machine Count</label>
                <input 
                  type="number" 
                  className="fi" 
                  value={grossQty} 
                  onChange={(e) => setGrossQty(e.target.value === "" ? "" : Number(e.target.value))} 
                  disabled={isSubmitting}
                  style={{ padding: '8px 12px', fontSize: '14px' }}
                />
              </div>
              <div className="fg" style={{ marginBottom: 0 }}>
                <label className="fl" style={{ fontSize: '11px', marginBottom: '4px' }}>Startup Scrap</label>
                <input 
                  type="number" 
                  className="fi" 
                  value={startupScrap} 
                  onChange={(e) => setStartupScrap(e.target.value === "" ? "" : Number(e.target.value))} 
                  style={{ borderColor: scrapNum > 0 ? 'var(--amber-dim)' : '', padding: '8px 12px', fontSize: '14px' }}
                  disabled={isSubmitting}
                />
              </div>
              <div className="fg" style={{ marginBottom: 0 }}>
                <label className="fl" style={{ fontSize: '11px', marginBottom: '4px' }}>QC Samples</label>
                <input 
                  type="number" 
                  className="fi" 
                  value={qcSample} 
                  onChange={(e) => setQcSample(e.target.value === "" ? "" : Number(e.target.value))} 
                  style={{ borderColor: qcNum > 0 ? 'var(--blue)' : '', padding: '8px 12px', fontSize: '14px' }}
                  disabled={isSubmitting}
                />
              </div>
            </div>
  
            <div className="msec" style={{ marginTop: '8px', marginBottom: '8px', fontSize: '12px' }}>
              Preview Thermal Print Slip
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '10px' }}>
              <div 
                id="print-slip" 
                style={{ 
                  background: '#fff', 
                  color: '#000', 
                  padding: '16px', 
                  borderRadius: '4px',
                  width: '280px',
                  fontFamily: 'var(--mono)',
                  fontSize: '12px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                  zoom: 0.5
                }}
              >
                <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '14px', borderBottom: '1px solid #000', paddingBottom: '6px', marginBottom: '10px' }}>
                  {labelTitle}
                </div>
                <div style={{ marginBottom: '8px', borderBottom: '1px solid #eee', paddingBottom: '4px', fontSize: '11px' }}>
                  {labelDate}: {formatDateDMY(new Date())} {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span>{labelShift}: {shift || 'A'}</span>
                  <span>{labelMC}: {machine.id}</span>
                </div>
                
                <div style={{ margin: '6px 0 3px', borderBottom: '1px solid #eee', paddingBottom: '3px' }}>
                  {labelProduct}: {productName || 'N/A'}
                </div>

                <div style={{ margin: '3px 0', fontSize: '11px' }}>
                  <span style={{ color: '#444' }}>{labelRM}:</span> <strong>{effectiveRM}</strong>
                </div>
                <div style={{ margin: '3px 0 6px', fontSize: '11px', borderBottom: '1px solid #eee', paddingBottom: '4px' }}>
                  <span style={{ color: '#444' }}>{labelRMBatch}:</span> <strong>{effectiveRMBatch}</strong>
                </div>
  
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontWeight: 'bold' }}>
                  <span>{labelBatch}: {(machine.activeBatchId || '').split('-')[0]}</span>
                  <span>{labelBin}: #{binNumber}</span>
                </div>
  
                <div style={{ fontSize: '11px', marginBottom: '2px' }}>
                  {labelOperator}: {operatorName || 'UNASSIGNED'}
                </div>
                <div style={{ fontSize: '11px', marginBottom: '10px' }}>
                  {labelSupervisor}: {supervisorName || 'N/A'}
                </div>
                
                <div style={{ borderBottom: '1px dashed #000', margin: '8px 0' }}></div>
                
                {grossNum > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                    <span>{labelGross}:</span>
                    <span>{grossNum}</span>
                  </div>
                )}
                {scrapNum > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                    <span>{labelStartup}:</span>
                    <span>{scrapNum}</span>
                  </div>
                )}
                {qcNum > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                    <span>{labelQC}:</span>
                    <span>{qcNum}</span>
                  </div>
                )}
                
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: 'bold', marginTop: '12px', paddingTop: '8px', borderTop: '1px solid #eee' }}>
                  <span>{labelNet}:</span>
                  <span>{netQty}</span>
                </div>
                
                <div style={{ textAlign: 'center', marginTop: '30px' }}>
                  <div style={{ fontSize: '10px', marginBottom: '12px', fontWeight: 'bold' }}>{labelUnit}: {unitId}</div>
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <QRCodeSVG value={unitId} size={160} level="M" />
                  </div>
                </div>
              </div>
            </div>

          <div style={{ display: 'flex', gap: '8px', position: 'sticky', bottom: '-10px', margin: '0 -16px -16px', padding: '10px 16px calc(10px + env(safe-area-inset-bottom, 0px))', background: 'var(--bg2)', borderTop: '1px solid var(--border)', zIndex: 2 }}>
            <button className="btn bsec" style={{ flex: 1 }} onClick={onClose} disabled={isSubmitting}>Cancel</button>
            <button 
              className="btn bpri" 
              style={{ flex: 2, opacity: isSubmitting ? 0.7 : 1 }}
              onClick={handleConfirm}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Printing & Logging...' : 'Confirm & Print Slip'}
              {!isSubmitting && <Printer size={16} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BinCompleteModal;
