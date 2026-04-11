import React, { useState } from 'react';
import { X, CheckCircle, Printer } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import type { Machine } from '../types';

interface BinCompleteModalProps {
  machine: Machine;
  binNumber: number;
  operatorName?: string;
  operatorCode?: string;
  shift?: string;
  onClose: () => void;
  onConfirm: (data: { grossQty: number, startupScrap: number, qcSample: number, netQty: number }) => void;
}

const BinCompleteModal: React.FC<BinCompleteModalProps> = ({ machine, binNumber, operatorName, operatorCode, shift, onClose, onConfirm }) => {
  const [grossQty, setGrossQty] = useState(4000);
  const [startupScrap, setStartupScrap] = useState(0);
  const [qcSample, setQcSample] = useState(0);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const netQty = grossQty - startupScrap - qcSample;
  
  const unitId = `${machine.activeBatchId || 'BATCH'}-${machine.id}-${binNumber}`;

  const handleConfirm = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    
    // Trigger the print dialog for the thermal printer
    window.print();
    
    // Slight delay to allow the browser to process the print dialog before completing and unmounting
    setTimeout(async () => {
      await onConfirm({ grossQty, startupScrap, qcSample, netQty });
    }, 500);
  };

  return (
    <div className="ov">
      <div className="modal animate-scale-in">
        <div className="mhd">
          <div>
            <div className="mtit">Complete Bin #{binNumber}</div>
            <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '2px' }}>{machine.name} • {machine.model}</div>
          </div>
          <button onClick={onClose} className="mcl" disabled={isSubmitting}>
            <X size={20} />
          </button>
        </div>

        <div className="mbd">
          <div className="fg">
            <label className="fl">Gross Machine Count</label>
            <input 
              type="number" 
              className="fi" 
              value={grossQty} 
              onChange={(e) => setGrossQty(Number(e.target.value))} 
              disabled={isSubmitting}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '13px' }}>
            <div className="fg" style={{ marginBottom: 0 }}>
              <label className="fl">Startup / Purge Scrap</label>
              <input 
                type="number" 
                className="fi" 
                value={startupScrap} 
                onChange={(e) => setStartupScrap(Number(e.target.value))} 
                style={{ borderColor: startupScrap > 0 ? 'var(--amber-dim)' : '' }}
                disabled={isSubmitting}
              />
            </div>
            <div className="fg" style={{ marginBottom: 0 }}>
              <label className="fl">QC Samples Taken</label>
              <input 
                type="number" 
                className="fi" 
                value={qcSample} 
                onChange={(e) => setQcSample(Number(e.target.value))} 
                style={{ borderColor: qcSample > 0 ? 'var(--blue)' : '' }}
                disabled={isSubmitting}
              />
            </div>
          </div>

          <div className="msec">Print Preview</div>
          
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
            <div 
              id="print-slip" 
              style={{ 
                background: '#fff', 
                color: '#000', 
                padding: '16px', 
                borderRadius: '4px',
                width: '100%',
                maxWidth: '280px',
                fontFamily: 'var(--mono)',
                fontSize: '12px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
              }}
            >
              <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '14px', borderBottom: '1px solid #000', paddingBottom: '6px', marginBottom: '10px' }}>
                PRODUCTION SLIP
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span>Date/Time:</span>
                <span>{new Date().toLocaleDateString()} {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span>Shift:</span>
                <span>{shift || 'N/A'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span>Operator:</span>
                <span>{operatorName || 'UNASSIGNED'} {operatorCode && operatorCode !== 'N/A' && `(${operatorCode})`}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span>Machine ID:</span>
                <span>{machine.id}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span>Batch / Bin:</span>
                <span style={{ fontWeight: 'bold' }}>{machine.activeBatchId} / #{binNumber}</span>
              </div>
              
              <div style={{ borderBottom: '1px dashed #000', margin: '8px 0' }}></div>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span>Gross Qty:</span>
                <span>{grossQty}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span>Startup Scrap:</span>
                <span>{startupScrap}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span>QC Samples:</span>
                <span>{qcSample}</span>
              </div>
              
              <div style={{ borderBottom: '1px dashed #000', margin: '8px 0' }}></div>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: 'bold', marginTop: '8px' }}>
                <span>NET QTY:</span>
                <span>{netQty}</span>
              </div>
              
              <div style={{ textAlign: 'center', marginTop: '20px' }}>
                <div style={{ fontSize: '10px', marginBottom: '6px', fontWeight: 'bold' }}>UNIT ID: {unitId}</div>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <QRCodeSVG value={unitId} size={90} level="M" />
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
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
