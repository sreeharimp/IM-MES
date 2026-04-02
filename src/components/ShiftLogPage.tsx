import React, { useState, useEffect, useMemo } from 'react';
import { Search, Filter, ChevronLeft, ChevronRight, Activity, Wrench, ArrowLeftRight, X, RefreshCw, User, Package } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Machine, Operator, Product, Mould } from '../types';

type LogType = 'production' | 'breakdown' | 'handover' | 'personnel' | 'event' | 'crate';

interface UnifiedLog {
  id: string;
  type: LogType;
  timestamp: string;        // ISO string for sorting
  machineId?: string;
  machineName?: string;
  operatorId?: string;
  operatorName?: string;
  productName?: string;
  mouldId?: string;
  shiftId?: string;
  supervisorName?: string;
  summary: string;
  detail?: string;
  badge?: string;           // e.g. batch ID, 'Resolved', output qty
  badgeColor?: string;
}

interface ShiftLogPageProps {
  machines: Machine[];
  operators: Operator[];
  products: Product[];
  moulds: Mould[];
}

const PAGE_SIZE = 20;

const ShiftLogPage: React.FC<ShiftLogPageProps> = ({ machines, operators, products, moulds }) => {
  const [logs, setLogs] = useState<UnifiedLog[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterType, setFilterType] = useState<string>('all');
  const [filterMachine, setFilterMachine] = useState('');
  const [filterOperator, setFilterOperator] = useState('');
  const [filterProduct, setFilterProduct] = useState('');
  const [filterMould, setFilterMould] = useState('');
  const [filterShift, setFilterShift] = useState('');
  const [filterSupervisor, setFilterSupervisor] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [searchText, setSearchText] = useState('');
  const [page, setPage] = useState(1);

  const fetchLogs = async () => {
    setLoading(true);
    const unified: UnifiedLog[] = [];

    // 1. Batch Records
    const { data: batches } = await supabase.from('batch_records').select('*').order('start_time', { ascending: false });
    if (batches) {
      for (const b of batches) {
        const op = operators.find(o => o.id === b.operator_id);
        unified.push({
          id: `batch-${b.id}`,
          type: 'production',
          timestamp: b.start_time,
          machineId: b.machine_id,
          machineName: machines.find(m => m.id === b.machine_id)?.name || b.machine_id,
          operatorId: b.operator_id,
          operatorName: op?.name,
          productName: b.product_name,
          mouldId: b.mould_id,
          shiftId: undefined,
          summary: `Batch started: ${b.product_name}`,
          detail: `Crates: ${b.crates || 0} · Output: ${(b.total_output || 0).toLocaleString()} pcs`,
          badge: b.id,
          badgeColor: 'var(--purple)',
        });
        if (b.end_time) {
          unified.push({
            id: `batch-end-${b.id}`,
            type: 'production',
            timestamp: b.end_time,
            machineId: b.machine_id,
            machineName: machines.find(m => m.id === b.machine_id)?.name || b.machine_id,
            operatorId: b.operator_id,
            operatorName: op?.name,
            productName: b.product_name,
            mouldId: b.mould_id,
            summary: `Batch completed: ${b.product_name}`,
            detail: `Total: ${(b.total_output || 0).toLocaleString()} pcs · ${b.crates || 0} crates`,
            badge: `${(b.total_output || 0).toLocaleString()} pcs`,
            badgeColor: 'var(--green)',
          });
        }
      }
    }

    // 2. Breakdown Records
    const { data: breakdowns } = await supabase.from('breakdown_records').select('*').order('start_time', { ascending: false });
    if (breakdowns) {
      for (const br of breakdowns) {
        const op = operators.find(o => o.id === br.operator_id);
        unified.push({
          id: `breakdown-${br.id}`,
          type: 'breakdown',
          timestamp: br.start_time,
          machineId: br.machine_id,
          machineName: br.machine_name,
          operatorId: br.operator_id,
          operatorName: op?.name,
          supervisorName: br.supervisor_name,
          summary: `Breakdown: ${br.reason}`,
          detail: br.remarks,
          badge: br.status,
          badgeColor: br.status === 'Open' ? 'var(--red)' : 'var(--green)',
        });
        if (br.end_time) {
          unified.push({
            id: `breakdown-end-${br.id}`,
            type: 'breakdown',
            timestamp: br.end_time,
            machineId: br.machine_id,
            machineName: br.machine_name,
            summary: `Breakdown Resolved: ${br.reason}`,
            detail: `Downtime: ${br.duration_minutes}m`,
            badge: 'Resolved',
            badgeColor: 'var(--green)',
          });
        }
      }
    }

    // 3. Shift Summaries (Handovers)
    const { data: summaries } = await supabase.from('shift_summaries').select('*').order('handover_time', { ascending: false });
    if (summaries) {
      for (const s of summaries) {
        unified.push({
          id: `shift-${s.id}`,
          type: 'handover',
          timestamp: s.handover_time,
          shiftId: s.shift_id,
          supervisorName: s.supervisor_name,
          summary: `Shift ${s.shift_id} handover by ${s.supervisor_name}`,
          detail: `Output: ${(s.total_output || 0).toLocaleString()} pcs · Running: ${s.running_machines} machines · Pending crates: ${s.pending_crates}`,
          badge: `Shift ${s.shift_id}`,
          badgeColor: 'var(--amber)',
        });
      }
    }
    
    // 4. Individual Crates
    const knownCrates = new Set<string>();
    const { data: crateData } = await supabase.from('crates').select('*').order('end_time', { ascending: false });
    if (crateData) {
      for (const c of crateData) {
        const op = operators.find(o => o.id === c.operator_id);
        const machine = machines.find(m => m.id === c.machine_id);
        const batch = batches?.find(b => b.id === c.batch_id);
        
        knownCrates.add(`${c.machine_id}-${c.bin_number}`); // Use machine + bin as unique identifier for deduplication
        
        // Also use products list to get name as requested
        const product = products.find(p => p.id === batch?.product_id);

        unified.push({
          id: `crate-${c.id}`,
          type: 'crate',
          timestamp: c.end_time || c.start_time,
          machineId: c.machine_id,
          machineName: machine?.name || c.machine_id,
          operatorId: c.operator_id,
          operatorName: op?.name,
          summary: `${product?.name || batch?.product_name || 'Product'} · ${c.batch_id} · Bin #${c.bin_number} Completed`,
          detail: `Net Qty: ${c.net_qty} · Scrap: ${c.startup_scrap} · QC: ${c.qc_sample}`,
          badge: `Bin #${c.bin_number}`,
          badgeColor: 'var(--green)',
        });
      }
    }

    // 5. Activity Logs (Operator Assignments, Status Changes, etc.)
    const { data: activityLogs } = await supabase.from('activity_logs').select('*').order('timestamp', { ascending: false });
    if (activityLogs) {
      for (const al of activityLogs) {
        const op = operators.find(o => o.id === al.operator_id);
        const machine = machines.find(m => m.id === al.machine_id);
        
        if (al.event_type === 'Crate Completed') {
          // Fallback legacy parse: "Bin #13 completed for BOV TUBE (Batch: APBT26D01)"
          const match = al.details.match(/Bin #(\d+)(.*)for (.*?) \(Batch: (.*?)\)/);
          if (match) {
            const binNum = match[1];
            if (knownCrates.has(`${al.machine_id}-${binNum}`)) {
              continue; // Skip if already tracked by modern crates table
            }
            unified.push({
              id: `event-${al.id}`,
              type: 'crate',
              timestamp: al.timestamp,
              machineId: al.machine_id,
              machineName: machine?.name || al.machine_id,
              operatorId: al.operator_id,
              operatorName: op?.name,
              supervisorName: al.supervisor_name,
              summary: `${match[3].trim()} · ${match[4].trim()} · Bin #${match[1]} Completed`,
              detail: `Net Qty: ${al.qty || 'N/A'} (Legacy Record)`,
              badge: `Bin #${match[1]}`,
              badgeColor: 'var(--green)',
            });
            continue;
          }
        }

        let logType: LogType = 'event';
        let badgeColor = 'var(--purple)';

        if (al.event_type.toLowerCase().includes('started') || al.event_type.toLowerCase().includes('stopped')) {
          logType = 'production';
          badgeColor = al.event_type.toLowerCase().includes('started') ? 'var(--green)' : 'var(--red)';
        } else if (al.event_type.toLowerCase().includes('assigned')) {
          logType = 'personnel';
          badgeColor = 'var(--blue)';
        }

        unified.push({
          id: `event-${al.id}`,
          type: logType,
          timestamp: al.timestamp,
          machineId: al.machine_id,
          machineName: machine?.name || al.machine_id,
          operatorId: al.operator_id,
          operatorName: op?.name,
          supervisorName: al.supervisor_name,
          summary: al.event_type,
          detail: al.details,
          badge: al.qty ? `${al.qty.toLocaleString()} pcs` : al.event_type.split(' ')[1] || 'Info',
          badgeColor: badgeColor,
        });
      }
    }

    // Sort all by timestamp descending
    unified.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    setLogs(unified);
    setLoading(false);
  };

  // Fetch all data
  useEffect(() => {
    fetchLogs();
    
    // Subscribe to all relevant changes for real-time audit log
    const ch = supabase.channel('shift-log-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activity_logs' }, () => fetchLogs())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shift_summaries' }, () => fetchLogs())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'batch_records' }, () => fetchLogs())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crates' }, () => fetchLogs())
      .subscribe();
      
    return () => { supabase.removeChannel(ch); };
  }, [machines, operators]);

  // Apply filters
  const filtered = useMemo(() => {
    return logs.filter(log => {
      if (filterType !== 'all' && log.type !== filterType) return false;
      if (filterMachine && log.machineId !== filterMachine && log.type !== 'handover' && log.type !== 'event' && log.type !== 'personnel') return false;
      if (filterOperator && log.operatorId !== filterOperator) return false;
      if (filterProduct && !log.productName?.toLowerCase().includes(filterProduct.toLowerCase())) return false;
      if (filterMould && log.mouldId !== filterMould) return false;
      if (filterShift && log.shiftId !== filterShift) return false;
      if (filterSupervisor && !log.supervisorName?.toLowerCase().includes(filterSupervisor.toLowerCase())) return false;
      if (filterDateFrom && new Date(log.timestamp) < new Date(filterDateFrom)) return false;
      if (filterDateTo && new Date(log.timestamp) > new Date(filterDateTo + 'T23:59:59')) return false;
      if (searchText) {
        const q = searchText.toLowerCase();
        if (
          !log.summary.toLowerCase().includes(q) &&
          !log.machineName?.toLowerCase().includes(q) &&
          !log.operatorName?.toLowerCase().includes(q) &&
          !log.productName?.toLowerCase().includes(q) &&
          !log.supervisorName?.toLowerCase().includes(q) &&
          !log.badge?.toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [logs, filterType, filterMachine, filterOperator, filterProduct, filterMould, filterShift, filterSupervisor, filterDateFrom, filterDateTo, searchText]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const resetFilters = () => {
    setFilterType('all'); setFilterMachine(''); setFilterOperator('');
    setFilterProduct(''); setFilterMould(''); setFilterShift('');
    setFilterSupervisor(''); setFilterDateFrom(''); setFilterDateTo('');
    setSearchText(''); setPage(1);
  };

  const hasFilters = filterType !== 'all' || filterMachine || filterOperator || filterProduct ||
    filterMould || filterShift || filterSupervisor || filterDateFrom || filterDateTo || searchText;

  const typeIcon = (type: LogType, summary?: string) => {
    if (type === 'production') return <Activity size={13} color="var(--green)" />;
    if (type === 'breakdown') return <Wrench size={13} color="var(--red)" />;
    if (type === 'handover') return <ArrowLeftRight size={13} color="var(--amber)" />;
    if (type === 'crate') return <Package size={13} color="var(--green)" />;
    if (summary?.includes('Operator')) return <User size={13} color="var(--blue)" />;
    return <Activity size={13} color="var(--blue)" />;
  };

  const typeLabel = (type: LogType, summary?: string) => {
    if (type === 'production') return { label: 'Production', color: 'var(--green)', bg: 'var(--green-bg)', border: 'var(--green-dim)' };
    if (type === 'breakdown') return { label: 'Breakdown', color: 'var(--red)', bg: 'var(--red-bg)', border: 'var(--red-dim)' };
    if (type === 'handover') return { label: 'Handover', color: 'var(--amber)', bg: 'var(--amber-bg)', border: 'var(--amber-dim)' };
    if (type === 'crate') return { label: 'Crate', color: 'var(--purple)', bg: 'var(--purple-bg)', border: 'var(--purple-dim)' };
    if (type === 'personnel') return { label: 'Personnel', color: 'var(--blue)', bg: 'var(--blue-bg)', border: 'var(--blue-dim)' };
    if (summary?.includes('Operator')) return { label: 'Operator', color: 'var(--blue)', bg: 'var(--blue-bg)', border: 'var(--blue-dim)' };
    return { label: 'Event', color: 'var(--blue)', bg: 'var(--blue-bg)', border: 'var(--blue-dim)' };
  };

  const formatTs = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="animate-fade-in">
      {/* Header Summary */}
      <div className="mg" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: '14px' }}>
        <div className="mc2">
          <div className="ml">Total Events</div>
          <div className="mv">{logs.length}</div>
          <div className="ms">All time</div>
        </div>
        <div className="mc2">
          <div className="ml">Filtered</div>
          <div className="mv green">{filtered.length}</div>
          <div className="ms">Matching current filters</div>
        </div>
        <div className="mc2">
          <div className="ml">Page</div>
          <div className="mv">{page} <span style={{ fontSize: '14px', color: 'var(--text3)' }}>/ {totalPages}</span></div>
          <div className="ms">{PAGE_SIZE} per page</div>
        </div>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: '14px' }}>
        <div className="ch" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="ct2" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Filter size={13} /> Filters
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn bsm bpri" onClick={() => fetchLogs()} disabled={loading} title="Refresh Log Data">
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
            {hasFilters && (
              <button className="btn bsm" style={{ color: 'var(--amber)', fontSize: '11px', padding: '4px 10px' }} onClick={resetFilters}>
                <X size={12} /> Clear All
              </button>
            )}
          </div>
        </div>
        <div className="cb">
          {/* Row 1 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '8px', marginBottom: '8px' }}>
            <div>
              <label className="fl">Search</label>
              <div style={{ position: 'relative' }}>
                <Search size={13} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)', pointerEvents: 'none' }} />
                <input className="fi" placeholder="Keyword search..." value={searchText} onChange={e => { setSearchText(e.target.value); setPage(1); }} style={{ paddingLeft: '28px' }} />
              </div>
            </div>
            <div>
              <label className="fl">Event Type</label>
              <select className="fi" value={filterType} onChange={e => { setFilterType(e.target.value); setPage(1); }}>
                <option value="all">All Events</option>
                <option value="production">Production</option>
                <option value="personnel">Personnel</option>
                <option value="breakdown">Breakdown</option>
                <option value="handover">Handover</option>
                <option value="crate">Crates</option>
                <option value="event">System Events</option>
              </select>
            </div>
            <div>
              <label className="fl">Date From</label>
              <input type="date" className="fi" value={filterDateFrom} onChange={e => { setFilterDateFrom(e.target.value); setPage(1); }} />
            </div>
            <div>
              <label className="fl">Date To</label>
              <input type="date" className="fi" value={filterDateTo} onChange={e => { setFilterDateTo(e.target.value); setPage(1); }} />
            </div>
          </div>
          {/* Row 2 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: '8px' }}>
            <div>
              <label className="fl">Machine</label>
              <select className="fi" value={filterMachine} onChange={e => { setFilterMachine(e.target.value); setPage(1); }}>
                <option value="">All IDs</option>
                {machines.map(m => <option key={m.id} value={m.id}>{m.id}</option>)}
              </select>
            </div>
            <div>
              <label className="fl">Operator</label>
              <select className="fi" value={filterOperator} onChange={e => { setFilterOperator(e.target.value); setPage(1); }}>
                <option value="">All Operators</option>
                {operators.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
            <div>
              <label className="fl">Product</label>
              <input className="fi" placeholder="Product name..." value={filterProduct} onChange={e => { setFilterProduct(e.target.value); setPage(1); }} />
            </div>
            <div>
              <label className="fl">Mould</label>
              <select className="fi" value={filterMould} onChange={e => { setFilterMould(e.target.value); setPage(1); }}>
                <option value="">All Moulds</option>
                {moulds.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <label className="fl">Shift</label>
              <select className="fi" value={filterShift} onChange={e => { setFilterShift(e.target.value); setPage(1); }}>
                <option value="">All Shifts</option>
                <option value="A">Shift A</option>
                <option value="B">Shift B</option>
                <option value="C">Shift C</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Log Table */}
      <div className="card">
        <div className="ch">
          <span className="ct2">Activity Log</span>
          <span style={{ fontSize: '11px', color: 'var(--text3)' }}>{filtered.length} events</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text3)' }}>Loading...</div>
          ) : (
            <table className="dt">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Timestamp</th>
                  <th>Machine</th>
                  <th>Event</th>
                  <th>Operator</th>
                  <th>Supervisor</th>
                  <th>Details</th>
                  <th>Badge</th>
                </tr>
              </thead>
              <tbody>
                {paginated.length === 0 ? (
                  <tr><td colSpan={8} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text3)' }}>No events match the current filters.</td></tr>
                ) : paginated.map(log => {
                  const tl = typeLabel(log.type);
                  return (
                    <tr key={log.id}>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: 600, background: tl.bg, color: tl.color, border: `1px solid ${tl.border}`, whiteSpace: 'nowrap' }}>
                          {typeIcon(log.type, log.summary)} {tl.label}
                        </span>
                      </td>
                      <td className="mono" style={{ fontSize: '11px', color: 'var(--text3)', whiteSpace: 'nowrap' }}>{formatTs(log.timestamp)}</td>
                      <td style={{ fontSize: '12px' }}>{log.machineId ? <span className="tag tb">{log.machineId}</span> : <span style={{ color: 'var(--text3)' }}>—</span>}</td>
                      <td style={{ fontWeight: 500, fontSize: '12px' }}>{log.summary}</td>
                      <td style={{ fontSize: '11px', color: 'var(--text2)' }}>{log.operatorName || '—'}</td>
                      <td style={{ fontSize: '11px', color: 'var(--text2)' }}>{log.supervisorName || '—'}</td>
                      <td style={{ fontSize: '11px', color: 'var(--text3)', maxWidth: '220px' }}>{log.detail}</td>
                      <td>
                        {log.badge && (
                          <span className="mono" style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(0,0,0,0.2)', color: log.badgeColor, border: `1px solid ${log.badgeColor}40`, whiteSpace: 'nowrap' }}>
                            {log.badge}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', padding: '16px', borderTop: '1px solid var(--border)' }}>
            <button className="btn bsec" style={{ padding: '6px 12px' }} disabled={page === 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft size={14} />
            </button>
            <span style={{ fontSize: '12px', color: 'var(--text2)' }}>
              Page <strong>{page}</strong> of <strong>{totalPages}</strong>
            </span>
            <button className="btn bsec" style={{ padding: '6px 12px' }} disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ShiftLogPage;
