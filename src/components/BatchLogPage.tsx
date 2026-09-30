import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Search, Filter, Factory, AlertCircle, CheckCircle2,
  ChevronDown, ChevronRight, UserCheck, Package, Layers,
  ShieldCheck, ShieldAlert, AlertOctagon, QrCode, ChevronLeft,
  Calendar, FlaskConical, Database, RefreshCw
} from 'lucide-react';
import type { BatchRecord, Product, Crate, Operator } from '../types';
import { supabase } from '../lib/supabase';
import {
  FinalInspectionService,
  type BatchFinalInspectionSummary,
} from '../services/finalInspectionService';

interface BatchLogPageProps {
  batchRecords: BatchRecord[];
  products: Product[];
  pendingCrates: Crate[];
  operators: Operator[];
  currentUser?: { id: string; name: string; role: string; };
  onNavigateToFinalInspection?: () => void;
}

const PAGE_SIZE = 15;

const BatchLogPage: React.FC<BatchLogPageProps> = ({
  batchRecords, pendingCrates, operators, currentUser, onNavigateToFinalInspection
}) => {
  const [allBatches, setAllBatches] = useState<BatchRecord[]>(batchRecords);
  const [totalDbBatches, setTotalDbBatches] = useState<number | null>(null);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);
  const [historyLoaded, setHistoryLoaded] = useState<boolean>(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [selProduct, setSelProduct] = useState('All');
  const [filterStatus, setFilterStatus] = useState<'All' | 'Active' | 'Closed'>('All');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterRM, setFilterRM] = useState('All');
  const [filterRMBatch, setFilterRMBatch] = useState('All');
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);
  const [expandedTab, setExpandedTab] = useState<Record<string, 'visual' | 'final'>>({});
  const [batchCrates, setBatchCrates] = useState<Record<string, Crate[]>>({});
  const [crateStats, setCrateStats] = useState<Record<string, { total: number; completed: number; pending: number }>>({});
  const [loadingBatch, setLoadingBatch] = useState<string | null>(null);
  const [finalInspectionSummaries, setFinalInspectionSummaries] = useState<Record<string, BatchFinalInspectionSummary>>({});
  const [loadingFinalInspections, setLoadingFinalInspections] = useState<boolean>(true);
  const [updatingPacketId, setUpdatingPacketId] = useState<string | null>(null);

  // Sync with prop when not loaded full history yet
  useEffect(() => {
    if (!historyLoaded) {
      setAllBatches(batchRecords);
    }
  }, [batchRecords, historyLoaded]);

  // Fetch total batches count in database
  useEffect(() => {
    const fetchTotalCount = async () => {
      try {
        const { count, error } = await supabase.from('batch_records').select('*', { count: 'exact', head: true });
        if (!error && typeof count === 'number') {
          setTotalDbBatches(count);
        }
      } catch (e) {
        console.warn('Could not fetch total batch count', e);
      }
    };
    fetchTotalCount();
  }, []);

  const loadFullHistory = async () => {
    setLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from('batch_records')
        .select('*')
        .order('start_time', { ascending: false });
      if (!error && data) {
        const mapped: BatchRecord[] = data.map((b: any) => ({
          id: b.id,
          machineId: b.machine_id,
          productId: b.product_id,
          productName: b.product_name,
          productCode: b.product_code,
          mouldId: b.mould_id,
          materialId: b.material_id,
          materialGrade: b.material_grade,
          materialBatch: b.material_batch,
          operatorId: b.operator_id,
          startTime: b.start_time,
          endTime: b.end_time,
          crates: b.crates,
          totalOutput: b.total_output || 0,
          status: b.status,
          batchDate: b.batch_date,
        }));
        setAllBatches(mapped);
        setHistoryLoaded(true);
      } else if (error) {
        alert('Failed to load history: ' + error.message);
      }
    } catch (err: any) {
      alert('Error loading batch history: ' + err?.message);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleStatusChange = async (
    packetId: string,
    currentStatus: 'PASSED' | 'REJECTED' | 'HELD',
    newStatus: 'PASSED' | 'REJECTED' | 'HELD'
  ) => {
    const userRole = currentUser?.role || 'QC';
    const check = FinalInspectionService.canChangeStatus(currentStatus, newStatus, userRole);
    if (!check.allowed) { alert(check.reason || 'Status transition not permitted.'); return; }
    const msg = currentStatus === 'REJECTED'
      ? `ADMIN OVERRIDE: Change REJECTED packet ${packetId} to ${newStatus}?`
      : `Change status of packet ${packetId} from ${currentStatus} to ${newStatus}?`;
    if (!window.confirm(msg)) return;
    try {
      setUpdatingPacketId(packetId);
      const res = await FinalInspectionService.updatePacketStatus(packetId, newStatus, {
        name: currentUser?.name || 'QC Inspector', role: userRole
      });
      if (!res.success) alert(res.error || 'Failed to update status.');
      else await loadFinalInspections();
    } catch (err: any) {
      alert(err?.message || 'Error updating packet status');
    } finally { setUpdatingPacketId(null); }
  };

  const loadFinalInspections = useCallback(async () => {
    try {
      setLoadingFinalInspections(true);
      const summaries = await FinalInspectionService.getAllBatchInspectionSummaries(
        allBatches.map(b => ({ id: b.id, productName: b.productName }))
      );
      setFinalInspectionSummaries(summaries);
    } catch (err) {
      console.warn('Failed loading final inspection summaries:', err);
    } finally { setLoadingFinalInspections(false); }
  }, [allBatches]);

  useEffect(() => {
    loadFinalInspections();
    const fiChannel = supabase.channel('batch-log-final-inspections')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'system_changes' }, () => { loadFinalInspections(); })
      .subscribe();
    return () => {
      fiChannel.unsubscribe();
    };
  }, [loadFinalInspections]);

  const totalFinalInspectedPackets = useMemo(() => Object.values(finalInspectionSummaries).reduce((s, v) => s + v.totalPackets, 0), [finalInspectionSummaries]);
  const totalPassedPackets = useMemo(() => Object.values(finalInspectionSummaries).reduce((s, v) => s + v.passedCount, 0), [finalInspectionSummaries]);
  const totalRejectedPackets = useMemo(() => Object.values(finalInspectionSummaries).reduce((s, v) => s + v.rejectedCount, 0), [finalInspectionSummaries]);
  const totalHeldPackets = useMemo(() => Object.values(finalInspectionSummaries).reduce((s, v) => s + v.heldCount, 0), [finalInspectionSummaries]);
  const totalPendingWipBins = useMemo(() => {
    if (Object.keys(crateStats).length > 0) {
      return Object.values(crateStats).reduce((sum, s) => sum + s.pending, 0);
    }
    return pendingCrates.length;
  }, [crateStats, pendingCrates]);

  const rmOptions = useMemo(() => { const s = new Set<string>(); allBatches.forEach(b => { if (b.materialGrade) s.add(b.materialGrade); }); return Array.from(s).sort(); }, [allBatches]);
  const rmBatchOptions = useMemo(() => { const s = new Set<string>(); allBatches.forEach(b => { if (filterRM === 'All' || b.materialGrade === filterRM) { if (b.materialBatch) s.add(b.materialBatch); } }); return Array.from(s).sort(); }, [allBatches, filterRM]);

  const filtered = useMemo(() => allBatches.filter(b => {
    if (filterStatus !== 'All' && b.status !== filterStatus) return false;
    if (selProduct !== 'All' && b.productName !== selProduct) return false;
    if (filterRM !== 'All' && b.materialGrade !== filterRM) return false;
    if (filterRMBatch !== 'All' && b.materialBatch !== filterRMBatch) return false;
    if (filterDateFrom && b.batchDate < filterDateFrom) return false;
    if (filterDateTo && b.batchDate > filterDateTo) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      if (!(b.id?.toLowerCase() || '').includes(q) &&
          !(b.productCode?.toLowerCase() || '').includes(q) &&
          !(b.productName?.toLowerCase() || '').includes(q) &&
          !(b.materialGrade?.toLowerCase() || '').includes(q) &&
          !(b.materialBatch?.toLowerCase() || '').includes(q)) return false;
    }
    return true;
  }), [allBatches, filterStatus, selProduct, filterRM, filterRMBatch, filterDateFrom, filterDateTo, searchTerm]);

  useEffect(() => { setCurrentPage(1); }, [filtered.length]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = useMemo(() => filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE), [filtered, currentPage]);

  const loadCrateStats = useCallback(async (targetIds?: string[]) => {
    const ids = targetIds || paginated.map(b => b.id);
    if (!ids.length) return;
    try {
      const { data, error } = await supabase
        .from('crates')
        .select('batch_id, status')
        .in('batch_id', ids);

      if (!error && data) {
        setCrateStats(prev => {
          const next = { ...prev };
          for (const id of ids) {
            if (!next[id]) {
              next[id] = { total: 0, completed: 0, pending: 0 };
            }
          }
          for (const row of data) {
            if (!next[row.batch_id]) {
              next[row.batch_id] = { total: 0, completed: 0, pending: 0 };
            }
            next[row.batch_id].total += 1;
            if (row.status === 'Completed') {
              next[row.batch_id].completed += 1;
            } else {
              next[row.batch_id].pending += 1;
            }
          }
          return next;
        });
      }
    } catch (err) {
      console.warn('Failed loading crate stats:', err);
    }
  }, [paginated]);

  useEffect(() => {
    loadCrateStats();
    const crateChannel = supabase.channel('batch-log-crates-watch')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crates' }, () => { loadCrateStats(); })
      .subscribe();
    return () => {
      crateChannel.unsubscribe();
    };
  }, [paginated, loadCrateStats]);

  const formatDate = (iso: string) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };
  const formatShortDate = (s: string) => {
    if (!s) return '—';
    const [y, m, d] = s.split('-');
    return `${d}/${m}/${y?.slice(2)}`;
  };

  const toggleBatch = async (batchId: string) => {
    if (expandedBatchId === batchId) { setExpandedBatchId(null); return; }
    setExpandedBatchId(batchId);
    if (!batchCrates[batchId]) {
      setLoadingBatch(batchId);
      const { data, error } = await supabase.from('crates').select('*').eq('batch_id', batchId).order('bin_number', { ascending: true });
      if (!error && data) {
        const mapped: Crate[] = data.map(c => ({
          id: c.id, batchId: c.batch_id, machineId: c.machine_id, binNumber: c.bin_number,
          startTime: c.start_time, endTime: c.end_time, grossQty: c.gross_qty, netQty: c.net_qty,
          rejectedCount: c.rejected_qty || 0, rejectionDetails: c.rejection_details || {},
          operatorId: c.operator_id, supervisorId: c.supervisor_id,
          inspectedBy: c.inspected_by, inspectedAt: c.inspected_at, status: c.status
        } as any));
        setBatchCrates(prev => ({ ...prev, [batchId]: mapped }));
        const comp = mapped.filter(c => c.status === 'Completed').length;
        const pend = mapped.filter(c => c.status !== 'Completed').length;
        setCrateStats(prev => ({ ...prev, [batchId]: { total: mapped.length, completed: comp, pending: pend } }));
      }
      setLoadingBatch(null);
    }
  };

  // Accurate bin stats directly from DB crate status counts
  const getBinStats = (b: BatchRecord) => {
    // 1. If batch crates already expanded and loaded
    if (batchCrates[b.id]) {
      const crates = batchCrates[b.id];
      const completed = crates.filter(c => c.status === 'Completed').length;
      const pendingCount = crates.filter(c => c.status !== 'Completed').length;
      const total = crates.length || b.crates || 0;
      return { total, completed, pendingCount, hasPending: pendingCount > 0 };
    }
    // 2. If aggregate crate stats loaded from DB
    if (crateStats[b.id]) {
      const stat = crateStats[b.id];
      const total = Math.max(stat.total, b.crates || 0);
      const completed = stat.completed;
      const pendingCount = stat.pending;
      return { total, completed, pendingCount, hasPending: pendingCount > 0 };
    }
    // 3. Fallback before crate stats finish fetching
    const pendingCount = pendingCrates.filter(c => c.batchId === b.id).length;
    const total = b.crates || 0;
    const completed = Math.max(0, total - pendingCount);
    return { total, completed, pendingCount, hasPending: pendingCount > 0 };
  };

  const getFinalSummary = (batchId: string) =>
    finalInspectionSummaries[batchId] ||
    finalInspectionSummaries[batchId.split('-')[0]] ||
    Object.values(finalInspectionSummaries).find(s =>
      s.batchId.toUpperCase() === batchId.toUpperCase() ||
      batchId.toUpperCase().startsWith(s.batchId.toUpperCase()) ||
      s.batchId.toUpperCase().startsWith(batchId.toUpperCase())
    );

  const clearFilters = () => {
    setSearchTerm(''); setSelProduct('All'); setFilterStatus('All');
    setFilterDateFrom(''); setFilterDateTo(''); setFilterRM('All'); setFilterRMBatch('All');
  };
  const hasActiveFilters = !!(searchTerm || selProduct !== 'All' || filterStatus !== 'All' || filterDateFrom || filterDateTo || filterRM !== 'All' || filterRMBatch !== 'All');
  return (
    <div className="animate-fade-in" style={{ padding: '0 4px' }}>
      {/* Metric Cards */}
      <div className="mg" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '20px' }}>
        <div className="mc2"><div className="ml">Active Batches</div><div className="mv green">{allBatches.filter(b => b.status === 'Active').length} <span className="ms">RUNNING</span></div></div>
        <div className="mc2"><div className="ml">Pending WIP</div><div className="mv amber">{totalPendingWipBins} <span className="ms">BINS</span></div></div>
        <div className="mc2" onClick={onNavigateToFinalInspection} style={{ cursor: onNavigateToFinalInspection ? 'pointer' : 'default' }} title={onNavigateToFinalInspection ? 'Click to open Final Inspection Audit Page' : undefined}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="ml">Final Inspected</div>
            {onNavigateToFinalInspection && <span style={{ fontSize: '10px', color: 'var(--blue)', fontWeight: 700 }}>Audit Log ?</span>}
          </div>
          <div className="mv blue" style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>{totalFinalInspectedPackets} <span className="ms">PACKETS</span></div>
          <div style={{ fontSize: '10px', marginTop: '3px', display: 'flex', gap: '8px', fontWeight: 600 }}>
            <span style={{ color: '#10b981' }}>{totalPassedPackets} Passed</span>
            {totalRejectedPackets > 0 && <span style={{ color: '#ef4444' }}> {totalRejectedPackets} Rej</span>}
            {totalHeldPackets > 0 && <span style={{ color: '#f59e0b' }}> {totalHeldPackets} Hold</span>}
          </div>
        </div>
        <div className="mc2">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="ml">Historical Audit</div>
            {!historyLoaded && (
              <span onClick={loadFullHistory} style={{ fontSize: '10px', color: 'var(--purple)', fontWeight: 700, cursor: 'pointer' }}>
                {loadingHistory ? 'Loading...' : 'Load All ?'}
              </span>
            )}
          </div>
          <div className="mv">{allBatches.length} <span className="ms">{historyLoaded ? 'FULL ARCHIVE' : (totalDbBatches ? `OF ${totalDbBatches} RECS` : 'RECORDS')}</span></div>
          <div style={{ fontSize: '10px', marginTop: '3px', color: 'var(--text3)', fontWeight: 500 }}>
            {historyLoaded ? 'Complete database history active' : (totalDbBatches ? `${totalDbBatches - allBatches.length} older records in DB` : 'Showing initial batch')}
          </div>
        </div>
      </div>

      <div className="card">
        {/* Header + Filters */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <span className="ct2">Production Traceability Log</span>
              <div style={{ display: 'flex', background: 'var(--bg4)', borderRadius: 'var(--r)', padding: '2px' }}>
                {(['All', 'Active', 'Closed'] as const).map(s => (
                  <button key={s} onClick={() => setFilterStatus(s)} style={{ padding: '4px 12px', border: 'none', background: filterStatus === s ? 'var(--bg)' : 'transparent', color: filterStatus === s ? 'var(--text)' : 'var(--text3)', fontSize: '11px', fontWeight: 600, borderRadius: '4px', cursor: 'pointer' }}>{s}</button>
                ))}
              </div>
              {!historyLoaded ? (
                <button
                  onClick={loadFullHistory}
                  disabled={loadingHistory}
                  className="btn bsm"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'rgba(168, 85, 247, 0.12)',
                    color: 'var(--purple)',
                    border: '1px solid rgba(168, 85, 247, 0.35)',
                    fontWeight: 700,
                    fontSize: '11px',
                    padding: '4px 10px',
                    borderRadius: 'var(--r)'
                  }}
                  title="Query all historical batches beyond initial 60 records"
                >
                  <Database size={12} />
                  {loadingHistory ? 'Loading Archive...' : `Load Full History (${totalDbBatches ? `${totalDbBatches} Batches` : 'All'})`}
                </button>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--green)', fontWeight: 600, background: 'rgba(16, 185, 129, 0.1)', padding: '3px 8px', borderRadius: 'var(--r)', border: '1px solid rgba(16, 185, 129, 0.25)' }}>
                  <CheckCircle2 size={12} /> Full History ({allBatches.length} Batches)
                </div>
              )}
            </div>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
              <input type="text" placeholder="Search Batch, Product, RM..." className="fi" style={{ width: '220px', paddingLeft: '32px', height: '32px', fontSize: '12px' }} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            </div>
          </div>

          {/* Advanced Filters */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '0 8px', height: '30px' }}>
              <Filter size={11} style={{ color: 'var(--text3)', marginRight: '6px' }} />
              <select className="fi" value={selProduct} onChange={e => setSelProduct(e.target.value)} style={{ border: 'none', background: 'transparent', width: '130px', height: '28px', padding: 0, fontSize: '11px', fontWeight: 600 }}>
                <option value="All">All Products</option>
                {Array.from(new Set(allBatches.map((b: any) => b.productName || 'Unknown'))).sort().map(name => (<option key={name} value={name}>{name}</option>))}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '0 8px', height: '30px' }}>
              <FlaskConical size={11} style={{ color: 'var(--text3)', marginRight: '6px' }} />
              <select className="fi" value={filterRM} onChange={e => { setFilterRM(e.target.value); setFilterRMBatch('All'); }} style={{ border: 'none', background: 'transparent', width: '120px', height: '28px', padding: 0, fontSize: '11px', fontWeight: 600 }}>
                <option value="All">All RM Grades</option>
                {rmOptions.map(rm => <option key={rm} value={rm}>{rm}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '0 8px', height: '30px' }}>
              <Layers size={11} style={{ color: 'var(--text3)', marginRight: '6px' }} />
              <select className="fi" value={filterRMBatch} onChange={e => setFilterRMBatch(e.target.value)} style={{ border: 'none', background: 'transparent', width: '120px', height: '28px', padding: 0, fontSize: '11px', fontWeight: 600 }}>
                <option value="All">All RM Batches</option>
                {rmBatchOptions.map(rb => <option key={rb} value={rb}>{rb}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '0 8px', height: '30px', gap: '4px' }}>
              <Calendar size={11} style={{ color: 'var(--text3)' }} />
              <span style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: 600 }}>From</span>
              <input type="date" className="fi" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} style={{ border: 'none', background: 'transparent', height: '28px', padding: 0, fontSize: '11px', width: '120px' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '0 8px', height: '30px', gap: '4px' }}>
              <Calendar size={11} style={{ color: 'var(--text3)' }} />
              <span style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: 600 }}>To</span>
              <input type="date" className="fi" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} style={{ border: 'none', background: 'transparent', height: '28px', padding: 0, fontSize: '11px', width: '120px' }} />
            </div>
            {hasActiveFilters && (
              <button onClick={clearFilters} className="btn bsm" style={{ fontSize: '10.5px', padding: '4px 10px', background: 'rgba(239,68,68,0.12)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}>Clear Filters</button>
            )}
            <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--text3)', fontWeight: 600 }}>
              {filtered.length} {filtered.length === 1 ? 'batch' : 'batches'} &middot; Page {currentPage}/{totalPages}
            </span>
          </div>
        </div>

        {/* Table */}
        <div className="cb" style={{ padding: 0 }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text3)' }}>
              No batch records match your filters.
              {hasActiveFilters && <div style={{ marginTop: '8px' }}><button onClick={clearFilters} className="btn bsm">Clear Filters</button></div>}
            </div>
          ) : (
            <div className="dt-wrap">
              <table className="dt">
                <thead>
                  <tr>
                    <th style={{ paddingLeft: '20px' }}>Batch Identity</th>
                    <th>Machine</th>
                    <th>Product</th>
                    <th>Raw Material</th>
                    <th>Prod. Date</th>
                    <th>Visual Bins</th>
                    <th>Final Inspection</th>
                    <th>Total Output</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map(b => {
                    const { total, completed, pendingCount, hasPending } = getBinStats(b);
                    const finalSummary = getFinalSummary(b.id);
                    const activeBatchTab = expandedTab[b.id] || (finalSummary && finalSummary.totalPackets > 0 ? 'final' : 'visual');
                    return (
                      <React.Fragment key={b.id}>
                        <tr onClick={() => toggleBatch(b.id)} style={{ cursor: 'pointer', transition: 'background 0.2s' }} className={expandedBatchId === b.id ? 'active-row' : ''}>
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
                            <div style={{ fontSize: '12px', fontWeight: 600 }}>{b.productName}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text3)' }} className="mono">{b.productCode}</div>
                          </td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <div style={{ fontSize: '12px', fontWeight: 600 }}>{b.materialGrade || <span style={{ color: 'var(--text3)', fontStyle: 'italic' }}>�</span>}</div>
                              {b.materialBatch && <div className="mono" style={{ fontSize: '10px', color: 'var(--amber)', fontWeight: 600 }}>Lot: {b.materialBatch}</div>}
                            </div>
                          </td>
                          <td>
                            <span className="mono" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)' }}>{formatShortDate(b.batchDate)}</span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span className="mono" style={{ fontSize: '12px', fontWeight: 600 }}>{completed} / {total}</span>
                                <span style={{ fontSize: '10px', color: 'var(--text3)' }}>Ready</span>
                              </div>
                              {hasPending && <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--amber)', fontSize: '10px', fontWeight: 600 }}><AlertCircle size={10} /> {pendingCount} Pending</div>}
                              {!hasPending && total > 0 && <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--green)', fontSize: '10px' }}><CheckCircle2 size={10} /> All Cleared</div>}
                            </div>
                          </td>
                          <td>
                            {(() => {
                              if (!finalSummary || finalSummary.totalPackets === 0) {
                                return <div style={{ opacity: 0.7 }}><span className="pill pd" style={{ fontSize: '9.5px', padding: '2px 6px' }}>0 pkts</span> <span style={{ fontSize: '10px', color: 'var(--text3)' }}>Pending</span></div>;
                              }
                              const sColor = finalSummary.status === 'PASSED' ? '#10b981' : finalSummary.status === 'REJECTED' ? '#ef4444' : '#f59e0b';
                              const sBg = finalSummary.status === 'PASSED' ? 'rgba(16,185,129,0.15)' : finalSummary.status === 'REJECTED' ? 'rgba(239,68,68,0.18)' : 'rgba(245,158,11,0.18)';
                              return (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span className="mono" style={{ fontSize: '12px', fontWeight: 700 }}>{finalSummary.totalPackets} pkts</span>
                                    <span className="pill" style={{ fontSize: '9px', padding: '1px 6px', fontWeight: 800, background: sBg, color: sColor, border: `1px solid ${sColor}44`, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                      {finalSummary.status === 'PASSED' && <CheckCircle2 size={10} />}
                                      {finalSummary.status === 'REJECTED' && <AlertOctagon size={10} />}
                                      {finalSummary.status === 'HELD' && <ShieldAlert size={10} />}
                                      {finalSummary.status}
                                    </span>
                                  </div>
                                  <div style={{ fontSize: '10px' }}>
                                    <span style={{ color: '#10b981', fontWeight: 600 }}>{finalSummary.passedCount}P</span>
                                    {finalSummary.rejectedCount > 0 && <span style={{ color: '#ef4444', fontWeight: 700 }}> � {finalSummary.rejectedCount}R</span>}
                                    {finalSummary.heldCount > 0 && <span style={{ color: '#f59e0b', fontWeight: 700 }}> � {finalSummary.heldCount}H</span>}
                                  </div>
                                </div>
                              );
                            })()}
                          </td>
                          <td className="mono" style={{ fontWeight: 700 }}>{(b.totalOutput || 0).toLocaleString()} <span style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: 400 }}>pcs</span></td>
                          <td><span className={`pill ${b.status === 'Active' ? 'pg' : 'pd'}`}>{b.status || 'Unknown'}</span></td>
                        </tr>
                        {/* Expanded batch detail */}
                        {expandedBatchId === b.id && (
                          <tr>
                            <td colSpan={9} style={{ padding: '0', background: 'var(--bg2)' }}>
                              <div className="animate-fade-in" style={{ padding: '16px 20px 24px 32px' }}>
                                {/* Batch Meta Bar */}
                                <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', marginBottom: '14px', paddingBottom: '12px', borderBottom: '1px solid var(--border)' }}>
                                  <div><div style={{ fontSize: '9px', color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '2px' }}>Batch ID</div><span className="mono" style={{ fontSize: '13px', fontWeight: 800, color: 'var(--purple)' }}>{b.id}</span></div>
                                  <div><div style={{ fontSize: '9px', color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '2px' }}>Product</div><span style={{ fontSize: '12px', fontWeight: 600 }}>{b.productName}</span>{b.productCode && <span className="mono" style={{ fontSize: '10px', color: 'var(--text3)', marginLeft: '6px' }}>{b.productCode}</span>}</div>
                                  <div><div style={{ fontSize: '9px', color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '2px' }}>Raw Material (Grade)</div><span style={{ fontSize: '12px', fontWeight: 600 }}>{b.materialGrade || '�'}</span></div>
                                  <div><div style={{ fontSize: '9px', color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '2px' }}>RM Batch / Lot No.</div><span className="mono" style={{ fontSize: '12px', fontWeight: 700, color: 'var(--amber)' }}>{b.materialBatch || '�'}</span></div>
                                  <div><div style={{ fontSize: '9px', color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '2px' }}>Production Date</div><span className="mono" style={{ fontSize: '12px', fontWeight: 600 }}>{b.batchDate || '�'}</span></div>
                                  <div><div style={{ fontSize: '9px', color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '2px' }}>Machine</div><span style={{ fontSize: '12px', fontWeight: 600 }}>{b.machineId}</span></div>
                                </div>

                                {/* Tabs */}
                                <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
                                  <button onClick={e => { e.stopPropagation(); setExpandedTab(prev => ({ ...prev, [b.id]: 'visual' })); }} style={{ padding: '5px 14px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 700, border: 'none', cursor: 'pointer', background: activeBatchTab === 'visual' ? 'var(--blue)' : 'var(--bg3)', color: activeBatchTab === 'visual' ? '#fff' : 'var(--text2)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Package size={13} />Visual Inspection Bins ({(batchCrates[b.id] || []).length})
                                  </button>
                                  <button onClick={e => { e.stopPropagation(); setExpandedTab(prev => ({ ...prev, [b.id]: 'final' })); }} style={{ padding: '5px 14px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 700, border: 'none', cursor: 'pointer', background: activeBatchTab === 'final' ? '#10b981' : 'var(--bg3)', color: activeBatchTab === 'final' ? '#022c22' : 'var(--text2)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <ShieldCheck size={13} />Final Inspected Packets ({getFinalSummary(b.id)?.totalPackets || 0})
                                  </button>
                                </div>

                                {/* Visual Bins Tab */}
                                {activeBatchTab === 'visual' && (
                                  loadingBatch === b.id ? (
                                    <div style={{ padding: '20px', textAlign: 'center', fontSize: '12px', color: 'var(--text3)' }}>Loading bins...</div>
                                  ) : (() => {
                                    const crates = batchCrates[b.id] || [];
                                    const totalRej = crates.reduce((s, c) => s + (c.rejectedCount || 0), 0);
                                    const totalNet = crates.reduce((s, c) => s + (c.netQty || 0), 0);
                                    const totalGross = totalNet + totalRej;
                                    const avgReject = totalGross > 0 ? (totalRej / totalGross) * 100 : 0;
                                    return (
                                      <div className="bin-tree">
                                        <div className="mg" style={{ gap: '10px', marginBottom: '16px' }}>
                                          <div className="stat-sm"><span className="l">Total Bins</span><span className="v">{crates.length}</span></div>
                                          <div className="stat-sm"><span className="l">Total Rejections</span><span className="v red">{totalRej.toLocaleString()}</span></div>
                                          <div className="stat-sm"><span className="l">Avg Reject %</span><span className="v amber">{avgReject.toFixed(2)}%</span></div>
                                          <div className="stat-sm"><span className="l">Success Rate</span><span className="v green">{(100 - avgReject).toFixed(1)}%</span></div>
                                        </div>
                                        <div className="dt-wrap">
                                          <table className="dt sub-table" style={{ width: '100%', background: 'transparent' }}>
                                            <thead><tr><th>Bin #</th><th>Net Qty</th><th>Rejections</th><th>Reject %</th><th>Inspector</th><th>Status</th></tr></thead>
                                            <tbody>
                                              {crates.map(crate => {
                                                const rTotal = (crate.netQty || 0) + (crate.rejectedCount || 0);
                                                const rRate = rTotal > 0 ? ((crate.rejectedCount || 0) / rTotal) * 100 : 0;
                                                return (
                                                  <tr key={crate.id}>
                                                    <td className="mono" style={{ fontWeight: 600 }}>Bin #{crate.binNumber}</td>
                                                    <td className="mono">{crate.netQty?.toLocaleString()} <span style={{ fontSize: '12px', color: 'var(--text3)' }}>pcs</span></td>
                                                    <td className="mono" style={{ color: crate.rejectedCount ? 'var(--red)' : 'inherit' }}>{crate.rejectedCount || 0}</td>
                                                    <td>
                                                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <div className="pbg" style={{ width: '60px', height: '4px', margin: 0 }}><div className="pf r" style={{ width: `${Math.min(100, rRate * 5)}%`, background: rRate > 5 ? 'var(--red)' : (rRate > 2 ? 'var(--amber)' : 'var(--green)') }} /></div>
                                                        <span className="mono" style={{ fontSize: '11px', fontWeight: 600, color: rRate > 5 ? 'var(--red)' : (rRate > 2 ? 'var(--amber)' : 'var(--text3)') }}>{rRate.toFixed(1)}%</span>
                                                      </div>
                                                    </td>
                                                    <td>
                                                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <UserCheck size={12} style={{ color: 'var(--blue)' }} />
                                                        <span style={{ fontSize: '11px' }}>{crate.inspectedBy ? (operators.find(o => o.id === crate.inspectedBy)?.name || crate.inspectedBy) : '---'}</span>
                                                      </div>
                                                    </td>
                                                    <td><span className={`pill ${crate.status === 'Completed' ? 'pg' : 'pa'}`} style={{ fontSize: '9px' }}>{crate.status}</span></td>
                                                  </tr>
                                                );
                                              })}
                                            </tbody>
                                          </table>
                                        </div>
                                      </div>
                                    );
                                  })()
                                )}

                                {/* Final Packets Tab */}
                                {activeBatchTab === 'final' && (() => {
                                  const fs = getFinalSummary(b.id);
                                  if (!fs || fs.totalPackets === 0) {
                                    return (
                                      <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text3)', background: 'var(--bg3)', borderRadius: '8px' }}>
                                        <ShieldCheck size={28} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
                                        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text2)' }}>No Final Inspected Packets Yet</div>
                                        <div style={{ fontSize: '11px', marginTop: '4px' }}>Scan pre-printed packet labels for Batch <span className="mono" style={{ color: 'var(--purple)' }}>{b.id}</span> in the Final Inspection module.</div>
                                      </div>
                                    );
                                  }
                                  return (
                                    <>
                                      <div className="mg" style={{ gap: '10px', marginBottom: '16px' }}>
                                        <div className="stat-sm"><span className="l">Inspected Packets</span><span className="v">{fs.totalPackets}</span></div>
                                        <div className="stat-sm"><span className="l">Total Quantity</span><span className="v blue">{fs.totalQuantity.toLocaleString()} <span style={{ fontSize: '10px', fontWeight: 400 }}>pcs</span></span></div>
                                        <div className="stat-sm"><span className="l">Passed</span><span className="v green">{fs.passedCount}</span></div>
                                        <div className="stat-sm"><span className="l">Rej / Held</span><span className="v" style={{ color: fs.rejectedCount > 0 ? '#ef4444' : (fs.heldCount > 0 ? '#f59e0b' : 'var(--text3)') }}>{fs.rejectedCount + fs.heldCount}</span></div>
                                      </div>
                                      <div className="dt-wrap">
                                        <table className="dt sub-table" style={{ width: '100%', background: 'transparent' }}>
                                          <thead><tr><th>Packet QR / ID</th><th>Quantity</th><th>Status</th><th>Inspector</th><th>Inspected At</th><th>Defect Notes</th><th>Action</th></tr></thead>
                                          <tbody>
                                            {fs.packets.map(pkt => (
                                              <tr key={pkt.id || pkt.packet_id}>
                                                <td className="mono" style={{ fontWeight: 700, color: 'var(--purple)' }}><div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><QrCode size={13} style={{ opacity: 0.6 }} />{pkt.packet_id}</div></td>
                                                <td className="mono">{pkt.quantity?.toLocaleString()} <span style={{ fontSize: '11px', color: 'var(--text3)' }}>pcs</span></td>
                                                <td>
                                                  <span className="pill" style={{ fontSize: '9.5px', padding: '2px 7px', fontWeight: 800, background: pkt.status === 'PASSED' ? 'rgba(16,185,129,0.15)' : pkt.status === 'REJECTED' ? 'rgba(239,68,68,0.18)' : 'rgba(245,158,11,0.18)', color: pkt.status === 'PASSED' ? '#10b981' : pkt.status === 'REJECTED' ? '#ef4444' : '#f59e0b', border: `1px solid ${pkt.status === 'PASSED' ? 'rgba(16,185,129,0.3)' : pkt.status === 'REJECTED' ? 'rgba(239,68,68,0.35)' : 'rgba(245,158,11,0.35)'}` }}>{pkt.status}</span>
                                                </td>
                                                <td><div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><UserCheck size={12} style={{ color: 'var(--blue)' }} /><span style={{ fontSize: '11px', fontWeight: 500 }}>{pkt.inspector_name}</span><span style={{ fontSize: '9.5px', color: 'var(--text3)' }}>({pkt.inspector_role})</span></div></td>
                                                <td style={{ fontSize: '11px', color: 'var(--text2)' }}>{formatDate(pkt.inspected_at)}</td>
                                                <td style={{ fontSize: '11px', color: pkt.defect_notes ? 'var(--amber)' : 'var(--text3)' }}>{pkt.defect_notes || '�'}</td>
                                                <td>
                                                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                                    {(['PASSED', 'REJECTED', 'HELD'] as const).filter(ns => ns !== pkt.status).map(ns => {
                                                      const check = FinalInspectionService.canChangeStatus(pkt.status as any, ns, currentUser?.role || 'QC');
                                                      return (
                                                        <button key={ns} onClick={e => { e.stopPropagation(); if (check.allowed) handleStatusChange(pkt.packet_id, pkt.status as any, ns); else alert(check.reason); }} disabled={updatingPacketId === pkt.packet_id}
                                                          style={{ fontSize: '9px', padding: '2px 7px', borderRadius: '4px', border: 'none', cursor: check.allowed ? 'pointer' : 'not-allowed', fontWeight: 700, opacity: check.allowed ? 1 : 0.4, background: ns === 'PASSED' ? 'rgba(16,185,129,0.15)' : ns === 'REJECTED' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)', color: ns === 'PASSED' ? '#10b981' : ns === 'REJECTED' ? '#ef4444' : '#f59e0b' }}
                                                          title={!check.allowed ? check.reason : `Mark as ${ns}`}>
                                                          {check.allowed ? `? ${ns}` : `?? ${ns}`}
                                                        </button>
                                                      );
                                                    })}
                                                  </div>
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </>
                                  );
                                })()}
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

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderTop: '1px solid var(--border)', background: 'var(--bg2)' }}>
            <span style={{ fontSize: '11px', color: 'var(--text3)', fontWeight: 600 }}>
              Showing {((currentPage - 1) * PAGE_SIZE) + 1} to {Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length} batches
              {!historyLoaded && totalDbBatches && totalDbBatches > allBatches.length && (
                <span> &middot; <button onClick={loadFullHistory} disabled={loadingHistory} style={{ background: 'none', border: 'none', color: 'var(--purple)', textDecoration: 'underline', cursor: 'pointer', fontSize: '11px', fontWeight: 700, padding: 0 }}>{loadingHistory ? 'Loading history...' : `Load all ${totalDbBatches} historical records`}</button></span>
              )}
            </span>
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="btn bsm" style={{ padding: '4px 10px', opacity: currentPage === 1 ? 0.4 : 1 }}><ChevronLeft size={14} /></button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(page => page === 1 || page === totalPages || Math.abs(page - currentPage) <= 2)
                .reduce<(number | '...')[]>((acc, page, idx, arr) => {
                  if (idx > 0 && (page as number) - (arr[idx - 1] as number) > 1) acc.push('...');
                  acc.push(page);
                  return acc;
                }, [])
                .map((page, idx) =>
                  page === '...'
                    ? <span key={`e${idx}`} style={{ fontSize: '11px', color: 'var(--text3)', padding: '0 4px' }}>�</span>
                    : <button key={page} onClick={() => setCurrentPage(page as number)} className="btn bsm" style={{ padding: '4px 10px', minWidth: '32px', background: currentPage === page ? 'var(--purple)' : 'var(--bg3)', color: currentPage === page ? '#fff' : 'var(--text2)', fontWeight: currentPage === page ? 800 : 600, fontSize: '11px' }}>{page}</button>
                )}
              <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="btn bsm" style={{ padding: '4px 10px', opacity: currentPage === totalPages ? 0.4 : 1 }}><ChevronRight size={14} /></button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        .stat-sm { background: var(--bg3); border: 1px solid var(--border); border-radius: var(--r); padding: 8px 12px; display: flex; flex-direction: column; }
        .stat-sm .l { font-size: 9px; color: var(--text3); text-transform: uppercase; font-weight: 600; }
        .stat-sm .v { font-size: 16px; font-weight: 700; font-family: var(--mono); }
        .stat-sm .v.red { color: var(--red); } .stat-sm .v.amber { color: var(--amber); } .stat-sm .v.green { color: var(--green); } .stat-sm .v.blue { color: var(--blue); }
        .sub-table th { background: transparent !important; border-bottom: 1px solid var(--border) !important; padding: 8px 12px !important; font-size: 10px !important; }
        .sub-table td { padding: 10px 12px !important; font-size: 11px !important; border-bottom: 1px solid rgba(255,255,255,0.02) !important; }
        .active-row { background: rgba(167, 139, 250, 0.05) !important; }
      `}</style>
    </div>
  );
};

export default BatchLogPage;