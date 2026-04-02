import React, { useState, useEffect } from 'react';
import { ArrowRight, AlertTriangle } from 'lucide-react';
import type { ShiftSetting } from '../types';

interface ShiftHandoverPageProps {
  summary: any;
  shiftSettings: ShiftSetting[];
  onAcknowledge: (selectedShiftId: string) => void;
  supervisorName: string;
  outgoingSupervisorEmail?: string;
}

const ShiftHandoverPage: React.FC<ShiftHandoverPageProps> = ({ summary, shiftSettings, onAcknowledge, supervisorName, outgoingSupervisorEmail }) => {
  const [selectedShiftId, setSelectedShiftId] = useState<string>('');

  useEffect(() => {
    // Auto-detect shift based on current time
    if (!shiftSettings || shiftSettings.length === 0) return;
    
    const now = new Date();
    const currentHours = now.getHours();
    const currentMinutes = now.getMinutes();
    const currentTimeVal = currentHours + currentMinutes / 60;

    let detectedShift = shiftSettings[0].id;

    for (const shift of shiftSettings) {
      const [startH, startM] = shift.startTime.split(':').map(Number);
      const [endH, endM] = shift.endTime.split(':').map(Number);
      
      const startVal = startH + startM / 60;
      const endVal = endH + endM / 60;

      if (startVal < endVal) {
        if (currentTimeVal >= startVal && currentTimeVal < endVal) {
          detectedShift = shift.id;
          break;
        }
      } else {
        // Crosses midnight (e.g., 22:00 to 06:00)
        if (currentTimeVal >= startVal || currentTimeVal < endVal) {
          detectedShift = shift.id;
          break;
        }
      }
    }
    
    setSelectedShiftId(detectedShift);
  }, [shiftSettings]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg)', color: 'var(--text)' }}>
      <div style={{ padding: '40px', maxWidth: '800px', margin: '0 auto', width: '100%', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <h1 style={{ fontSize: '32px', marginBottom: '8px' }}>Welcome, {supervisorName}</h1>
          <p style={{ color: 'var(--text3)' }}>A shift handover is pending. Please acknowledge the previous shift's performance and start your shift.</p>
        </div>

        <div className="card animate-scale-in" style={{ marginBottom: '32px' }}>
          <div className="ch">
            <span className="ct2">Previous Shift Summary</span>
            {outgoingSupervisorEmail && (
              <span style={{ fontSize: '11px', color: 'var(--text3)' }}>Handover from: <span style={{ color: 'var(--amber)', fontWeight: 600 }}>{outgoingSupervisorEmail}</span></span>
            )}
          </div>
          <div className="cb" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
            <div style={{ padding: '20px', background: 'var(--bg2)', borderRadius: 'var(--r)', textAlign: 'center' }}>
              <div style={{ fontSize: '13px', color: 'var(--text3)', marginBottom: '8px' }}>Total Output</div>
              <div style={{ fontSize: '28px', color: 'var(--green)', fontWeight: 600 }}>
                {summary?.totalOutput?.toLocaleString() || 0}
              </div>
            </div>
            <div style={{ padding: '20px', background: 'var(--bg2)', borderRadius: 'var(--r)', textAlign: 'center' }}>
              <div style={{ fontSize: '13px', color: 'var(--text3)', marginBottom: '8px' }}>Running Machines</div>
              <div style={{ fontSize: '28px', color: 'var(--purple)', fontWeight: 600 }}>
                {summary?.runningMachines || 0}
              </div>
            </div>
            <div style={{ padding: '20px', background: 'var(--bg2)', borderRadius: 'var(--r)', textAlign: 'center' }}>
              <div style={{ fontSize: '13px', color: 'var(--text3)', marginBottom: '8px' }}>Pending Crates</div>
              <div style={{ fontSize: '28px', color: 'var(--amber)', fontWeight: 600 }}>
                {summary?.pendingCrates || 0}
              </div>
            </div>
          </div>
        </div>

        <div className="card animate-scale-in" style={{ animationDelay: '0.1s' }}>
          <div className="cb" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            <div style={{ display: 'flex', gap: '16px', padding: '16px', background: 'rgba(255, 170, 0, 0.1)', color: 'var(--amber)', borderRadius: 'var(--r)', border: '1px solid rgba(255, 170, 0, 0.2)' }}>
              <AlertTriangle size={20} style={{ flexShrink: 0 }} />
              <div style={{ fontSize: '13px', lineHeight: '1.5' }}>
                All operators have been unassigned for the shift changeover. Machines that are currently running will require new operator assignments once you proceed to the floor.
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', color: 'var(--text2)', marginBottom: '8px' }}>
                Starting Shift
              </label>
              <select 
                className="fi" 
                style={{ width: '100%', padding: '12px' }}
                value={selectedShiftId} 
                onChange={e => setSelectedShiftId(e.target.value)}
              >
                {shiftSettings.map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({s.startTime} - {s.endTime})</option>
                ))}
              </select>
            </div>

            <button 
              className="btn bpri" 
              style={{ padding: '16px', display: 'flex', justifyContent: 'center', gap: '8px', fontSize: '16px' }}
              onClick={() => onAcknowledge(selectedShiftId)}
            >
              Acknowledge & Start Shift <ArrowRight size={20} />
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default ShiftHandoverPage;
