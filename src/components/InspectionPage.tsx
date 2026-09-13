import React, { useState, useEffect } from 'react';
import { 
  ArrowRight, CheckCircle2, Camera, Printer, ChevronLeft, ChevronRight, AlertTriangle
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { printProductionSlip, formatDateDMY } from '../utils/printService';
import { formatUnitId, parseScannedUnitId } from '../utils/batchUtils';
import { supabase } from '../lib/supabase';
import type { Machine, Product, Crate, BatchRecord, Operator, AppSettings } from '../types';

interface InspectionPageProps {
  pendingCrates: Crate[];
  machines: Machine[];
  products: Product[];
  batchRecords: BatchRecord[];
  operators: Operator[];
  onStartInspection: (crate: { id: string, netQty: number, machineId: string }) => void;
  onTriggerScan?: () => void;
  scannerSearchTerm?: string;
  onClearScannerSearchTerm?: () => void;
  supervisorName?: string;
  appSettings?: AppSettings | null;
}

const InspectionPage: React.FC<InspectionPageProps> = ({ 
  pendingCrates, 
  machines, 
  products,
  batchRecords,
  operators,
  onStartInspection,
  onTriggerScan = () => {},
  scannerSearchTerm = '',
  onClearScannerSearchTerm = () => {},
  supervisorName,
  appSettings
}) => {
  const [filterMachineId, setFilterMachineId] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [filterBatch, setFilterBatch] = useState('');
  const [filterProduct, setFilterProduct] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [reprintCrate, setReprintCrate] = useState<Crate | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const [displayedCrates, setDisplayedCrates] = useState<Crate[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const matchCrate = (crateList: Crate[], searchVal: string): Crate | null => {
    if (!searchVal) return null;
    const parsed = parseScannedUnitId(searchVal);
    const raw = (parsed.raw || searchVal).trim().toLowerCase();
    const norm = (parsed.normalized || raw).toLowerCase();

    return crateList.find((c) => {
      const cid = c.id.toLowerCase();
      const normCid = formatUnitId(c.id).toLowerCase();
      if (cid === raw || cid === norm || normCid === norm || normCid === raw) return true;
      if (parsed.batchId && parsed.binNumber && c.batchId.toLowerCase() === parsed.batchId.toLowerCase() && c.binNumber === parsed.binNumber) return true;
      return false;
    }) || null;
  };

  // Server-side filtering + pagination via Supabase PostgREST
  useEffect(() => {
    let isMounted = true;
    const fetchServerCrates = async () => {
      setIsLoading(true);
      try {
        let query = supabase
          .from('crates')
          .select('*', { count: 'exact' })
          .eq('status', 'Pending Inspection');

        if (filterMachineId) {
          query = query.eq('machine_id', filterMachineId);
        }
        if (filterBatch) {
          const parsed = parseScannedUnitId(filterBatch);
          const raw = parsed.raw;
          const norm = parsed.normalized;

          const orConditions: string[] = [];
          if (raw) {
            orConditions.push(`id.ilike.%${raw}%`);
            orConditions.push(`batch_id.ilike.%${raw}%`);
          }
          if (norm && norm !== raw) {
            orConditions.push(`id.ilike.%${norm}%`);
          }
          if (parsed.batchId && parsed.binNumber) {
            orConditions.push(`and(batch_id.eq.${parsed.batchId},bin_number.eq.${parsed.binNumber})`);
          }

          if (orConditions.length > 0) {
            query = query.or(orConditions.join(','));
          }
        }
        if (filterDate) {
          query = query.gte('start_time', `${filterDate}T00:00:00`).lte('start_time', `${filterDate}T23:59:59`);
        }
        if (filterProduct) {
          const matchedBatchIds = batchRecords
            .filter(b => b.productName?.toLowerCase() === filterProduct.toLowerCase())
            .map(b => b.id);
          if (matchedBatchIds.length > 0) {
            query = query.in('batch_id', matchedBatchIds);
          } else {
            // No matching batches means no crates should be returned for this product filter
            query = query.eq('batch_id', 'NON_EXISTENT_BATCH');
          }
        }

        query = query.order('end_time', { ascending: sortOrder === 'asc', nullsFirst: false });
        query = query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

        const { data, count, error } = await query;
        if (error) {
          console.error('Error fetching server crates:', error);
          return;
        }

        if (isMounted) {
          if (count !== null) {
            setTotalCount(count);
            const calculatedTotalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
            if (page > calculatedTotalPages) {
              setPage(calculatedTotalPages);
              return;
            }
          }
          if (data) {
            const mappedCrates = data.map((c: any) => ({
              id: c.id,
              batchId: c.batch_id,
              machineId: c.machine_id,
              binNumber: c.bin_number,
              startTime: c.start_time,
              endTime: c.end_time,
              grossQty: c.gross_qty,
              startupScrap: c.startup_scrap,
              qcSample: c.qc_sample,
              netQty: c.net_qty,
              operatorId: c.operator_id,
              supervisorId: c.supervisor_id,
              status: c.status
            } as Crate));

            setDisplayedCrates(mappedCrates);

            if (filterBatch) {
              const matched = matchCrate(mappedCrates, filterBatch);
              if (matched) {
                onStartInspection({ id: matched.id, netQty: matched.netQty, machineId: matched.machineId });
              }
            }
          }
        }
      } catch (err) {
        console.error('Fetch server crates exception:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchServerCrates();
    return () => { isMounted = false; };
  }, [filterMachineId, filterBatch, filterDate, filterProduct, sortOrder, page, pendingCrates, batchRecords]);

  const handleReprint = (crate: Crate) => {
    setReprintCrate(crate);
    const batch = batchRecords.find(b => b.id === crate.batchId);
    const productName = batch?.productName || 'N/A';
    const rmName = batch?.materialGrade || (crate as any).materialGrade || (crate as any).material_grade || 'N/A';
    const rmBatch = crate.materialBatch || (crate as any).material_batch || batch?.materialBatch || 'N/A';
    const machine = machines.find(m => m.id === crate.machineId) || { id: crate.machineId } as Machine;
    const operator = operators.find(o => o.id === crate.operatorId);
    
    setTimeout(() => {
      printProductionSlip(crate, machine, operator?.name, true, productName, supervisorName, appSettings?.printLabels, rmName, rmBatch);
      setReprintCrate(null);
    }, 500);
  };

  useEffect(() => {
    if (scannerSearchTerm) {
      const t = setTimeout(() => {
        const parsed = parseScannedUnitId(scannerSearchTerm);
        setFilterBatch(parsed.raw || scannerSearchTerm.trim());
        setPage(1);
        onClearScannerSearchTerm();
      }, 0);
      return () => clearTimeout(t);
    }
  }, [scannerSearchTerm, onClearScannerSearchTerm]);

  const handleScan = () => {
    onTriggerScan();
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const paginatedCrates = displayedCrates;

  return (
    <div className="animate-fade-in">
      <div>
      {/* High Volume Warning Banner */}
      {totalCount > 900 && (
        <div style={{ 
          padding: '12px 16px', 
          background: 'var(--amber-bg)', 
          border: '1px solid var(--amber-dim)', 
          color: 'var(--amber)', 
          borderRadius: '8px', 
          marginBottom: '16px', 
          fontSize: '13px', 
          display: 'flex', 
          alignItems: 'center', 
          gap: '8px',
          fontWeight: 600
        }}>
          <AlertTriangle size={18} />
          <span>High Pending Inspection Volume ({totalCount} total pending bins). Server-side pagination active — use page controls below to navigate all bins.</span>
        </div>
      )}

      {/* Search & Filter Header */}
      <div className="card" style={{ marginBottom: '24px', padding: '20px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 200px' }}>
            <label className="fl" style={{ color: 'var(--amber)', fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}>
               Scan Unit ID / Barcode
               <button 
                 onClick={handleScan}
                 style={{ border: 'none', background: 'var(--amber-bg)', color: 'var(--amber)', fontSize: '9px', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer', fontWeight: 700 }}
               >
                 CAMERA SCAN
               </button>
            </label>
            <div style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--amber)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 12h10"/><path d="M10 8h4"/><path d="M12 16h0"/></svg>
              </div>
              <input 
                type="text" 
                className="fi" 
                placeholder="Scan or Type ID..." 
                style={{ paddingLeft: '34px', borderColor: 'var(--amber-dim)', background: 'var(--amber-bg)' }}
                value={filterBatch}
                onChange={(e) => {
                  const val = e.target.value;
                  setFilterBatch(val);
                  setPage(1);
                  
                  // Auto-open logic: if ID matches (old, new, or thermal wrapper format), trigger inspection!
                  const match = matchCrate(displayedCrates.length > 0 ? displayedCrates : pendingCrates, val);
                  if (match) {
                    onStartInspection({ id: match.id, netQty: match.netQty, machineId: match.machineId });
                    setFilterBatch(''); // Clear for next scan
                  }
                }}
              />
            </div>
          </div>

          <div style={{ flex: '1 1 180px' }}>
            <label className="fl">Machine ID</label>
            <select 
              className="fi" 
              value={filterMachineId} 
              onChange={(e) => { setFilterMachineId(e.target.value); setPage(1); }}
            >
              <option value="">All IDs</option>
              {machines.map(m => <option key={m.id} value={m.id}>{m.id}</option>)}
            </select>
          </div>

          <div style={{ flex: '1 1 180px' }}>
            <label className="fl">Product</label>
            <select 
              className="fi"
              value={filterProduct}
              onChange={(e) => { setFilterProduct(e.target.value); setPage(1); }}
            >
              <option value="">All Products</option>
              {products.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
            </select>
          </div>

          <div style={{ flex: '1 1 180px' }}>
            <label className="fl">Date</label>
            <input 
              type="date" 
              className="fi"
              value={filterDate}
              onChange={(e) => { setFilterDate(e.target.value); setPage(1); }}
            />
          </div>

          <div style={{ flex: '1 1 180px' }}>
            <label className="fl">Sort Order</label>
            <select 
              className="fi"
              value={sortOrder}
              onChange={(e) => { setSortOrder(e.target.value as 'asc' | 'desc'); setPage(1); }}
            >
              <option value="desc">Descending (Newest First)</option>
              <option value="asc">Ascending (Oldest First)</option>
            </select>
          </div>

          <button className="btn bsec" style={{ height: '42px', padding: '0 20px', borderRadius: 'var(--r)' }} onClick={() => {
            setFilterMachineId('');
            setFilterBatch('');
            setFilterDate('');
            setFilterProduct('');
            setSortOrder('desc');
            setPage(1);
          }}>
            Reset
          </button>
        </div>
      </div>

      {/* Table of Pending Inspections */}
      {!isLoading && displayedCrates.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--bg2)', marginBottom: '16px' }}>
          <div className="dt-wrap">
            <table className="dt">
              <thead>
                <tr>
                  <th style={{ paddingLeft: '16px' }}>Unit ID & Bin</th>
                  <th>Machine</th>
                  <th>Product & Batch</th>
                  <th>Timing</th>
                  <th style={{ textAlign: 'right' }}>Net Qty</th>
                  <th style={{ textAlign: 'center', width: '200px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedCrates.map(crate => {
                  const prodName = batchRecords.find(b => b.id === crate.batchId)?.productName || 'QC Audit';
                  const startTimeStr = crate.startTime ? new Date(crate.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
                  const endTimeStr = crate.endTime ? new Date(crate.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';

                  return (
                    <tr key={crate.id} style={{ transition: 'background 0.15s ease' }}>
                      <td data-label="Unit ID & Bin" style={{ paddingLeft: '16px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span style={{ fontFamily: 'var(--mono)', fontSize: '12px', fontWeight: 600, color: 'var(--amber)' }}>
                            {formatUnitId(crate.id, crate.machineId)}
                          </span>
                          <span style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: 500 }}>
                            Bin #{crate.binNumber}
                          </span>
                        </div>
                      </td>

                      <td data-label="Machine">
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: '12px', color: 'var(--text)' }}>
                            {crate.machineId}
                          </span>
                        </div>
                      </td>

                      <td data-label="Product & Batch">
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>
                            {prodName}
                          </span>
                          <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--text3)' }}>
                            Batch: {crate.batchId.split('-')[0]}
                          </span>
                        </div>
                      </td>

                      <td data-label="Timing">
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text2)' }}>
                          <span>{startTimeStr} → {endTimeStr}</span>
                        </div>
                      </td>

                      <td data-label="Net Qty" style={{ textAlign: 'right' }}>
                        <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: '13px', color: 'var(--green)' }}>
                          {crate.netQty.toLocaleString()}
                        </span>
                        <span style={{ fontSize: '10px', color: 'var(--text3)', marginLeft: '4px' }}>pcs</span>
                      </td>

                      <td data-label="Actions" style={{ textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                          <button 
                            className="btn bsm bsec" 
                            style={{ padding: '4px 8px', fontSize: '10px', height: '28px' }} 
                            onClick={() => handleReprint(crate)}
                            title="Reprint Slip"
                          >
                            <Printer size={12} /> Reprint
                          </button>
                          <button 
                            className="btn bsm bpri" 
                            style={{ padding: '4px 10px', fontSize: '11px', height: '28px', gap: '4px' }}
                            onClick={() => onStartInspection({ id: crate.id, netQty: crate.netQty, machineId: crate.machineId })}
                          >
                            Inspect <ArrowRight size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isLoading && (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text3)' }}>
          Loading server inspection queue...
        </div>
      )}

      {!isLoading && displayedCrates.length === 0 && (
        <div style={{ padding: '60px', textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 'var(--rl)' }}>
          <div style={{ background: 'var(--bg3)', width: '64px', height: '64px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: 'var(--text3)' }}>
            <CheckCircle2 size={32} />
          </div>
          <h3 style={{ color: 'var(--text2)', marginBottom: '8px' }}>All caught up!</h3>
          <p style={{ color: 'var(--text3)', fontSize: '14px' }}>No pending inspections match your filters.</p>
        </div>
      )}

      {/* Pagination controls */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px', marginTop: '24px', padding: '16px', borderTop: '1px solid var(--border)' }}>
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

      {/* Floating Action Button for Scanning (Android Style) */}
      <button 
        className="fab-scan"
        onClick={handleScan}
        title="Scan Barcode / QR"
      >
        <div className="fab-icon-wrapper">
          <Camera size={24} />
          <div className="fab-pulse"></div>
        </div>
      </button>
      </div>

      <style>{`
        .inspection-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 12px 30px rgba(0,0,0,0.3);
          border-color: var(--amber-dim);
        }
        .info-group {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .info-label {
          font-size: 10px;
          color: var(--text3);
          text-transform: uppercase;
          font-weight: 700;
          letter-spacing: 0.05em;
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .info-value {
          font-size: 15px;
          font-weight: 600;
          color: var(--text);
        }

        .fab-scan {
          position: fixed;
          bottom: 30px;
          left: 50%;
          transform: translateX(-50%);
          width: 64px;
          height: 64px;
          border-radius: 50%;
          background: linear-gradient(135deg, var(--amber), #ff8c00);
          color: white;
          border: none;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 8px 25px rgba(255, 191, 0, 0.4);
          cursor: pointer;
          z-index: 100;
          transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }

        .fab-scan:hover {
          transform: translateX(-50%) scale(1.1) translateY(-5px);
          box-shadow: 0 12px 30px rgba(255, 191, 0, 0.5);
        }

        .fab-scan:active {
          transform: translateX(-50%) scale(0.9);
        }

        .fab-icon-wrapper {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .fab-pulse {
          position: absolute;
          width: 100%;
          height: 100%;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.4);
          animation: pulse 2s infinite;
          z-index: -1;
        }

        @keyframes pulse {
          0% { transform: scale(1); opacity: 0.6; }
          100% { transform: scale(1.8); opacity: 0; }
        }

        @media (max-width: 1024px) {
          .fab-scan {
            display: none;
          }
        }

        /* Scanner Module Styles */
        .scanner-container {
          position: relative;
          width: 100%;
          aspect-ratio: 1;
          background: #000;
          overflow: hidden;
          border-radius: 12px;
        }

        .scanner-overlay-ui {
          position: absolute;
          inset: 0;
          z-index: 10;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          pointer-events: none;
        }

        .viewfinder {
          width: 70%;
          height: 70%;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-radius: 24px;
          position: relative;
          box-shadow: 0 0 0 1000px rgba(0, 0, 0, 0.5);
        }

        .viewfinder::before {
          content: '';
          position: absolute;
          top: -2px; left: -2px; right: -2px; bottom: -2px;
          border: 4px solid var(--amber);
          border-radius: 24px;
          clip-path: polygon(
            0 0, 30% 0, 30% 10%, 70% 10%, 70% 0, 100% 0, 
            100% 30%, 90% 30%, 90% 70%, 100% 70%, 100% 100%, 
            70% 100%, 70% 90%, 30% 90%, 30% 100%, 0 100%, 
            0 70%, 10% 70%, 10% 30%, 0 30%
          );
        }

        .scan-line {
          position: absolute;
          top: 10%;
          left: 10%;
          right: 10%;
          height: 3px;
          background: var(--amber);
          box-shadow: 0 0 15px var(--amber);
          animation: scan 2.5s ease-in-out infinite;
          z-index: 11;
          border-radius: 4px;
        }

        @keyframes scan {
          0%, 100% { top: 10%; opacity: 0.2; }
          50% { top: 85%; opacity: 1; }
        }

        .torch-btn {
          pointer-events: auto;
          position: absolute;
          bottom: 20px;
          background: rgba(255, 255, 255, 0.2);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.3);
          color: white;
          width: 48px;
          height: 48px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }

        html.native-scanner-active,
        body.native-scanner-active {
          background: transparent !important;
        }

        body.native-scanner-active #root {
          background: transparent !important;
        }
      `}</style>
      {/* Scanner Overlay removed and moved to App.tsx level */}

      {/* Auto-closing Reprint Overlay */}
      {reprintCrate && (
        <div className="ov animate-fade-in" style={{ zIndex: 1000, background: 'rgba(0,0,0,0.8)' }}>
           <div className="modal animate-scale-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ color: 'var(--text)', marginBottom: '20px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Printer size={18} /> Preparing Slip Print...
              </div>
              <div 
                id="print-slip" 
                style={{ 
                  background: '#fff', 
                  color: '#000', 
                  padding: '16px', 
                  borderRadius: '4px',
                  width: '100%',
                  maxWidth: '280px',
                  fontFamily: 'var(--mono)',
                  fontSize: '12px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
                }}
              >
                <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '14px', borderBottom: '1px solid #000', paddingBottom: '6px', marginBottom: '10px' }}>
                  PRODUCTION SLIP (REPRINT)
                </div>
                <div style={{ marginBottom: '8px', borderBottom: '1px solid #eee', paddingBottom: '4px', fontSize: '11px' }}>
                  Date/Time: {formatDateDMY(reprintCrate.endTime)} {new Date(reprintCrate.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span>SHIFT: {reprintCrate.shiftId || 'A'}</span>
                  <span>MC: {reprintCrate.machineId}</span>
                </div>
                
                <div style={{ margin: '6px 0 3px', borderBottom: '1px solid #eee', paddingBottom: '3px' }}>
                  {appSettings?.printLabels?.production_slip?.product_label || 'PRODUCT'}: {batchRecords.find(b => b.id === reprintCrate.batchId)?.productName || 'N/A'}
                </div>

                <div style={{ margin: '3px 0', fontSize: '11px' }}>
                  <span style={{ color: '#444' }}>{appSettings?.printLabels?.production_slip?.rm_label || 'RAW MATERIAL'}:</span> <strong>{batchRecords.find(b => b.id === reprintCrate.batchId)?.materialGrade || (reprintCrate as any).materialGrade || (reprintCrate as any).material_grade || 'N/A'}</strong>
                </div>
                <div style={{ margin: '3px 0 6px', fontSize: '11px', borderBottom: '1px solid #eee', paddingBottom: '4px' }}>
                  <span style={{ color: '#444' }}>{appSettings?.printLabels?.production_slip?.rm_batch_label || 'RM LOT / BATCH'}:</span> <strong>{reprintCrate.materialBatch || (reprintCrate as any).material_batch || batchRecords.find(b => b.id === reprintCrate.batchId)?.materialBatch || 'N/A'}</strong>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontWeight: 'bold' }}>
                  <span>{appSettings?.printLabels?.production_slip?.batch_label || 'BATCH'}: {reprintCrate.batchId}</span>
                  <span>{appSettings?.printLabels?.production_slip?.bin_label || 'BIN'}: #{reprintCrate.binNumber}</span>
                </div>

                <div style={{ fontSize: '11px', marginBottom: '2px' }}>
                  OPERATOR: {operators.find(o => o.id === reprintCrate.operatorId)?.name || 'UNASSIGNED'}
                </div>
                <div style={{ fontSize: '11px', marginBottom: '10px' }}>
                  SUPERVISOR: {supervisorName || 'N/A'}
                </div>
                
                <div style={{ borderBottom: '1px dashed #000', margin: '8px 0' }}></div>
                
                {reprintCrate.grossQty > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                    <span>Gross Qty:</span>
                    <span>{reprintCrate.grossQty}</span>
                  </div>
                )}
                {reprintCrate.startupScrap > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                    <span>Startup Scrap:</span>
                    <span>{reprintCrate.startupScrap}</span>
                  </div>
                )}
                {reprintCrate.qcSample > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                    <span>QC Samples:</span>
                    <span>{reprintCrate.qcSample}</span>
                  </div>
                )}
                
                <div style={{ borderBottom: '1px dashed #000', margin: '8px 0' }}></div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: 'bold', marginTop: '8px' }}>
                  <span>NET QTY:</span>
                  <span>{reprintCrate.netQty}</span>
                </div>
                
                <div style={{ textAlign: 'center', marginTop: '20px' }}>
                  <div style={{ fontSize: '11px', marginBottom: '8px', fontWeight: 'bold' }}>UNIT ID: {formatUnitId(reprintCrate.id, reprintCrate.machineId)}</div>
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <QRCodeSVG value={formatUnitId(reprintCrate.id, reprintCrate.machineId)} size={140} level="M" />
                  </div>
                </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

// Camera scanner components removed and moved to App.tsx / CameraScanner.tsx level

export default InspectionPage;
