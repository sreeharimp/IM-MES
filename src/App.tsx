import React, { useState, useEffect } from 'react';
import { 
  LogOut, Wrench, Factory, History, Cpu, Menu, 
  ChevronLeft, ChevronRight, ScrollText, CheckCircle2, 
  Play, UserPlus, ClipboardList, Square, AlertCircle, Info, Pencil, X, ShieldCheck, Boxes, LayoutDashboard
} from 'lucide-react';
import type { Machine, MachineStatus, Operator, Product, Mould, RawMaterial, ProductMaterial, Crate, BatchRecord, ShiftSetting, AppSettings, DefectType, BreakdownReason, CleaningTask, Tab } from './types';
import { DEFAULT_ROLE_PERMISSIONS } from './types';
import { getBatchSummary, formatUnitId } from './utils/batchUtils';
import { printProductionSlip } from './utils/printService';
import { supabase } from './lib/supabase';

// Modals & Pages
import BinCompleteModal from './components/BinCompleteModal';
import InspectionModal from './components/InspectionModal';
import AdminDashboard from './components/AdminDashboard';
import BreakdownModal from './components/BreakdownModal';
import JobSetupModal from './components/JobSetupModal';
import HandoverSummaryModal from './components/HandoverSummaryModal';
import ResolveBreakdownModal from './components/ResolveBreakdownModal';
import Login from './components/Login';
import ShiftHandoverPage from './components/ShiftHandoverPage';
import ForceOperatorAssignmentModal from './components/ForceOperatorAssignmentModal';
import ShiftLogPage from './components/ShiftLogPage';
import InspectionPage from './components/InspectionPage';
import BreakdownLogPage from './components/BreakdownLogPage';
import BatchLogPage from './components/BatchLogPage';
import PackingPage from './components/PackingPage';
import LiveDashboardPage from './components/LiveDashboardPage';
import AboutPage from './components/AboutPage';

function NavItem({ icon, label, active, onClick }: any) {
  return (
    <div className={`ni ${active ? 'active' : ''}`} onClick={onClick}>
      <div className="nic">{icon}</div>
      <span>{label}</span>
    </div>
  );
}
// ─── Change Raw Material & Lot Traceability Modal ────────────────────────────
function ChangeRMModal({ machine, products, rawMaterials, productMaterials, batchRecords, onClose, onConfirm }: any) {
  const activeBatch = batchRecords?.find((b: any) => b.id === machine.activeBatchId);
  const initialMatId = machine.currentMaterialId || activeBatch?.materialId || activeBatch?.materialGrade || '';
  const initialBatch = machine.materialBatch || activeBatch?.materialBatch || '';

  const currentProduct = products?.find((p: any) => p.id === machine.activeProductId);
  const currentRM = rawMaterials?.find((r: any) => r.id === initialMatId || r.name === initialMatId);
  const oldMaterialName = currentRM?.name || initialMatId || 'Not Assigned';

  const approvedIds = productMaterials
    .filter((pm: any) => pm.productId === machine.activeProductId)
    .map((pm: any) => pm.materialId);
  const approvedMaterials = rawMaterials.filter((rm: any) => approvedIds.includes(rm.id));

  const [selectedId, setSelectedId] = useState(initialMatId);
  const [batch, setBatch] = useState(initialBatch);
  const [reason, setReason] = useState('Lot Replenished');
  const [customReason, setCustomReason] = useState('');
  const [saving, setSaving] = useState(false);

  const REASON_PRESETS = [
    'Lot Replenished',
    'Container / Bag Empty',
    'Approved Substitution',
    'Lot # Correction',
    'Quality / Vendor Switch',
    'Other'
  ];

  const effectiveReason = reason === 'Other' 
    ? customReason.trim() 
    : (customReason.trim() ? `${reason} (${customReason.trim()})` : reason);

  const valid = selectedId && batch.trim() && effectiveReason;

  return (
    <div className="ov animate-fade-in" onClick={onClose} style={{ alignItems: 'flex-start', padding: '10px', paddingTop: 'max(10px, env(safe-area-inset-top, 10px))' }}>
      <div 
        className="modal animate-scale-in" 
        style={{ 
          width: '100%', 
          maxWidth: '400px', 
          maxHeight: 'min(92vh, 92dvh)', 
          display: 'flex', 
          flexDirection: 'column', 
          position: 'relative', 
          bottom: 'auto', 
          top: '0', 
          margin: '0 auto', 
          borderRadius: '16px',
          overflow: 'hidden'
        }} 
        onClick={(e: any) => e.stopPropagation()}
      >
        <div className="mhd" style={{ padding: '12px 14px 10px', borderBottom: '1px solid var(--border)' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div className="mtit" style={{ fontSize: '15px' }}>Change RM & Batch</div>
              <span style={{ fontSize: '8.5px', padding: '1px 5px', borderRadius: '4px', background: 'rgba(59,130,246,0.15)', color: 'var(--blue)', border: '1px solid rgba(59,130,246,0.3)', fontWeight: 700 }}>
                ISO 13485
              </span>
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '2px' }}>
              {machine.name || machine.id} · Regulatory Traceability Log
            </div>
          </div>
          <button onClick={onClose} className="mcl" style={{ width: '28px', height: '28px' }}><X size={18} /></button>
        </div>

        <div className="mbd" style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', minHeight: 0, padding: '10px 14px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {/* Current Running State Context */}
          <div style={{ 
            background: 'var(--bg3)', 
            border: '1px solid var(--border)', 
            borderRadius: '8px', 
            padding: '6px 10px', 
            fontSize: '10.5px',
            display: 'flex',
            flexDirection: 'column',
            gap: '3px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text2)', fontSize: '10.5px' }}>
              <span>Product: <strong style={{ color: 'var(--text)' }}>{currentProduct?.name || '—'}</strong></span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '9.5px' }}>{machine.activeBatchId ? `Batch: ${machine.activeBatchId}` : ''}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text3)', fontSize: '9.5px' }}>Current RM: <strong style={{ color: 'var(--text)' }}>{oldMaterialName}</strong></span>
              <span style={{ 
                fontFamily: 'var(--mono)', 
                fontSize: '9.5px', 
                background: 'rgba(59,130,246,0.12)', 
                color: 'var(--blue)', 
                padding: '1px 5px', 
                borderRadius: '3px',
                fontWeight: 600
              }}>
                Lot: {initialBatch || 'None'}
              </span>
            </div>
          </div>

          {/* Approved Raw Materials List */}
          <div className="fg" style={{ marginBottom: 0 }}>
            <label className="fl" style={{ fontSize: '11px', marginBottom: '4px' }}>Select Approved Raw Material *</label>
            {approvedMaterials.length === 0 ? (
              <div style={{ padding: '6px 10px', background: 'var(--red-bg)', color: 'var(--red)', borderRadius: '6px', fontSize: '11px', border: '1px solid var(--red-dim)' }}>
                No approved materials found for this product.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '110px', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
                {approvedMaterials.map((rm: any) => (
                  <button
                    key={rm.id}
                    type="button"
                    className={`rmo${selectedId === rm.id ? ' sel prm' : ''}`}
                    style={{ 
                      width: '100%', 
                      textAlign: 'left', 
                      padding: '6px 10px', 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center',
                      borderRadius: '6px',
                      minHeight: '30px'
                    }}
                    onClick={() => setSelectedId(rm.id)}
                  >
                    <div>
                      <div className="rmn" style={{ fontSize: '11.5px', fontWeight: 600 }}>{rm.name}</div>
                      <div className="rmm" style={{ fontSize: '9.5px', color: 'var(--text3)' }}>{rm.vendor}</div>
                    </div>
                    {selectedId === rm.id && <CheckCircle2 size={14} color="var(--green)" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* New Material Batch / Lot Number */}
          <div className="fg" style={{ marginBottom: 0 }}>
            <label className="fl" style={{ fontSize: '11px', marginBottom: '4px', fontWeight: 600, color: 'var(--blue)' }}>
              New Material Batch / Lot # *
            </label>
            <input
              type="text"
              className="fi"
              style={{ 
                fontSize: '13px', 
                padding: '7px 10px', 
                height: '34px', 
                fontFamily: 'var(--mono)',
                borderRadius: '6px',
                borderColor: batch.trim() ? 'var(--blue)' : undefined
              }}
              placeholder="e.g. LOT-2026-002"
              value={batch}
              onChange={(e: any) => setBatch(e.target.value)}
              onFocus={(e: any) => {
                setTimeout(() => {
                  e.target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 300);
              }}
            />
          </div>

          {/* Reason for Change (Required for standard traceability) */}
          <div className="fg" style={{ marginBottom: 0 }}>
            <label className="fl" style={{ fontSize: '11px', marginBottom: '4px' }}>Reason for Change (Audit Requirement) *</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '5px' }}>
              {REASON_PRESETS.map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setReason(p)}
                  style={{
                    fontSize: '9.5px',
                    padding: '3px 7px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    background: reason === p ? 'var(--blue)' : 'var(--bg2)',
                    color: reason === p ? '#fff' : 'var(--text2)',
                    border: `1px solid ${reason === p ? 'var(--blue)' : 'var(--border)'}`,
                    fontWeight: reason === p ? 700 : 500
                  }}
                >
                  {p}
                </button>
              ))}
            </div>

            <input
              type="text"
              className="fi"
              style={{ fontSize: '11px', padding: '5px 8px', height: '28px', borderRadius: '6px' }}
              placeholder={reason === 'Other' ? 'Enter specific reason (required)...' : 'Additional note / Supplier COA ref (optional)...'}
              value={customReason}
              onChange={(e: any) => setCustomReason(e.target.value)}
              onFocus={(e: any) => {
                setTimeout(() => {
                  e.target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 300);
              }}
            />
          </div>

          {/* Standards Compliance Notice */}
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '6px', 
            padding: '5px 8px', 
            borderRadius: '6px', 
            background: 'rgba(59,130,246,0.06)', 
            border: '1px solid rgba(59,130,246,0.18)'
          }}>
            <ShieldCheck size={13} color="var(--blue)" style={{ flexShrink: 0 }} />
            <div style={{ fontSize: '9px', color: 'var(--text3)', lineHeight: 1.2 }}>
              Traceability records are immutable. Logged with supervisor signature.
            </div>
          </div>
        </div>

        {/* Sticky Action Footer - Always visible on mobile */}
        <div style={{ 
          position: 'sticky', 
          bottom: 0, 
          background: 'var(--bg2)', 
          borderTop: '1px solid var(--border)', 
          padding: '10px 14px calc(10px + env(safe-area-inset-bottom, 0px))', 
          display: 'flex', 
          gap: '8px', 
          zIndex: 10 
        }}>
          <button 
            type="button" 
            className="btn bsec" 
            style={{ flex: 1, height: '36px', fontSize: '12px' }} 
            onClick={onClose} 
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn bpri"
            style={{ flex: 2, height: '36px', fontSize: '12px', fontWeight: 600 }}
            disabled={!valid || saving}
            onClick={async () => {
              setSaving(true);
              await onConfirm({
                materialId: selectedId,
                materialBatch: batch.trim(),
                reason: effectiveReason,
                oldMaterialName,
                oldBatch: initialBatch
              });
              setSaving(false);
            }}
          >
            {saving ? 'Logging...' : 'Confirm & Log Change'}
          </button>
        </div>
      </div>
    </div>
  );
}

