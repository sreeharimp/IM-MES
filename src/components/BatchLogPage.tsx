import React, { useState, useEffect } from 'react';
import { Search, Filter, Factory, AlertCircle, CheckCircle2, ChevronDown, ChevronRight, ChevronLeft, UserCheck, Package, Tag } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatDateDMY } from '../utils/printService';
import type { BatchRecord, Product, Crate, Operator } from '../types';

interface BatchLogPageProps {
  batchRecords: BatchRecord[];
  products: Product[];
  pendingCrates: Crate[];
  operators: Operator[];
}

const PAGE_SIZE = 20;

const BatchLogPage: React.FC<BatchLogPageProps> = ({ products = [], pendingCrates = [], operators = [] }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selProduct, setSelProduct] = useState('All');
  const [filterStatus, setFilterStatus] = useState<'All' | 'Active' | 'Closed'>('All');
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);
  const [batchCrates, setBatchCrates] = useState<Record<string, Crate[]>>({});
  const [loadingBatch, setLoadingBatch] = useState<string | null>(null);

  const [batches, setBatches] = useState<BatchRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [activeCount, setActiveCount] = useState(0);
  const [historicalCount, setHistoricalCount] = useState(0);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(1);
    }, 400);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  const fetchBatches = async () => {
    setLoading(true);
    try {
      // 1. Fetch count stats
      const [activeRes, totalRes] = await Promise.all([
        supabase.from('batch_records').select('*', { count: 'exact', head: true }).eq('status', 'Active'),
        supabase.from('batch_records').select('*', { count: 'exact', head: true })
      ]);
      if (activeRes.count !== null) setActiveCount(activeRes.count);
      if (totalRes.count !== null) setHistoricalCount(totalRes.count);

      // 2. Fetch paginated filtered records
      let query = supabase.from('batch_records').select('*', { count: 'exact' });

      if (filterStatus !== 'All') {
        query = query.eq('status', filterStatus);
      }
      if (selProduct !== 'All') {
        query = query.eq('product_name', selProduct);
      }
      if (debouncedSearch) {
        query = query.or(`id.ilike.%${debouncedSearch}%,product_code.ilike.%${debouncedSearch}%`);
      }

      const start = (page - 1) * PAGE_SIZE;
      const end = start + PAGE_SIZE - 1;

      const { data, count, error } = await query
        .order('start_time', { ascending: false })
        .range(start, end);

      if (error) throw error;
      if (data) {
        setBatches(data.map((b: any) => ({
          id: b.id,
          machineId: b.machine_id,
          productId: b.product_id,
          productName: b.product_name,
          productCode: b.product_code,
          mouldId: b.mould_id,
          materialGrade: b.material_grade,
          materialBatch: b.material_batch,
          operatorId: b.operator_id,
          startTime: b.start_time,
          endTime: b.end_time,
          crates: b.crates,
          totalOutput: b.total_output || 0,
          status: b.status,
          batchDate: b.batch_date
        })));
        setTotalCount(count || 0);
      }
    } catch (err) {
      console.error('Error fetching batches:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBatches();
  }, [debouncedSearch, selProduct, filterStatus, page]);

  const handleFilterStatusChange = (status: 'All' | 'Active' | 'Closed') => {
    setFilterStatus(status);
    setPage(1);
  };

  const handleProductChange = (productName: string) => {
    setSelProduct(productName);
    setPage(1);
  };

  const formatDate = (iso: string) => {
    return formatDateDMY(iso) + ' ' + new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
        const mapped: Crate[] = data.map(c => ({
          id: c.id,
          batchId: c.batch_id,
          machineId: c.machine_id,
          binNumber: c.bin_number,
          startTime: c.start_time,
          endTime: c.end_time,
          grossQty: c.gross_qty,
          netQty: c.net_qty,
          rejectedQty: c.rejected_qty || 0,
          rejectionDetails: c.rejection_details || {},
          operatorId: c.operator_id,
          supervisorId: c.supervisor_id,
          inspectedBy: c.inspected_by,
          inspectedAt: c.inspected_at,
          materialBatch: c.material_batch,
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

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="animate-fade-in" style={{ padding: '0 4px' }}>
      {/* Summary stat cards */}
      <div className="mg" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '20px' }}>
        <div className="mc2" style={{ borderLeft: '3px solid var(--green)' }}>
          <div className="ml">Active Batches</div>
          <div className="mv green">{activeCount} <span className="ms">RUNNING</span></div>
        </div>
        <div className="mc2" style={{ borderLeft: '3px solid var(--amber)' }}>
          <div className="ml">Pending WIP</div>
          <div className="mv amber">{pendingCrates.length} <span className="ms">BINS</span></div>
        </div>
        <div className="mc2" style={{ borderLeft: '3px solid var(--purple)' }}>
          <div className="ml">Historical Audit</div>
          <div className="mv">{historicalCount} <span className="ms">RECORDS</span></div>
        </div>
      </div>

      <div className="card">
        <div className="ch" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span className="ct2">Production Traceability Log</span>
            <div style={{ display: 'flex', background: 'var(--bg4)', borderRadius: 'var(--r)', padding: '2px' }}>
              {(['All', 'Active', 'Closed'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => handleFilterStatusChange(s)}
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
                onChange={e => handleProductChange(e.target.value)}
                style={{ border: 'none', background: 'transparent', width: '160px', height: '30px', padding: 0, fontSize: '11px', fontWeight: 600 }}
              >
                <option value="All">All Products</option>
                {products.map(p => (
                  <option key={p.id} value={p.name}>{p.name}</option>
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
          {loading ? (
            <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text3)' }}>Loading records...</div>
          ) : batches.length === 0 ? (
            <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text3)' }}>No batch records match your filters.</div>
          ) : (
            <div className="dt-wrap">
              <table className="dt">
                <thead>
                  <tr>
                    <th style={{ paddingLeft: '20px' }}>Batch Identity</th>
                    <th>Machine</th>
                    <th>Product Details</th>
                    <th>Batch Date</th>
                    <th>Material</th>
                    <th>Crate Status</th>
                    <th>Total Output</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map(b => {
                    const inspection = getBatchInspectionStatus(b.id);
                    const pendingCount = inspection.count;
                    const totalCrates = Math.max(b.crates || 0, pendingCount);
                    const completedCount = Math.max(0, totalCrates - pendingCount);

                    return (
                      <React.Fragment key={b.id}>
                        <tr
                          onClick={() => toggleBatch(b.id)}
                          style={{ cursor: 'pointer', transition: 'background 0.2s' }}
                          className={expandedBatchId === b.id ? 'active-row' : ''}
                        >
                          <td data-label="Batch Identity" style={{ paddingLeft: '20px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              {expandedBatchId === b.id ? <ChevronDown size={14} color="var(--purple)" /> : <ChevronRight size={14} color="var(--text3)" />}
                              <div>
                                <span className="mono" style={{ fontWeight: 600, color: 'var(--purple)', fontSize: '13px' }}>{b.id}</span>
                                <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '2px' }}>{formatDate(b.startTime)}</div>
                              </div>
                            </div>
                          </td>
                          <td data-label="Machine">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <Factory size={12} style={{ color: 'var(--text3)' }} />
                              <span style={{ fontWeight: 500, fontSize: '13px' }}>{b.machineId}</span>
                            </div>
                          </td>
                          <td data-label="Product Details">
                            <div>
                              <div style={{ fontSize: '12px', fontWeight: 600 }}>{b.productName}</div>
                              <div style={{ fontSize: '11px', color: 'var(--text3)' }} className="mono">{b.productCode}</div>
                            </div>
                          </td>
                          <td data-label="Batch Date">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontFamily: 'var(--mono)', fontWeight: 600 }}>
                              <Tag size={11} style={{ color: 'var(--text3)' }} />
                              {b.batchDate || '—'}
                            </div>
                          </td>
                          <td data-label="Material">
                            <div>
                              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text)' }}>{b.materialGrade || '—'}</div>
                              <div style={{ fontSize: '10px', color: 'var(--text3)' }} className="mono">{b.materialBatch || '—'}</div>
                            </div>
                          </td>
                          <td data-label="Crate Status">
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span className="mono" style={{ fontSize: '12px', fontWeight: 600 }}>
                                  {completedCount} / {totalCrates}
                                </span>
                                <span style={{ fontSize: '10px', color: 'var(--text3)' }}>Bins Ready</span>
                              </div>
                              {inspection.hasPending && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--amber)', fontSize: '10px', fontWeight: 600 }}>
                                  <AlertCircle size={10} /> {inspection.count} Pending
                                </div>
                              )}
                              {!inspection.hasPending && totalCrates > 0 && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--green)', fontSize: '10px' }}>
                                  <CheckCircle2 size={10} /> All Cleared
                                </div>
                              )}
                            </div>
                          </td>
                          <td data-label="Total Output" className="mono" style={{ fontWeight: 700 }}>
                            {(b.totalOutput || 0).toLocaleString()} <span style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: 400 }}>pcs</span>
                          </td>
                          <td data-label="Status">
                            <span className={`pill ${b.status === 'Active' ? 'pg' : 'pd'}`}>
                              {b.status || 'Unknown'}
                            </span>
                          </td>
                        </tr>

                        {/* Expanded drill-down */}
                        {expandedBatchId === b.id && (
                          <tr>
                            <td colSpan={8} style={{ padding: '0', background: 'var(--bg2)' }}>
                              <div className="animate-fade-in" style={{ padding: '16px 20px 24px 44px' }}>
                                {/* Batch header info */}
                                <div style={{ display: 'flex', gap: '16px', marginBottom: '12px', paddingBottom: '12px', borderBottom: '1px solid var(--border)' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text3)' }}>
                                    <Tag size={11} />
                                    <span>Batch Date: <strong style={{ color: 'var(--text)' }}>{b.batchDate || '—'}</strong></span>
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text3)' }}>
                                    <Package size={11} />
                                    <span>Material: <strong style={{ color: 'var(--text)' }}>{b.materialGrade || '—'}</strong></span>
                                  </div>
                                  <div style={{ fontSize: '11px', color: 'var(--text3)' }}>
                                    Lot #: <strong className="mono" style={{ color: 'var(--purple)' }}>{b.materialBatch || '—'}</strong>
                                  </div>
                                </div>

                                {loadingBatch === b.id ? (
                                  <div style={{ padding: '20px', textAlign: 'center', fontSize: '12px', color: 'var(--text3)' }}>Loading bins...</div>
                                ) : (
                                  <div className="bin-tree">
                                    {(() => {
                                      const crates = batchCrates[b.id] || [];
                                      const totalRej = crates.reduce((sum, c) => sum + (c.rejectedQty || 0), 0);
                                      const totalNet = crates.reduce((sum, c) => sum + (c.netQty || 0), 0);
                                      const totalGross = totalNet + totalRej;
                                      const avgReject = totalGross > 0 ? (totalRej / totalGross) * 100 : 0;
                                      const successRate = 100 - avgReject;

                                      return (
                                        <>
                                          <div className="mg" style={{ gap: '10px', marginBottom: '16px' }}>
                                            <div className="stat-sm" style={{ borderLeft: '2px solid var(--blue)' }}>
                                              <span className="l">Total Bins</span>
                                              <span className="v">{crates.length}</span>
                                            </div>
                                            <div className="stat-sm" style={{ borderLeft: '2px solid var(--red)' }}>
                                              <span className="l">Total Rejections</span>
                                              <span className="v red">{totalRej.toLocaleString()}</span>
                                            </div>
                                            <div className="stat-sm" style={{ borderLeft: '2px solid var(--amber)' }}>
                                              <span className="l">Avg Reject %</span>
                                              <span className="v amber">{avgReject.toFixed(2)}%</span>
                                            </div>
                                            <div className="stat-sm" style={{ borderLeft: '2px solid var(--green)' }}>
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
                                                  <th>Material Lot</th>
                                                  <th>Inspector</th>
                                                  <th>Status</th>
                                                </tr>
                                              </thead>
                                              <tbody>
                                                {crates.map(crate => {
                                                  const rTotal = (crate.netQty || 0) + (crate.rejectedQty || 0);
                                                  const rRate = rTotal > 0 ? ((crate.rejectedQty || 0) / rTotal) * 100 : 0;
                                                  return (
                                                    <tr key={crate.id}>
                                                      <td className="mono" style={{ fontWeight: 600 }}>Bin #{crate.binNumber}</td>
                                                      <td className="mono">{crate.netQty?.toLocaleString()} <span style={{ fontSize: '12px', color: 'var(--text3)' }}>pcs</span></td>
                                                      <td className="mono" style={{ color: crate.rejectedQty ? 'var(--red)' : 'inherit' }}>
                                                        {crate.rejectedQty || 0}
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
                                                      <td className="mono" style={{ fontSize: '10px', color: 'var(--purple)' }}>
                                                        {(crate as any).materialBatch || b.materialBatch || '—'}
                                                      </td>
                                                      <td>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                          <UserCheck size={12} style={{ color: 'var(--blue)' }} />
                                                          <span style={{ fontSize: '11px' }}>
                                                            {crate.inspectedBy ? (
                                                              operators.find(o => o.id === crate.inspectedBy)?.name || crate.inspectedBy
                                                            ) : '—'}
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
                                              {/* Summary row */}
                                              {crates.length > 0 && (
                                                <tfoot>
                                                  <tr style={{ background: 'var(--bg3)', borderTop: '2px solid var(--border)' }}>
                                                    <td className="mono" style={{ fontWeight: 700, fontSize: '11px', padding: '8px 12px' }}>
                                                      TOTAL ({crates.length} bins)
                                                    </td>
                                                    <td className="mono" style={{ fontWeight: 700, fontSize: '12px', color: 'var(--green)' }}>
                                                      {totalNet.toLocaleString()} <span style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: 400 }}>pcs</span>
                                                    </td>
                                                    <td className="mono" style={{ fontWeight: 700, color: totalRej > 0 ? 'var(--red)' : 'var(--text3)' }}>
                                                      {totalRej.toLocaleString()}
                                                    </td>
                                                    <td style={{ fontWeight: 700, fontSize: '11px', color: avgReject > 5 ? 'var(--red)' : avgReject > 2 ? 'var(--amber)' : 'var(--green)' }}>
                                                      {avgReject.toFixed(2)}%
                                                    </td>
                                                    <td colSpan={3} />
                                                  </tr>
                                                </tfoot>
                                              )}
                                            </table>
                                          </div>
                                        </>
                                      );
                                    })()}
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

          {/* Pagination controls */}
          {!loading && totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px', padding: '16px', borderTop: '1px solid var(--border)' }}>
              <button className="btn bsec" style={{ padding: '4px 10px' }} disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft size={13} />
              </button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                const p = totalPages <= 7 ? i + 1 : page <= 4 ? i + 1 : page >= totalPages - 3 ? totalPages - 6 + i : page - 3 + i;
                return (
                  <button 
                    key={p} 
                    onClick={() => setPage(p)} 
                    style={{ 
                      padding: '3px 8px', fontSize: '11px', border: '1px solid', 
                      borderColor: p === page ? 'var(--blue)' : 'var(--border)', 
                      background: p === page ? 'var(--blue)' : 'transparent', 
                      color: p === page ? '#fff' : 'var(--text2)', 
                      borderRadius: '4px', cursor: 'pointer', fontWeight: p === page ? 700 : 400 
                    }}
                  >
                    {p}
                  </button>
                );
              })}
              <button className="btn bsec" style={{ padding: '4px 10px' }} disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
                <ChevronRight size={13} />
              </button>
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
        .sub-table tfoot td {
          padding: 8px 12px !important;
        }
        .active-row {
          background: rgba(167, 139, 250, 0.05) !important;
        }
      `}</style>
    </div>
  );
};

export default BatchLogPage;
