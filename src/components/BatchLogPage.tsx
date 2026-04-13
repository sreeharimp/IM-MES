import React, { useState } from 'react';
import { Search, Filter, Factory, AlertCircle, CheckCircle2, ChevronDown, ChevronRight, UserCheck, Package, Trash2 } from 'lucide-react';
import type { BatchRecord, Product, Crate, Operator } from '../types';
import { supabase } from '../lib/supabase';

interface BatchLogPageProps {
  batchRecords: BatchRecord[];
  products: Product[];
  pendingCrates: Crate[];
  operators: Operator[];
}

const BatchLogPage: React.FC<BatchLogPageProps> = ({ batchRecords, pendingCrates, operators }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selProduct, setSelProduct] = useState('All');
  const [filterStatus, setFilterStatus] = useState<'All' | 'Active' | 'Closed'>('All');
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);
  const [batchCrates, setBatchCrates] = useState<Record<string, Crate[]>>({});
  const [loadingBatch, setLoadingBatch] = useState<string | null>(null);

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
      <div className="mg" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '20px' }}>
        <div className="mc2"><div className="ml">Active Batches</div><div className="mv green">{batchRecords.filter(b => b.status === 'Active').length} <span className="ms">RUNNING</span></div></div>
        <div className="mc2"><div className="ml">Pending WIP</div><div className="mv amber">{pendingCrates.length} <span className="ms">BINS</span></div></div>
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
            <table className="dt">
              <thead>
                <tr>
                  <th style={{ paddingLeft: '20px' }}>Batch Identity</th>
                  <th>Machine</th>
                  <th>Product Details</th>
                  <th>Crate Status</th>
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
            <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop:'2px' }}>{formatDate(b.startTime)}</div>
          </div>
       </div>
    </td>
    <td>
       <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Factory size={12} style={{ color: 'var(--text3)' }} />
          <span style={{ fontWeight: 500, fontSize:'13px' }}>{b.machineId}</span>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--amber)', fontSize:'10px', fontWeight:600 }}>
               <AlertCircle size={10} /> {inspection.count} Pending Inspection
            </div>
          )}
          {!inspection.hasPending && totalCrates > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--green)', fontSize:'10px' }}>
               <CheckCircle2 size={10} /> All Cleared
            </div>
          )}
       </div>
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
  {expandedBatchId === b.id && (
    <tr>
      <td colSpan={6} style={{ padding: '0', background: 'var(--bg2)' }}>
        <div className="animate-fade-in" style={{ padding: '16px 20px 24px 44px' }}>
          {loadingBatch === b.id ? (
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
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px' }}>
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
                          <span className="v amber">
                            {avgReject.toFixed(2)}%
                          </span>
                       </div>
                       <div className="stat-sm">
                          <span className="l">Success Rate</span>
                          <span className="v green">
                            {successRate.toFixed(1)}%
                          </span>
                       </div>
                    </div>

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
                              <td className="mono">{crate.netQty?.toLocaleString()} <span style={{fontSize:'10px', color:'var(--text3)'}}>pcs</span></td>
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
