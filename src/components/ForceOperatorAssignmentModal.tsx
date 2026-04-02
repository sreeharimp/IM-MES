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
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(8px)',
      zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center'
    }}>
      <div className="card animate-scale-in" style={{ width: '600px', maxWidth: '90vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div className="ch" style={{ background: 'var(--amber-bg)', borderBottom: '1px solid var(--amber-dim)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="ct2" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--amber)' }}>
            <AlertCircle size={20} /> Action Required: Assign Operators
          </span>
          {onClose && (
            <button 
              onClick={onClose} 
              style={{ background: 'none', border: 'none', color: 'var(--amber)', cursor: 'pointer', padding: '4px' }}
            >
              <X size={20} />
            </button>
          )}
        </div>
        <div className="cb" style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          <p style={{ color: 'var(--text2)', marginBottom: '24px', lineHeight: '1.5' }}>
            Ensure an operator is assigned to each machine to maintain consistent production tracking and quality accountability.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {machines.map(m => (
              <div key={m.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', alignItems: 'center', padding: '16px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--r)' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '15px' }}>{m.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '4px' }}>Machine {m.id}</div>
                </div>
                <select 
                  className="fi" 
                  value={assignments[m.id] || ''}
                  onChange={e => handleSelect(m.id, e.target.value)}
                >
                  <option value="">Select Operator...</option>
                  {operators.filter(o => o.isCertified).map(o => (
                    <option key={o.id} value={o.id}>{o.name} ({o.employeeId})</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
        <div style={{ padding: '24px', borderTop: '1px solid var(--border)', background: 'var(--bg2)', borderBottomLeftRadius: 'var(--r)', borderBottomRightRadius: 'var(--r)' }}>
          <button 
            className="btn bpri" 
            style={{ width: '100%', padding: '14px', fontSize: '15px', display: 'flex', justifyContent: 'center', gap: '8px' }}
            disabled={!allAssigned}
            onClick={handleConfirm}
          >
            <UserCheck size={18} /> Confirm Assignments
          </button>
        </div>
      </div>
    </div>
  );
}

export default ForceOperatorAssignmentModal;
