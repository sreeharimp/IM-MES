import React, { useState } from 'react';
import { CheckCircle, X } from 'lucide-react';

interface ResolveBreakdownModalProps {
  machineName: string;
  onClose: () => void;
  onConfirm: (notes: string) => void;
}

const ResolveBreakdownModal: React.FC<ResolveBreakdownModalProps> = ({ machineName, onClose, onConfirm }) => {
  const [notes, setNotes] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!notes.trim()) return;
    onConfirm(notes);
  };

  return (
    <div className="ov">
      <div className="modal animate-scale-in">
        <div className="mhd">
          <div>
            <div className="mtit">Resolve Breakdown</div>
            <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '2px' }}>{machineName}</div>
          </div>
          <button className="mcl" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="mbd">
          <form onSubmit={handleSubmit}>
            <div className="fg">
              <label className="fl">Resolution Notes / Corrective Actions</label>
              <textarea 
                autoFocus
                required
                placeholder="Describe what was fixed and any parts replaced..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="fi" 
                style={{ minHeight: '100px', resize: 'none' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
              <button type="button" className="btn bsec" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
              <button type="submit" className="btn bpri" style={{ flex: 2 }}>
                <CheckCircle size={16} /> Proceed to Verification
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ResolveBreakdownModal;
