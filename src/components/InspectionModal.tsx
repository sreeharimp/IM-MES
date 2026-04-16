import React, { useState } from 'react';
import { X, CheckCircle, AlertTriangle, Clipboard, User } from 'lucide-react';
import type { DefectType, Operator } from '../types';

interface InspectionModalProps {
  binId: string;
  netQty: number;
  defectTypes: DefectType[];
  operators: Operator[];
  onClose: () => void;
  onConfirm: (data: any) => void;
}

const InspectionModal: React.FC<InspectionModalProps> = ({ binId, netQty, defectTypes, operators, onClose, onConfirm }) => {
  const [rejections, setRejections] = useState(
    defectTypes.length > 0 
      ? defectTypes.map(d => ({ category: d.name, count: 0 }))
      : [
          { category: 'Flash / Burrs', count: 0 },
          { category: 'Short Shot', count: 0 },
          { category: 'Burn Marks', count: 0 },
          { category: 'Silver Streaks', count: 0 },
          { category: 'Dimensional Out', count: 0 },
        ]
  );
  const [inspectorId, setInspectorId] = useState('');

  const totalRejected = rejections.reduce((sum, r) => sum + r.count, 0);
  const goodQty = netQty - totalRejected;

  const updateRejection = (index: number, val: number) => {
    const next = [...rejections];
    next[index].count = Math.max(0, val);
    setRejections(next);
  };

  return (
    <div className="modal-overlay" style={{ overflowY: 'auto', padding: '10px' }}>
      <div 
        className="modal-container animate-scale-in" 
        style={{ 
          width: '100%', 
          maxWidth: '850px', // Wider for landscape
          maxHeight: 'none',
          background: 'var(--bg)',
          borderRadius: 'var(--rl)',
          border: '1px solid var(--border)',
          boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* Header - Fixed */}
        <div className="modal-header" style={{ padding: '24px 32px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ padding: '10px', background: 'var(--blue-bg)', borderRadius: '12px', color: 'var(--blue)' }}>
              <Clipboard size={24} />
            </div>
            <div>
              <div className="modal-title" style={{ fontSize: '20px', fontWeight: 600 }}>Visual Inspection Protocol</div>
              <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '2px' }}>
                <span className="mono" style={{ color: 'var(--text2)' }}>{binId}</span> • Incoming: <span className="mono" style={{ color: 'var(--text)' }}>{netQty.toLocaleString()}</span> pcs
              </div>
            </div>
          </div>
          <button onClick={onClose} className="mcl" style={{ background: 'var(--bg2)', borderRadius: '50%', padding: '8px' }}>
            <X size={20} />
          </button>
        </div>

        {/* Responsive Content Area */}
        <div className="modal-body" style={{ padding: '24px 32px' }}>
          {/* Inspector Selection */}
          <div style={{ marginBottom: '24px', padding: '16px', background: 'var(--bg2)', borderRadius: '16px', border: '1px solid var(--border)' }}>
             <label className="fl" style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <User size={14} /> INSPECTED BY (EMPLOYEE)
             </label>
             <select 
               className="fi" 
               style={{ background: 'var(--bg)', borderColor: !inspectorId ? 'var(--amber-dim)' : 'var(--border)' }}
               value={inspectorId}
               onChange={(e) => setInspectorId(e.target.value)}
             >
               <option value="">Select Inspector...</option>
               {operators.map(o => (
                 <option key={o.id} value={o.id}>{o.name} ({o.employeeId})</option>
               ))}
             </select>
             {!inspectorId && <p style={{ fontSize: '10px', color: 'var(--amber)', marginTop: '4px' }}>* Required to complete inspection</p>}
          </div>

          <div className="inspection-grid">
            
            {/* Left Column: Defect Categories */}
            <div className="inspection-categories">
              <div className="modal-section" style={{ borderTop: 'none', marginBottom: '16px', fontWeight: 600, letterSpacing: '0.05em' }}>DEFECT CATEGORIZATION</div>
              <div className="rejection-list">
                {rejections.map((rej, idx) => (
                  <div key={rej.category} className="rejection-item">
                    <span className="rejection-label">{rej.category}</span>
                    <div className="counter-group">
                      <button className="cbtn" onClick={() => updateRejection(idx, rej.count - 1)}>-</button>
                      <input 
                        type="number" 
                        className="counter-input" 
                        value={rej.count}
                        onChange={(e) => updateRejection(idx, Number(e.target.value))}
                      />
                      <button className="cbtn" onClick={() => updateRejection(idx, rej.count + 1)}>+</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right Column: Calculations & Action */}
            <div className="inspection-summary">
              <div className="modal-section" style={{ borderTop: 'none', marginBottom: '16px', fontWeight: 600, letterSpacing: '0.05em' }}>QUALITY SUMMARY</div>
              
              <div className="summary-cards">
                <div className="sum-card total">
                  <div className="sum-label">NET REJECTED</div>
                  <div className="sum-val red">{totalRejected.toLocaleString()}</div>
                </div>
                <div className="sum-card good">
                  <div className="sum-label">ACCEPTABLE OUTPUT</div>
                  <div className="sum-val green">{goodQty.toLocaleString()}</div>
                </div>
              </div>

              <div className="oee-mini-meter">
                <div className="meter-label">Quality Rate: <span style={{ color: netQty > 0 ? (goodQty/netQty > 0.95 ? 'var(--green)' : 'var(--amber)') : 'var(--text3)' }}>{netQty > 0 ? Math.round((goodQty / netQty) * 100) : 100}%</span></div>
                <div className="meter-bg">
                  <div className="meter-fill" style={{ width: `${netQty > 0 ? Math.max(0, (goodQty / netQty) * 100) : 100}%`, background: goodQty/netQty > 0.95 ? 'var(--green)' : 'var(--amber)' }} />
                </div>
              </div>

              {goodQty < 0 && (
                <div className="error-badge">
                  <AlertTriangle size={14} /> ERROR: Rejections exceed incoming quantity
                </div>
              )}

              <div style={{ flex: 1 }} />

              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button className="btn btn-outline" style={{ flex: 1 }} onClick={onClose}>Discard</button>
                <button 
                  className="btn btn-primary" 
                  style={{ flex: 2, padding: '14px 24px' }}
                  disabled={goodQty < 0 || !inspectorId}
                  onClick={() => onConfirm({ rejections, goodQty, inspectorId })}
                >
                  <CheckCircle size={18} /> Confirm & Seal Crate
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>

      <style>{`
        .inspection-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 32px;
        }

        .rejection-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .rejection-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          background: var(--bg2);
          border: 1px solid var(--border);
          border-radius: 12px;
          transition: all 0.2s;
        }

        .rejection-item:hover {
          border-color: var(--blue-dim);
          background: var(--bg3);
        }

        .rejection-label {
          font-size: 14px;
          font-weight: 500;
          color: var(--text2);
        }

        .counter-group {
          display: flex;
          align-items: center;
          gap: 4px;
          background: var(--bg);
          padding: 2px;
          border-radius: 8px;
          border: 1px solid var(--border);
        }

        .cbtn {
          width: 32px;
          height: 32px;
          border: none;
          background: transparent;
          color: var(--text3);
          cursor: pointer;
          font-size: 18px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 6px;
        }

        .cbtn:hover {
          background: var(--bg2);
          color: var(--text);
        }

        .counter-input {
          width: 60px;
          background: transparent;
          border: none;
          color: var(--text);
          font-family: var(--mono);
          text-align: center;
          font-weight: 600;
          font-size: 16px;
        }

        /* Summary styles */
        .summary-cards {
          display: grid;
          grid-template-columns: 1fr;
          gap: 16px;
          margin-bottom: 24px;
        }

        .sum-card {
          padding: 16px;
          background: var(--bg3);
          border: 1px solid var(--border2);
          border-radius: 16px;
        }

        .sum-label {
          font-size: 10px;
          font-weight: 700;
          color: var(--text3);
          letter-spacing: 0.1em;
          margin-bottom: 8px;
        }

        .sum-val {
          font-family: var(--mono);
          font-size: 32px;
          font-weight: 800;
        }

        .sum-val.red { color: var(--red); }
        .sum-val.green { color: var(--green); }

        .oee-mini-meter {
          margin-bottom: 24px;
        }

        .meter-label {
          font-size: 12px;
          color: var(--text3);
          margin-bottom: 8px;
        }

        .meter-bg {
          height: 8px;
          background: var(--bg3);
          border-radius: 4px;
          overflow: hidden;
        }

        .meter-fill {
          height: 100%;
          transition: width 0.3s ease;
        }

        .error-badge {
          display: flex;
          gap: 8px;
          align-items: center;
          padding: 10px;
          background: rgba(255, 68, 68, 0.1);
          color: var(--red);
          border-radius: 8px;
          font-size: 12px;
          font-weight: 600;
          justify-content: center;
        }

        @media (max-width: 768px) {
          .inspection-grid {
            grid-template-columns: 1fr;
            gap: 16px;
          }
          
          .modal-container {
            max-width: 100%;
            margin: 0;
            border-radius: var(--rl);
            max-height: 95vh;
            overflow: hidden;
          }

          .modal-header {
            padding: 16px 20px !important;
          }

          .modal-body {
            padding: 16px 20px !important;
            overflow-y: auto;
          }

          .summary-cards {
            grid-template-columns: 1fr 1fr;
            gap: 10px;
          }

          .rejection-item {
            padding: 10px 12px;
          }

          .modal-title {
            font-size: 16px !important;
          }

          .sum-val {
            font-size: 24px;
          }
        }

        /* Landscape optimization */
        @media (max-height: 600px) {
          .modal-container {
            max-width: 95vw;
            max-height: 95vh;
          }
          .modal-header {
            padding: 10px 20px !important;
          }
          .modal-body {
            padding: 10px 20px !important;
            overflow-y: auto;
          }
          .inspection-grid {
            gap: 12px;
          }
          .rejection-item {
            padding: 6px 12px;
          }
          .summary-cards {
            margin-bottom: 12px;
          }
          .sum-val {
            font-size: 20px;
          }
        }
      `}</style>
    </div>
  );
};

export default InspectionModal;
