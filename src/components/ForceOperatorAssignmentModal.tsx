import React, { useState } from 'react';
import { AlertCircle, UserCheck, X } from 'lucide-react';
import type { Machine, Operator } from '../types';

interface ForceOperatorAssignmentModalProps {
  machines: Machine[];
  operators: Operator[];
  onConfirm: (assignments: { machineId: string, operatorId: string }[]) => void;
  onClose?: () => void;
}

const ForceOperatorAssignmentModal: React.FC<ForceOperatorAssignmentModalProps> = ({ machines, operators, onConfirm, onClose }) => {
  const [assignments, setAssignments] = useState<Record<string, string>>({});

  const handleSelect = (machineId: string, operatorId: string) => {
    setAssignments(prev => ({ ...prev, [machineId]: operatorId }));
  };

  const allAssigned = machines.every(m => assignments[m.id]);

  const handleConfirm = () => {
    if (!allAssigned) return;
    const finalAssignments = Object.entries(assignments).map(([machineId, operatorId]) => ({ machineId, operatorId }));
    onConfirm(finalAssignments);
  };

  return (
    <div className="ov animate-fade-in" style={{ alignItems: 'flex-start', paddingTop: '10px' }}>
      <div className="modal animate-scale-in" style={{ display: 'flex', flexDirection: 'column', position: 'relative', bottom: 'auto', top: '0', margin: '0 auto' }}>
        <div className="mhd" style={{ background: 'var(--amber-bg)', borderBottomColor: 'var(--amber-dim)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--amber)' }}>
            <AlertCircle size={20} />
            <div className="mtit" style={{ color: 'var(--amber)' }}>Assign Operators</div>
          </div>
          {onClose && (
            <button className="mcl" onClick={onClose} style={{ color: 'var(--amber)' }}>
              <X size={20} />
            </button>
          )}
        </div>

        <div className="mbd" style={{ overflowY: 'auto', padding: '16px 20px' }}>
          <p style={{ color: 'var(--text3)', marginBottom: '12px', fontSize: '13px', lineHeight: '1.5' }}>
            Acknowledge operator assignments for the current shift. Each running machine requires an active operator.
          </p>

          <div className="assignment-list">
            {machines.map(m => (
              <div key={m.id} className="assignment-card">
                <div className="machine-header">
                  <div className="machine-icon">
                    <AlertCircle size={16} />
                  </div>
                  <div className="machine-info">
                    <div className="machine-name">{m.name}</div>
                    <div className="machine-details">{m.id} • {m.status}</div>
                  </div>
                </div>
                
                <div className="operator-selection">
                  <label className="fl" style={{ fontSize: '10px', marginBottom: '6px', color: 'var(--text3)' }}>ASSIGNED OPERATOR</label>
                  <select 
                    className="fi" 
                    style={{ width: '100%', minHeight: '42px', fontSize: '14px' }}
                    value={assignments[m.id] || ''}
                    onChange={e => handleSelect(m.id, e.target.value)}
                  >
                    <option value="">Select Operator...</option>
                    {operators.filter(o => o.isCertified).map(o => (
                      <option key={o.id} value={o.id}>{o.name} ({o.employeeId})</option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="modal-footer" style={{ padding: '20px', borderTop: '1px solid var(--border)', background: 'var(--bg2)' }}>
          <button 
            className="btn bpri" 
            style={{ width: '100%', height: '56px', borderRadius: '16px', fontSize: '16px', fontWeight: 600, display: 'flex', justifyContent: 'center', gap: '12px' }}
            disabled={!allAssigned}
            onClick={handleConfirm}
          >
            <UserCheck size={22} /> Confirm & Proceed
          </button>
        </div>
      </div>

      <style>{`
        .assignment-list {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .assignment-card {
          padding: 12px;
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: 16px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .machine-header {
          display: flex;
          align-items: center;
          gap: 14px;
        }
        .machine-icon {
          width: 32px;
          height: 32px;
          border-radius: 10px;
          background: var(--amber-bg);
          color: var(--amber);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .machine-name {
          font-weight: 700;
          font-size: 14px;
          color: var(--text);
        }
        .machine-details {
          font-size: 12px;
          color: var(--text3);
          font-family: var(--mono);
        }
        .operator-selection {
          border-top: 1px solid var(--border);
          padding-top: 10px;
        }
      `}</style>
    </div>
  );
}

export default ForceOperatorAssignmentModal;
