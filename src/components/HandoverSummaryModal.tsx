import React, { useState } from 'react';
import { AlertTriangle, CheckCircle, X, MessageSquare } from 'lucide-react';
import type { Machine, Crate } from '../types';

interface HandoverSummaryModalProps {
  machines: Machine[];
  pendingCrates: Crate[];
  onConfirm: (data: { notes: string, totalOutput: number, runningMachines: number, pendingCrates: number }) => void;
  onClose: () => void;
}

const HandoverSummaryModal: React.FC<HandoverSummaryModalProps> = ({ 
  machines, 
  pendingCrates, 
  onConfirm, 
  onClose 
}) => {
  const [notes, setNotes] = useState('');
  const totalProduction = machines.reduce((acc, m) => acc + m.currentShiftProduction, 0);
  const activeMachines = machines.filter(m => m.status === 'Running').length;
  const maintenanceMachines = machines.filter(m => m.status === 'Maintenance').length;

  return (
    <div className="ov animate-fade-in">
      <div className="modal animate-scale-in" style={{ width: '840px', display: 'flex', flexDirection: 'column' }}>
        <div className="mhd">
          <div>
            <div className="mtit">Shift Handover Summary</div>
            <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '2px' }}>Review production metrics before sign-out</div>
          </div>
          <button className="mcl" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="cb" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '24px', padding: '24px' }}>
          <div>
            <div className="ct2" style={{ marginBottom: '12px' }}>Shift Performance</div>
            <div className="mg" style={{ gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
              <div className="mc2">
                <div className="ml">Total Output</div>
                <div className="mv green">{totalProduction.toLocaleString()}</div>
                <div className="ms">Shift Pcs</div>
              </div>
              <div className="mc2">
                <div className="ml">Pending WIP</div>
                <div className="mv amber">{pendingCrates.length}</div>
                <div className="ms">Active Bins</div>
              </div>
            </div>

            <div className="ct2" style={{ marginBottom: '12px' }}>Machine Status Recap</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div className="dot g" />
                  <span style={{ fontSize: '13px' }}>Running Machines</span>
                </div>
                <span className="mono" style={{ fontWeight: 600 }}>{activeMachines}</span>
              </div>
              <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div className="dot r" />
                  <span style={{ fontSize: '13px' }}>Maintenance / Breakdown</span>
                </div>
                <span className="mono" style={{ fontWeight: 600 }}>{maintenanceMachines}</span>
              </div>
              <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div className="dot i" />
                  <span style={{ fontSize: '13px' }}>Idle / Setup</span>
                </div>
                <span className="mono" style={{ fontWeight: 600 }}>{machines.length - activeMachines - maintenanceMachines}</span>
              </div>
            </div>
            
            <div style={{ marginTop: '20px' }}>
              <label className="fl"><MessageSquare size={10} style={{marginRight: '4px'}} /> Handover Notes</label>
              <textarea 
                className="fi" 
                placeholder="Share critical updates for next shift..." 
                style={{ height: '100px', resize: 'none' }}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: '24px' }}>
            <div className="ct2" style={{ marginBottom: '16px' }}>Handover Protocol</div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <ProtocolPoint text="All bin completions recorded" />
              <ProtocolPoint text="Maintenance alerts acknowledged" />
              <ProtocolPoint text="Handover notes synchronized" />
              <ProtocolPoint text="Workplace cleaning verified" />
            </div>

            {maintenanceMachines > 0 && (
              <div style={{ 
                marginTop: '20px', padding: '12px', background: 'var(--red-bg)', 
                border: '1px solid var(--red-dim)', borderRadius: 'var(--r)' 
              }}>
                <div style={{ display: 'flex', gap: '8px', color: 'var(--red)', fontWeight: 600, fontSize: '11px', textTransform: 'uppercase', marginBottom: '4px' }}>
                  <AlertTriangle size={14} /> Critical: Open Breakdowns
                </div>
                <p style={{ fontSize: '11px', color: 'var(--text2)' }}>
                  {maintenanceMachines} machine(s) are in Maintenance. Ensure tech updates are shared.
                </p>
              </div>
            )}

            <div style={{ marginTop: '32px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button className="btn bpri" style={{ width: '100%', height: '48px' }} onClick={() => onConfirm({ 
                notes, 
                totalOutput: totalProduction, 
                runningMachines: activeMachines, 
                pendingCrates: pendingCrates.length 
              })}>Confirm & Sign Out</button>
              <button className="btn bsec" style={{ width: '100%', height: '48px' }} onClick={onClose}>Cancel</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const ProtocolPoint = ({ text }: { text: string }) => (
  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
    <CheckCircle size={16} color="var(--green)" />
    <span style={{ fontSize: '12px', color: 'var(--text2)' }}>{text}</span>
  </div>
);

export default HandoverSummaryModal;
