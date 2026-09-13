import React, { useState } from 'react';
import { ShieldCheck, Zap, AlertTriangle, UserCheck } from 'lucide-react';

interface ShiftHandoverModalProps {
  onAcknowledge: (assignments: any) => void;
}

const ShiftHandoverModal: React.FC<ShiftHandoverModalProps> = ({ onAcknowledge }) => {
  const [acknowledged, setAcknowledged] = useState(false);

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'radial-gradient(circle at center, #1a1e26 0%, var(--bg) 100%)',
      zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px'
    }}>
      <div className="animate-fade-in" style={{ width: '100%', maxWidth: '960px' }}>
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{ display: 'inline-flex', padding: '10px 20px', background: 'var(--blue-bg)', border: '1px solid #1a4a7a', borderRadius: '20px', marginBottom: '20px', alignItems: 'center', gap: '10px' }}>
            <div className="dot" style={{ background: 'var(--blue)' }} />
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--blue)', letterSpacing: '.1em', textTransform: 'uppercase' }}>Shift Handover Protocol · ISO 13485</span>
          </div>
          <h1 style={{ fontSize: '32px', fontWeight: 600, color: 'var(--text)', marginBottom: '8px', letterSpacing: '-0.02em' }}>Initialize Command Center</h1>
          <p style={{ color: 'var(--text3)', fontSize: '14px', maxWidth: '600px', margin: '0 auto' }}>
            Review plant inheritance and operator assignments to maintain the unbroken chain of production responsibility.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '48px' }}>
          {/* Plant Status */}
          <div className="glass-card" style={{ padding: 0 }}>
            <div className="card-header">
              <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Zap size={14} color="var(--amber)" /> Inherited Plant Status
              </span>
            </div>
            <div className="card-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '20px' }}>
                <div className="status-box">
                  <span className="status-label">Running</span>
                  <div className="status-value">3 / 4</div>
                </div>
                <div className="status-box">
                  <span className="status-label">Efficiency</span>
                  <div className="status-value" style={{ color: 'var(--green)' }}>84.2%</div>
                </div>
                <div className="status-box">
                  <span className="status-label">WIP Bins</span>
                  <div className="status-value">12 <span style={{ fontSize: '10px', fontWeight: 400, color: 'var(--text3)' }}>PENDING</span></div>
                </div>
                <div className="status-box">
                  <span className="status-label">Material</span>
                  <div className="status-value" style={{ fontSize: '11px' }}>H110MA / 1102XK</div>
                </div>
              </div>
              
              <div style={{ 
                padding: '12px', background: 'var(--red-bg)', border: '1px solid var(--red-dim)', borderRadius: 'var(--r)',
                display: 'flex', gap: '10px'
              }}>
                <AlertTriangle size={18} color="var(--red)" style={{ flexShrink: 0 }} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: '12px', color: 'var(--red)' }}>PENDING BREAKDOWN: MACHINE 04</div>
                  <div style={{ fontSize: '11px', color: 'var(--text2)', marginTop: '2px' }}>Nozzle heater fluctuation reported at 14:15. Technicians responding.</div>
                </div>
              </div>
            </div>
          </div>

          {/* Assignments */}
          <div className="glass-card" style={{ padding: 0 }}>
            <div className="card-header">
              <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <UserCheck size={14} color="var(--blue)" /> Active Shift Assignments
              </span>
            </div>
            <div className="card-body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <AssignmentItem machine="IMM-01" name="S. Nair" cert={true} />
                <AssignmentItem machine="IMM-02" name="R. Kumar" cert={true} />
                <AssignmentItem machine="IMM-03" name="A. Joshi" cert={true} />
                <AssignmentItem machine="INSP-01" name="P. Verma" role="INSPECTOR" cert={true} />
              </div>
            </div>
          </div>
        </div>

        <div style={{ textAlign: 'center' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '12px', marginBottom: '32px', cursor: 'pointer', userSelect: 'none' }}>
            <div style={{ 
              width: '24px', height: '24px', borderRadius: '6px', border: '1px solid var(--border2)',
              background: acknowledged ? 'var(--green)' : 'var(--bg3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s'
            }}>
              {acknowledged && <ShieldCheck size={16} color="var(--bg)" />}
              <input 
                type="checkbox" 
                checked={acknowledged} 
                onChange={(e) => setAcknowledged(e.target.checked)}
                style={{ display: 'none' }}
              />
            </div>
            <span style={{ fontSize: '14px', color: acknowledged ? 'var(--text)' : 'var(--text3)' }}>I acknowledge the plant status and accept responsibility for the upcoming shift.</span>
          </label>

          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <button 
              className={`btn btn-primary ${!acknowledged ? 'disabled' : ''}`} 
              style={{ padding: '14px 48px', fontSize: '14px', height: 'auto' }}
              disabled={!acknowledged}
              onClick={() => onAcknowledge({})}
            >
              Initialize Production Console
            </button>
          </div>
        </div>
      </div>

      <style>{`
        .status-box {
          background: var(--bg4);
          padding: 10px 12px;
          border-radius: var(--r);
        }
        .status-label {
          display: block;
          font-size: 9px;
          color: var(--text3);
          text-transform: uppercase;
          letter-spacing: .08em;
          margin-bottom: 2px;
        }
        .status-value {
          display: block;
          font-family: var(--mono);
          font-size: 16px;
          font-weight: 600;
          color: var(--text);
        }
      `}</style>
    </div>
  );
};

const AssignmentItem = ({ machine, name, cert, role }: { machine: string, name: string, cert: boolean, role?: string }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'var(--bg3)', borderRadius: 'var(--r)', border: '1px solid var(--border)' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <span className="mono" style={{ fontSize: '11px', color: 'var(--text3)' }}>{machine}</span>
      <span style={{ fontSize: '13px', fontWeight: 500 }}>{name}</span>
    </div>
    <div style={{ display: 'flex', gap: '6px' }}>
      {role && <span className="tag tag-blue">{role}</span>}
      {cert && <span className="tag tag-green">CERTIFIED</span>}
    </div>
  </div>
);

export default ShiftHandoverModal;
