import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  X, Plus, Trash2, Calendar, Clock, Factory, User, ShieldCheck, 
  Layers, Package, AlertTriangle, CheckCircle2 
} from 'lucide-react';
import type { Machine, Product, Operator, ShiftSetting, BatchRecord } from '../types';
import { supabase } from '../lib/supabase';
import { formatUnitId, genBatchId } from '../utils/batchUtils';
import type { SupervisorRecord } from '../utils/supervisorUtils';

interface LogMissedProductionModalProps {
  machines?: Machine[];
  products?: Product[];
  operators?: Operator[];
  supervisors?: SupervisorRecord[];
  shiftSettings?: ShiftSetting[];
  defaultSupervisorName?: string;
  onClose: () => void;
  onSuccess: () => void;
}

interface BinDraft {
  binNumber: number;
  grossQty: number;
  startupScrap: number;
  qcSample: number;
  netQty: number;
}

export const LogMissedProductionModal: React.FC<LogMissedProductionModalProps> = ({
  machines = [],
  products = [],
  operators = [],
  supervisors = [],
  shiftSettings = [],
  defaultSupervisorName,
  onClose,
  onSuccess
}) => {
  // Default to yesterday's date (since missed shift is typically last night)
  const defaultDateStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  }, []);

  // Form selections
  const [productionDate, setProductionDate] = useState<string>(defaultDateStr);
  const [selectedShift, setSelectedShift] = useState<string>('C');
  const [selectedMachineId, setSelectedMachineId] = useState<string>(machines[0]?.id || 'IMM-A');
  const [selectedOperatorId, setSelectedOperatorId] = useState<string>(operators[0]?.id || '');
  const [selectedSupervisor, setSelectedSupervisor] = useState<string>(defaultSupervisorName || 'Nidhin Chandran');

  // Batch auto-discovery states
  const [isLoadingBatch, setIsLoadingBatch] = useState(false);
  const [existingBatch, setExistingBatch] = useState<BatchRecord | null>(null);
  const [existingMaxBin, setExistingMaxBin] = useState<number>(0);

  // Manual fallback if no batch exists for this date/machine
  const [fallbackProductId, setFallbackProductId] = useState<string>('');
  const [fallbackMouldId, setFallbackMouldId] = useState<string>('');
  const [fallbackMaterialBatch, setFallbackMaterialBatch] = useState<string>('');

  // Mode: 'bulk' or 'single'
  const [entryMode, setEntryMode] = useState<'bulk' | 'single'>('bulk');
  const [numBinsToLog, setNumBinsToLog] = useState<number>(3);
  const [standardBinQty, setStandardBinQty] = useState<number>(4000);
  const [startBinNumber, setStartBinNumber] = useState<number>(1);

  // Editable drafts list
  const [binDrafts, setBinDrafts] = useState<BinDraft[]>([]);

  // Submission states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<{ count: number; batchId: string; totalUnits: number } | null>(null);

  // Helper to generate drafts
  const generateDrafts = useCallback((startBin: number, count: number, defaultQty: number) => {
    const drafts: BinDraft[] = [];
    const validCount = Math.max(1, count);
    for (let i = 0; i < validCount; i++) {
      const bNum = startBin + i;
      drafts.push({
        binNumber: bNum,
        grossQty: defaultQty,
        startupScrap: 0,
        qcSample: 0,
        netQty: defaultQty
      });
    }
    setBinDrafts(drafts);
  }, []);

  // Auto-detect supervisor if not set
  useEffect(() => {
    if (!selectedSupervisor && supervisors.length > 0) {
      const active = supervisors.find(s => s.role === 'Supervisor' || s.fullName?.includes('Nidhin')) || supervisors[0];
      if (active?.fullName || active?.full_name) {
        setSelectedSupervisor(active.fullName || active.full_name || '');
      }
    }
  }, [supervisors, selectedSupervisor]);

  // When Machine or Production Date changes, query for existing batch and highest bin number
  useEffect(() => {
    if (!selectedMachineId || !productionDate) return;

    let isMounted = true;
    setIsLoadingBatch(true);
    setExistingBatch(null);
    setExistingMaxBin(0);

    const lookupBatch = async () => {
      try {
        // 1. Check for batch record on this machine & date
        const { data: batchList } = await supabase
          .from('batch_records')
          .select('*')
          .eq('machine_id', selectedMachineId)
          .eq('batch_date', productionDate)
          .order('start_time', { ascending: false });

        if (!isMounted) return;

        const batchData = batchList && batchList.length > 0 ? batchList[0] : null;
        let batchIdToQueryCrates: string | null = null;

        if (batchData) {
          const rec: BatchRecord = {
            id: batchData.id,
            machineId: batchData.machine_id,
            productId: batchData.product_id,
            productName: batchData.product_name,
            productCode: batchData.product_code,
            mouldId: batchData.mould_id,
            materialGrade: batchData.material_grade,
            materialBatch: batchData.material_batch,
            operatorId: batchData.operator_id,
            startTime: batchData.start_time,
            endTime: batchData.end_time,
            crates: batchData.crates,
            totalOutput: batchData.total_output,
            status: batchData.status,
            batchDate: batchData.batch_date
          };
          setExistingBatch(rec);
          batchIdToQueryCrates = batchData.id;

          const prod = (products || []).find(p => p.id === batchData.product_id);
          if (prod?.binQty) setStandardBinQty(prod.binQty);
        } else {
          // If no batch found, pre-select machine's current active product as fallback
          const mach = (machines || []).find(m => m.id === selectedMachineId);
          if (mach?.activeProductId) {
            setFallbackProductId(mach.activeProductId);
            setFallbackMouldId(mach.currentMouldId || '');
            setFallbackMaterialBatch(mach.materialBatch || '');
            const prod = (products || []).find(p => p.id === mach.activeProductId);
            if (prod?.binQty) setStandardBinQty(prod.binQty);
          }
        }

        // 2. Query crates to find the highest existing bin number
        let maxBin = 0;
        if (batchIdToQueryCrates) {
          const { data: crates } = await supabase
            .from('crates')
            .select('bin_number')
            .eq('batch_id', batchIdToQueryCrates)
            .order('bin_number', { ascending: false })
            .limit(1);

          if (crates && crates.length > 0 && crates[0].bin_number) {
            maxBin = crates[0].bin_number;
          }
        }

        if (isMounted) {
          setExistingMaxBin(maxBin);
          const nextSuggested = maxBin + 1;
          setStartBinNumber(nextSuggested);
          generateDrafts(nextSuggested, numBinsToLog, standardBinQty);
        }
      } catch (err) {
        console.error('Error looking up batch for missed production:', err);
      } finally {
        if (isMounted) setIsLoadingBatch(false);
      }
    };

    lookupBatch();

    return () => { isMounted = false; };
  }, [selectedMachineId, productionDate, machines, products, generateDrafts, numBinsToLog, standardBinQty]);

  // Re-generate drafts when parameters change
  const handleRegenerateDrafts = (start: number, count: number, qty: number) => {
    setStartBinNumber(start);
    setNumBinsToLog(count);
    setStandardBinQty(qty);
    generateDrafts(start, count, qty);
  };

  // Update a single field in a draft row
  const updateDraftRow = (index: number, field: keyof BinDraft, val: number) => {
    setBinDrafts(prev => {
      const copy = [...prev];
      const target = { ...copy[index], [field]: val };
      if (field === 'grossQty' || field === 'startupScrap' || field === 'qcSample') {
        const gross = Number(target.grossQty) || 0;
        const scrap = Number(target.startupScrap) || 0;
        const qc = Number(target.qcSample) || 0;
        target.netQty = Math.max(0, gross - scrap - qc);
      }
      copy[index] = target;
      return copy;
    });
  };

  const removeDraftRow = (index: number) => {
    setBinDrafts(prev => prev.filter((_, i) => i !== index));
  };

  const addExtraDraftRow = () => {
    const nextNum = binDrafts.length > 0 ? binDrafts[binDrafts.length - 1].binNumber + 1 : startBinNumber;
    setBinDrafts(prev => [
      ...prev,
      {
        binNumber: nextNum,
        grossQty: standardBinQty,
        startupScrap: 0,
        qcSample: 0,
        netQty: standardBinQty
      }
    ]);
  };

  // Summary calculations
  const totalNetUnits = useMemo(() => {
    return binDrafts.reduce((sum, d) => sum + (Number(d.netQty) || 0), 0);
  }, [binDrafts]);

  // Compute shift window start and end ISO timestamps for that date
  const computeShiftTimestamps = (dateStr: string, shift: string) => {
    let startHour = 6;
    let endHour = 14;
    let nextDay = false;

    if (shift === 'B') {
      startHour = 14;
      endHour = 22;
    } else if (shift === 'C') {
      startHour = 22;
      endHour = 6;
      nextDay = true;
    }

    const start = new Date(`${dateStr}T${String(startHour).padStart(2, '0')}:00:00`);
    const end = new Date(`${dateStr}T${String(endHour).padStart(2, '0')}:00:00`);
    if (nextDay) {
      end.setDate(end.getDate() + 1);
    }
    return { start, end };
  };

  // Submission handler
  const handleSubmit = async () => {
    setErrorMessage(null);
    if (!selectedMachineId) {
      setErrorMessage('Please select a machine.');
      return;
    }
    if (binDrafts.length === 0) {
      setErrorMessage('Please add at least one bin to log.');
      return;
    }

    const prod = existingBatch
      ? (products || []).find(p => p.id === existingBatch.productId)
      : (products || []).find(p => p.id === fallbackProductId);

    if (!prod && !existingBatch) {
      setErrorMessage('Please select the product that was running on this machine.');
      return;
    }

    setIsSubmitting(true);

    try {
      let batchId = existingBatch?.id;
      const targetDate = productionDate;
      const mach = (machines || []).find(m => m.id === selectedMachineId);

      // 1. If batch doesn't exist yet for this date, create it
      if (!batchId) {
        const pCode = prod?.batchIdentifier || prod?.itemCode?.slice(0, 2) || 'XX';
        const dateObj = new Date(targetDate);
        const generatedId = genBatchId(pCode, dateObj);
        batchId = generatedId;

        const newBatchPayload = {
          id: batchId,
          machine_id: selectedMachineId,
          product_id: prod?.id,
          product_name: prod?.name || '',
          product_code: prod?.itemCode || '',
          mould_id: fallbackMouldId || mach?.currentMouldId || prod?.mouldId || 'M01',
          material_grade: mach?.materialGrade || 'Standard',
          material_batch: fallbackMaterialBatch || mach?.materialBatch || 'Standard Lot',
          operator_id: selectedOperatorId || 'UNASSIGNED',
          start_time: new Date(`${targetDate}T06:00:00Z`).toISOString(),
          crates: 0,
          total_output: 0,
          status: 'Active',
          batch_date: targetDate
        };

        const { error: batchCreateErr } = await supabase.from('batch_records').upsert(newBatchPayload);
        if (batchCreateErr) throw new Error(`Could not initialize batch record: ${batchCreateErr.message}`);
      }

      // 2. Prepare crate rows with appropriate timestamps
      const { start: shiftStart, end: shiftEnd } = computeShiftTimestamps(targetDate, selectedShift);
      const timeSpanMs = Math.max(1000, shiftEnd.getTime() - shiftStart.getTime());
      const stepMs = Math.floor(timeSpanMs / Math.max(1, binDrafts.length));

      // Batch ID should never contain machine ID. Crate Unit ID format: {batch_id}-{machine_id}-{bin_number}
      const cleanBatch = batchId.replace(new RegExp(`-${selectedMachineId}$`), '');
      const unitPrefix = `${cleanBatch}-${selectedMachineId}`;

      const cratesToInsert = binDrafts.map((draft, idx) => {
        const binStart = new Date(shiftStart.getTime() + idx * stepMs);
        const binEnd = new Date(shiftStart.getTime() + (idx + 1) * stepMs);
        const cid = formatUnitId(`${unitPrefix}-${draft.binNumber}`, selectedMachineId);

        return {
          id: cid,
          batch_id: cleanBatch,
          machine_id: selectedMachineId,
          bin_number: draft.binNumber,
          shift_id: selectedShift,
          start_time: binStart.toISOString(),
          end_time: binEnd.toISOString(),
          gross_qty: draft.grossQty,
          startup_scrap: draft.startupScrap,
          qc_sample: draft.qcSample,
          net_qty: draft.netQty,
          operator_id: selectedOperatorId || 'UNASSIGNED',
          supervisor_id: selectedSupervisor || 'Nidhin Chandran',
          mould_id: existingBatch?.mouldId || fallbackMouldId || mach?.currentMouldId || null,
          material_batch: existingBatch?.materialBatch || fallbackMaterialBatch || mach?.materialBatch || null,
          status: 'Pending Inspection',
          rejected_qty: 0,
          packed_qty: 0
        };
      });

      // 3. Upsert crates into Supabase
      const { error: cratesErr } = await supabase.from('crates').upsert(cratesToInsert);
      if (cratesErr) throw new Error(`Could not save bins: ${cratesErr.message}`);

      // 4. Update the batch record totals
      const { data: latestBatchStats } = await supabase
        .from('crates')
        .select('net_qty')
        .eq('batch_id', cleanBatch);

      const updatedCratesCount = latestBatchStats?.length || binDrafts.length;
      const updatedTotalOutput = (latestBatchStats || []).reduce((sum, c) => sum + (c.net_qty || 0), 0);

      await supabase.from('batch_records').update({
        crates: updatedCratesCount,
        total_output: updatedTotalOutput
      }).eq('id', cleanBatch);

      setSuccessInfo({
        count: binDrafts.length,
        batchId: cleanBatch,
        totalUnits: totalNetUnits
      });

      onSuccess();
    } catch (err: any) {
      console.error('Missed production commit failed:', err);
      setErrorMessage(err.message || 'An error occurred while logging missed production.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="ov animate-fade-in" style={{ zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div 
        className="modal animate-scale-in" 
        style={{ 
          width: '850px', 
          maxWidth: '96vw', 
          maxHeight: '92vh', 
          display: 'flex', 
          flexDirection: 'column', 
          background: 'var(--bg)', 
          border: '1px solid var(--border)', 
          borderRadius: '14px', 
          overflow: 'hidden',
          boxShadow: '0 20px 50px rgba(0,0,0,0.6)'
        }}
      >
        {/* Header */}
        <div className="mhd" style={{ padding: '16px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(59, 130, 246, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--blue)' }}>
              <Clock size={18} />
            </div>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text)' }}>
                Log Missed / Backdated Production
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text3)' }}>
                Record production runs that occurred during POS lockout, network downtime, or missed shift logging
              </div>
            </div>
          </div>
          <button 
            className="btn bsm bsec" 
            style={{ width: '30px', height: '30px', padding: 0, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={onClose}
          >
            <X size={15} />
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: '20px 22px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {successInfo ? (
            <div style={{ textAlign: 'center', padding: '30px 10px' }}>
              <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.15)', color: 'var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto' }}>
                <CheckCircle2 size={32} />
              </div>
              <h2 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '8px', color: 'var(--text)' }}>
                Production Successfully Logged!
              </h2>
              <p style={{ color: 'var(--text2)', fontSize: '13px', maxWidth: '480px', margin: '0 auto 24px auto', lineHeight: '1.6' }}>
                Recorded <strong style={{ color: 'var(--text)' }}>{successInfo.count} bins</strong> with a total of <strong style={{ color: 'var(--green)' }}>{successInfo.totalUnits.toLocaleString()} units</strong> for batch <span className="mono" style={{ color: 'var(--blue)', fontWeight: 700 }}>{successInfo.batchId}</span>. All crates are now pending QC visual inspection.
              </p>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                <button 
                  className="btn bsec" 
                  onClick={() => {
                    setSuccessInfo(null);
                    const nextStart = startBinNumber + successInfo.count;
                    handleRegenerateDrafts(nextStart, numBinsToLog, standardBinQty);
                  }}
                >
                  <Plus size={14} /> Log Another Machine / Shift
                </button>
                <button 
                  className="btn bpri" 
                  onClick={onClose}
                >
                  Done & View in Batch Log
                </button>
              </div>
            </div>
          ) : (
            <>
              {errorMessage && (
                <div style={{ padding: '10px 14px', background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', color: 'var(--red)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <AlertTriangle size={15} style={{ flexShrink: 0 }} />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* 1. Context Row: Date, Shift, Machine, Operator, Supervisor */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', background: 'rgba(255,255,255,0.02)', padding: '14px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text3)', marginBottom: '6px', fontWeight: 600 }}>
                    <Calendar size={12} /> Production Date
                  </label>
                  <input 
                    type="date" 
                    className="fi" 
                    style={{ width: '100%', height: '36px', fontSize: '12px' }}
                    value={productionDate} 
                    onChange={e => setProductionDate(e.target.value)} 
                  />
                </div>

                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text3)', marginBottom: '6px', fontWeight: 600 }}>
                    <Clock size={12} /> Shift
                  </label>
                  <select 
                    className="fi" 
                    style={{ width: '100%', height: '36px', fontSize: '12px' }}
                    value={selectedShift} 
                    onChange={e => setSelectedShift(e.target.value)}
                  >
                    <option value="A">Shift A (06:00 - 14:00)</option>
                    <option value="B">Shift B (14:00 - 22:00)</option>
                    <option value="C">Shift C (22:00 - 06:00 Night)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text3)', marginBottom: '6px', fontWeight: 600 }}>
                    <Factory size={12} /> Machine
                  </label>
                  <select 
                    className="fi" 
                    style={{ width: '100%', height: '36px', fontSize: '12px' }}
                    value={selectedMachineId} 
                    onChange={e => setSelectedMachineId(e.target.value)}
                  >
                    {(machines || []).map(m => (
                      <option key={m.id} value={m.id}>
                        {m.id} - {m.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text3)', marginBottom: '6px', fontWeight: 600 }}>
                    <User size={12} /> Operator
                  </label>
                  <select 
                    className="fi" 
                    style={{ width: '100%', height: '36px', fontSize: '12px' }}
                    value={selectedOperatorId} 
                    onChange={e => setSelectedOperatorId(e.target.value)}
                  >
                    <option value="">-- Select Operator --</option>
                    {(operators || []).map(op => (
                      <option key={op.id} value={op.id}>
                        {op.name} {op.employeeId ? `(${op.employeeId})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text3)', marginBottom: '6px', fontWeight: 600 }}>
                    <ShieldCheck size={12} /> Shift Supervisor
                  </label>
                  <select 
                    className="fi" 
                    style={{ width: '100%', height: '36px', fontSize: '12px' }}
                    value={selectedSupervisor} 
                    onChange={e => setSelectedSupervisor(e.target.value)}
                  >
                    {(supervisors || []).map((s, idx) => (
                      <option key={s.id || s.email || idx} value={s.fullName || s.full_name || s.email}>
                        {s.fullName || s.full_name} ({s.role || 'Supervisor'})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 2. Detected Batch Info Banner */}
              <div style={{ background: 'var(--bg2)', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Package size={16} style={{ color: 'var(--blue)' }} />
                  <div>
                    <span style={{ fontSize: '11px', color: 'var(--text3)', marginRight: '6px' }}>Target Batch:</span>
                    {isLoadingBatch ? (
                      <span style={{ fontSize: '12px', color: 'var(--text2)' }}>Detecting batch...</span>
                    ) : existingBatch ? (
                      <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>
                        <span className="mono" style={{ color: 'var(--blue)' }}>{existingBatch.id}</span> ({existingBatch.productName})
                      </span>
                    ) : (
                      <span style={{ fontSize: '12px', color: 'var(--amber)', fontWeight: 600 }}>
                        No existing batch found on {productionDate}. A new batch record will be initialized.
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '11px', color: 'var(--text2)' }}>
                  {existingMaxBin > 0 && (
                    <span>Last logged bin: <strong className="mono" style={{ color: 'var(--text)' }}>Bin #{existingMaxBin}</strong></span>
                  )}
                  <span>Next auto-suggested: <strong className="mono" style={{ color: 'var(--green)' }}>Bin #{startBinNumber}</strong></span>
                </div>
              </div>

              {/* If no batch exists, allow selecting product & mould */}
              {!existingBatch && !isLoadingBatch && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', padding: '12px', background: 'rgba(255, 170, 0, 0.05)', border: '1px solid rgba(255, 170, 0, 0.2)', borderRadius: '8px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--text3)', marginBottom: '4px' }}>Product</label>
                    <select 
                      className="fi" 
                      style={{ width: '100%', height: '34px', fontSize: '12px' }}
                      value={fallbackProductId}
                      onChange={e => {
                        setFallbackProductId(e.target.value);
                        const p = (products || []).find(prod => prod.id === e.target.value);
                        if (p?.binQty) setStandardBinQty(p.binQty);
                        if (p?.mouldId) setFallbackMouldId(p.mouldId);
                      }}
                    >
                      <option value="">-- Select Product --</option>
                      {(products || []).map(p => (
                        <option key={p.id} value={p.id}>{p.name} ({p.itemCode})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--text3)', marginBottom: '4px' }}>Raw Material Lot / Batch (Optional)</label>
                    <input 
                      type="text" 
                      className="fi" 
                      placeholder="e.g. SMM-21-Lot-04" 
                      style={{ width: '100%', height: '34px', fontSize: '12px' }}
                      value={fallbackMaterialBatch} 
                      onChange={e => setFallbackMaterialBatch(e.target.value)} 
                    />
                  </div>
                </div>
              )}

              {/* 3. Bin Entry Controls */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginTop: '6px' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)' }}>Entry Method:</span>
                  <div style={{ display: 'flex', background: 'var(--bg3)', borderRadius: '6px', padding: '2px', border: '1px solid var(--border)' }}>
                    <button 
                      className={`btn bsm ${entryMode === 'bulk' ? 'bpri' : ''}`} 
                      style={{ padding: '4px 12px', fontSize: '11px', border: 'none', background: entryMode === 'bulk' ? 'var(--blue)' : 'transparent', color: entryMode === 'bulk' ? '#fff' : 'var(--text3)' }}
                      onClick={() => {
                        setEntryMode('bulk');
                        handleRegenerateDrafts(startBinNumber, 3, standardBinQty);
                      }}
                    >
                      Multiple Bins (Shift Run)
                    </button>
                    <button 
                      className={`btn bsm ${entryMode === 'single' ? 'bpri' : ''}`} 
                      style={{ padding: '4px 12px', fontSize: '11px', border: 'none', background: entryMode === 'single' ? 'var(--blue)' : 'transparent', color: entryMode === 'single' ? '#fff' : 'var(--text3)' }}
                      onClick={() => {
                        setEntryMode('single');
                        handleRegenerateDrafts(startBinNumber, 1, standardBinQty);
                      }}
                    >
                      Single Bin
                    </button>
                  </div>
                </div>

                {/* Quick Generator controls */}
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text3)' }}>Start Bin #:</span>
                    <input 
                      type="number" 
                      className="fi mono" 
                      style={{ width: '60px', height: '28px', fontSize: '11px', textAlign: 'center' }} 
                      value={startBinNumber} 
                      onChange={e => handleRegenerateDrafts(Math.max(1, parseInt(e.target.value) || 1), numBinsToLog, standardBinQty)} 
                    />
                  </div>

                  {entryMode === 'bulk' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text3)' }}>Total Bins:</span>
                      <input 
                        type="number" 
                        className="fi mono" 
                        style={{ width: '50px', height: '28px', fontSize: '11px', textAlign: 'center' }} 
                        value={numBinsToLog} 
                        onChange={e => handleRegenerateDrafts(startBinNumber, Math.max(1, parseInt(e.target.value) || 1), standardBinQty)} 
                      />
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text3)' }}>Std Qty:</span>
                    <input 
                      type="number" 
                      className="fi mono" 
                      style={{ width: '70px', height: '28px', fontSize: '11px', textAlign: 'center' }} 
                      value={standardBinQty} 
                      onChange={e => handleRegenerateDrafts(startBinNumber, numBinsToLog, Math.max(1, parseInt(e.target.value) || 1))} 
                    />
                  </div>
                </div>
              </div>

              {/* 4. Editable Bins Table */}
              <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
                <table className="dt" style={{ margin: 0 }}>
                  <thead>
                    <tr>
                      <th style={{ width: '80px', textAlign: 'center' }}>Bin #</th>
                      <th>Gross Qty</th>
                      <th>Startup Scrap</th>
                      <th>QC Sample</th>
                      <th>Net Output Qty</th>
                      <th style={{ width: '50px', textAlign: 'center' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {binDrafts.map((draft, idx) => (
                      <tr key={idx}>
                        <td style={{ textAlign: 'center' }}>
                          <span className="pill pg mono" style={{ fontSize: '11px', fontWeight: 800 }}>
                            #{draft.binNumber}
                          </span>
                        </td>
                        <td>
                          <input 
                            type="number" 
                            className="fi mono" 
                            style={{ width: '100px', height: '28px', fontSize: '12px' }}
                            value={draft.grossQty}
                            onChange={e => updateDraftRow(idx, 'grossQty', parseInt(e.target.value) || 0)}
                          />
                        </td>
                        <td>
                          <input 
                            type="number" 
                            className="fi mono" 
                            style={{ width: '80px', height: '28px', fontSize: '12px' }}
                            value={draft.startupScrap}
                            onChange={e => updateDraftRow(idx, 'startupScrap', parseInt(e.target.value) || 0)}
                          />
                        </td>
                        <td>
                          <input 
                            type="number" 
                            className="fi mono" 
                            style={{ width: '80px', height: '28px', fontSize: '12px' }}
                            value={draft.qcSample}
                            onChange={e => updateDraftRow(idx, 'qcSample', parseInt(e.target.value) || 0)}
                          />
                        </td>
                        <td>
                          <span className="mono" style={{ fontWeight: 800, fontSize: '13px', color: 'var(--green)' }}>
                            {draft.netQty.toLocaleString()} pcs
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button 
                            className="btn bdan bsm" 
                            style={{ width: '26px', height: '26px', padding: 0, borderRadius: '4px' }}
                            title="Remove bin"
                            disabled={binDrafts.length <= 1}
                            onClick={() => removeDraftRow(idx)}
                          >
                            <Trash2 size={12} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Add Row Button */}
              <div>
                <button 
                  className="btn bsec bsm" 
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px' }}
                  onClick={addExtraDraftRow}
                >
                  <Plus size={13} /> Add Another Bin to this Run
                </button>
              </div>

              {/* Total Output Summary Footer */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(16, 185, 129, 0.08)', padding: '12px 18px', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.25)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Layers size={18} style={{ color: 'var(--green)' }} />
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--text2)', fontWeight: 600 }}>Total Bins to be Created:</div>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text)' }}>{binDrafts.length} Bins</div>
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text2)', fontWeight: 600 }}>Total Net Output to Log:</div>
                  <div className="mono" style={{ fontSize: '18px', fontWeight: 800, color: 'var(--green)' }}>
                    {totalNetUnits.toLocaleString()} units
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Modal Actions Footer */}
        {!successInfo && (
          <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border)', background: 'var(--bg2)', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button className="btn bsec" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </button>
            <button 
              className="btn bpri" 
              style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '160px', justifyContent: 'center' }}
              onClick={handleSubmit} 
              disabled={isSubmitting || binDrafts.length === 0}
            >
              {isSubmitting ? 'Logging Production...' : `Log ${binDrafts.length} Missed Bins`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
