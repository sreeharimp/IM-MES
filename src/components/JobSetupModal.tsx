import React, { useState } from 'react';
import { X, ArrowRight, ChevronLeft, AlertCircle, Check } from 'lucide-react';
import type { Product, Machine, Mould, RawMaterial, ProductMaterial, CleaningTask } from '../types';

interface JobSetupModalProps {
  machine: Machine;
  allMachines: Machine[];
  products: Product[];
  moulds: Mould[];
  rawMaterials: RawMaterial[];
  productMaterials: ProductMaterial[];
  cleaningTasks: CleaningTask[];
  onClose: () => void;
  onConfirm: (data: { 
    mouldId: string,
    productId: string, 
    materialId: string,
    materialGrade: string, 
    materialBatch: string,
    isMouldChanged: boolean,
    binTarget: number
  }) => void;
  onAssignOperator: () => void;
}

const JobSetupModal: React.FC<JobSetupModalProps> = ({ 
  machine, allMachines, products, moulds, rawMaterials, productMaterials, cleaningTasks, onClose, onConfirm, onAssignOperator 
}) => {
  const [step, setStep] = useState(1);
  const [isMouldChanged, setIsMouldChanged] = useState<boolean | null>(null);
  const [setup, setSetup] = useState({
    mouldId: machine.currentMouldId || '',
    productId: machine.activeProductId || '',
    materialId: machine.currentMaterialId || '',
    materialGrade: machine.materialGrade || '',
    materialBatch: machine.materialBatch || '',
    binTarget: machine.binTarget || 4000
  });

  const [checklist, setChecklist] = useState<Record<string, boolean>>({});



  const handleBack = () => setStep(s => s - 1);

  const renderStep = () => {
    if (step === 1) {
      return (
        <div className="animate-fade-in">
          <div className="msec" style={{ borderTop: 'none', marginBottom: '12px' }}>Select Setup Type</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button 
              className="rmo sel prm" 
              style={{ padding: '14px', width: '100%', textAlign: 'left' }}
              onClick={() => { setIsMouldChanged(true); setStep(2); }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="rmn" style={{ fontSize: '14px' }}>New Mould Change</span>
                <span className="pill pg" style={{ fontSize: '9px' }}>Full Validation</span>
              </div>
              <div className="rmm">Required for new production jobs or product switches.</div>
            </button>
            <button 
              className="rmo" 
              style={{ padding: '14px', width: '100%', textAlign: 'left' }}
              onClick={() => { setIsMouldChanged(false); setStep(4); }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="rmn" style={{ fontSize: '14px' }}>Resume Production</span>
                <span className="pill pd" style={{ fontSize: '9px' }}>Quick Start</span>
              </div>
              <div className="rmm">Continue existing run with same mould & product.</div>
            </button>
          </div>
        </div>
      );
    }

    if (step === 2 && isMouldChanged) {
      // Find moulds used by other machines
      const busyMouldIds = allMachines
        .filter(m => m.id !== machine.id && m.currentMouldId)
        .map(m => m.currentMouldId);

      const availableMoulds = moulds.filter(m => !busyMouldIds.includes(m.id));

      return (
        <div className="animate-fade-in">
          <div className="msec" style={{ borderTop: 'none', marginBottom: '12px' }}>Step 1: Select Active Mould</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '300px', overflowY: 'auto' }}>
            {availableMoulds.map(m => (
              <button
                key={m.id}
                onClick={() => { setSetup({ ...setup, mouldId: m.id, productId: '' }); setStep(3); }}
                className={`rmo ${setup.mouldId === m.id ? 'sel' : ''}`}
                style={{ width: '100%', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <div>
                  <div className="rmn">{m.name}</div>
                  <div className="rmm">Mould ID: {m.id} • {m.cavities} Cavities</div>
                </div>
                <ArrowRight size={14} color="var(--text3)" />
              </button>
            ))}
            {availableMoulds.length === 0 && (
              <div className="card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text3)' }}>
                No moulds available. All active moulds are assigned to other machines.
              </div>
            )}
          </div>
        </div>
      );
    }

    if (step === 3 && isMouldChanged) {
      const associatedProducts = products.filter(p => p.mouldId === setup.mouldId);
      return (
        <div className="animate-fade-in">
          <div className="msec" style={{ borderTop: 'none', marginBottom: '12px' }}>Step 2: Select Associated Product</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {associatedProducts.map(p => (
              <button
                key={p.id}
                onClick={() => { setSetup({ ...setup, productId: p.id, materialId: '' }); setStep(4); }}
                className={`rmo ${setup.productId === p.id ? 'sel' : ''}`}
                style={{ width: '100%', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <div>
                  <div className="rmn">{p.name}</div>
                  <div className="rmm">Item Code: {p.itemCode} • Bin Qty: {p.binQty}</div>
                </div>
                <ArrowRight size={14} color="var(--text3)" />
              </button>
            ))}
            {associatedProducts.length === 0 && (
              <div className="card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text3)' }}>
                No products linked to this mould.
              </div>
            )}
          </div>
        </div>
      );
    }

    if (step === 4) {
      const approvedIds = productMaterials.filter(pm => pm.productId === setup.productId).map(pm => pm.materialId);
      const approvedMaterials = rawMaterials.filter(rm => approvedIds.includes(rm.id));

      return (
        <div className="animate-fade-in">
          <div className="msec" style={{ borderTop: 'none', marginBottom: '12px' }}>Step 3: Material & Traceability</div>
          
          <div className="fg">
            <label className="fl">Approved Raw Materials</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '6px', maxHeight: '180px', overflowY: 'auto' }}>
              {approvedMaterials.map(rm => (
                <button 
                  key={rm.id} 
                  className={`to ${setup.materialId === rm.id ? 'sel' : ''}`}
                  style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px' }}
                  onClick={() => setSetup({...setup, materialId: rm.id, materialGrade: rm.id})} // Map ID to Grade
                >
                  <span style={{ fontWeight: 600 }}>{rm.name}</span>
                  <span style={{ fontSize: '10px', color: 'var(--text3)' }}>{rm.vendor}</span>
                </button>
              ))}
              {approvedMaterials.length === 0 && (
                <div style={{ padding: '10px', background: 'var(--red-bg)', color: 'var(--red)', borderRadius: 'var(--r)', fontSize: '12px', border: '1px solid var(--red-dim)' }}>
                  No approved materials found for this product.
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px', marginTop: '12px' }}>
            <div className="fg">
              <label className="fl">Material Batch #</label>
              <input type="text" className="fi" placeholder="LOT-001" 
                value={setup.materialBatch} onChange={e => setSetup({...setup, materialBatch: e.target.value})} />
            </div>
          </div>

          <div className="fg">
            <label className="fl">Bin Target (pcs)</label>
            <input type="number" className="fi" value={setup.binTarget} min={100}
              onChange={e => setSetup({...setup, binTarget: Number(e.target.value)})} />
          </div>

          <button 
            disabled={!setup.materialId || !setup.materialBatch}
            className="btn bpri bfull" 
            style={{ marginTop: '8px' }} 
            onClick={() => setStep(5)}
          >
            Go to Cleaning Checks
          </button>
        </div>
      );
    }

    if (step === 5) {
      return (
        <div className="animate-fade-in">
          <div className="msec" style={{ borderTop: 'none', marginBottom: '12px' }}>Machine Hygiene Checklist</div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', background: 'var(--border)', borderRadius: 'var(--r)', overflow: 'hidden', marginBottom: '16px', border: '1px solid var(--border)' }}>
            {cleaningTasks.map(item => (
              <div 
                key={item.id}
                onClick={() => setChecklist({...checklist, [item.id]: !checklist[item.id]})}
                style={{ 
                  display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', cursor: 'pointer',
                  background: checklist[item.id] ? 'var(--green-bg)' : 'var(--bg2)',
                  transition: 'background 0.15s'
                }}
              >
                <div style={{ 
                  width: '18px', height: '18px', borderRadius: '4px', border: '1px solid', 
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: checklist[item.id] ? 'var(--green)' : 'var(--bg3)',
                  borderColor: checklist[item.id] ? 'var(--green)' : 'var(--border2)'
                }}>
                  {checklist[item.id] && <Check size={14} color="var(--bg)" />}
                </div>
                <span style={{ fontSize: '13px', color: checklist[item.id] ? 'var(--text)' : 'var(--text2)' }}>{item.label}</span>
              </div>
            ))}
            {cleaningTasks.length === 0 && (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text3)', fontSize: '12px' }}>
                No mandatory cleaning tasks defined.
              </div>
            )}
          </div>

          {!machine.currentOperatorId && (
            <div style={{ 
              padding: '10px 12px', background: 'var(--red-bg)', border: '1px solid var(--red-dim)',
              borderRadius: 'var(--r)', marginBottom: '16px', fontSize: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: 'var(--red)', marginBottom: '4px' }}>
                <AlertCircle size={14} /> UNASSIGNED OPERATOR
              </div>
              <div style={{ color: 'var(--text2)', fontSize: '11px', marginBottom: '10px' }}>ISO 13485 requires an assigned operator to start production.</div>
              <button 
                className="btn bsec bsm bfull" 
                style={{ borderColor: 'var(--red-dim)', color: 'var(--red)' }}
                onClick={onAssignOperator}
              >
                Assign Operator Now
              </button>
            </div>
          )}

          <button 
            disabled={(cleaningTasks.length > 0 && !cleaningTasks.every(t => checklist[t.id])) || !machine.currentOperatorId}
            className="btn bpri bfull" 
            onClick={() => onConfirm({ ...setup, isMouldChanged: !!isMouldChanged })}
          >
             Finalize & Start Production
          </button>
        </div>
      );
    }
  };

  return (
    <div className="ov">
      <div className="modal animate-scale-in" style={{ width: '420px' }}>
        <div className="mhd">
          <div>
            <div className="mtit">{machine.id}: Setup Validation</div>
            <div className="ps" style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '1px' }}>Compliance & 5M Checklist</div>
          </div>
          <button onClick={onClose} className="mcl">
            <X size={20} />
          </button>
        </div>

        <div className="mbd">
          {isMouldChanged !== null && (
            <div style={{ display: 'flex', gap: '4px', marginBottom: '16px' }}>
              {[1, 2, 3, 4, 5].map(s => (
                <div key={s} style={{ 
                  flex: 1, height: '3px', borderRadius: '1px',
                  background: s <= step ? 'var(--green)' : 'var(--bg4)',
                  opacity: (!isMouldChanged && (s === 2 || s === 3)) ? 0.2 : 1
                }} />
              ))}
            </div>
          )}

          <div style={{ minHeight: '320px' }}>
            {renderStep()}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px' }}>
            {step > 1 && (
              <button 
                onClick={() => {
                  if (step === 4 && !isMouldChanged) setIsMouldChanged(null);
                  else handleBack();
                }} 
                className="btn bsec bsm" 
                style={{ border: 'none', background: 'none' }}
              >
                <ChevronLeft size={14} /> Back
              </button>
            )}
            <div />
          </div>
        </div>
      </div>
    </div>
  );
};

export default JobSetupModal;
