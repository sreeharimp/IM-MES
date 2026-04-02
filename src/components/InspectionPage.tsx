import { BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';
import React, { useState } from 'react';
import { 
  ArrowRight, 
  Package, Hash, Layers, CheckCircle2
} from 'lucide-react';
import type { Machine, Product, Crate, BatchRecord } from '../types';

interface InspectionPageProps {
  pendingCrates: Crate[];
  machines: Machine[];
  products: Product[];
  batchRecords: BatchRecord[];
  onStartInspection: (crate: { id: string, netQty: number, machineId: string }) => void;
}

const InspectionPage: React.FC<InspectionPageProps> = ({ 
  pendingCrates, 
  machines, 
  products,
  batchRecords,
  onStartInspection 
}) => {
  const [filterMachineId, setFilterMachineId] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [filterBatch, setFilterBatch] = useState('');
  const [filterProduct, setFilterProduct] = useState('');

  const handleScan = async () => {
    try {
      const isSupported = await BarcodeScanner.isSupported();
      if (!isSupported) {
        alert('Barcode scanning is not supported on this device/platform.');
        return;
      }

      await BarcodeScanner.requestPermissions();
      const { barcodes } = await BarcodeScanner.scan();
      
      if (barcodes.length > 0) {
        const val = barcodes[0].displayValue;
        setFilterBatch(val);
        
        const match = pendingCrates.find(c => c.id === val);
        if (match) {
          onStartInspection({ id: match.id, netQty: match.netQty, machineId: match.machineId });
          setFilterBatch(''); 
        } else {
          alert(`Unit ID ${val} not found in pending inspections.`);
        }
      }
    } catch (err) {
      console.error('Scanning error:', err);
      alert('Scanning failed. Please check permissions.');
    }
  };

  const filteredCrates = pendingCrates.filter(crate => {
    const matchMachine = !filterMachineId || crate.machineId === filterMachineId;
    const matchBatch = !filterBatch || crate.batchId.toLowerCase().includes(filterBatch.toLowerCase());
    const matchDate = !filterDate || crate.startTime.startsWith(filterDate);
    
    let matchProduct = true;
    if (filterProduct) {
      const batch = batchRecords.find(b => b.id === crate.batchId);
      matchProduct = batch?.productName === filterProduct;
    }
    
    return matchMachine && matchBatch && matchDate && matchProduct;
  });

  return (
    <div className="animate-fade-in">
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
                  
                  // Auto-open logic: if ID matches exactly, we could trigger inspection
                  const match = pendingCrates.find(c => c.id === val);
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
              onChange={(e) => setFilterMachineId(e.target.value)}
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
              onChange={(e) => setFilterProduct(e.target.value)}
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
              onChange={(e) => setFilterDate(e.target.value)}
            />
          </div>

          <button className="btn bsec" style={{ height: '42px', padding: '0 20px', borderRadius: 'var(--r)' }} onClick={() => {
            setFilterMachineId('');
            setFilterBatch('');
            setFilterDate('');
          }}>
            Reset
          </button>
        </div>
      </div>

      {/* Grid of Pending Inspections */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
        {filteredCrates.map(crate => {
          return (
            <div key={crate.id} className="card inspection-card" style={{ 
              padding: '0', 
              overflow: 'hidden',
              border: '1px solid var(--border)',
              transition: 'transform 0.2s, box-shadow 0.2s',
              background: 'var(--bg2)'
            }}>
              {/* Product Badge Area - Main Header */}
              <div style={{ padding: '12px 16px', background: 'var(--bg3)', borderBottom: '1px solid var(--border)', display:'flex', alignItems:'center', gap:'8px' }}>
                 <Package size={14} style={{color:'var(--purple)'}} />
                 <span style={{ fontSize: '13px', fontWeight: 600 }}>{batchRecords.find(b => b.id === crate.batchId)?.productName || 'QC Audit'}</span>
              </div>

              {/* Card Body */}
              <div style={{ padding: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
                  <div className="info-group">
                    <span className="info-label"><Hash size={10} /> Unit ID</span>
                    <span className="info-value" style={{ fontFamily: 'var(--mono)', fontSize: '13px', color: 'var(--amber)' }}>{crate.id}</span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr 1fr', gap: '8px' }}>
                    <div className="info-group">
                      <span className="info-label"><Hash size={10} /> Batch</span>
                      <span className="info-value" style={{ fontFamily: 'var(--mono)', fontSize: '13px', color: 'var(--text)' }}>{crate.batchId}</span>
                    </div>
                    <div className="info-group">
                      <span className="info-label"><Hash size={10} /> Bin</span>
                      <span className="info-value" style={{ fontFamily: 'var(--mono)', fontSize: '13px', color: 'var(--text)' }}>#{crate.binNumber}</span>
                    </div>
                    <div className="info-group">
                      <span className="info-label"><Layers size={10} /> Qty</span>
                      <span className="info-value" style={{ fontFamily: 'var(--mono)', fontSize: '13px', color: 'var(--text)' }}>{crate.netQty.toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                <button 
                  className="btn bpri" 
                  style={{ width: '100%', padding: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', borderRadius: 'var(--r)', fontSize:'13px' }}
                  onClick={() => onStartInspection({ id: crate.id, netQty: crate.netQty, machineId: crate.machineId })}
                >
                  Start QC Inspection <ArrowRight size={16} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {filteredCrates.length === 0 && (
        <div style={{ padding: '60px', textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 'var(--rl)' }}>
          <div style={{ background: 'var(--bg3)', width: '64px', height: '64px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: 'var(--text3)' }}>
            <CheckCircle2 size={32} />
          </div>
          <h3 style={{ color: 'var(--text2)', marginBottom: '8px' }}>All caught up!</h3>
          <p style={{ color: 'var(--text3)', fontSize: '14px' }}>No pending inspections match your filters.</p>
        </div>
      )}

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
      `}</style>
    </div>
  );
};

export default InspectionPage;
