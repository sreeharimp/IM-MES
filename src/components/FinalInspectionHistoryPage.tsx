import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ShieldCheck, Search, Filter, RefreshCw, CheckCircle2,
  AlertTriangle, AlertOctagon, ShieldAlert, ChevronDown, ChevronRight,
  Package, UserCheck, Calendar, Clock, QrCode, Layers, FileSpreadsheet, Download
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  FinalInspectionService,
  type BatchFinalInspectionSummary,
  type FinalInspectionRecord
} from '../services/finalInspectionService';

interface FinalInspectionHistoryPageProps {
  batchRecords?: any[];
  currentUser?: {
    id: string;
    name: string;
    role: string;
  };
}

export const FinalInspectionHistoryPage: React.FC<FinalInspectionHistoryPageProps> = ({
  batchRecords = [],
  currentUser
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PASSED' | 'REJECTED' | 'HELD'>('ALL');
  const [productFilter, setProductFilter] = useState('ALL');
  const [expandedBatches, setExpandedBatches] = useState<Record<string, boolean>>({});
  const [batchSummaries, setBatchSummaries] = useState<Record<string, BatchFinalInspectionSummary>>({});
  const [allRecords, setAllRecords] = useState<FinalInspectionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingPacketId, setUpdatingPacketId] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<string>(new Date().toLocaleTimeString());

  // Handle packet status transitions
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
        await loadData();
      }
    } catch (err: any) {
      alert(err?.message || 'Error updating packet status');
    } finally {
      setUpdatingPacketId(null);
    }
  };

  // Load complete inspection data
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [history, summaries] = await Promise.all([
        FinalInspectionService.getInspectionHistory(),
        FinalInspectionService.getAllBatchInspectionSummaries(
          batchRecords.map(b => ({ id: b.id, productName: b.productName }))
        )
      ]);

      setAllRecords(history);
      setBatchSummaries(summaries);
      setLastRefreshed(new Date().toLocaleTimeString());

      // Batches remain collapsed by default until user clicks to expand or clicks Expand All
    } catch (err) {
      console.warn('Failed to load final inspection history:', err);
    } finally {
      setLoading(false);
    }
  }, [batchRecords]);

  useEffect(() => {
    loadData();

    // Real-time synchronization subscription
    const channel = supabase.channel('portal-final-inspections')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'system_changes' }, () => {
        loadData();
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [loadData]);

  const toggleBatch = (batchId: string) => {
    setExpandedBatches(prev => ({
      ...prev,
      [batchId]: !prev[batchId]
    }));
  };

  const expandAll = () => {
    const next: Record<string, boolean> = {};
    for (const bId of Object.keys(batchSummaries)) {
      next[bId] = true;
    }
    setExpandedBatches(next);
  };

  const collapseAll = () => {
    setExpandedBatches({});
  };

  // Filtered batches list
  const filteredBatches = useMemo(() => {
    return Object.values(batchSummaries).filter(summary => {
      // Hide batches with zero packets unless explicitly searching
      if (summary.totalPackets === 0 && !searchTerm.trim()) {
        return false;
      }

      // Status Filter
      if (statusFilter !== 'ALL' && summary.status !== statusFilter) {
        return false;
      }

      // Product Filter
      if (productFilter !== 'ALL' && summary.productName !== productFilter) {
        return false;
      }

      // Search Query
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchesBatch = summary.batchId.toLowerCase().includes(q);
        const matchesProduct = (summary.productName || '').toLowerCase().includes(q);
        const matchesInspector = summary.inspectors.some(i => i.toLowerCase().includes(q));
        const matchesPacket = summary.packets.some(p => p.packet_id.toLowerCase().includes(q));
        if (!matchesBatch && !matchesProduct && !matchesInspector && !matchesPacket) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => {
      const timeA = a.latestInspectedAt ? new Date(a.latestInspectedAt).getTime() : 0;
      const timeB = b.latestInspectedAt ? new Date(b.latestInspectedAt).getTime() : 0;
      return timeB - timeA;
    });
  }, [batchSummaries, statusFilter, productFilter, searchTerm]);

  // Overall KPI Metrics
  const totalBatchesInspected = useMemo(() => {
    return Object.values(batchSummaries).filter(b => b.totalPackets > 0).length;
  }, [batchSummaries]);

  const totalPacketsInspected = useMemo(() => {
    return Object.values(batchSummaries).reduce((acc, b) => acc + b.totalPackets, 0);
  }, [batchSummaries]);

  const totalQuantityInspected = useMemo(() => {
    return Object.values(batchSummaries).reduce((acc, b) => acc + b.totalQuantity, 0);
  }, [batchSummaries]);

  const totalPassedPackets = useMemo(() => {
    return Object.values(batchSummaries).reduce((acc, b) => acc + b.passedCount, 0);
  }, [batchSummaries]);

  const totalRejectedPackets = useMemo(() => {
    return Object.values(batchSummaries).reduce((acc, b) => acc + b.rejectedCount, 0);
  }, [batchSummaries]);

  const totalHeldPackets = useMemo(() => {
    return Object.values(batchSummaries).reduce((acc, b) => acc + b.heldCount, 0);
  }, [batchSummaries]);

  const passRate = totalPacketsInspected > 0
    ? ((totalPassedPackets / totalPacketsInspected) * 100).toFixed(1)
    : '100.0';

  // Unique products for filter
  const productOptions = useMemo(() => {
    const set = new Set<string>();
    for (const b of Object.values(batchSummaries)) {
      if (b.productName) set.add(b.productName);
    }
    return Array.from(set).sort();
  }, [batchSummaries]);

  const formatDate = (iso?: string) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // CSV Export
  const exportToCSV = () => {
    if (allRecords.length === 0) return;
    const headers = ['Batch Code', 'Packet ID', 'Product', 'Quantity', 'Status', 'Inspector', 'Inspected At', 'Defect Notes', 'Session ID'];
    const rows = allRecords.map(r => [
      r.batch_code || 'UNASSIGNED',
      r.packet_id,
      r.product_name || '',
      r.quantity,
      r.status,
      r.inspector_name,
      r.inspected_at,
      `"${(r.defect_notes || '').replace(/"/g, '""')}"`,
      r.session_id
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `final_inspections_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="animate-fade-in" style={{ padding: '0 4px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* ── 1. Top Header Bar ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '14px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.25) 0%, rgba(5, 150, 105, 0.15) 100%)',
              border: '1px solid rgba(16, 185, 129, 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#10b981'
            }}>
              <ShieldCheck size={22} />
            </div>
            <div>
              <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text)', margin: 0, letterSpacing: '-0.02em' }}>
                Final Inspection Audit Log
              </h1>
              <div style={{ fontSize: '11.5px', color: 'var(--text3)', marginTop: '2px' }}>
                Batch-wise Traceability & Pre-Printed Label Verification
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text3)' }}>
            Updated: {lastRefreshed}
          </span>
          <button
            onClick={loadData}
            disabled={loading}
            className="btn bsm"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'var(--bg3)',
              border: '1px solid var(--border)',
              color: 'var(--text)'
            }}
            title="Refresh Inspection Records"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            onClick={exportToCSV}
            className="btn bsm"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'rgba(16, 185, 129, 0.15)',
              border: '1px solid rgba(16, 185, 129, 0.35)',
              color: '#10b981',
              fontWeight: 700
            }}
            title="Export CSV Report"
          >
            <Download size={13} />
            Export CSV
          </button>
        </div>
      </div>

      {/* ── 2. Top Metric KPI Cards ────────────────────────────────────────── */}
      <div className="mg" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' }}>
        <div className="mc2">
          <div className="ml">Inspected Batches</div>
          <div className="mv blue" style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
            {totalBatchesInspected} <span className="ms">BATCHES</span>
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '2px' }}>
            Batch-wise traceability active
          </div>
        </div>

        <div className="mc2">
          <div className="ml">Total Packets Scanned</div>
          <div className="mv green" style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
            {totalPacketsInspected.toLocaleString()} <span className="ms">PACKETS</span>
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '2px' }}>
            {totalQuantityInspected.toLocaleString()} pcs total output
          </div>
        </div>

        <div className="mc2">
          <div className="ml">Passed Quality Rate</div>
          <div className="mv green" style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
            {passRate}% <span className="ms">CLEARED</span>
          </div>
          <div style={{ fontSize: '10px', color: '#10b981', marginTop: '2px', fontWeight: 600 }}>
            {totalPassedPackets.toLocaleString()} of {totalPacketsInspected.toLocaleString()} passed
          </div>
        </div>

        <div className="mc2">
          <div className="ml">Non-Conforming Packets</div>
          <div className="mv" style={{ display: 'flex', alignItems: 'baseline', gap: '6px', color: totalRejectedPackets > 0 ? '#ef4444' : (totalHeldPackets > 0 ? '#f59e0b' : 'var(--text3)') }}>
            {totalRejectedPackets + totalHeldPackets} <span className="ms">UNITS</span>
          </div>
          <div style={{ fontSize: '10px', marginTop: '2px', display: 'flex', gap: '6px', fontWeight: 600 }}>
            <span style={{ color: totalRejectedPackets > 0 ? '#ef4444' : 'var(--text3)' }}>{totalRejectedPackets} Rejected</span>
            <span>•</span>
            <span style={{ color: totalHeldPackets > 0 ? '#f59e0b' : 'var(--text3)' }}>{totalHeldPackets} Held</span>
          </div>
        </div>
      </div>

      {/* ── 3. Filters & Search Control Bar ───────────────────────────────── */}
      <div className="card" style={{ padding: '14px 18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          
          {/* Status Tabs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--bg4)', padding: '3px', borderRadius: '8px' }}>
            {(['ALL', 'PASSED', 'REJECTED', 'HELD'] as const).map(st => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                style={{
                  padding: '5px 14px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 700,
                  border: 'none',
                  cursor: 'pointer',
                  background: statusFilter === st ? 'var(--bg)' : 'transparent',
                  color: statusFilter === st ? 'var(--text)' : 'var(--text3)',
                  transition: 'all 0.15s ease'
                }}
              >
                {st === 'ALL' ? 'All Batches' : st}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {/* Product Filter */}
            {productOptions.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '0 10px' }}>
                <Filter size={12} style={{ color: 'var(--text3)', marginRight: '6px' }} />
                <select
                  className="fi"
                  value={productFilter}
                  onChange={e => setProductFilter(e.target.value)}
                  style={{ border: 'none', background: 'transparent', width: '150px', height: '32px', padding: 0, fontSize: '11px', fontWeight: 600 }}
                >
                  <option value="ALL">All Products</option>
                  {productOptions.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Search Input */}
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
              <input
                type="text"
                placeholder="Search Batch / Packet QR..."
                className="fi"
                style={{ width: '220px', paddingLeft: '32px', height: '32px', fontSize: '11.5px' }}
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>

            {/* Expand / Collapse All */}
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                onClick={expandAll}
                className="btn bsm"
                style={{ fontSize: '10.5px', padding: '4px 10px', background: 'var(--bg3)' }}
              >
                Expand All
              </button>
              <button
                onClick={collapseAll}
                className="btn bsm"
                style={{ fontSize: '10.5px', padding: '4px 10px', background: 'var(--bg3)' }}
              >
                Collapse All
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* ── 4. Batch-Wise Inspections List ─────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {filteredBatches.length === 0 ? (
          <div className="card" style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text3)' }}>
            <ShieldCheck size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
            <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text2)', marginBottom: '4px' }}>
              No Final Inspection Records Found
            </div>
            <div style={{ fontSize: '12px', maxWidth: '400px', margin: '0 auto' }}>
              {searchTerm || statusFilter !== 'ALL' || productFilter !== 'ALL'
                ? 'No batches match your selected search or status filters.'
                : 'Scanned packet labels submitted from the Android QC Inspector or Web Final Inspection module will appear here batch-wise in real time.'}
            </div>
          </div>
        ) : (
          filteredBatches.map(summary => {
            const isExpanded = !!expandedBatches[summary.batchId];
            const statusColor =
              summary.status === 'PASSED' ? '#10b981' :
              summary.status === 'REJECTED' ? '#ef4444' :
              summary.status === 'HELD' ? '#f59e0b' : 'var(--text3)';

            const statusBg =
              summary.status === 'PASSED' ? 'rgba(16, 185, 129, 0.12)' :
              summary.status === 'REJECTED' ? 'rgba(239, 68, 68, 0.15)' :
              summary.status === 'HELD' ? 'rgba(245, 158, 11, 0.15)' : 'var(--bg3)';

            return (
              <div
                key={summary.batchId}
                className="card"
                style={{
                  border: isExpanded ? '1px solid rgba(167, 139, 250, 0.35)' : '1px solid var(--border)',
                  overflow: 'hidden',
                  transition: 'border 0.2s ease, box-shadow 0.2s ease'
                }}
              >
                {/* Batch Header Bar */}
                <div
                  onClick={() => toggleBatch(summary.batchId)}
                  style={{
                    padding: '16px 20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    background: isExpanded ? 'rgba(167, 139, 250, 0.04)' : 'transparent',
                    flexWrap: 'wrap',
                    gap: '12px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      background: 'var(--bg3)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: isExpanded ? 'var(--purple)' : 'var(--text3)'
                    }}>
                      {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    </div>

                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span className="mono" style={{ fontSize: '15px', fontWeight: 800, color: 'var(--purple)' }}>
                          {summary.batchId}
                        </span>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>
                          {summary.productName || 'Standard Product'}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '11px', color: 'var(--text3)', marginTop: '3px' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Package size={12} />
                          <strong style={{ color: 'var(--text)' }}>{summary.totalPackets}</strong> {summary.totalPackets === 1 ? 'packet' : 'packets'}
                          <span style={{ opacity: 0.7 }}>({summary.totalQuantity.toLocaleString()} pcs)</span>
                        </span>
                        <span>•</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <UserCheck size={12} />
                          {summary.inspectors.length > 0 ? summary.inspectors.join(', ') : 'QC Inspector'}
                        </span>
                        {summary.latestInspectedAt && (
                          <>
                            <span>•</span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Clock size={12} />
                              {formatDate(summary.latestInspectedAt)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right Header Status Pills */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {/* Passed / Rejected Mini Breakdown */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 700 }}>
                      <span style={{ color: '#10b981', background: 'rgba(16, 185, 129, 0.1)', padding: '2px 8px', borderRadius: '4px' }}>
                        {summary.passedCount} Passed
                      </span>
                      {summary.rejectedCount > 0 && (
                        <span style={{ color: '#ef4444', background: 'rgba(239, 68, 68, 0.12)', padding: '2px 8px', borderRadius: '4px' }}>
                          {summary.rejectedCount} Rej
                        </span>
                      )}
                      {summary.heldCount > 0 && (
                        <span style={{ color: '#f59e0b', background: 'rgba(245, 158, 11, 0.12)', padding: '2px 8px', borderRadius: '4px' }}>
                          {summary.heldCount} Hold
                        </span>
                      )}
                    </div>

                    {/* Overall Status Badge */}
                    <span
                      className="pill"
                      style={{
                        fontSize: '11px',
                        padding: '4px 10px',
                        fontWeight: 800,
                        background: statusBg,
                        color: statusColor,
                        border: `1px solid ${statusColor}44`,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px'
                      }}
                    >
                      {summary.status === 'PASSED' && <CheckCircle2 size={13} />}
                      {summary.status === 'REJECTED' && <AlertOctagon size={13} />}
                      {summary.status === 'HELD' && <ShieldAlert size={13} />}
                      {summary.status}
                    </span>
                  </div>
                </div>

                {/* Expanded Packet Breakdown Table */}
                {isExpanded && (
                  <div className="animate-fade-in" style={{ borderTop: '1px solid var(--border)', background: 'var(--bg2)', padding: '16px 20px 20px' }}>
                    
                    {/* Batch Summary Header Row */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Inspected Packet Verification Breakdown
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text3)' }}>
                        Showing {summary.packets.length} verified label record(s)
                      </div>
                    </div>

                    {/* Sub-table */}
                    <div className="dt-wrap" style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                      <table className="dt sub-table" style={{ width: '100%', background: 'var(--bg)' }}>
                        <thead>
                          <tr>
                            <th style={{ paddingLeft: '16px' }}>Packet QR / Identifier</th>
                            <th>Quantity</th>
                            <th>Final QC Status</th>
                            <th>QC Action</th>
                            <th>Inspector</th>
                            <th>Inspected At</th>
                            <th>Session ID</th>
                            <th>Defect Notes / Remarks</th>
                          </tr>
                        </thead>
                        <tbody>
                          {summary.packets.map(pkt => (
                            <tr key={pkt.id || pkt.packet_id}>
                              <td style={{ paddingLeft: '16px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <QrCode size={14} style={{ color: 'var(--purple)', opacity: 0.8 }} />
                                  <span className="mono" style={{ fontWeight: 700, color: 'var(--purple)', fontSize: '12.5px' }}>
                                    {pkt.packet_id}
                                  </span>
                                </div>
                              </td>
                              <td className="mono" style={{ fontWeight: 600 }}>
                                {pkt.quantity?.toLocaleString()} <span style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: 400 }}>pcs</span>
                              </td>
                              <td>
                                <span
                                  className="pill"
                                  style={{
                                    fontSize: '9.5px',
                                    padding: '2px 8px',
                                    fontWeight: 800,
                                    background: pkt.status === 'PASSED' ? 'rgba(16, 185, 129, 0.15)' :
                                                pkt.status === 'REJECTED' ? 'rgba(239, 68, 68, 0.18)' : 'rgba(245, 158, 11, 0.18)',
                                    color: pkt.status === 'PASSED' ? '#10b981' :
                                           pkt.status === 'REJECTED' ? '#ef4444' : '#f59e0b',
                                    border: `1px solid ${pkt.status === 'PASSED' ? 'rgba(16, 185, 129, 0.35)' :
                                                         pkt.status === 'REJECTED' ? 'rgba(239, 68, 68, 0.35)' : 'rgba(245, 158, 11, 0.35)'}`,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '3px'
                                  }}
                                >
                                  {pkt.status === 'PASSED' && <CheckCircle2 size={10} />}
                                  {pkt.status === 'REJECTED' && <AlertOctagon size={10} />}
                                  {pkt.status === 'HELD' && <ShieldAlert size={10} />}
                                  {pkt.status}
                                </span>
                              </td>

                              {/* QC Action column implementing user transition rules */}
                              <td>
                                {(() => {
                                  const isAdmin = (currentUser?.role || '').toLowerCase() === 'admin' || (currentUser?.role || '').toLowerCase() === 'poweruser';
                                  const isUpdating = updatingPacketId === pkt.packet_id;

                                  if (pkt.status === 'HELD') {
                                    return (
                                      <div style={{ display: 'flex', gap: '4px' }}>
                                        <button
                                          onClick={() => handleStatusChange(pkt.packet_id, pkt.status, 'PASSED')}
                                          disabled={isUpdating}
                                          className="btn bsm"
                                          style={{
                                            padding: '2px 8px', fontSize: '10px', fontWeight: 700,
                                            background: 'rgba(16, 185, 129, 0.15)', color: '#10b981',
                                            border: '1px solid rgba(16, 185, 129, 0.3)'
                                          }}
                                          title="Hold items can be passed"
                                        >
                                          ✓ Pass
                                        </button>
                                        <button
                                          onClick={() => handleStatusChange(pkt.packet_id, pkt.status, 'REJECTED')}
                                          disabled={isUpdating}
                                          className="btn bsm"
                                          style={{
                                            padding: '2px 8px', fontSize: '10px', fontWeight: 700,
                                            background: 'rgba(239, 68, 68, 0.12)', color: '#ef4444',
                                            border: '1px solid rgba(239, 68, 68, 0.3)'
                                          }}
                                        >
                                          ✕ Reject
                                        </button>
                                      </div>
                                    );
                                  }

                                  if (pkt.status === 'PASSED') {
                                    return (
                                      <div style={{ display: 'flex', gap: '4px' }}>
                                        <button
                                          onClick={() => handleStatusChange(pkt.packet_id, pkt.status, 'HELD')}
                                          disabled={isUpdating}
                                          className="btn bsm"
                                          style={{
                                            padding: '2px 8px', fontSize: '10px', fontWeight: 700,
                                            background: 'rgba(245, 158, 11, 0.12)', color: '#f59e0b',
                                            border: '1px solid rgba(245, 158, 11, 0.3)'
                                          }}
                                          title="Passed items can be put on hold"
                                        >
                                          ⏸ Hold
                                        </button>
                                        <button
                                          onClick={() => handleStatusChange(pkt.packet_id, pkt.status, 'REJECTED')}
                                          disabled={isUpdating}
                                          className="btn bsm"
                                          style={{
                                            padding: '2px 8px', fontSize: '10px', fontWeight: 700,
                                            background: 'rgba(239, 68, 68, 0.12)', color: '#ef4444',
                                            border: '1px solid rgba(239, 68, 68, 0.3)'
                                          }}
                                          title="Passed items can be rejected"
                                        >
                                          ✕ Reject
                                        </button>
                                      </div>
                                    );
                                  }

                                  if (pkt.status === 'REJECTED') {
                                    if (isAdmin) {
                                      return (
                                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                          <button
                                            onClick={() => handleStatusChange(pkt.packet_id, pkt.status, 'PASSED')}
                                            disabled={isUpdating}
                                            className="btn bsm"
                                            style={{
                                              padding: '2px 8px', fontSize: '10px', fontWeight: 700,
                                              background: 'rgba(16, 185, 129, 0.15)', color: '#10b981',
                                              border: '1px solid rgba(16, 185, 129, 0.4)'
                                            }}
                                            title="Admin Override: Pass rejected item"
                                          >
                                            Override Pass
                                          </button>
                                          <button
                                            onClick={() => handleStatusChange(pkt.packet_id, pkt.status, 'HELD')}
                                            disabled={isUpdating}
                                            className="btn bsm"
                                            style={{
                                              padding: '2px 8px', fontSize: '10px', fontWeight: 700,
                                              background: 'rgba(245, 158, 11, 0.12)', color: '#f59e0b',
                                              border: '1px solid rgba(245, 158, 11, 0.4)'
                                            }}
                                            title="Admin Override: Hold rejected item"
                                          >
                                            Override Hold
                                          </button>
                                        </div>
                                      );
                                    }

                                    return (
                                      <span
                                        style={{
                                          fontSize: '10px', color: '#f87171',
                                          display: 'inline-flex', alignItems: 'center', gap: '4px',
                                          opacity: 0.85
                                        }}
                                        title="Rejected items cannot be passed or held by anyone other than Admin"
                                      >
                                        🔒 Locked (Admin Only)
                                      </span>
                                    );
                                  }

                                  return null;
                                })()}
                              </td>

                              <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <UserCheck size={12} style={{ color: 'var(--blue)' }} />
                                  <span style={{ fontSize: '11px', fontWeight: 600 }}>
                                    {pkt.inspector_name}
                                  </span>
                                  <span style={{ fontSize: '9.5px', color: 'var(--text3)' }}>
                                    ({pkt.inspector_role})
                                  </span>
                                </div>
                              </td>
                              <td style={{ fontSize: '11px', color: 'var(--text2)' }}>
                                {formatDate(pkt.inspected_at)}
                              </td>
                              <td className="mono" style={{ fontSize: '10px', color: 'var(--text3)' }}>
                                {pkt.session_id}
                              </td>
                              <td style={{ fontSize: '11px', color: pkt.defect_notes ? 'var(--amber)' : 'var(--text3)' }}>
                                {pkt.defect_notes || '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

    </div>
  );
};

export default FinalInspectionHistoryPage;
