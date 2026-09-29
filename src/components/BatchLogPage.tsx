import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Search, Filter, Factory, AlertCircle, CheckCircle2, 
  ChevronDown, ChevronRight, UserCheck, Package, Trash2,
  ShieldCheck, ShieldAlert, AlertOctagon, RefreshCw, QrCode
} from 'lucide-react';
import type { BatchRecord, Product, Crate, Operator } from '../types';
import { supabase } from '../lib/supabase';
import { 
  FinalInspectionService, 
  type BatchFinalInspectionSummary, 
  type FinalInspectionRecord 
} from '../services/finalInspectionService';

interface BatchLogPageProps {
  batchRecords: BatchRecord[];
  products: Product[];
  pendingCrates: Crate[];
  operators: Operator[];
  currentUser?: {
    id: string;
    name: string;
    role: string;
  };
  onNavigateToFinalInspection?: () => void;
}

const BatchLogPage: React.FC<BatchLogPageProps> = ({ 
  batchRecords, 
  pendingCrates, 
  operators, 
  currentUser,
  onNavigateToFinalInspection 
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selProduct, setSelProduct] = useState('All');
  const [filterStatus, setFilterStatus] = useState<'All' | 'Active' | 'Closed'>('All');
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);
  const [expandedTab, setExpandedTab] = useState<Record<string, 'visual' | 'final'>>({});
  const [batchCrates, setBatchCrates] = useState<Record<string, Crate[]>>({});
  const [loadingBatch, setLoadingBatch] = useState<string | null>(null);
  const [finalInspectionSummaries, setFinalInspectionSummaries] = useState<Record<string, BatchFinalInspectionSummary>>({});
  const [loadingFinalInspections, setLoadingFinalInspections] = useState<boolean>(true);
  const [updatingPacketId, setUpdatingPacketId] = useState<string | null>(null);

  // Status transition handler enforcing rules:
  // - Hold items can be passed
  // - Passed items can be hold or rejected
  // - Rejected items cannot be passed or hold by anyone other than admin
  const handleStatusChange = async (
    packetId: string,
    currentStatus: 'PASSED' | 'REJECTED' | 'HELD',
    newStatus: 'PASSED' | 'REJECTED' | 'HELD'
  ) => {
    const userRole = currentUser?.role || 'QC';
    const check = FinalInspectionService.canChangeStatus(currentStatus, newStatus, userRole);
    if (!check.allowed) {
      alert(check.reason || 'Status transition not permitted.');
      return;
    }

    const confirmMsg = currentStatus === 'REJECTED'
      ? `ADMIN OVERRIDE: Are you sure you want to change REJECTED packet ${packetId} to ${newStatus}?`
      : `Change status of packet ${packetId} from ${currentStatus} to ${newStatus}?`;

    if (!window.confirm(confirmMsg)) {
      return;
    }

    try {
      setUpdatingPacketId(packetId);
      const res = await FinalInspectionService.updatePacketStatus(
        packetId,
        newStatus,
        {
          name: currentUser?.name || 'QC Inspector',
          role: userRole
        }
      );

      if (!res.success) {
        alert(res.error || 'Failed to update status.');
      } else {
        await loadFinalInspections();
      }
    } catch (err: any) {
      alert(err?.message || 'Error updating packet status');
    } finally {
      setUpdatingPacketId(null);
    }
  };

  // Load and refresh Batch Final Inspection Summaries
  const loadFinalInspections = useCallback(async () => {
    try {
      setLoadingFinalInspections(true);
      const summaries = await FinalInspectionService.getAllBatchInspectionSummaries(
        batchRecords.map(b => ({ id: b.id, productName: b.productName }))
      );
      setFinalInspectionSummaries(summaries);
    } catch (err) {
      console.warn('Failed loading final inspection summaries:', err);
    } finally {
      setLoadingFinalInspections(false);
    }
  }, [batchRecords]);

  useEffect(() => {
    loadFinalInspections();

    // Cross-tab / cross-device real-time sync
    const channel = supabase.channel('batch-log-final-inspections')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'system_changes' }, () => {
        loadFinalInspections();
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [loadFinalInspections]);

  // Aggregate metrics
  const totalFinalInspectedPackets = useMemo(() => {
    return Object.values(finalInspectionSummaries).reduce((sum, s) => sum + s.totalPackets, 0);
  }, [finalInspectionSummaries]);

  const totalPassedPackets = useMemo(() => {
    return Object.values(finalInspectionSummaries).reduce((sum, s) => sum + s.passedCount, 0);
  }, [finalInspectionSummaries]);

  const totalRejectedPackets = useMemo(() => {
    return Object.values(finalInspectionSummaries).reduce((sum, s) => sum + s.rejectedCount, 0);
  }, [finalInspectionSummaries]);

  const totalHeldPackets = useMemo(() => {
    return Object.values(finalInspectionSummaries).reduce((sum, s) => sum + s.heldCount, 0);
  }, [finalInspectionSummaries]);

  const filtered = batchRecords.filter(b => {
    const matchesStatus = filterStatus === 'All' || b.status === filterStatus;
    const matchesProduct = selProduct === 'All' || b.productName === selProduct;
    const matchesSearch = (b.id?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      (b.productCode?.toLowerCase() || '').includes(searchTerm.toLowerCase());
    return matchesStatus && matchesProduct && matchesSearch;
  });

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const toggleBatch = async (batchId: string) => {
    if (expandedBatchId === batchId) {
      setExpandedBatchId(null);
      return;
    }

    setExpandedBatchId(batchId);
    if (!batchCrates[batchId]) {
      setLoadingBatch(batchId);
      const { data, error } = await supabase
        .from('crates')
        .select('*')
        .eq('batch_id', batchId)
        .order('bin_number', { ascending: true });

      if (!error && data) {
        // Map DB fields to Crate type
        const mapped: Crate[] = data.map(c => ({
          id: c.id,
          batchId: c.batch_id,
          machineId: c.machine_id,
          binNumber: c.bin_number,
          startTime: c.start_time,
          endTime: c.end_time,
          grossQty: c.gross_qty,
          netQty: c.net_qty,
          rejectedCount: c.rejected_qty || 0,
          rejectionDetails: c.rejection_details || {},
          operatorId: c.operator_id,
          supervisorId: c.supervisor_id,
          inspectedBy: c.inspected_by,
          inspectedAt: c.inspected_at,
          status: c.status
        } as any));
        setBatchCrates(prev => ({ ...prev, [batchId]: mapped }));
      }
      setLoadingBatch(null);
    }
  };

  const getBatchInspectionStatus = (batchId: string) => {
    const pendingForBatch = pendingCrates.filter(c => c.batchId === batchId);
    return {
      hasPending: pendingForBatch.length > 0,
      count: pendingForBatch.length
    };
  };

  return (
    <div className="animate-fade-in" style={{ padding: '0 4px' }}>
      <div className="mg" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '20px' }}>
        <div className="mc2"><div className="ml">Active Batches</div><div className="mv green">{batchRecords.filter(b => b.status === 'Active').length} <span className="ms">RUNNING</span></div></div>
        <div className="mc2"><div className="ml">Pending WIP</div><div className="mv amber">{pendingCrates.length} <span className="ms">BINS</span></div></div>
        <div 
          className="mc2" 
          onClick={onNavigateToFinalInspection}
          style={{ cursor: onNavigateToFinalInspection ? 'pointer' : 'default', transition: 'border-color 0.2s' }}
          title={onNavigateToFinalInspection ? 'Click to open Final Inspection Audit Page' : undefined}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="ml">Final Inspected</div>
            {onNavigateToFinalInspection && (
              <span style={{ fontSize: '10px', color: 'var(--blue)', fontWeight: 700 }}>
                Audit Log &rarr;
              </span>
            )}
          </div>
          <div className="mv blue" style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
            {totalFinalInspectedPackets} <span className="ms">PACKETS</span>
          </div>
          <div style={{ fontSize: '10px', marginTop: '3px', display: 'flex', gap: '8px', fontWeight: 600 }}>
            <span style={{ color: '#10b981' }}>{totalPassedPackets} Passed</span>
            {totalRejectedPackets > 0 && <span style={{ color: '#ef4444' }}>• {totalRejectedPackets} Rej</span>}
            {totalHeldPackets > 0 && <span style={{ color: '#f59e0b' }}>• {totalHeldPackets} Hold</span>}
          </div>
        </div>
        <div className="mc2"><div className="ml">Historical Audit</div><div className="mv">{batchRecords.length} <span className="ms">RECORDS</span></div></div>
      </div>

      <div className="card">
        <div className="ch" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span className="ct2">Production Traceability Log</span>
            <div style={{ display: 'flex', background: 'var(--bg4)', borderRadius: 'var(--r)', padding: '2px' }}>
              {(['All', 'Active', 'Closed'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setFilterStatus(s)}
                  style={{
                    padding: '4px 12px', border: 'none', background: filterStatus === s ? 'var(--bg)' : 'transparent',
                    color: filterStatus === s ? 'var(--text)' : 'var(--text3)', fontSize: '11px', fontWeight: 600,
                    borderRadius: '4px', cursor: 'pointer'
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '0 10px' }}>
              <Filter size={12} style={{ color: 'var(--text3)', marginRight: '8px' }} />
              <select
                className="fi"
                value={selProduct}
                onChange={e => setSelProduct(e.target.value)}
                style={{ border: 'none', background: 'transparent', width: '160px', height: '30px', padding: 0, fontSize: '11px', fontWeight: 600 }}
              >
                <option value="All">All Products</option>
                {Array.from(new Set(batchRecords.map((b: any) => b.productName || 'Unknown'))).sort().map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
              <input
                type="text"
                placeholder="Search Batch ID..."
                className="fi"
                style={{ width: '200px', paddingLeft: '32px', height: '32px', fontSize: '12px' }}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="cb" style={{ padding: 0 }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text3)' }}>No batch records match your filters.</div>
          ) : (
            <div className="dt-wrap">
              <table className="dt">

              <thead>
                <tr>
                  <th style={{ paddingLeft: '20px' }}>Batch Identity</th>
                  <th>Machine</th>
                  <th>Product Details</th>
                  <th>Visual Bins</th>
                  <th>Final Inspection</th>
                  <th>Total Output</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(b => {
                  const inspection = getBatchInspectionStatus(b.id);
                  const pendingCount = inspection.count;
                  // Handle legacy data where b.crates might be 0 but bins actually exist
                  const totalCrates = Math.max(b.crates || 0, pendingCount);
                  const completedCount = Math.max(0, totalCrates - pendingCount);

                  // Retrieve matching final inspection summary for this batch
                  const finalSummary = finalInspectionSummaries[b.id] || 
                    finalInspectionSummaries[b.id.split('-')[0]] || 
                    Object.values(finalInspectionSummaries).find(s => 
                      s.batchId.toUpperCase() === b.id.toUpperCase() ||
                      b.id.toUpperCase().startsWith(s.batchId.toUpperCase()) ||
                      s.batchId.toUpperCase().startsWith(b.id.toUpperCase())
                    );

                  const activeBatchTab = expandedTab[b.id] || (finalSummary && finalSummary.totalPackets > 0 ? 'final' : 'visual');

                  return (
                    <React.Fragment key={b.id}>
                      <tr
                        onClick={() => toggleBatch(b.id)}
                        style={{ cursor: 'pointer', transition: 'background 0.2s' }}
                        className={expandedBatchId === b.id ? 'active-row' : ''}
                      >
                        <td style={{ paddingLeft: '20px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {expandedBatchId === b.id ? <ChevronDown size={14} color="var(--purple)" /> : <ChevronRight size={14} color="var(--text3)" />}
                            <div>
                              <span className="mono" style={{ fontWeight: 600, color: 'var(--purple)', fontSize: '13px' }}>{b.id}</span>
                              <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '2px' }}>{formatDate(b.startTime)}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Factory size={12} style={{ color: 'var(--text3)' }} />
                            <span style={{ fontWeight: 500, fontSize: '13px' }}>{b.machineId}</span>
                          </div>
                        </td>
                        <td>
                          <div>
                            <div style={{ fontSize: '12px', fontWeight: 600 }}>{b.productName}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text3)' }} className="mono">{b.productCode}</div>
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span className="mono" style={{ fontSize: '12px', fontWeight: 600 }}>
                                {completedCount} / {totalCrates}
                              </span>
                              <span style={{ fontSize: '10px', color: 'var(--text3)' }}>Bins Ready</span>
                            </div>
                            {inspection.hasPending && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--amber)', fontSize: '10px', fontWeight: 600 }}>
                                <AlertCircle size={10} /> {inspection.count} Pending Inspection
                              </div>
                            )}
                            {!inspection.hasPending && totalCrates > 0 && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--green)', fontSize: '10px' }}>
                                <CheckCircle2 size={10} /> All Cleared
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Final Inspection Column (No. of packets & status) */}
                        <td>
                          {(() => {
                            if (!finalSummary || finalSummary.totalPackets === 0) {
                              return (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', opacity: 0.7 }}>
                                  <span className="pill pd" style={{ fontSize: '9.5px', padding: '2px 6px' }}>0 pkts</span>
                                  <span style={{ fontSize: '10px', color: 'var(--text3)' }}>Pending</span>
                                </div>
                              );
                            }

                            const statusColor = 
                              finalSummary.status === 'PASSED' ? '#10b981' :
                              finalSummary.status === 'REJECTED' ? '#ef4444' :
                              finalSummary.status === 'HELD' ? '#f59e0b' : 'var(--text3)';

                            const statusBg = 
                              finalSummary.status === 'PASSED' ? 'rgba(16, 185, 129, 0.15)' :
                              finalSummary.status === 'REJECTED' ? 'rgba(239, 68, 68, 0.18)' :
                              finalSummary.status === 'HELD' ? 'rgba(245, 158, 11, 0.18)' : 'var(--bg3)';

                            return (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span className="mono" style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)' }}>
                                    {finalSummary.totalPackets} {finalSummary.totalPackets === 1 ? 'pkt' : 'pkts'}
                                  </span>
                                  <span
                                    className="pill"
                                    style={{
                                      fontSize: '9px',
                                      padding: '1px 6px',
                                      fontWeight: 800,
                                      background: statusBg,
                                      color: statusColor,
                                      border: `1px solid ${statusColor}44`,
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '3px'
                                    }}
                                  >
                                    {finalSummary.status === 'PASSED' && <CheckCircle2 size={10} />}
                                    {finalSummary.status === 'REJECTED' && <AlertOctagon size={10} />}
                                    {finalSummary.status === 'HELD' && <ShieldAlert size={10} />}
                                    {finalSummary.status}
                                  </span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px' }}>
                                  <span style={{ color: '#10b981', fontWeight: 600 }}>{finalSummary.passedCount} Passed</span>
                                  {finalSummary.rejectedCount > 0 && (
                                    <span style={{ color: '#ef4444', fontWeight: 700 }}>• {finalSummary.rejectedCount} Rej</span>
                                  )}
                                  {finalSummary.heldCount > 0 && (
                                    <span style={{ color: '#f59e0b', fontWeight: 700 }}>• {finalSummary.heldCount} Hold</span>
                                  )}
                                </div>
                              </div>
                            );
                          })()}
                        </td>

                        <td className="mono" style={{ fontWeight: 700 }}>
                          {(b.totalOutput || 0).toLocaleString()} <span style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: 400 }}>pcs</span>
                        </td>
                        <td>
                          <span className={`pill ${b.status === 'Active' ? 'pg' : 'pd'}`}>
                            {b.status || 'Unknown'}
                          </span>
                        </td>
                      </tr>

                      {/* Expanded Batch Section */}
                      {expandedBatchId === b.id && (
                        <tr>
                          <td colSpan={7} style={{ padding: '0', background: 'var(--bg2)' }}>
                            <div className="animate-fade-in" style={{ padding: '16px 20px 24px 32px' }}>
                              
                              {/* Sub-Navigation Tabs inside expanded batch */}
                              <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setExpandedTab(prev => ({ ...prev, [b.id]: 'visual' })); }}
                                  style={{
                                    padding: '5px 14px',
                                    borderRadius: '6px',
                                    fontSize: '11.5px',
                                    fontWeight: 700,
                                    border: 'none',
                                    cursor: 'pointer',
                                    background: activeBatchTab === 'visual' ? 'var(--blue)' : 'var(--bg3)',
                                    color: activeBatchTab === 'visual' ? '#fff' : 'var(--text2)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                  }}
                                >
                                  <Package size={13} />
                                  Visual Inspection Bins ({(batchCrates[b.id] || []).length})
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setExpandedTab(prev => ({ ...prev, [b.id]: 'final' })); }}
                                  style={{
                                    padding: '5px 14px',
                                    borderRadius: '6px',
                                    fontSize: '11.5px',
                                    fontWeight: 700,
                                    border: 'none',
                                    cursor: 'pointer',
                                    background: activeBatchTab === 'final' ? '#10b981' : 'var(--bg3)',
                                    color: activeBatchTab === 'final' ? '#022c22' : 'var(--text2)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                  }}
                                >
                                  <ShieldCheck size={13} />
                                  Final Inspected Packets ({finalSummary?.totalPackets || 0})
                                </button>
                              </div>

                              {/* TAB 1: Visual Inspection Bins */}
                              {activeBatchTab === 'visual' && (
                                loadingBatch === b.id ? (
                                  <div style={{ padding: '20px', textAlign: 'center', fontSize: '12px', color: 'var(--text3)' }}>Loading bins...</div>
                                ) : (
                                  <div className="bin-tree">
                                    {(() => {
                                      const crates = batchCrates[b.id] || [];
                                      const totalRej = crates.reduce((sum, c) => sum + (c.rejectedCount || 0), 0);
                                      const totalNet = crates.reduce((sum, c) => sum + (c.netQty || 0), 0);
                                      const totalGross = totalNet + totalRej;
                                      const avgReject = totalGross > 0 ? (totalRej / totalGross) * 100 : 0;
                                      const successRate = 100 - avgReject;

                                      return (
                                        <>
                                          <div className="mg" style={{ gap: '10px', marginBottom: '16px' }}>
                                            <div className="stat-sm">
                                              <span className="l">Total Bins</span>
                                              <span className="v">{crates.length}</span>
                                            </div>
                                            <div className="stat-sm">
                                              <span className="l">Total Rejections</span>
                                              <span className="v red">{totalRej.toLocaleString()}</span>
                                            </div>
                                            <div className="stat-sm">
                                              <span className="l">Avg Reject %</span>
                                              <span className="v amber">{avgReject.toFixed(2)}%</span>
                                            </div>
                                            <div className="stat-sm">
                                              <span className="l">Success Rate</span>
                                              <span className="v green">{successRate.toFixed(1)}%</span>
                                            </div>
                                          </div>

                                          <div className="dt-wrap">
                                            <table className="dt sub-table" style={{ width: '100%', background: 'transparent' }}>
                                              <thead>
                                                <tr>
                                                  <th>Bin #</th>
                                                  <th>Net Qty</th>
                                                  <th>Rejections</th>
                                                  <th>Reject %</th>
                                                  <th>Inspector</th>
                                                  <th>Status</th>
                                                </tr>
                                              </thead>
                                              <tbody>
                                                {crates.map(crate => {
                                                  const rTotal = (crate.netQty || 0) + (crate.rejectedCount || 0);
                                                  const rRate = rTotal > 0 ? ((crate.rejectedCount || 0) / rTotal) * 100 : 0;
                                                  return (
                                                    <tr key={crate.id}>
                                                      <td className="mono" style={{ fontWeight: 600 }}>Bin #{crate.binNumber}</td>
                                                      <td className="mono">{crate.netQty?.toLocaleString()} <span style={{ fontSize: '12px', color: 'var(--text3)' }}>pcs</span></td>
                                                      <td className="mono" style={{ color: crate.rejectedCount ? 'var(--red)' : 'inherit' }}>
                                                        {crate.rejectedCount || 0}
                                                      </td>
                                                      <td>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                          <div className="pbg" style={{ width: '60px', height: '4px', margin: 0 }}>
                                                            <div className="pf r" style={{ width: `${Math.min(100, rRate * 5)}%`, background: rRate > 5 ? 'var(--red)' : (rRate > 2 ? 'var(--amber)' : 'var(--green)') }} />
                                                          </div>
                                                          <span className="mono" style={{ fontSize: '11px', fontWeight: 600, color: rRate > 5 ? 'var(--red)' : (rRate > 2 ? 'var(--amber)' : 'var(--text3)') }}>
                                                            {rRate.toFixed(1)}%
                                                          </span>
                                                        </div>
                                                      </td>
                                                      <td>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                          <UserCheck size={12} style={{ color: 'var(--blue)' }} />
                                                          <span style={{ fontSize: '11px' }}>
                                                            {crate.inspectedBy ? (
                                                              operators.find(o => o.id === crate.inspectedBy)?.name || crate.inspectedBy
                                                            ) : '---'}
                                                          </span>
                                                        </div>
                                                      </td>
                                                      <td>
                                                        <span className={`pill ${crate.status === 'Completed' ? 'pg' : 'pa'}`} style={{ fontSize: '9px' }}>
                                                          {crate.status}
                                                        </span>
                                                      </td>
                                                    </tr>
                                                  );
                                                })}
                                              </tbody>
                                            </table>
                                          </div>
                                        </>
                                      );
                                    })()}
                                  </div>
                                )
                              )}

                              {/* TAB 2: Final Inspected Packets */}
                              {activeBatchTab === 'final' && (
                                <div>
                                  {(!finalSummary || finalSummary.totalPackets === 0) ? (
                                    <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text3)', background: 'var(--bg3)', borderRadius: '8px' }}>
                                      <ShieldCheck size={28} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
                                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text2)' }}>
                                        No Final Inspected Packets Yet
                                      </div>
                                      <div style={{ fontSize: '11px', marginTop: '4px' }}>
                                        Scan pre-printed packet labels for Batch <span className="mono" style={{ color: 'var(--purple)' }}>{b.id}</span> in the Final Inspection module.
                                      </div>
                                    </div>
                                  ) : (
                                    <>
                                      {/* Batch Final Inspection Metrics */}
                                      <div className="mg" style={{ gap: '10px', marginBottom: '16px' }}>
                                        <div className="stat-sm">
                                          <span className="l">Inspected Packets</span>
                                          <span className="v">{finalSummary.totalPackets}</span>
                                        </div>
                                        <div className="stat-sm">
                                          <span className="l">Total Quantity</span>
                                          <span className="v blue">{finalSummary.totalQuantity.toLocaleString()} <span style={{ fontSize: '10px', fontWeight: 400 }}>pcs</span></span>
                                        </div>
                                        <div className="stat-sm">
                                          <span className="l">Passed Packets</span>
                                          <span className="v green">{finalSummary.passedCount}</span>
                                        </div>
                                        <div className="stat-sm">
                                          <span className="l">Rejected / Held</span>
                                          <span className="v" style={{ color: finalSummary.rejectedCount > 0 ? '#ef4444' : (finalSummary.heldCount > 0 ? '#f59e0b' : 'var(--text3)') }}>
                                            {finalSummary.rejectedCount + finalSummary.heldCount}
                                          </span>
                                        </div>
                                      </div>

                                      {/* Packets Detail Table */}
                                      <div className="dt-wrap">
                                        <table className="dt sub-table" style={{ width: '100%', background: 'transparent' }}>
                                          <thead>
                                            <tr>
                                              <th>Packet QR / ID</th>
                                              <th>Quantity</th>
                                              <th>Status</th>
                                              <th>Inspector</th>
                                              <th>Inspected At</th>
                                              <th>Defect / Remarks</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {finalSummary.packets.map((pkt) => (
                                              <tr key={pkt.id || pkt.packet_id}>
                                                <td className="mono" style={{ fontWeight: 700, color: 'var(--purple)' }}>
                                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <QrCode size={13} style={{ opacity: 0.6 }} />
                                                    {pkt.packet_id}
                                                  </div>
                                                </td>
                                                <td className="mono">
                                                  {pkt.quantity?.toLocaleString()} <span style={{ fontSize: '11px', color: 'var(--text3)' }}>pcs</span>
                                                </td>
                                                <td>
                                                  <span
                                                    className="pill"
                                                    style={{
                                                      fontSize: '9.5px',
                                                      padding: '2px 7px',
                                                      fontWeight: 800,
                                                      background: pkt.status === 'PASSED' ? 'rgba(16, 185, 129, 0.15)' :
                                                                  pkt.status === 'REJECTED' ? 'rgba(239, 68, 68, 0.18)' : 'rgba(245, 158, 11, 0.18)',
                                                      color: pkt.status === 'PASSED' ? '#10b981' :
                                                             pkt.status === 'REJECTED' ? '#ef4444' : '#f59e0b',
                                                      border: `1px solid ${pkt.status === 'PASSED' ? 'rgba(16, 185, 129, 0.3)' :
                                                                           pkt.status === 'REJECTED' ? 'rgba(239, 68, 68, 0.35)' : 'rgba(245, 158, 11, 0.35)'}`
                                                    }}
                                                  >
                                                    {pkt.status}
                                                  </span>
                                                </td>
                                                <td>
                                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <UserCheck size={12} style={{ color: 'var(--blue)' }} />
                                                    <span style={{ fontSize: '11px', fontWeight: 500 }}>
                                                      {pkt.inspector_name}
                                                    </span>
                                                    <span style={{ fontSize: '9.5px', color: 'var(--text3)' }}>({pkt.inspector_role})</span>
                                                  </div>
                                                </td>
                                                <td style={{ fontSize: '11px', color: 'var(--text2)' }}>
                                                  {formatDate(pkt.inspected_at)}
                                                </td>
                                                <td style={{ fontSize: '11px', color: pkt.defect_notes ? 'var(--amber)' : 'var(--text3)' }}>
                                                  {pkt.defect_notes || '—'}
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </>
                                  )}
                                </div>
                              )}

                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          )}
        </div>
      </div>
      <style>{`
        .stat-sm {
          background: var(--bg3);
          border: 1px solid var(--border);
          border-radius: var(--r);
          padding: 8px 12px;
          display: flex;
          flex-direction: column;
        }
        .stat-sm .l {
          font-size: 9px;
          color: var(--text3);
          text-transform: uppercase;
          font-weight: 600;
        }
        .stat-sm .v {
          font-size: 16px;
          font-weight: 700;
          font-family: var(--mono);
        }
        .stat-sm .v.red { color: var(--red); }
        .stat-sm .v.amber { color: var(--amber); }
        .stat-sm .v.green { color: var(--green); }
        
        .sub-table th {
          background: transparent !important;
          border-bottom: 1px solid var(--border) !important;
          padding: 8px 12px !important;
          font-size: 10px !important;
        }
        .sub-table td {
          padding: 10px 12px !important;
          font-size: 11px !important;
          border-bottom: 1px solid rgba(255,255,255,0.02) !important;
        }
        .active-row {
          background: rgba(167, 139, 250, 0.05) !important;
        }
      `}</style>
    </div>
  );
};

export default BatchLogPage;
