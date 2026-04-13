import React, { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

import type { BreakdownReason } from '../types';

interface BreakdownModalProps {
  machineId: string;
  machineName: string;
  breakdownReasons: BreakdownReason[];
  onClose: () => void;
  onConfirm: (data: { event: string; remarks: string }) => void;
}


const BreakdownModal: React.FC<BreakdownModalProps> = ({ machineId, machineName, breakdownReasons, onClose, onConfirm }) => {
  const [event, setEvent] = useState(breakdownReasons[0]?.name || 'Other');
  const [remarks, setRemarks] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!remarks.trim()) return;
    onConfirm({ event, remarks });
  };

  return (
    <div className="ov">
      <div className="modal animate-fade-in">
        <div className="mhd">
          <div>
            <div className="mtit">Log Breakdown</div>
            <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '2px' }}>{machineName} ({machineId})</div>
          </div>
          <button className="mcl" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="mbd">
          <form onSubmit={handleSubmit}>
            <div className="fg">
              <label className="fl">Primary Event Category</label>
              <select 
                value={event}
                onChange={(e) => setEvent(e.target.value)}
                className="fsel"
              >
                {breakdownReasons.map(r => <option key={r.id} value={r.name}>{r.name}</option>)}
                <option value="Other">Other (Specify in Remarks)</option>
              </select>
            </div>

            <div className="fg">
              <label className="fl">Supervisor Remarks / Action Plan</label>
              <textarea 
                autoFocus
                required
                placeholder="Describe the root cause or temporary countermeasure..."
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                className="fi" 
                style={{ minHeight: '100px', resize: 'none' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
              <button type="button" className="btn bsec" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
              <button type="submit" className="btn bdan" style={{ flex: 2 }}>
                <AlertTriangle size={16} /> Record Breakdown
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default BreakdownModal;
