import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Package, Clock, CheckCircle2, Factory, TrendingUp } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Machine, Product, BatchRecord } from '../types';

interface StockPageProps {
  machines: Machine[];
  products: Product[];
  batchRecords: BatchRecord[];
}

interface ProductStock {
  productId: string;
  productName: string;
  productCode: string;
  wipQty: number;        // Currently in production (current shift output)
  pendingQty: number;    // Pending inspection
  pendingBins: number;   // Number of bins pending
  inspectedQty: number;  // Inspected & ready to dispatch
  inspectedBins: number; // Number of bins inspected
}

const formatQty = (n: number) => n.toLocaleString('en-IN');

const StockPage: React.FC<StockPageProps> = ({ machines, products }) => {
  const [stockData, setStockData] = useState<ProductStock[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [sortBy, setSortBy] = useState<'name' | 'pending' | 'inspected' | 'wip'>('pending');
  const [searchTerm, setSearchTerm] = useState('');

  const fetchStockData = useCallback(async () => {
    setIsLoading(true);
    try {
      // 1. Fetch all pending inspection crates
      const { data: pendingCrates } = await supabase
        .from('crates')
        .select('batch_id, net_qty')
        .eq('status', 'Pending Inspection');

      // 2. Fetch ALL completed (inspected) crates — total available stock, no date filter
      const { data: completedCrates } = await supabase
        .from('crates')
        .select('batch_id, net_qty')
        .eq('status', 'Completed');

      // 3. Fetch all batch records to resolve product from batch_id
      const { data: allBatchRecords } = await supabase
        .from('batch_records')
        .select('id, product_id, product_name, product_code');

      // Build batch -> product map
      const batchMap = new Map<string, { productId: string; productName: string; productCode: string }>();
      (allBatchRecords || []).forEach((b: any) => {
        batchMap.set(b.id, {
          productId: b.product_id,
          productName: b.product_name,
          productCode: b.product_code,
        });
      });

      // Aggregate pending by product
      const pendingByProduct = new Map<string, { qty: number; bins: number; productName: string; productCode: string }>();
      (pendingCrates || []).forEach((c: any) => {
        const batch = batchMap.get(c.batch_id);
        if (!batch) return;
        const existing = pendingByProduct.get(batch.productId) || { qty: 0, bins: 0, productName: batch.productName, productCode: batch.productCode };
        pendingByProduct.set(batch.productId, {
          qty: existing.qty + (c.net_qty || 0),
          bins: existing.bins + 1,
          productName: batch.productName,
          productCode: batch.productCode,
        });
      });

      // Aggregate completed by product
      const completedByProduct = new Map<string, { qty: number; bins: number }>();
      (completedCrates || []).forEach((c: any) => {
        const batch = batchMap.get(c.batch_id);
        if (!batch) return;
        const existing = completedByProduct.get(batch.productId) || { qty: 0, bins: 0 };
        completedByProduct.set(batch.productId, {
          qty: existing.qty + (c.net_qty || 0),
          bins: existing.bins + 1,
        });
      });

      // Aggregate WIP from running machines (current shift production)
      const wipByProduct = new Map<string, number>();
      machines
        .filter(m => m.status === 'Running' && m.activeProductId)
        .forEach(m => {
          const pid = m.activeProductId!;
          wipByProduct.set(pid, (wipByProduct.get(pid) || 0) + (m.currentShiftProduction || 0));
        });

      // Merge all product IDs that have any stock
      const allProductIds = new Set<string>([
        ...pendingByProduct.keys(),
        ...completedByProduct.keys(),
        ...wipByProduct.keys(),
      ]);

      const stockList: ProductStock[] = [];
      allProductIds.forEach(productId => {
        const product = products.find(p => p.id === productId);
        const pendingInfo = pendingByProduct.get(productId);
        const completedInfo = completedByProduct.get(productId);
        const wipQty = wipByProduct.get(productId) || 0;

        const productName = product?.name
          || pendingInfo?.productName
          || (allBatchRecords || []).find((b: any) => b.product_id === productId)?.product_name
          || 'Unknown';
        const productCode = product?.itemCode || pendingInfo?.productCode || '';

        stockList.push({
          productId,
          productName,
          productCode,
          wipQty,
          pendingQty: pendingInfo?.qty || 0,
          pendingBins: pendingInfo?.bins || 0,
          inspectedQty: completedInfo?.qty || 0,
          inspectedBins: completedInfo?.bins || 0,
        });
      });

      setStockData(stockList);
      setLastRefresh(new Date());
    } catch (err) {
      console.error('StockPage fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [machines, products]);

  useEffect(() => {
    fetchStockData();
    const timer = setInterval(fetchStockData, 30000);
    return () => clearInterval(timer);
  }, [fetchStockData]);

  // Filter & sort
  const filteredData = stockData
    .filter(s => {
      if (!searchTerm) return true;
      const q = searchTerm.toLowerCase();
      return s.productName.toLowerCase().includes(q) || s.productCode.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      if (sortBy === 'name') return a.productName.localeCompare(b.productName);
      if (sortBy === 'pending') return b.pendingQty - a.pendingQty;
      if (sortBy === 'inspected') return b.inspectedQty - a.inspectedQty;
      if (sortBy === 'wip') return b.wipQty - a.wipQty;
      return 0;
    });

  // Totals
  const totalWip = stockData.reduce((s, p) => s + p.wipQty, 0);
  const totalPending = stockData.reduce((s, p) => s + p.pendingQty, 0);
  const totalPendingBins = stockData.reduce((s, p) => s + p.pendingBins, 0);
  const totalInspected = stockData.reduce((s, p) => s + p.inspectedQty, 0);
  const totalInspectedBins = stockData.reduce((s, p) => s + p.inspectedBins, 0);

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '32px' }}>
      {/* ── Page Header ── */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Package size={22} style={{ color: 'var(--blue)' }} />
              Stock Ledger
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '2px' }}>
              Product-wise WIP · Pending Inspection · Ready to Dispatch
            </div>
          </div>
          <button
            className="btn bsec bsm"
            onClick={fetchStockData}
            disabled={isLoading}
            style={{ height: '34px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '6px' }}>
          Last updated: {lastRefresh.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </div>
      </div>

      {/* ── Overall Summary Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        {/* WIP */}
        <div className="card" style={{ padding: '16px', borderLeft: '4px solid var(--amber)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <div style={{ background: 'var(--amber-bg)', borderRadius: '8px', padding: '6px', display: 'flex' }}>
              <Factory size={16} style={{ color: 'var(--amber)' }} />
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              In Production (WIP)
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--amber)', lineHeight: 1 }}>
            {isLoading ? '—' : formatQty(totalWip)}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px' }}>pcs · current shift</div>
        </div>

        {/* Pending */}
        <div className="card" style={{ padding: '16px', borderLeft: '4px solid #fb923c' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <div style={{ background: 'rgba(251,146,60,0.15)', borderRadius: '8px', padding: '6px', display: 'flex' }}>
              <Clock size={16} style={{ color: '#fb923c' }} />
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Pending Inspection
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, fontFamily: 'var(--mono)', color: '#fb923c', lineHeight: 1 }}>
            {isLoading ? '—' : formatQty(totalPending)}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px' }}>pcs · {totalPendingBins} bins</div>
        </div>

        {/* Ready to Dispatch */}
        <div className="card" style={{ padding: '16px', borderLeft: '4px solid var(--green)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <div style={{ background: 'var(--green-bg)', borderRadius: '8px', padding: '6px', display: 'flex' }}>
              <CheckCircle2 size={16} style={{ color: 'var(--green)' }} />
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Ready to Dispatch
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--green)', lineHeight: 1 }}>
            {isLoading ? '—' : formatQty(totalInspected)}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px' }}>pcs · {totalInspectedBins} bins</div>
        </div>
      </div>

      {/* ── Filters / Search ── */}
      <div className="card" style={{ padding: '16px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 220px' }}>
            <label className="fl" style={{ fontWeight: 700, marginBottom: '6px', display: 'block' }}>
              Search Product
            </label>
            <input
              type="text"
              className="fi"
              placeholder="Name or item code…"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>
          <div style={{ flex: '1 1 180px' }}>
            <label className="fl" style={{ fontWeight: 700, marginBottom: '6px', display: 'block' }}>
              Sort By
            </label>
            <select
              className="fi"
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
              style={{ width: '100%' }}
            >
              <option value="pending">Pending Qty ↓</option>
              <option value="inspected">Ready Qty ↓</option>
              <option value="wip">In Production Qty ↓</option>
              <option value="name">Product Name A–Z</option>
            </select>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text3)', paddingBottom: '8px' }}>
            <strong style={{ color: 'var(--text)' }}>{filteredData.length}</strong> of {stockData.length} products
          </div>
        </div>
      </div>

      {/* ── Table (Single unified view for all screen sizes) ── */}
      {isLoading ? (
        <div className="card" style={{ padding: '48px', textAlign: 'center' }}>
          <div style={{ fontSize: '13px', color: 'var(--text3)' }}>Loading stock data…</div>
        </div>
      ) : filteredData.length === 0 ? (
        <div className="card" style={{ padding: '48px', textAlign: 'center' }}>
          <Package size={40} style={{ color: 'var(--text3)', marginBottom: '12px' }} />
          <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '6px' }}>No stock data found</div>
          <div style={{ fontSize: '13px', color: 'var(--text3)' }}>
            {searchTerm ? 'No products match your search.' : 'No production or inspected bins recorded yet.'}
          </div>
        </div>
      ) : (
        <div className="card" style={{ overflowX: 'auto', padding: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
            <thead>
              <tr style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text3)', letterSpacing: '0.05em' }}>
                  Product
                </th>
                <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--amber)', letterSpacing: '0.05em' }}>
                  🏭 In Production
                </th>
                <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#fb923c', letterSpacing: '0.05em' }}>
                  ⏳ Pending Inspection
                </th>
                <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--green)', letterSpacing: '0.05em' }}>
                  ✅ Ready to Despatch
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredData.map((row, idx) => {
                const totalStock = row.wipQty + row.pendingQty + row.inspectedQty;
                const wipPct   = totalStock > 0 ? (row.wipQty / totalStock) * 100 : 0;
                const pendPct  = totalStock > 0 ? (row.pendingQty / totalStock) * 100 : 0;
                const inspPct  = totalStock > 0 ? (row.inspectedQty / totalStock) * 100 : 0;

                return (
                  <tr
                    key={row.productId}
                    style={{
                      borderBottom: '1px solid var(--border)',
                      background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg2)')}
                    onMouseLeave={e => (e.currentTarget.style.background = idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)')}
                  >
                    {/* Product */}
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ fontWeight: 600, fontSize: '13px' }}>{row.productName}</div>
                      {row.productCode && (
                        <div style={{ fontSize: '11px', color: 'var(--text3)', fontFamily: 'var(--mono)', marginTop: '2px' }}>
                          {row.productCode}
                        </div>
                      )}
                      {totalStock > 0 && (
                        <div style={{ display: 'flex', height: '3px', borderRadius: '2px', overflow: 'hidden', marginTop: '6px', gap: '1px' }}>
                          {wipPct  > 0 && <div style={{ flex: wipPct,  background: 'var(--amber)' }} />}
                          {pendPct > 0 && <div style={{ flex: pendPct, background: '#fb923c' }} />}
                          {inspPct > 0 && <div style={{ flex: inspPct, background: 'var(--green)' }} />}
                        </div>
                      )}
                    </td>

                    {/* WIP */}
                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      {row.wipQty > 0 ? (
                        <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: '14px', color: 'var(--amber)' }}>
                          {formatQty(row.wipQty)}{' '}
                          <span style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: 400 }}>pcs</span>
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text3)', fontSize: '12px' }}>—</span>
                      )}
                    </td>

                    {/* Pending */}
                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      {row.pendingQty > 0 ? (
                        <div>
                          <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: '14px', color: '#fb923c' }}>
                            {formatQty(row.pendingQty)}{' '}
                            <span style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: 400 }}>pcs</span>
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>
                            {row.pendingBins} bin{row.pendingBins !== 1 ? 's' : ''}
                          </div>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text3)', fontSize: '12px' }}>—</span>
                      )}
                    </td>

                    {/* Ready to Despatch */}
                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      {row.inspectedQty > 0 ? (
                        <div>
                          <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: '14px', color: 'var(--green)' }}>
                            {formatQty(row.inspectedQty)}{' '}
                            <span style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: 400 }}>pcs</span>
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>
                            {row.inspectedBins} bin{row.inspectedBins !== 1 ? 's' : ''}
                          </div>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text3)', fontSize: '12px' }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}

              {/* Totals row */}
              <tr style={{ background: 'var(--bg2)', borderTop: '2px solid var(--border2)' }}>
                <td style={{ padding: '12px 16px', fontWeight: 700, fontSize: '13px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <TrendingUp size={14} style={{ color: 'var(--blue)' }} />
                    TOTALS — {filteredData.length} product{filteredData.length !== 1 ? 's' : ''}
                  </div>
                </td>
                <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 800, fontSize: '14px', color: 'var(--amber)' }}>
                  {formatQty(filteredData.reduce((s, p) => s + p.wipQty, 0))}
                </td>
                <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 800, fontSize: '14px', color: '#fb923c' }}>
                  {formatQty(filteredData.reduce((s, p) => s + p.pendingQty, 0))}
                </td>
                <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 800, fontSize: '14px', color: 'var(--green)' }}>
                  {formatQty(filteredData.reduce((s, p) => s + p.inspectedQty, 0))}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Footer note */}
      <div style={{ marginTop: '16px', fontSize: '11px', color: 'var(--text3)', textAlign: 'center', lineHeight: 1.6 }}>
        🏭 <strong>In Production</strong> = current shift output &nbsp;·&nbsp;
        ⏳ <strong>Pending Inspection</strong> = all uncleared bins &nbsp;·&nbsp;
        ✅ <strong>Ready to Despatch</strong> = total inspected stock (all-time available)
      </div>
    </div>
  );
};

export default StockPage;
