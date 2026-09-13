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
    <div className="ov animate-fade-in" style={{ alignItems: 'flex-start', paddingTop: '10px' }}>
      <div className="modal animate-scale-in" style={{ display: 'flex', flexDirection: 'column', maxHeight: '95vh', position: 'relative', bottom: 'auto', top: '0', margin: '0 auto', borderRadius: '16px' }}>
        {/* Header - Fixed */}
        <div className="mhd">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ padding: '8px', background: 'var(--blue-bg)', borderRadius: '12px', color: 'var(--blue)', display: 'flex' }}>
              <Clipboard size={20} />
            </div>
            <div>
              <div className="mtit" style={{ fontSize: '18px' }}>Visual Inspection Protocol</div>
              <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>
                <span className="mono">{binId}</span> • Incoming: <span className="mono">{netQty.toLocaleString()}</span> pcs
              </div>
            </div>
          </div>
          <button onClick={onClose} className="mcl">
            <X size={20} />
          </button>
        </div>

        {/* Content Area */}
        <div className="mbd" style={{ overflowY: 'auto' }}>
          {/* Inspector Selection */}
          <div className="inspector-box">
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
              <div className="msec">DEFECT CATEGORIZATION</div>
              <div className="rejection-list">
                {rejections.map((rej, idx) => (
                  <div key={rej.category} className="rejection-item">
                    <span className="rejection-label">{rej.category}</span>
                    <div className="counter-group">
                      <button className="cbtn" onClick={() => updateRejection(idx, rej.count - 1)}>-</button>
                      <input 
                        type="number" 
                        className="counter-input" 
                        value={rej.count === 0 ? '' : rej.count}
                        placeholder="0"
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
              <div className="msec">QUALITY SUMMARY</div>
              
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

              <div className="action-btns" style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                <button className="btn bsec" style={{ flex: 1 }} onClick={onClose}>Discard</button>
                <button 
                  className="btn bpri" 
                  style={{ flex: 2 }}
                  disabled={goodQty < 0 || !inspectorId}
                  onClick={() => onConfirm({ rejections, goodQty, inspectorId })}
                >
                  <CheckCircle size={18} /> Confirm & Seal
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
          gap: 16px;
        }

        .rejection-list {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .rejection-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 6px 12px;
          background: var(--bg2);
          border: 1px solid var(--border);
          border-radius: 8px;
        }

        .rejection-label {
          font-size: 13px;
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
          width: 28px;
          height: 28px;
          border: none;
          background: transparent;
          color: var(--text3);
          cursor: pointer;
          font-size: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 6px;
        }

        .counter-input {
          width: 44px;
          background: transparent;
          border: none;
          color: var(--text);
          font-family: var(--mono);
          text-align: center;
          font-weight: 600;
          font-size: 14px;
        }

        .summary-cards {
          display: grid;
          grid-template-columns: 1fr;
          gap: 8px;
          margin-bottom: 12px;
        }

        .sum-card {
          padding: 8px 12px;
          background: var(--bg3);
          border: 1px solid var(--border2);
          border-radius: 12px;
        }

        .sum-label {
          font-size: 9px;
          font-weight: 700;
          color: var(--text3);
          letter-spacing: 0.1em;
          margin-bottom: 4px;
          text-transform: uppercase;
        }

        .sum-val {
          font-family: var(--mono);
          font-size: 24px;
          font-weight: 700;
        }

        .sum-val.red { color: var(--red); }
        .sum-val.green { color: var(--green); }

        .oee-mini-meter {
          margin-bottom: 12px;
        }

        .meter-label {
          font-size: 11px;
          color: var(--text3);
          margin-bottom: 6px;
        }

        .meter-bg {
          height: 6px;
          background: var(--bg3);
          border-radius: 3px;
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
          padding: 8px;
          background: var(--red-bg);
          color: var(--red);
          border-radius: 8px;
          font-size: 11px;
          font-weight: 600;
        }

        .inspector-box {
          margin-bottom: 12px;
          padding: 12px;
          background: var(--bg3);
          border-radius: 12px;
        }

        @media (max-width: 768px) {
          .inspection-grid {
            grid-template-columns: 1fr;
            gap: 12px;
          }
          .summary-cards {
            grid-template-columns: 1fr 1fr;
          }
          .sum-val {
            font-size: 20px;
          }
          .action-btns {
             position: sticky;
             bottom: 0;
             background: var(--bg2);
             margin: 0 -18px -18px;
             padding: 12px 18px;
             border-top: 1px solid var(--border);
          }
        }
      `}</style>
    </div>
  );
};

export default InspectionModal;
