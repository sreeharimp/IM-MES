import React, { useState } from 'react';
import { X, CheckCircle } from 'lucide-react';
import type { Machine } from '../types';

interface BinCompleteModalProps {
  machine: Machine;
  binNumber: number;
  onClose: () => void;
  onConfirm: (data: { grossQty: number, startupScrap: number, qcSample: number, netQty: number }) => void;
}

const BinCompleteModal: React.FC<BinCompleteModalProps> = ({ machine, binNumber, onClose, onConfirm }) => {
  const [grossQty, setGrossQty] = useState(4000);
  const [startupScrap, setStartupScrap] = useState(0);
  const [qcSample, setQcSample] = useState(0);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const netQty = grossQty - startupScrap - qcSample;

  const handleConfirm = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    await onConfirm({ grossQty, startupScrap, qcSample, netQty });
    // isSubmitting will stay true until modal closes for safety
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

          <div className="msec">Calculation Summary</div>
          
          <div className="bcp-box">
            <div className="bcp-val">{netQty.toLocaleString()}</div>
            <div className="bcp-parts" style={{ marginTop: '4px', fontSize: '10px', color: 'var(--text3)' }}>
              Net units to Inspection
            </div>
          </div>
          
          <div style={{ fontSize: '11px', color: 'var(--text3)', textAlign: 'center', marginBottom: '20px' }}>
            This quantity will be sent to Visual Inspection for final grading.
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn bsec" style={{ flex: 1 }} onClick={onClose} disabled={isSubmitting}>Cancel</button>
            <button 
              className="btn bpri" 
              style={{ flex: 2, opacity: isSubmitting ? 0.7 : 1 }}
              onClick={handleConfirm}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Logging...' : 'Confirm & Next Bin'}
              {!isSubmitting && <CheckCircle size={16} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BinCompleteModal;
