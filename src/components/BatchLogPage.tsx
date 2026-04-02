import React, { useState } from 'react';
import { Search, Filter, Factory, AlertCircle, CheckCircle2 } from 'lucide-react';
import type { BatchRecord, Product, Crate } from '../types';

interface BatchLogPageProps {
  batchRecords: BatchRecord[];
  products: Product[];
  pendingCrates: Crate[];
}

const BatchLogPage: React.FC<BatchLogPageProps> = ({ batchRecords, pendingCrates }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selProduct, setSelProduct] = useState('All');
  const [filterStatus, setFilterStatus] = useState<'All' | 'Active' | 'Closed'>('All');

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
                    <tr key={b.id}>
                      <td style={{ paddingLeft: '20px' }}>
                         <span className="mono" style={{ fontWeight: 600, color: 'var(--purple)', fontSize: '13px' }}>{b.id}</span>
                         <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop:'2px' }}>{formatDate(b.startTime)}</div>
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
                            {inspection.hasPending === false && totalCrates > 0 && (
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
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default BatchLogPage;