function MachineCard({ machine, products, operators, moulds, rawMaterials, batchRecords, onAction, onComplete, onAssign, onResolve, onChangeRM }: any) {
  const p = products.find((pr: any) => pr.id === machine.activeProductId);
  const o = operators.find((op: any) => op.id === machine.currentOperatorId);
  const mld = moulds.find((m: any) => m.id === machine.currentMouldId);

  // Fallback to active batch record if machine record doesn't have material populated
  const activeBatch = batchRecords?.find((b: any) => b.id === machine.activeBatchId);
  const effectiveMatId = machine.currentMaterialId || activeBatch?.materialId || activeBatch?.materialGrade;
  const effectiveBatch = machine.materialBatch || activeBatch?.materialBatch;

  const rm = rawMaterials?.find((r: any) => r.id === effectiveMatId || r.name === effectiveMatId);
  const [prog, setProg] = useState(0);

  useEffect(() => {
    let t: any;
    if (machine.status === 'Running' && machine.binStartTime) {
      const update = () => {
        const cycle = mld?.cycleTime || 60;
        const target = machine.binTarget || 1000;
        const elapsed = (Date.now() - machine.binStartTime!) / 1000;
        setProg(Math.min(100, (elapsed / (target * cycle)) * 100));
      };
      update();
      t = setInterval(update, 5000);
    } else {
      setProg(0);
    }
    return () => clearInterval(t);
  }, [machine.status, machine.binStartTime, mld, machine.binTarget]);

  const estCount = (machine.status === 'Running' && machine.binStartTime && mld?.cycleTime)
    ? Math.min(machine.binTarget || 1000, Math.floor((Date.now() - machine.binStartTime) / (mld.cycleTime * 1000)) * (mld.cavities || 1))
    : 0;

  return (
    <div className={`mach ${machine.status.toLowerCase()}`}>
      {/* ── Slot 1: Header Row with Machine ID, Status & Product Name ── */}
      <div className="mh" style={{ padding: '4px 8px', background: '#ffffff', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <div className={`st-ind ${machine.status.toLowerCase()}`} />
            <div className="mn" style={{ fontSize: '11px', fontWeight: 700, fontFamily: 'var(--mono)', lineHeight: 1, color: '#0f172a' }}>{machine.id}</div>
            <span style={{ fontSize: '8.5px', color: '#64748b', fontWeight: 500, lineHeight: 1 }}>
              {machine.status === 'Running' ? 'Running' : (machine.status === 'Maintenance' ? 'Maintenance' : 'Idle')}
            </span>
          </div>
          <div style={{ fontSize: '10px', fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '2px', lineHeight: 1.2 }}>
            {p?.name || (mld?.name ? mld.name : 'No mould loaded')}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
          <button 
            className="btn bsm" 
            onClick={onAssign} 
            style={{ 
              flexShrink: 0, 
              padding: 0, 
              width: '18px', 
              height: '18px', 
              background: '#ffffff', 
              border: '1px solid #e2e8f0', 
              color: '#64748b', 
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textTransform: 'none'
            }} 
            title={o ? `Operator: ${o.name}` : 'Assign operator'}
          >
            <UserPlus size={9} />
          </button>
        </div>
      </div>

      <div className="mb2" style={{ padding: '5px 7px' }}>
        {/* ── Slot 2: Mould & Identifiers + Raw Material ── */}
        <div style={{ marginBottom: '4px' }}>
          <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap', alignItems: 'center' }}>
            {machine.activeBatchId && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                <span style={{ fontSize: '7px', color: '#64748b', fontWeight: 500 }}>Batch</span>
                <span className="tag-blue">{machine.activeBatchId}</span>
              </div>
            )}
            {machine.currentMouldId && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                <span style={{ fontSize: '7px', color: '#64748b', fontWeight: 500 }}>Mould</span>
                <span className="tag-blue">{machine.currentMouldId}</span>
              </div>
            )}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
              <span style={{ fontSize: '7px', color: '#64748b', fontWeight: 500 }}>Lot</span>
              <span className="tag-blue">{effectiveBatch || 'None'}</span>
            </div>
          </div>
        </div>

        {/* Raw Material Info (Plain unboxed row) */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
          <div style={{ minWidth: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', gap: '3px' }}>
            <span style={{ fontSize: '7px', color: '#64748b', fontWeight: 500, flexShrink: 0 }}>RM</span>
            <span style={{ fontSize: '9px', fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {rm ? rm.name : (effectiveMatId || <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Not set</span>)}
            </span>
          </div>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onChangeRM(); }}
            style={{ 
              background: '#ffffff', 
              border: '1px solid #e2e8f0', 
              cursor: 'pointer', 
              padding: '1px 5px', 
              borderRadius: '3px', 
              color: '#475569', 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: '2px', 
              fontSize: '7.5px', 
              fontWeight: 500, 
              lineHeight: 1,
              height: '16px',
              minHeight: '16px',
              flexShrink: 0,
              touchAction: 'manipulation',
              textTransform: 'none'
            }} 
            title="Change raw material and batch"
          >
            <Pencil size={8} /> Edit
          </button>
        </div>

        {/* ── Slot 3: Primary Metric (Bin fill) ── */}
        <div style={{ marginBottom: '4px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '2px' }}>
            <span style={{ fontSize: '7px', color: '#64748b', fontWeight: 500 }}>Bin fill</span>
            <span style={{ fontSize: '9px', fontFamily: 'var(--mono)' }}>
              <strong style={{ color: '#0f172a', fontWeight: 700, fontSize: '9.5px' }}>
                {machine.status === 'Running' ? estCount.toLocaleString() : '—'}
              </strong>
              {' '}<span style={{ color: '#cbd5e1' }}>/</span>{' '}
              <span style={{ color: '#64748b' }}>{(machine.binTarget || 1000).toLocaleString()}</span>
            </span>
          </div>
          <div style={{ height: '3px', background: '#f1f5f9', borderRadius: '2px', overflow: 'hidden' }}>
            <div 
              style={{ 
                width: machine.status === 'Running' ? `${prog}%` : '0%', 
                height: '100%', 
                background: machine.status === 'Running' ? '#16a34a' : '#cbd5e1', 
                borderRadius: '2px', 
                transition: 'width 0.4s ease' 
              }} 
            />
          </div>
        </div>

        {/* ── Slot 4: Secondary Metadata (Plain hairline-divided row, NO nested boxes!) ── */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: '1fr 1fr 1fr', 
          padding: '3px 0', 
          marginBottom: '4px', 
          borderTop: '1px solid #f1f5f9', 
          borderBottom: '1px solid #f1f5f9' 
        }}>
          <div style={{ textAlign: 'center', borderRight: '1px solid #f1f5f9', padding: '0 2px' }}>
            <div style={{ fontSize: '6.5px', color: '#64748b', fontWeight: 500 }}>Bin</div>
            <div style={{ fontSize: '9px', fontWeight: 600, color: '#0f172a', marginTop: '1px', fontFamily: 'var(--mono)' }}>
              {machine.status === 'Running' ? `#${machine.currentBinNumber || 1}` : '—'}
            </div>
          </div>
          <div style={{ textAlign: 'center', borderRight: '1px solid #f1f5f9', padding: '0 2px' }}>
            <div style={{ fontSize: '6.5px', color: '#64748b', fontWeight: 500 }}>Output</div>
            <div style={{ fontSize: '9px', fontWeight: 600, color: '#0f172a', marginTop: '1px', fontFamily: 'var(--mono)' }}>
              {(machine.currentShiftProduction || 0).toLocaleString()}
            </div>
          </div>
          <div style={{ textAlign: 'center', padding: '0 2px' }}>
            <div style={{ fontSize: '6.5px', color: '#64748b', fontWeight: 500 }}>Operator</div>
            <div style={{ fontSize: '8.5px', fontWeight: 600, color: '#0f172a', marginTop: '1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {o?.name?.split(' ')[0] || 'Unassigned'}
            </div>
          </div>
        </div>

        {/* ── Slot 5: Action Buttons (Unified two-row button layout) ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '4px' }}>
          {machine.status === 'Running' ? (
            <>
              {/* Line 1: Bin Complete button across full width */}
              <button
                className="mbtn mpri"
                style={{
                  width: '100%',
                  height: '22px',
                  fontSize: '9.5px',
                  fontWeight: 600,
                  gap: '3px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '5px',
                  background: '#16a34a',
                  color: '#ffffff',
                  border: '1px solid #15803d',
                  padding: '2px 8px',
                  boxShadow: '0 1px 2px rgba(22, 163, 74, 0.15)'
                }}
                onClick={() => onComplete(machine.id)}
              >
                <CheckCircle2 size={10} /> Bin complete
              </button>

              {/* Line 2: Breakdown and Stop half half */}
              <div style={{ display: 'flex', gap: '3px', width: '100%' }}>
                <button
                  className="mbtn mwrn"
                  style={{
                    flex: 1,
                    height: '20px',
                    fontSize: '8.5px',
                    fontWeight: 600,
                    gap: '2px',
                    padding: '2px 6px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '4px',
                    background: '#fffbeb',
                    color: '#b45309',
                    border: '1px solid #fde68a'
                  }}
                  title="Report breakdown"
                  onClick={() => onAction(machine.id, 'Maintenance')}
                >
                  <Wrench size={8.5} /> Breakdown
                </button>
                <button
                  className="mbtn mdan"
                  style={{
                    flex: 1,
                    height: '20px',
                    fontSize: '8.5px',
                    fontWeight: 600,
                    gap: '2px',
                    padding: '2px 6px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '4px',
                    background: '#fef2f2',
                    color: '#dc2626',
                    border: '1px solid #fecaca'
                  }}
                  title="Stop machine"
                  onClick={() => onAction(machine.id, 'Stop')}
                >
                  <Square size={8.5} /> Stop
                </button>
              </div>
            </>
          ) : machine.status === 'Maintenance' ? (
            <>
              {/* Line 1: Resolve breakdown full width */}
              <button
                className="mbtn mpri"
                style={{
                  width: '100%',
                  height: '22px',
                  fontSize: '9.5px',
                  fontWeight: 600,
                  gap: '3px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '5px',
                  background: '#16a34a',
                  color: '#ffffff',
                  border: '1px solid #15803d',
                  padding: '2px 8px',
                  boxShadow: '0 1px 2px rgba(22, 163, 74, 0.15)'
                }}
                onClick={onResolve}
              >
                <CheckCircle2 size={10} /> Resolve breakdown
              </button>

              {/* Line 2: Stop half/half */}
              <div style={{ display: 'flex', gap: '3px', width: '100%' }}>
                <button
                  className="mbtn mdan"
                  style={{
                    flex: 1,
                    height: '20px',
                    fontSize: '8.5px',
                    fontWeight: 600,
                    gap: '2px',
                    padding: '2px 6px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '4px',
                    background: '#fef2f2',
                    color: '#dc2626',
                    border: '1px solid #fecaca'
                  }}
                  title="Stop machine"
                  onClick={() => onAction(machine.id, 'Stop')}
                >
                  <Square size={8.5} /> Stop
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Line 1: Start job full width */}
              <button
                className="mbtn mpri"
                style={{
                  width: '100%',
                  height: '22px',
                  fontSize: '9.5px',
                  fontWeight: 600,
                  gap: '3px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '5px',
                  background: '#2563eb',
                  color: '#ffffff',
                  border: '1px solid #1d4ed8',
                  padding: '2px 8px',
                  boxShadow: '0 1px 2px rgba(37, 99, 235, 0.15)'
                }}
                onClick={() => onAction(machine.id, 'Start')}
              >
                <Play size={9} /> Start job
              </button>

              {/* Line 2: Breakdown & Unload / Idle half half */}
              <div style={{ display: 'flex', gap: '3px', width: '100%' }}>
                <button
                  className="mbtn mwrn"
                  style={{
                    flex: 1,
                    height: '20px',
                    fontSize: '8.5px',
                    fontWeight: 600,
                    gap: '2px',
                    padding: '2px 6px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '4px',
                    background: '#fffbeb',
                    color: '#b45309',
                    border: '1px solid #fde68a'
                  }}
                  title="Report breakdown"
                  onClick={() => onAction(machine.id, 'Maintenance')}
                >
                  <Wrench size={8.5} /> Breakdown
                </button>
                {machine.currentMouldId ? (
                  <button
                    className="mbtn mdan"
                    style={{
                      flex: 1,
                      height: '20px',
                      fontSize: '8.5px',
                      fontWeight: 600,
                      gap: '2px',
                      padding: '2px 6px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: '4px',
                      background: '#fef2f2',
                      color: '#dc2626',
                      border: '1px solid #fecaca'
                    }}
                    title="Unload mould"
                    onClick={() => onAction(machine.id, 'Unload')}
                  >
                    Unload
                  </button>
                ) : (
                  <button
                    className="mbtn"
                    disabled
                    style={{
                      flex: 1,
                      height: '20px',
                      fontSize: '8.5px',
                      fontWeight: 500,
                      gap: '2px',
                      padding: '2px 6px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: '4px',
                      background: '#f8fafc',
                      color: '#94a3b8',
                      border: '1px solid #e2e8f0',
                      cursor: 'default'
                    }}
                  >
                    Idle
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}



const TopBarClock: React.FC = React.memo(() => {
  const [timeStr, setTimeStr] = useState(() => 
    new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  );

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeStr(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div style={{ fontSize: '14px', fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--text)' }}>
      {timeStr}
    </div>
  );
});

const App: React.FC = () => {
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<{ fullName: string, email: string, role: string, employeeCode?: string } | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
  const [isViewOnly, setIsViewOnly] = useState(false);
  const [isAuthorizedSession, setIsAuthorizedSession] = useState(false);
  const [showTakeControlModal, setShowTakeControlModal] = useState(false);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('Live Dashboard');

  const [pendingCrates, setPendingCrates] = useState<Crate[]>([]);
  const [selectedMachineId, setSelectedMachineId] = useState<string | null>(null);
  const [isHandoverSummaryOpen, setIsHandoverSummaryOpen] = useState(false);
  const [inspectingBin, setInspectingBin] = useState<{ id: string, netQty: number, machineId: string } | null>(null);
  const [breakingMachineId, setBreakingMachineId] = useState<string | null>(null);
  const [resolvingMachineId, setResolvingMachineId] = useState<string | null>(null);
  const [settingUpMachineId, setSettingUpMachineId] = useState<string | null>(null);
  const [assigningOperatorMachineId, setAssigningOperatorMachineId] = useState<string | null>(null);
  const [isInitialAssignmentOpen, setIsInitialAssignmentOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ type: 'status' | 'complete', data: any } | null>(null);
  const [pendingBreakdownMachineId, setPendingBreakdownMachineId] = useState<string | null>(null);
  
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  const [shiftSettings, setShiftSettings] = useState<ShiftSetting[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [moulds, setMoulds] = useState<Mould[]>([]);
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);
  const [productMaterials, setProductMaterials] = useState<ProductMaterial[]>([]);
  const [changingRMMachineId, setChangingRMMachineId] = useState<string | null>(null);
  const [batchRecords, setBatchRecords] = useState<BatchRecord[]>([]);
  const [defectTypes, setDefectTypes] = useState<DefectType[]>([]);
  const [breakdownReasons, setBreakdownReasons] = useState<BreakdownReason[]>([]);
  const [cleaningTasks, setCleaningTasks] = useState<CleaningTask[]>([]);

  // RBAC: Compute accessible tabs for the logged-in user's role
  const userPermissions: Tab[] = React.useMemo(() => {
    const role = profile?.role || 'Supervisor';
    const permissionsMap = appSettings?.role_permissions || appSettings?.printLabels?.role_permissions || DEFAULT_ROLE_PERMISSIONS;
    return permissionsMap[role] || DEFAULT_ROLE_PERMISSIONS[role] || DEFAULT_ROLE_PERMISSIONS.Supervisor;
  }, [profile?.role, appSettings?.role_permissions, appSettings?.printLabels]);

  // If user does not have permission for the currently active tab, redirect to their first permitted tab
  useEffect(() => {
    if (profile && userPermissions.length > 0 && !userPermissions.includes(activeTab)) {
      setActiveTab(userPermissions[0]);
    }
  }, [profile, userPermissions, activeTab]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    supabase.auth.onAuthStateChange((_event, session) => {
        setSession(session);
        // Reset local flow states on session change
        setIsHandoverSummaryOpen(false);
        setIsInitialAssignmentOpen(false);
    });
  }, []);

  useEffect(() => {
    if (!session) return;
    const fetchData = async () => {
      try {
        const [{data: appData}, {data: shiftData}, {data: machs}, {data: pData}, {data: prdData}, {data: opers}, {data: batRecs}, {data: mldData}, {data: rmData}, {data: pmData}, {data: crates}, {data: dTypes}, {data: bReasons}, {data: cTasks}] = await Promise.all([
          supabase.from('app_settings').select('*').eq('id', 'global').maybeSingle(),
          supabase.from('shift_settings').select('*').order('id'),
          supabase.from('machines').select('*').order('id'),
          supabase.from('profiles').select('full_name, email, role, employee_code').eq('id', session.user.id).maybeSingle(),
          supabase.from('products').select('*'),
          supabase.from('operators').select('*'),
          supabase.from('batch_records').select('*').order('start_time', { ascending: false }).limit(60),
          supabase.from('moulds').select('*'),
          supabase.from('raw_materials').select('*'),
          supabase.from('approved_materials').select('*'),
          supabase.from('crates').select('*').eq('status', 'Pending Inspection').order('start_time', { ascending: false }).limit(60),
          supabase.from('defect_types').select('*').order('name'),
          supabase.from('breakdown_reasons').select('*').order('name'),
          supabase.from('cleaning_tasks').select('*').order('label')
        ]);
        if (cTasks) setCleaningTasks(cTasks);
        if (bReasons) setBreakdownReasons(bReasons);

        let localRolePerms: any = null;
        try {
          const stored = localStorage.getItem('immc_role_permissions');
          if (stored) localRolePerms = JSON.parse(stored);
        } catch (_) {}

        if (appData) setAppSettings({ 
          id: appData.id, 
          currentShift: appData.current_shift, 
          pendingHandover: appData.pending_handover, 
          lastHandoverSummary: appData.last_handover_summary, 
          outgoingSupervisorEmail: appData.last_handover_summary?.outgoing_supervisor_email,
          activeSupervisorName: appData.active_supervisor_name,
          printLabels: appData.print_labels,
          role_permissions: appData.role_permissions || appData.print_labels?.role_permissions || localRolePerms || undefined
        });

        // 2b. Auto-Authorize if user is the active supervisor
        if (pData && appData.active_supervisor_name === pData.full_name && !appData.pending_handover) {
           setIsAuthorizedSession(true);
        }

        // 2c. Check localStorage for View-Only persistence
        const wasViewOnly = localStorage.getItem('isViewOnly') === 'true';
        if (wasViewOnly) setIsViewOnly(true);
        if (shiftData) setShiftSettings(shiftData.map((s: any) => ({ id: s.id, name: s.name, startTime: s.start_time, endTime: s.end_time })));
        if (machs) setMachines(machs.map((m: any) => ({
            id: m.id, name: m.name, model: m.model,
            currentMouldId: m.current_mould_id, currentOperatorId: m.current_operator_id,
            activeProductId: m.active_product_id, 
            currentMaterialId: m.current_material_id,
            materialGrade: m.material_grade,
            materialBatch: m.material_batch,
            currentBinNumber: m.current_bin_number || 1,
            currentShiftProduction: m.current_shift_production || 0,
            currentDayProduction: m.current_day_production || 0,
            status: m.status, binTarget: m.bin_target,
            binStartTime: m.bin_start_time ? Number(m.bin_start_time) : undefined,
            activeBatchId: m.active_batch_id,
            activeBatchDate: m.active_batch_date,
            breakdownStartTime: m.breakdown_start_time ? Number(m.breakdown_start_time) : undefined,
            oee: m.oee || 0, lastCleaningDone: m.last_cleaning_done, faiApproved: m.fai_approved
        })));
        if (pData) {
          setProfile({ fullName: pData.full_name, email: pData.email, role: pData.role || 'Supervisor', employeeCode: pData.employee_code });
        } else {
          // Auto-create missing profile from whitelist for new signups
          const { data: whitelist } = await supabase.from('authorized_supervisors').select('*').eq('email', session.user.email).maybeSingle();
          const { data: neu, error: createErr } = await supabase.from('profiles').insert({
            id: session.user.id,
            full_name: whitelist?.full_name || 'New User',
            email: session.user.email,
            employee_code: whitelist?.employee_code || null,
            role: 'Supervisor'
          }).select().maybeSingle();

          if (createErr) console.error('Auto-Profile Error:', createErr);
          if (neu) setProfile({ fullName: neu.full_name, email: neu.email, role: neu.role, employeeCode: neu.employee_code });
        }
        if (prdData) setProducts(prdData.map((p: any) => ({ ...p, mouldId: p.mould_id, itemCode: p.item_code, batchIdentifier: p.batch_identifier, binQty: p.bin_qty, stdPackSize: p.std_pack_size })));
        if (opers) setOperators(opers.map((o: any) => ({ ...o, employeeId: o.employee_id, isCertified: o.is_certified })));
        if (batRecs) setBatchRecords(batRecs.map((b: any) => ({ 
            id: b.id, machineId: b.machine_id, productId: b.product_id, productName: b.product_name, productCode: b.product_code,
            mouldId: b.mould_id, materialId: b.material_id, materialGrade: b.material_grade, materialBatch: b.material_batch, operatorId: b.operator_id,
            startTime: b.start_time, endTime: b.end_time, crates: b.crates, totalOutput: b.total_output || 0, status: b.status, batchDate: b.batch_date
        })));
        if (mldData) setMoulds(mldData.map((m: any) => ({ ...m, cycleTime: m.cycle_time })));
        if (rmData) setRawMaterials(rmData);
        if (pmData) setProductMaterials(pmData.map((pm: any) => ({ productId: pm.product_id, materialId: pm.material_id })));
        if (crates) setPendingCrates(crates.map((c: any) => ({ 
          id: c.id, batchId: c.batch_id, machineId: c.machine_id, binNumber: c.bin_number, 
          startTime: c.start_time, endTime: c.end_time, grossQty: c.gross_qty, 
          startupScrap: c.startup_scrap, qcSample: c.qc_sample, netQty: c.net_qty, 
          operatorId: c.operator_id, supervisorId: c.supervisor_id, status: c.status 
        })));
        if (dTypes) setDefectTypes(dTypes);
        if (appData && shiftData) {
          const ct = new Date().getHours() + new Date().getMinutes() / 60;
          let detected = shiftData[0].id;
          for (const s of shiftData) {
            const [sh, sm] = s.start_time.split(':').map(Number);
            const [eh, em] = s.end_time.split(':').map(Number);
            const sv = sh + sm/60, ev = eh + em/60;
            if (sv < ev) { if (ct >= sv && ct < ev) detected = s.id; } 
            else { if (ct >= sv || ct < ev) detected = s.id; }
          }
          if (appData.current_shift !== detected && !appData.pending_handover && pData?.role !== 'Admin' && pData?.role !== 'PowerUser') {
            setAppSettings(prev => prev ? { ...prev, pendingHandover: true } : null);
          }
        }
      } catch (err) { console.error('Fetch Error:', err); }
    };
    fetchData();

    const channel = supabase.channel('realtime_app')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'machines' }, (p) => {
          if (p.eventType === 'DELETE') {
            setMachines(prev => prev.filter(mach => mach.id !== p.old.id));
            return;
          }
          const m = p.new as any;
          setMachines(prev => prev.map(mach => mach.id === m.id ? { 
              ...mach, 
              status: m.status ?? mach.status, 
              currentMouldId: m.current_mould_id !== undefined ? m.current_mould_id : mach.currentMouldId, 
              currentOperatorId: m.current_operator_id !== undefined ? m.current_operator_id : mach.currentOperatorId,
              activeProductId: m.active_product_id !== undefined ? m.active_product_id : mach.activeProductId, 
              currentMaterialId: m.current_material_id !== undefined ? m.current_material_id : mach.currentMaterialId,
              materialGrade: m.material_grade !== undefined ? m.material_grade : mach.materialGrade,
              materialBatch: m.material_batch !== undefined ? m.material_batch : mach.materialBatch,
              currentBinNumber: m.current_bin_number ?? mach.currentBinNumber,
              currentShiftProduction: m.current_shift_production ?? mach.currentShiftProduction, 
              currentDayProduction: m.current_day_production ?? mach.currentDayProduction,
              binStartTime: m.bin_start_time ? Number(m.bin_start_time) : mach.binStartTime,
              binTarget: m.bin_target ?? mach.binTarget,
              activeBatchId: m.active_batch_id ?? mach.activeBatchId,
              activeBatchDate: m.active_batch_date ?? mach.activeBatchDate,
              breakdownStartTime: m.breakdown_start_time ? Number(m.breakdown_start_time) : mach.breakdownStartTime,
              oee: m.oee ?? mach.oee,
              lastCleaningDone: m.last_cleaning_done ?? mach.lastCleaningDone,
              faiApproved: m.fai_approved ?? mach.faiApproved
          } : mach));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'crates' }, (p) => {
          const c = p.new as any;
          setPendingCrates(prev => {
            if (prev.some(crate => crate.id === c.id)) return prev;
            return [...prev, { 
              id: c.id, batchId: c.batch_id, machineId: c.machine_id, binNumber: c.bin_number, 
              startTime: c.start_time, endTime: c.end_time, grossQty: c.gross_qty, 
              startup_scrap: c.startup_scrap, qcSample: c.qc_sample, netQty: c.net_qty, 
              operatorId: c.operator_id, supervisorId: c.supervisor_id, status: c.status 
            } as unknown as Crate];
          });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'crates' }, (p) => {
          const c = p.new as any;
          if (c.status === 'Completed') {
            setPendingCrates(prev => prev.filter(crate => crate.id !== c.id));
          }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'batch_records' }, (p) => {
          const b = p.new as any;
          if (p.eventType === 'INSERT') {
            setBatchRecords(prev => [{
              id: b.id, machineId: b.machine_id, productId: b.product_id, productName: b.product_name, productCode: b.product_code,
              mouldId: b.mould_id, materialId: b.material_id, materialGrade: b.material_grade, materialBatch: b.material_batch, operatorId: b.operator_id,
              startTime: b.start_time, endTime: b.end_time, crates: b.crates, totalOutput: b.total_output || 0, status: b.status, batchDate: b.batch_date
            }, ...prev]);
          } else if (p.eventType === 'UPDATE') {
            setBatchRecords(prev => prev.map(rec => rec.id === b.id ? {
              ...rec, 
              crates: b.crates, 
              totalOutput: b.total_output || 0, 
              status: b.status, 
              endTime: b.end_time,
              materialId: b.material_id !== undefined ? b.material_id : rec.materialId,
              materialGrade: b.material_grade !== undefined ? b.material_grade : rec.materialGrade,
              materialBatch: b.material_batch !== undefined ? b.material_batch : rec.materialBatch
            } : rec));
          }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_settings' }, (p) => {
          const a = p.new as any;
          if (a.id === 'global') setAppSettings(prev => ({ 
            id: a.id, 
            currentShift: a.current_shift, 
            pendingHandover: a.pending_handover, 
            lastHandoverSummary: a.last_handover_summary, 
            outgoingSupervisorEmail: a.last_handover_summary?.outgoing_supervisor_email,
            activeSupervisorName: a.active_supervisor_name,
            printLabels: a.print_labels !== undefined ? a.print_labels : prev?.printLabels,
            role_permissions: a.role_permissions !== undefined ? a.role_permissions : (a.print_labels?.role_permissions ?? prev?.role_permissions)
          }));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'operators' }, (p) => {
          if (p.eventType === 'DELETE') {
            setOperators(prev => prev.filter(o => o.id !== p.old.id));
          } else if (p.eventType === 'INSERT') {
            const o = p.new as any;
            setOperators(prev => [...prev, { id: o.id, name: o.name, employeeId: o.employee_id, isCertified: o.is_certified }]);
          } else if (p.eventType === 'UPDATE') {
            const o = p.new as any;
            setOperators(prev => prev.map(op => op.id === o.id ? { id: o.id, name: o.name, employeeId: o.employee_id, isCertified: o.is_certified } : op));
          }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'defect_types' }, (p) => {
          if (p.eventType === 'DELETE') {
            setDefectTypes(prev => prev.filter(d => d.id !== p.old.id));
          } else if (p.eventType === 'INSERT') {
            const d = p.new as any;
            setDefectTypes(prev => [...prev, d].sort((a,b) => a.name.localeCompare(b.name)));
          } else if (p.eventType === 'UPDATE') {
            const d = p.new as any;
            setDefectTypes(prev => prev.map(dt => dt.id === d.id ? d : dt).sort((a,b) => a.name.localeCompare(b.name)));
          }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'breakdown_reasons' }, (p) => {
          if (p.eventType === 'DELETE') {
            setBreakdownReasons(prev => prev.filter(r => r.id !== p.old.id));
          } else if (p.eventType === 'INSERT') {
            const r = p.new as any;
            setBreakdownReasons(prev => [...prev, r].sort((a,b) => a.name.localeCompare(b.name)));
          } else if (p.eventType === 'UPDATE') {
            const r = p.new as any;
            setBreakdownReasons(prev => prev.map(rt => rt.id === r.id ? r : rt).sort((a,b) => a.name.localeCompare(b.name)));
          }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cleaning_tasks' }, (p) => {
          if (p.eventType === 'DELETE') {
            setCleaningTasks(prev => prev.filter(t => t.id !== p.old.id));
          } else if (p.eventType === 'INSERT') {
            const t = p.new as any;
            setCleaningTasks(prev => [...prev, t].sort((a,b) => a.label.localeCompare(b.label)));
          } else if (p.eventType === 'UPDATE') {
            const t = p.new as any;
            setCleaningTasks(prev => prev.map(ct => ct.id === t.id ? t : ct).sort((a,b) => a.label.localeCompare(b.label)));
          }
      })
      .subscribe();

    const profileSubscription = supabase.channel(`profile_${session.user.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${session.user.id}` }, (payload) => {
        const p = payload.new as any;
        setProfile({ fullName: p.full_name, email: p.email, role: p.role || 'Supervisor', employeeCode: p.employee_code });
      })
      .subscribe();

    return () => { 
      supabase.removeChannel(channel); 
      supabase.removeChannel(profileSubscription);
    };
  }, [session]);

  const addLogEntry = async (mid: string, type: string, details: string, opId?: string) => {
    try {
      await supabase.from('activity_logs').insert({
        id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        timestamp: new Date().toISOString(),
        event_type: type,
        machine_id: mid,
        operator_id: opId || null,
        supervisor_name: profile?.fullName || 'System',
        details
      });
    } catch (err) { console.error('Log Error:', err); }
  };

  const handleAction = async (mid: string, action: string) => {
    if (action === 'Start') setSettingUpMachineId(mid);
    else if (action === 'Maintenance') {
      setPendingBreakdownMachineId(mid);
      setSelectedMachineId(mid);
    }
    else if (action === 'Stop') {
      setPendingAction({ type: 'status', data: { machineId: mid, nextStatus: 'Idle' } });
    }
    else if (action === 'Unload') {
      const prevM = machines.find(m => m.id === mid);
      const prevP = products.find(p => p.id === prevM?.activeProductId);
      const prevRM = rawMaterials.find((r: any) => r.id === prevM?.currentMaterialId)?.name || prevM?.materialGrade || prevM?.currentMaterialId || '—';
      setMachines(prev => prev.map(m => m.id === mid ? { ...m, currentMouldId: null, activeProductId: null, activeBatchId: null, currentMaterialId: null, materialGrade: null, materialBatch: null } : m));
      await supabase.from('machines').update({ current_mould_id: null, active_product_id: null, active_batch_id: null, current_material_id: null, material_grade: null, material_batch: null, status: 'Idle' }).eq('id', mid);
      if (prevM?.currentMouldId) {
        await addLogEntry(mid, 'Mould & RM Unloaded', `Mould ${prevM.currentMouldId} unloaded (Prod: ${prevP?.name || '—'} | RM: ${prevRM} | Lot: ${prevM.materialBatch || '—'} | Batch: ${prevM.activeBatchId || '—'})`);
      }
    }
    else if (action === 'Offline') {
      setMachines(prev => prev.map(m => m.id === mid ? { ...m, status: 'Idle' } : m));
      await supabase.from('machines').update({ status: 'Idle' }).eq('id', mid);
    }
  };

  const handleHandoverAcknowledge = async (sid: string) => {
    if (!profile) return;
    try {
      // Clear shift metrics across all machines before starting new shift
      const { data: machs } = await supabase.from('machines').select('id');
      if (machs) {
        for (const m of machs) {
          await supabase.from('machines').update({ current_shift_production: 0 }).eq('id', m.id);
        }
      }

      // Upsert the main settings to clear the pending flag
      const { error } = await supabase.from('app_settings').upsert({ 
        id: 'global',
        pending_handover: false, 
        current_shift: sid, 
        last_handover_summary: null,
        active_supervisor_name: profile?.fullName || 'Unknown'
      });
      
      localStorage.removeItem('isViewOnly'); // Clear view-mode when taking control

      // Update the previous handover record with the incoming supervisor name
      await supabase.from('shift_summaries')
        .update({ incoming_supervisor_name: profile?.fullName })
        .order('handover_time', { ascending: false })
        .limit(1);

      if (error) {
        console.error('Handover Error:', error.message);
        alert(`Could not save handover: ${error.message}`);
        return;
      }

      setMachines(prev => prev.map(m => ({ ...m, currentShiftProduction: 0 })));
      setAppSettings(prev => prev ? { ...prev, pendingHandover: false, currentShift: sid, activeSupervisorName: profile?.fullName || 'Unknown' } : null);
      setIsAuthorizedSession(true);
      setIsInitialAssignmentOpen(true);
    } catch (err) { 
      console.error('Handover Acknowledge Catch:', err); 
      alert('An unexpected error occurred during handover acknowledgment.');
    }
  };

  const handleBinComplete = async (data: any): Promise<boolean> => {
    if (!selectedMachineId) return false;
    
    // 1. Fetch latest machine state
    const { data: latestMachine } = await supabase.from('machines').select('*').eq('id', selectedMachineId).single();
    if (!latestMachine) return false;

    const p = products.find(pr => pr.id === latestMachine.active_product_id);
    const { batchId: currentBatchId, batchDateStr: currentBatchDate } = getBatchSummary(p?.batchIdentifier || 'XX');
    
    let absBatchId = latestMachine.active_batch_id || currentBatchId;

    // 2. Fetch/Update Batch Record to get global bin count
    const { data: latestBatch } = await supabase.from('batch_records').select('*').eq('id', absBatchId).maybeSingle();
    
    // Auto Rollover at 6 AM
    const isRollover = latestMachine.active_batch_id && latestMachine.active_batch_date && latestMachine.active_batch_date !== currentBatchDate;
    
    let bNo: number;
    if (isRollover) {
      const { data: oldBatch } = await supabase.from('batch_records').select('*').eq('id', latestMachine.active_batch_id).single();
      
      // Initialize new batch record for the new day
      await supabase.from('batch_records').upsert({ 
        id: currentBatchId, 
        machine_id: latestMachine.id, 
        product_id: latestMachine.active_product_id, 
        product_name: p?.name || '', 
        product_code: p?.itemCode || '', 
        mould_id: latestMachine.current_mould_id, 
        material_grade: oldBatch?.material_grade || '', 
        material_batch: oldBatch?.material_batch || '', 
        operator_id: latestMachine.current_operator_id || '', 
        start_time: new Date().toISOString(), 
        crates: 0, 
        total_output: 0, 
        status: 'Active', 
        batch_date: currentBatchDate 
      });

      await supabase.from('machines').update({ 
        active_batch_id: currentBatchId, 
        active_batch_date: currentBatchDate,
        current_bin_number: 1,
        current_day_production: 0
      }).eq('id', latestMachine.id);

      await addLogEntry(latestMachine.id, 'Batch Rollover',
        `New production day — New Batch: ${currentBatchId} | RM: ${oldBatch?.material_grade || '?'} | Lot: ${oldBatch?.material_batch || '?'} | Mould: ${latestMachine.current_mould_id || '?'}`);
      
      absBatchId = currentBatchId;
      bNo = 1;
    } else {
      // Not a rollover, use batch-wide count plus one
      bNo = (latestBatch?.crates || 0) + 1;
    }

    // Bin Identification: ensure machine ID is not duplicated if absBatchId already ends with it
    const cleanBatch = absBatchId.endsWith(`-${latestMachine.id}`)
      ? absBatchId
      : `${absBatchId}-${latestMachine.id}`;
    const cid = formatUnitId(`${cleanBatch}-${bNo}`, latestMachine.id);
    
    const neu: any = { 
      id: cid, batch_id: absBatchId, machine_id: latestMachine.id, bin_number: bNo, 
      start_time: new Date(latestMachine.bin_start_time || Date.now()).toISOString(), end_time: new Date().toISOString(), gross_qty: data.grossQty, 
      startup_scrap: data.startupScrap, qc_sample: data.qcSample, net_qty: data.netQty, 
      operator_id: latestMachine.current_operator_id || 'UNASSIGNED', supervisor_id: profile?.email || 'System', 
      mould_id: latestMachine.current_mould_id || null, material_batch: latestMachine.material_batch || null,
      shift_id: appSettings?.currentShift || 'A',
      status: 'Pending Inspection' 
    };

    // Performance: Optimistic UI updates
    setMachines(prev => prev.map(m => m.id === latestMachine.id ? { 
      ...m, 
      currentBinNumber: bNo + 1, 
      currentShiftProduction: (m.currentShiftProduction || 0) + data.netQty,
      currentDayProduction: (m.currentDayProduction || 0) + data.netQty,
      binStartTime: Date.now()
    } : m));

    setPendingCrates(prev => [{ 
      id: cid, batchId: neu.batch_id, machineId: neu.machine_id, binNumber: neu.bin_number, 
      startTime: neu.start_time, endTime: neu.end_time, grossQty: neu.gross_qty, 
      startupScrap: neu.startup_scrap, qcSample: neu.qc_sample, netQty: neu.net_qty, 
      operatorId: neu.operator_id, supervisorId: neu.supervisor_id, status: 'Pending Inspection' 
    } as unknown as Crate, ...prev]);

    const { error: crateErr } = await supabase.from('crates').insert(neu);
    if (crateErr) {
      console.error('Crate Insert Error:', crateErr);
      if (crateErr.code === '23505') { 
        alert(`Bin collision detected! This batch already has a record for ${cid}.`);
      } else {
        alert(`Could not log bin: ${crateErr.message}`);
      }
      setSelectedMachineId(null);
      return false;
    }

    // Update global state
    await supabase.from('batch_records').update({ 
      crates: bNo, 
      total_output: (latestBatch?.total_output || 0) + data.netQty 
    }).eq('id', absBatchId);

    await supabase.from('machines').update({ 
      current_bin_number: bNo + 1, 
      current_shift_production: (latestMachine.current_shift_production || 0) + data.netQty, 
      current_day_production: (latestMachine.current_day_production || 0) + data.netQty, 
      bin_start_time: Date.now() 
    }).eq('id', latestMachine.id);

    // Thermal Slip Printing on Bin Complete
    try {
      const op = operators.find(o => o.id === latestMachine.current_operator_id);
      const rmName = rawMaterials.find(r => r.id === latestMachine.current_material_id)?.name || latestMachine.material_grade || latestBatch?.material_grade || 'N/A';
      const rmBatch = latestMachine.material_batch || latestBatch?.material_batch || 'N/A';

      printProductionSlip(
        {
          id: cid,
          batchId: absBatchId,
          machineId: latestMachine.id,
          binNumber: bNo,
          startTime: neu.start_time,
          endTime: neu.end_time,
          grossQty: neu.gross_qty,
          startupScrap: neu.startup_scrap,
          qcSample: neu.qc_sample,
          netQty: neu.net_qty,
          operatorId: neu.operator_id,
          supervisorId: neu.supervisor_id,
          status: 'Pending Inspection',
          shiftId: neu.shift_id,
          mouldId: neu.mould_id,
          materialBatch: neu.material_batch
        } as Crate,
        latestMachine as unknown as Machine,
        op?.name,
        false,
        p?.name,
        profile?.email || 'System',
        appSettings?.printLabels,
        rmName,
        rmBatch
      );
    } catch (printErr) {
      console.warn('Print production slip error:', printErr);
    }

    setSelectedMachineId(null);
    // If this was triggered by a breakdown request, open the breakdown modal now
    if (pendingBreakdownMachineId === latestMachine.id) {
      setBreakingMachineId(latestMachine.id);
      setPendingBreakdownMachineId(null);
    }
    setSelectedMachineId(null);
    return true;
  };

  const handleOpenBinComplete = async (mid: string) => {
    // Sync with global batch count before opening
    const m = machines.find(ma => ma.id === mid);
    if (m && m.activeBatchId) {
      const { data: latestBatch } = await supabase.from('batch_records').select('crates').eq('id', m.activeBatchId).maybeSingle();
      if (latestBatch) {
        const nextBin = (latestBatch.crates || 0) + 1;
        await supabase.from('machines').update({ current_bin_number: nextBin }).eq('id', mid);
        setMachines(prev => prev.map(ma => ma.id === mid ? { ...ma, currentBinNumber: nextBin } : ma));
      }
    }
    setSelectedMachineId(mid);
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'Live Dashboard':
        return (
          <LiveDashboardPage 
            machines={machines} 
            products={products} 
            operators={operators} 
            moulds={moulds} 
            rawMaterials={rawMaterials} 
            batchRecords={batchRecords} 
            appSettings={appSettings} 
            shiftSettings={shiftSettings} 
            currentUserRole={profile?.role} 
            currentSupervisorName={profile?.fullName} 
          />
        );
      case 'Shop Floor':
        return (
          <div className="animate-fade-in">
            <div className="mach-grid">
              {machines.map(m => (
                <MachineCard key={m.id} machine={m} products={products} operators={operators} moulds={moulds} rawMaterials={rawMaterials} productMaterials={productMaterials} batchRecords={batchRecords} onAction={isViewOnly ? () => {} : handleAction} onComplete={isViewOnly ? () => {} : handleOpenBinComplete} onAssign={isViewOnly ? () => {} : () => setAssigningOperatorMachineId(m.id)} onResolve={isViewOnly ? () => {} : () => setResolvingMachineId(m.id)} onChangeRM={isViewOnly ? () => {} : () => setChangingRMMachineId(m.id)} />
              ))}
            </div>
          </div>
        );
      case 'Inspections': return <InspectionPage pendingCrates={pendingCrates} machines={machines} products={products} batchRecords={batchRecords} operators={operators} onStartInspection={setInspectingBin} />;
      case 'Batch Log': return <BatchLogPage batchRecords={batchRecords} products={products} pendingCrates={pendingCrates} operators={operators} />;
      case 'Packing': return <PackingPage machines={machines} products={products} batchRecords={batchRecords} operators={operators} appSettings={appSettings} supervisorName={profile?.fullName || ''} />;
      case 'Machines': 
        if (!userPermissions.includes('Machines') && profile?.role !== 'Admin' && profile?.role !== 'PowerUser') {
          setActiveTab(userPermissions[0] || 'Shop Floor');
          return null;
        }
        return <AdminDashboard machines={machines} operators={operators} moulds={moulds} products={products} rawMaterials={rawMaterials} productMaterials={productMaterials} supervisors={[]} shiftSettings={shiftSettings} defectTypes={defectTypes} breakdownReasons={breakdownReasons} cleaningTasks={cleaningTasks} currentUserRole={profile?.role || 'Supervisor'} appSettings={appSettings} onUpdateAppSettings={setAppSettings} />;
      case 'Shift Log': return <ShiftLogPage machines={machines} operators={operators} products={products} moulds={moulds} />;
      case 'Breakdowns': return <BreakdownLogPage machines={machines} />;
      case 'About': return <AboutPage />;
      default: return null;
    }
  };

  if (!session) return <Login onSuccess={() => {}} />;
  if (!profile) return <div className="loading">Initializing...</div>;

  // 1. Handover Flow (Only for supervisors in transition)
  if (appSettings?.pendingHandover && !isAuthorizedSession && !isViewOnly && profile.role !== 'Admin' && profile.role !== 'PowerUser' && profile.role !== 'QC' && userPermissions.includes('Shop Floor')) {
    if (profile.email.toLowerCase() === appSettings.lastHandoverSummary?.outgoing_supervisor_email?.toLowerCase()) {
      return (
        <div className="loading" style={{flexDirection:'column', gap:'20px'}}>
          <div className="ua animate-pulse" style={{width:'80px', height:'80px', fontSize:'24px', background:'var(--amber)', color:'white'}}>H</div>
          <div style={{textAlign:'center'}}>
            <div style={{fontSize:'20px', fontWeight:600}}>Handover in Progress</div>
            <div style={{color:'var(--text3)', marginTop:'8px', maxWidth:'300px'}}>Waiting for the incoming supervisor to acknowledge your shift summary.</div>
            <button className="btn bdan bsm" style={{marginTop:'24px'}} onClick={() => supabase.auth.signOut()}>Sign Out Anyway</button>
          </div>
        </div>
      );
    }
    return (
      <ShiftHandoverPage 
        summary={appSettings.lastHandoverSummary} 
        shiftSettings={shiftSettings} 
        supervisorName={profile.fullName} 
        outgoingSupervisorEmail={appSettings.lastHandoverSummary?.outgoing_supervisor_email} 
        onAcknowledge={handleHandoverAcknowledge} 
      />
    );
  }

  // 2. Login Mode Selection Logic (If predecessor hasn't signed out)
  if (!isAuthorizedSession && !isViewOnly && profile.role !== 'Admin' && profile.role !== 'PowerUser' && profile.role !== 'QC' && userPermissions.includes('Shop Floor') && !appSettings?.pendingHandover) {
    return (
      <div className="ov">
        <div className="modal animate-scale-in" style={{ width: '400px', textAlign:'center' }}>
          <div className="mbd" style={{padding:'30px'}}>
             <div className="ua" style={{background:'var(--blue)', color:'white', marginBottom:'20px'}}>S</div>
             <h2 style={{fontSize:'20px', marginBottom:'10px'}}>Active Session Detected</h2>
             <p style={{color:'var(--text3)', fontSize:'13px', marginBottom:'30px'}}>
                The previous supervisor has not signed out yet. Would you like to take control of the station or continue in view-only mode?
             </p>
             <div style={{display:'flex', flexDirection:'column', gap:'12px'}}>
                <button className="btn bpri bfull" onClick={() => setShowTakeControlModal(true)}>Take Control</button>
                <button className="btn bsec bfull" onClick={() => {
                   setIsViewOnly(true);
                   localStorage.setItem('isViewOnly', 'true');
                }}>View Only Mode</button>
                <button className="btn bdan bfull" style={{background:'none', border:'none', color:'var(--red)'}} onClick={() => {
                   localStorage.removeItem('isViewOnly');
                   supabase.auth.signOut();
                }}>Sign Out / Exit</button>
             </div>
          </div>
        </div>

        {/* Local Takeover Confirmation Modal (Needed because main App isn't rendered yet) */}
        {showTakeControlModal && (
          <div className="ov" style={{zIndex:10001}}>
            <div className="modal animate-scale-in" style={{ width: '400px' }}>
              <div className="mhd">
                 <div className="mtit">Taking Station Control</div>
              </div>
              <div className="mbd" style={{padding:'20px'}}>
                 <p style={{color:'var(--text2)', fontSize:'14px', marginBottom:'20px'}}>
                    You are taking over the system without a formal handover summary. Please confirm to proceed.
                 </p>
                 <div style={{display:'flex', gap:'12px'}}>
                    <button className="btn bsec" style={{flex:1}} onClick={() => setShowTakeControlModal(false)}>Cancel</button>
                    <button className="btn bpri" style={{flex:1}} onClick={() => {
                       setShowTakeControlModal(false);
                       setIsAuthorizedSession(true);
                       handleHandoverAcknowledge(appSettings?.currentShift || 'A');
                    }}>Confirm Takeover</button>
                 </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // 3. Initial Onboarding Step (Operator Assignment)
  if (isInitialAssignmentOpen && profile.role !== 'Admin' && profile.role !== 'PowerUser' && profile.role !== 'QC' && userPermissions.includes('Shop Floor')) {
    return (
      <div style={{ height: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <ForceOperatorAssignmentModal 
          machines={machines.filter(m => m.status === 'Running')} 
          operators={operators} 
          onConfirm={async (asgs) => {
            for (const a of asgs) {
              if (a.operatorId) {
                await supabase.from('machines').update({ current_operator_id: a.operatorId }).eq('id', a.machineId);
                const opName = operators.find(o => o.id === a.operatorId)?.name || a.operatorId;
                await addLogEntry(a.machineId, 'Operator Assigned', `Operator ${opName} assigned for new shift`, a.operatorId);
              }
            }
            setMachines(prev => prev.map(m => {
              const a = asgs.find(asg => asg.machineId === m.id);
              return a ? { ...m, currentOperatorId: a.operatorId } : m;
            }));
            setIsAuthorizedSession(true);
            setIsInitialAssignmentOpen(false);
          }}
          onClose={() => {
            setIsAuthorizedSession(true);
            setIsInitialAssignmentOpen(false);
          }}
        />
      </div>
    );
  }


  return (
    <div id="app-layout">
      {/* 1. Session Modals */}
      {showTakeControlModal && (
        <div className="ov" style={{ zIndex: 10000 }}>
          <div className="modal animate-scale-in" style={{ width: '400px' }}>
            <div className="mhd">
              <div className="mtit">Taking Station Control</div>
            </div>
            <div className="mbd" style={{ padding: '20px' }}>
              <p style={{ color: 'var(--text2)', fontSize: '14px', marginBottom: '20px' }}>
                {isViewOnly ? 'Upgrade your current view-only session to an active supervisor session?' : 'You are taking over the system without a formal handover summary. Please confirm to proceed.'}
              </p>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button className="btn bsec" style={{ flex: 1 }} onClick={() => setShowTakeControlModal(false)}>Cancel</button>
                <button className="btn bpri" style={{ flex: 1 }} onClick={() => {
                  setShowTakeControlModal(false);
                  setIsViewOnly(false);
                  handleHandoverAcknowledge(appSettings?.currentShift || 'A');
                }}>Confirm Takeover</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {pendingAction && (
        <div className="ov animate-fade-in">
          <div className="modal animate-scale-in" style={{ width: '320px', padding: '24px', textAlign: 'center' }}>
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>Safety Confirmation</div>
              <div style={{ fontSize: '13px', color: 'var(--text2)' }}>Enter PIN (1234) to confirm machine STOP</div>
            </div>
            <input
              type="password"
              className="fi"
              style={{ width: '100%', textAlign: 'center', fontSize: '24px', letterSpacing: '8px', marginBottom: '20px' }}
              autoFocus
              maxLength={4}
              onChange={async (e) => {
                if (e.target.value === '1234') {
                  const { machineId, nextStatus } = pendingAction.data;
                  setMachines((prev: Machine[]) => prev.map(m => m.id === machineId ? { ...m, status: nextStatus as MachineStatus, currentOperatorId: null as any } : m));
                  await supabase.from('machines').update({ status: nextStatus, current_operator_id: null }).eq('id', machineId);
                  await addLogEntry(machineId, 'Machine Stopped', 'Machine manually stopped by supervisor');
                  setPendingAction(null);
                }
              }}
            />
            <button className="btn bfull bsec" onClick={() => setPendingAction(null)}>Cancel</button>
          </div>
        </div>
      )}

      {/* 2. Navigation Components */}
      <div 
        className={`sidebar-overlay ${!isSidebarCollapsed ? 'open' : ''}`} 
        onClick={() => setIsSidebarCollapsed(true)} 
      />

      <div id="sidebar" className={isSidebarCollapsed ? 'collapsed' : 'open'}>
        <div className="sl" style={{ display: 'flex', alignItems: 'center', justifyContent: isSidebarCollapsed ? 'center' : 'space-between', minHeight: '64px' }}>
          {!isSidebarCollapsed && (
            <div style={{ flex: 1 }}>
              <div className="sl-t">IM-MES</div>
              <div className="sl-s">Execution System</div>
            </div>
          )}
          <button className="btn bsm desktop-only" onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)} style={{ padding: '8px', marginLeft: isSidebarCollapsed ? '0' : '8px' }}>
            {isSidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>

        </div>
        <div className="su">
          <div className="ua">{(profile?.fullName || 'U').split(' ').map(n => n[0]).join('')}</div>
          {!isSidebarCollapsed && (
            <div>
              <div className="un">{profile?.fullName}</div>
              <div className="ur">{profile?.role || 'Supervisor'}</div>
            </div>
          )}
        </div>
        <nav className="snav">
            {userPermissions.includes('Live Dashboard') && (
              <NavItem icon={<LayoutDashboard size={16}/>} label="Live Dashboard" active={activeTab==='Live Dashboard'} onClick={()=>{setActiveTab('Live Dashboard'); if(window.innerWidth <= 1024) setIsSidebarCollapsed(true);}}/>
            )}
            {userPermissions.includes('Shop Floor') && (
              <NavItem icon={<Factory size={16}/>} label="Shop Floor" active={activeTab==='Shop Floor'} onClick={()=>{setActiveTab('Shop Floor'); if(window.innerWidth <= 1024) setIsSidebarCollapsed(true);}}/>
            )}
            {userPermissions.includes('Inspections') && (
              <NavItem icon={<ClipboardList size={16}/>} label="Inspections" active={activeTab==='Inspections'} onClick={()=>{setActiveTab('Inspections'); if(window.innerWidth <= 1024) setIsSidebarCollapsed(true);}}/>
            )}
            {userPermissions.includes('Packing') && (
              <NavItem icon={<Boxes size={16}/>} label="Packing App" active={activeTab==='Packing'} onClick={()=>{setActiveTab('Packing'); if(window.innerWidth <= 1024) setIsSidebarCollapsed(true);}}/>
            )}
            {userPermissions.includes('Batch Log') && (
              <NavItem icon={<History size={16}/>} label="Batch Log" active={activeTab==='Batch Log'} onClick={()=>{setActiveTab('Batch Log'); if(window.innerWidth <= 1024) setIsSidebarCollapsed(true);}}/>
            )}
            {userPermissions.includes('Shift Log') && (
              <NavItem icon={<ScrollText size={16}/>} label="Shift Log" active={activeTab==='Shift Log'} onClick={()=>{setActiveTab('Shift Log'); if(window.innerWidth <= 1024) setIsSidebarCollapsed(true);}}/>
            )}
            {userPermissions.includes('Breakdowns') && (
              <NavItem icon={<AlertCircle size={16}/>} label="Breakdowns" active={activeTab==='Breakdowns'} onClick={()=>{setActiveTab('Breakdowns'); if(window.innerWidth <= 1024) setIsSidebarCollapsed(true);}}/>
            )}
            {!isViewOnly && (profile?.role === 'Admin' || profile?.role === 'PowerUser' || userPermissions.includes('Machines')) && (
              <NavItem icon={<Cpu size={16}/>} label="Admin Console" active={activeTab==='Machines'} onClick={()=>{setActiveTab('Machines'); if(window.innerWidth <= 1024) setIsSidebarCollapsed(true);}}/>
            )}
            <div style={{ flex: 1 }} />
            {userPermissions.includes('About') && (
              <NavItem icon={<Info size={16}/>} label="About" active={activeTab==='About'} onClick={()=>{setActiveTab('About'); if(window.innerWidth <= 1024) setIsSidebarCollapsed(true);}}/>
            )}
        </nav>
      </div>

      {/* 3. Main Content Area */}
      <main id="main">
        <header id="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button 
              className="btn bsm mobile-only" 
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)} 
              style={{ padding: '8px' }}
            >
              <Menu size={20} />
            </button>
            <div className="desktop-only">
              <div className="pt">{activeTab}</div>
              <div className="ps">LIVE · Unit Output Dashboard</div>
            </div>
            <div className="mobile-only" style={{ fontSize: '15px', fontWeight: 700 }}>
              {activeTab}
            </div>
          </div>

          <div className="topbar-center" style={{ display: 'flex', alignItems: 'center', gap: '15px', background: 'rgba(255,255,255,0.03)', padding: '6px 12px', borderRadius: '30px', border: '1px solid var(--border)' }}>
            <div className="desktop-only" style={{ textAlign: 'right' }}>
              <TopBarClock />
            </div>
            <div className="desktop-only" style={{ width: '1px', height: '20px', background: 'var(--border)' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div className="pill pg" style={{ padding: '2px 8px', fontSize: '10px', fontWeight: 800 }}>S-{appSettings?.currentShift || 'A'}</div>
              <div className="desktop-only">
                {(profile?.role === 'Supervisor' ? profile?.fullName : appSettings?.activeSupervisorName) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text2)', borderLeft: '1px solid var(--border)', paddingLeft: '12px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 600 }}>{profile?.role === 'Supervisor' ? profile?.fullName : appSettings?.activeSupervisorName}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div style={{ textAlign: 'right', display: 'flex', gap: '6px', alignItems: 'center', justifyContent: 'flex-end' }}>
            <button 
              className="btn bdan bsm" 
              style={{ padding: '3px 8px', height: '26px', fontSize: '10px' }}
              onClick={(profile?.role === 'Admin' || profile?.role === 'PowerUser' || profile?.role === 'QC' || !userPermissions.includes('Shop Floor') || isViewOnly) ? () => supabase.auth.signOut() : () => setIsHandoverSummaryOpen(true)}
            >
              <LogOut size={12}/> <span style={{ fontSize: '10px', fontWeight: 600 }}>Logout</span>
            </button>
          </div>
        </header>

        <section id="content">
          {renderContent()}
          <div className="mobile-only" style={{ height: '70px' }} />
        </section>
      </main>

      {/* Bottom Navigation for Mobile */}
      <nav className="bottom-nav">
        {userPermissions.includes('Live Dashboard') && (
          <div className={`bn-item ${activeTab === 'Live Dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('Live Dashboard')}>
            <LayoutDashboard size={20} />
            <span>Dashboard</span>
          </div>
        )}
        {userPermissions.includes('Shop Floor') && (
          <div className={`bn-item ${activeTab === 'Shop Floor' ? 'active' : ''}`} onClick={() => setActiveTab('Shop Floor')}>
            <Factory size={20} />
            <span>Shop Floor</span>
          </div>
        )}
        {userPermissions.includes('Inspections') && (
          <div className={`bn-item ${activeTab === 'Inspections' ? 'active' : ''}`} onClick={() => setActiveTab('Inspections')}>
            <ClipboardList size={20} />
            <span>Inspection</span>
          </div>
        )}
        {userPermissions.includes('Packing') && (
          <div className={`bn-item ${activeTab === 'Packing' ? 'active' : ''}`} onClick={() => setActiveTab('Packing')}>
            <Boxes size={20} />
            <span>Packing</span>
          </div>
        )}
        {userPermissions.includes('Batch Log') && (
          <div className={`bn-item ${activeTab === 'Batch Log' ? 'active' : ''}`} onClick={() => setActiveTab('Batch Log')}>
            <History size={20} />
            <span>Log</span>
          </div>
        )}
        {userPermissions.includes('Shift Log') && (
          <div className={`bn-item ${activeTab === 'Shift Log' ? 'active' : ''}`} onClick={() => setActiveTab('Shift Log')}>
            <ScrollText size={20} />
            <span>Shift</span>
          </div>
        )}
        {userPermissions.includes('Breakdowns') && (
          <div className={`bn-item ${activeTab === 'Breakdowns' ? 'active' : ''}`} onClick={() => setActiveTab('Breakdowns')}>
            <AlertCircle size={20} />
            <span>Breakdowns</span>
          </div>
        )}
      </nav>

      {/* 4. Global Modals */}
      {isHandoverSummaryOpen && (
        <HandoverSummaryModal 
          machines={machines} 
          pendingCrates={pendingCrates} 
          onClose={() => setIsHandoverSummaryOpen(false)} 
          onConfirm={async (data) => {
            try {
              const { error: logErr } = await supabase.from('shift_summaries').insert({
                id: `S-${Date.now()}`,
                shift_date: new Date().toISOString().split('T')[0],
                shift_id: appSettings?.currentShift || 'A',
                supervisor_name: profile?.fullName || 'Supervisor',
                handover_time: new Date().toISOString(),
                total_output: data.totalOutput,
                running_machines: data.runningMachines,
                pending_crates: data.pendingCrates,
                remarks: data.notes || 'End of shift handover summary'
              });
              if (logErr) throw new Error(`Log Error: ${logErr.message}`);
              const { error: setErr } = await supabase.from('app_settings').upsert({ 
                id: 'global',
                pending_handover: true, 
                last_handover_summary: data, 
                outgoing_supervisor_email: profile?.email || null,
                current_shift: appSettings?.currentShift || 'A'
              });
              if (setErr) throw new Error(`State Error: ${setErr.message}`);
              await supabase.auth.signOut();
            } catch (err: any) {
              console.error('Sign Out Handover Error:', err);
              alert(`Handover failed! Your summary was not saved: ${err.message}`);
            }
          }} 
        />
      )}

      {selectedMachineId && (() => {
        const selMachine = machines.find(m => m.id === selectedMachineId);
        if (!selMachine) return null;
        const op = operators.find(o => o.id === selMachine.currentOperatorId);
        const prod = products.find(p => p.id === selMachine.activeProductId);
        const rm = rawMaterials.find(r => r.id === selMachine.currentMaterialId);
        const rmName = rm?.name || selMachine.materialGrade || 'N/A';
        const rmBatch = selMachine.materialBatch || 'N/A';

        return (
          <BinCompleteModal 
            machine={selMachine} 
            binNumber={selMachine.currentBinNumber} 
            operatorName={op?.name || 'Unknown Operator'}
            operatorCode={op?.employeeId || 'N/A'}
            shift={appSettings?.currentShift || 'A'}
            productName={prod?.name || 'N/A'}
            supervisorName={profile?.email || 'System'}
            rawMaterialName={rmName}
            rawMaterialBatch={rmBatch}
            appSettings={appSettings}
            onClose={() => { setSelectedMachineId(null); setPendingBreakdownMachineId(null); }} 
            onConfirm={handleBinComplete} 
          />
        );
      })()}

      {inspectingBin && (
        <InspectionModal 
          binId={inspectingBin.id} 
          netQty={inspectingBin.netQty} 
          defectTypes={defectTypes} 
          operators={operators} 
          onClose={() => setInspectingBin(null)} 
          onConfirm={async (data) => {
            const rejDetails = data.rejections.reduce((acc: any, r: any) => { if (r.count > 0) acc[r.category] = r.count; return acc; }, {});
            const rejQty = data.rejections.reduce((sum: number, r: any) => sum + r.count, 0);
            const diff = data.goodQty - inspectingBin.netQty;
            const inspector = operators.find(o => o.id === data.inspectorId);
            const inspectorDisplay = inspector ? `${inspector.name} (${inspector.employeeId})` : 'System';
            await supabase.from('crates').update({ 
              status: 'Completed', 
              net_qty: data.goodQty,
              rejected_qty: rejQty,
              rejection_details: rejDetails,
              inspected_by: inspectorDisplay,
              inspected_at: new Date().toISOString()
            }).eq('id', inspectingBin.id);
            if (diff !== 0) {
              const crate = pendingCrates.find(c => c.id === inspectingBin.id);
              if (crate?.batchId) {
                const b = batchRecords.find(br => br.id === crate.batchId);
                if (b) await supabase.from('batch_records').update({ total_output: (b.totalOutput || 0) + diff }).eq('id', crate.batchId);
              }
            }
            setPendingCrates(prev => prev.filter(c => c.id !== inspectingBin.id));
            setInspectingBin(null);
          }} 
        />
      )}

      {breakingMachineId && (
        <BreakdownModal 
          machineId={breakingMachineId} 
          machineName={machines.find(m => m.id === breakingMachineId)?.name || ''} 
          breakdownReasons={breakdownReasons} 
          onClose={() => setBreakingMachineId(null)} 
          onConfirm={async (data) => {
            const m = machines.find(ma => ma.id === breakingMachineId)!;
            await supabase.from('breakdown_records').insert({ id: `BRK-${Date.now()}`, machine_id: m.id, machine_name: m.name, start_time: new Date().toISOString(), reason: data.event, remarks: data.remarks, operator_id: m.currentOperatorId || 'UNASSIGNED', supervisor_name: profile?.fullName || 'Supervisor', status: 'Open' });
            await supabase.from('machines').update({ status: 'Maintenance', breakdown_start_time: Date.now() }).eq('id', m.id);
            await addLogEntry(m.id, 'Breakdown Reported', `Machine into maintenance: ${data.event}`, m.currentOperatorId || undefined);
            setBreakingMachineId(null);
          }} 
        />
      )}

      {resolvingMachineId && (
        <ResolveBreakdownModal 
          machineName={machines.find(m => m.id === resolvingMachineId)?.name || ''} 
          onClose={() => setResolvingMachineId(null)} 
          onConfirm={async () => {
            const m = machines.find(ma => ma.id === resolvingMachineId)!;
            const endTime = new Date();
            const startTime = m.breakdownStartTime ? new Date(m.breakdownStartTime) : new Date();
            const duration = Math.round((endTime.getTime() - startTime.getTime()) / 60000);
            await supabase.from('breakdown_records').update({ status: 'Resolved', end_time: endTime.toISOString(), duration_minutes: duration }).eq('machine_id', resolvingMachineId).eq('status', 'Open');
            await supabase.from('machines').update({ status: 'Idle', breakdown_start_time: null }).eq('id', resolvingMachineId);
            setMachines((prev: Machine[]) => prev.map(ma => ma.id === resolvingMachineId ? { ...ma, status: 'Idle', breakdownStartTime: undefined } : ma));
            await addLogEntry(resolvingMachineId, 'Breakdown Resolved', `Maintenance completed in ${duration}m, machine ready`);
            setResolvingMachineId(null);
          }} 
        />
      )}

      {settingUpMachineId && (
        <JobSetupModal 
          machine={machines.find(m => m.id === settingUpMachineId)!} 
          allMachines={machines} 
          products={products} 
          moulds={moulds} 
          rawMaterials={rawMaterials} 
          productMaterials={productMaterials} 
          cleaningTasks={cleaningTasks} 
          onClose={() => setSettingUpMachineId(null)} 
          onAssignOperator={() => setAssigningOperatorMachineId(settingUpMachineId)} 
          onConfirm={async (data) => {
            const p = products.find(pr => pr.id === data.productId);
            if (!p) return;
            const { batchId: bid, batchDateStr: batchDate } = getBatchSummary(p.batchIdentifier || 'XX');
            if (data.isMouldChanged) {
              await supabase.from('batch_records').upsert({ 
                id: bid, machine_id: settingUpMachineId, product_id: data.productId, 
                product_name: p.name, product_code: p.itemCode, mould_id: data.mouldId, 
                material_id: data.materialId, material_grade: data.materialGrade, 
                material_batch: data.materialBatch, operator_id: '', 
                start_time: new Date().toISOString(), crates: 0, total_output: 0, 
                status: 'Active', batch_date: batchDate 
              });
              await supabase.from('machines').update({ 
                status: 'Running', current_mould_id: data.mouldId, active_product_id: data.productId, 
                current_material_id: data.materialId, material_grade: data.materialGrade, material_batch: data.materialBatch,
                active_batch_id: bid, active_batch_date: batchDate, current_bin_number: 1, 
                current_shift_production: 0, current_day_production: 0, bin_start_time: Date.now(), bin_target: data.binTarget
              }).eq('id', settingUpMachineId);

              setMachines(prev => prev.map(ma => ma.id === settingUpMachineId ? {
                ...ma,
                status: 'Running', currentMouldId: data.mouldId, activeProductId: data.productId,
                currentMaterialId: data.materialId, materialGrade: data.materialGrade, materialBatch: data.materialBatch,
                activeBatchId: bid, activeBatchDate: batchDate, currentBinNumber: 1,
                currentShiftProduction: 0, currentDayProduction: 0, binStartTime: Date.now(), binTarget: data.binTarget
              } : ma));

              const rmName = rawMaterials.find((r: any) => r.id === data.materialId)?.name || data.materialId;
              await addLogEntry(settingUpMachineId, 'Job Setup - RM Initialized',
                `New Job: ${p.name} (${p.itemCode}) | Batch: ${bid} | RM: ${rmName} | Lot: ${data.materialBatch} | Mould: ${data.mouldId}`);
            } else {
              const m = machines.find(ma => ma.id === settingUpMachineId);
              const isDiffDay = m?.activeBatchDate && m.activeBatchDate !== batchDate;
              if (isDiffDay) {
                await supabase.from('batch_records').upsert({ 
                  id: bid, machine_id: settingUpMachineId, product_id: data.productId, 
                  product_name: p.name, product_code: p.itemCode, mould_id: data.mouldId, 
                  material_id: data.materialId, material_grade: data.materialGrade, 
                  material_batch: data.materialBatch, operator_id: '', 
                  start_time: new Date().toISOString(), crates: 0, total_output: 0, 
                  status: 'Active', batch_date: batchDate 
                });
                await supabase.from('machines').update({ 
                  status: 'Running', active_batch_id: bid, active_batch_date: batchDate, 
                  current_material_id: data.materialId, material_grade: data.materialGrade, material_batch: data.materialBatch,
                  current_bin_number: 1, current_shift_production: 0, current_day_production: 0, 
                  bin_start_time: Date.now(), bin_target: data.binTarget
                }).eq('id', settingUpMachineId);

                setMachines(prev => prev.map(ma => ma.id === settingUpMachineId ? {
                  ...ma,
                  status: 'Running', activeBatchId: bid, activeBatchDate: batchDate,
                  currentMaterialId: data.materialId, materialGrade: data.materialGrade, materialBatch: data.materialBatch,
                  currentBinNumber: 1, currentShiftProduction: 0, currentDayProduction: 0,
                  binStartTime: Date.now(), binTarget: data.binTarget
                } : ma));

                const rmNameR = rawMaterials.find((r: any) => r.id === data.materialId)?.name || data.materialId;
                await addLogEntry(settingUpMachineId, 'Job Rollover - RM Carried',
                  `Resumed (Day Rollover): ${p.name} | Batch: ${bid} | RM: ${rmNameR} | Lot: ${data.materialBatch} | Mould: ${data.mouldId}`);
              } else {
                const { data: latestBatch } = await supabase.from('batch_records').select('crates').eq('id', bid).maybeSingle();
                const nextBin = (latestBatch?.crates || 0) + 1;
                await supabase.from('machines').update({ 
                  status: 'Running', bin_start_time: Date.now(), bin_target: data.binTarget, current_bin_number: nextBin,
                  current_material_id: data.materialId, material_grade: data.materialGrade, material_batch: data.materialBatch
                }).eq('id', settingUpMachineId);

                await supabase.from('batch_records').update({
                  material_id: data.materialId, material_grade: data.materialGrade, material_batch: data.materialBatch
                }).eq('id', bid);

                setMachines(prev => prev.map(ma => ma.id === settingUpMachineId ? { 
                  ...ma, status: 'Running', binStartTime: Date.now(), binTarget: data.binTarget, currentBinNumber: nextBin,
                  currentMaterialId: data.materialId, materialGrade: data.materialGrade, materialBatch: data.materialBatch
                } : ma));

                const rmNameS = rawMaterials.find((r: any) => r.id === data.materialId)?.name || data.materialId;
                await addLogEntry(settingUpMachineId, 'Job Resumed - RM Verified',
                  `Resumed: ${p.name} | Bin #${nextBin} | RM: ${rmNameS} | Lot: ${data.materialBatch}`);
              }
            }
            setSettingUpMachineId(null);
          }} 
        />
      )}

      {changingRMMachineId && (
        <ChangeRMModal
          machine={machines.find(m => m.id === changingRMMachineId)!}
          products={products}
          rawMaterials={rawMaterials}
          productMaterials={productMaterials}
          batchRecords={batchRecords}
          onClose={() => setChangingRMMachineId(null)}
          onConfirm={async ({ materialId, materialBatch, reason, oldMaterialName, oldBatch }: any) => {
            const rm = rawMaterials.find((r: any) => r.id === materialId);
            const gradeName = rm?.name || materialId;
            const m = machines.find(ma => ma.id === changingRMMachineId);
            const p = products.find(pr => pr.id === m?.activeProductId);

            await supabase.from('machines').update({
              current_material_id: materialId,
              material_grade: gradeName,
              material_batch: materialBatch,
            }).eq('id', changingRMMachineId);

            if (m?.activeBatchId) {
              await supabase.from('batch_records').update({
                material_id: materialId,
                material_grade: gradeName,
                material_batch: materialBatch,
              }).eq('id', m.activeBatchId);
            }

            setMachines(prev => prev.map(mach => mach.id === changingRMMachineId
              ? { ...mach, currentMaterialId: materialId, materialGrade: gradeName, materialBatch }
              : mach
            ));
            setBatchRecords(prev => prev.map(b => (m?.activeBatchId && b.id === m.activeBatchId)
              ? { ...b, materialId, materialGrade: gradeName, materialBatch }
              : b
            ));

            const logDetails = `RM Traceability: [${oldMaterialName || 'None'} (Lot: ${oldBatch || 'None'})] ➔ [${gradeName} (Lot: ${materialBatch})] | Reason: ${reason} | Prod: ${p?.name || '—'} (${p?.itemCode || '—'}) | Batch: ${m?.activeBatchId || '—'} | Bin #${m?.currentBinNumber || 1}`;
            await addLogEntry(changingRMMachineId, 'RM Batch Changed', logDetails, m?.currentOperatorId || undefined);
            setChangingRMMachineId(null);
          }}
        />
      )}

      {assigningOperatorMachineId && (
        <ForceOperatorAssignmentModal 
          machines={machines.filter(m => m.id === assigningOperatorMachineId)} 
          operators={operators} 
          onClose={() => setAssigningOperatorMachineId(null)} 
          onConfirm={async (asgs) => { 
            setMachines(prev => prev.map(m => { const a = asgs.find(asg => asg.machineId === m.id); return a ? { ...m, currentOperatorId: a.operatorId } : m; }));
            for (const a of asgs) {
              if (a.operatorId) {
                await supabase.from('machines').update({ current_operator_id: a.operatorId }).eq('id', a.machineId);
                const opName = operators.find(o => o.id === a.operatorId)?.name || a.operatorId;
                await addLogEntry(a.machineId, 'Operator Assigned', `Operator ${opName} reassigned mid-shift`, a.operatorId);
              }
            } 
            setAssigningOperatorMachineId(null); 
          }} 
        />
      )}
    </div>
  );
};

export default App;

