import React, { useState, useEffect, useMemo } from 'react';
import { Search, Filter, ChevronLeft, ChevronRight, Activity, Wrench, ArrowLeftRight, X, RefreshCw, User, Package } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Machine, Operator, Product, Mould } from '../types';

type LogType = 'production' | 'breakdown' | 'handover' | 'personnel' | 'event' | 'crate';

interface UnifiedLog {
  id: string;
  type: LogType;
  timestamp: string;
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
  badge?: string;
  badgeColor?: string;
}

interface ShiftLogPageProps {
  machines: Machine[];
  operators: Operator[];
  products: Product[];
  moulds: Mould[];
}

const PAGE_SIZE = 50;

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
  const [debouncedSearchText, setDebouncedSearchText] = useState('');
  const [page, setPage] = useState(1);

  // Debounce search text
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchText(searchText);
      setPage(1);
    }, 400);
    return () => clearTimeout(handler);
  }, [searchText]);

  const fetchLogs = React.useCallback(async () => {
    setLoading(true);
    const unified: UnifiedLog[] = [];

    try {
      // 1. Batch Records
      let batchQuery = supabase.from('batch_records').select('*');
      if (filterMachine) batchQuery = batchQuery.eq('machine_id', filterMachine);
      if (filterOperator) batchQuery = batchQuery.eq('operator_id', filterOperator);
      if (filterMould) batchQuery = batchQuery.eq('mould_id', filterMould);
      if (filterDateFrom) batchQuery = batchQuery.gte('start_time', filterDateFrom);
      if (filterDateTo) batchQuery = batchQuery.lte('start_time', filterDateTo + 'T23:59:59');
      
      const { data: batches } = await batchQuery
        .order('start_time', { ascending: false })
        .limit(100);

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
      let breakdownQuery = supabase.from('breakdown_records').select('*');
      if (filterMachine) breakdownQuery = breakdownQuery.eq('machine_id', filterMachine);
      if (filterOperator) breakdownQuery = breakdownQuery.eq('operator_id', filterOperator);
      if (filterSupervisor) breakdownQuery = breakdownQuery.ilike('supervisor_name', `%${filterSupervisor}%`);
      if (filterDateFrom) breakdownQuery = breakdownQuery.gte('start_time', filterDateFrom);
      if (filterDateTo) breakdownQuery = breakdownQuery.lte('start_time', filterDateTo + 'T23:59:59');

      const { data: breakdowns } = await breakdownQuery
        .order('start_time', { ascending: false })
        .limit(50);

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
      let summariesQuery = supabase.from('shift_summaries').select('*');
      if (filterShift) summariesQuery = summariesQuery.eq('shift_id', filterShift);
      if (filterSupervisor) summariesQuery = summariesQuery.ilike('supervisor_name', `%${filterSupervisor}%`);
      if (filterDateFrom) summariesQuery = summariesQuery.gte('handover_time', filterDateFrom);
      if (filterDateTo) summariesQuery = summariesQuery.lte('handover_time', filterDateTo + 'T23:59:59');

      const { data: summaries } = await summariesQuery
        .order('handover_time', { ascending: false })
        .limit(30);

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

          if (s.incoming_supervisor_name) {
            const takeoverTime = new Date(new Date(s.handover_time).getTime() + 1000).toISOString();
            unified.push({
              id: `shift-takeover-${s.id}`,
              type: 'handover',
              timestamp: takeoverTime,
              shiftId: s.shift_id,
              supervisorName: s.incoming_supervisor_name,
              summary: `Shift ${s.shift_id} takeover by ${s.incoming_supervisor_name}`,
              detail: `Acknowledged handover from ${s.supervisor_name}`,
              badge: `Shift ${s.shift_id}`,
              badgeColor: 'var(--green)',
            });
          }
        }
      }

      // 4. Individual Crates
      const knownCrates = new Set<string>();
      let cratesQuery = supabase.from('crates').select('*');
      if (filterMachine) cratesQuery = cratesQuery.eq('machine_id', filterMachine);
      if (filterOperator) cratesQuery = cratesQuery.eq('operator_id', filterOperator);
      if (filterShift) cratesQuery = cratesQuery.eq('shift_id', filterShift);
      if (filterDateFrom) cratesQuery = cratesQuery.gte('end_time', filterDateFrom);
      if (filterDateTo) cratesQuery = cratesQuery.lte('end_time', filterDateTo + 'T23:59:59');

      const { data: crateData } = await cratesQuery
        .order('end_time', { ascending: false })
        .limit(100);

      if (crateData) {
        for (const c of crateData) {
          const op = operators.find(o => o.id === c.operator_id);
          const machine = machines.find(m => m.id === c.machine_id);
          const batch = batches?.find(b => b.id === c.batch_id);
          knownCrates.add(`${c.machine_id}-${c.bin_number}`);
          const product = products.find(p => p.id === batch?.product_id);
          const rejStr = c.rejected_qty > 0 ? ` · Rej: ${c.rejected_qty}` : '';
          const opStr = op?.name ? ` · ${op.name}` : '';
          const insStr = c.inspected_by ? ` · QC: ${c.inspected_by}` : '';
          unified.push({
            id: `crate-${c.id}`,
            type: 'crate',
            timestamp: c.end_time || c.start_time,
            machineId: c.machine_id,
            machineName: machine?.name || c.machine_id,
            operatorId: c.operator_id,
            operatorName: op?.name,
            summary: `${product?.name || batch?.product_name || 'Product'} · Bin #${c.bin_number} Completed`,
            detail: `Net: ${c.net_qty}${rejStr}${opStr}${insStr}`,
            badge: `Bin #${c.bin_number}`,
            badgeColor: 'var(--green)',
          });
        }
      }

      // 5. Activity Logs
      let logsQuery = supabase.from('activity_logs').select('*');
      if (filterMachine) logsQuery = logsQuery.eq('machine_id', filterMachine);
      if (filterOperator) logsQuery = logsQuery.eq('operator_id', filterOperator);
      if (filterDateFrom) logsQuery = logsQuery.gte('timestamp', filterDateFrom);
      if (filterDateTo) logsQuery = logsQuery.lte('timestamp', filterDateTo + 'T23:59:59');

      const { data: activityLogs } = await logsQuery
        .order('timestamp', { ascending: false })
        .limit(150);

      if (activityLogs) {
        for (const al of activityLogs) {
          const op = operators.find(o => o.id === al.operator_id);
          const machine = machines.find(m => m.id === al.machine_id);

          if (al.event_type === 'Crate Completed') {
            const match = al.details.match(/Bin #(\d+)(.*)for (.*?) \(Batch: (.*?)\)/);
            if (match) {
              const binNum = match[1];
              if (knownCrates.has(`${al.machine_id}-${binNum}`)) continue;
              unified.push({
                id: `event-${al.id}`,
                type: 'crate',
                timestamp: al.timestamp,
                machineId: al.machine_id,
                machineName: machine?.name || al.machine_id,
                operatorId: al.operator_id,
                operatorName: op?.name,
                supervisorName: al.supervisor_name,
                summary: `${match[3].trim()} · Bin #${match[1]} Completed`,
                detail: `Net: ${al.qty || 'N/A'} (Legacy)`,
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
            operatorName: op?.employeeId ? `${op.name} (${op.employeeId})` : op?.name,
            supervisorName: al.supervisor_name,
            summary: al.event_type,
            detail: al.details,
            badge: al.qty ? `${al.qty.toLocaleString()} pcs` : al.event_type.split(' ')[1] || 'Info',
            badgeColor: badgeColor,
          });
        }
      }

      unified.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setLogs(unified);
    } catch (err) {
      console.error('Error fetching logs:', err);
    } finally {
      setLoading(false);
    }
  }, [machines, operators, products, filterMachine, filterOperator, filterMould, filterDateFrom, filterDateTo, filterShift, filterSupervisor]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

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
      if (debouncedSearchText) {
        const q = debouncedSearchText.toLowerCase();
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
  }, [logs, filterType, filterMachine, filterOperator, filterProduct, filterMould, filterShift, filterSupervisor, filterDateFrom, filterDateTo, debouncedSearchText]);

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

  const TYPE_META: Record<string, { label: string; color: string; bg: string; border: string; icon: React.ReactNode }> = {
    production: { label: 'Prod', color: 'var(--green)', bg: 'var(--green-bg)', border: 'var(--green-dim)', icon: <Activity size={10} /> },
    breakdown:  { label: 'Break', color: 'var(--red)', bg: 'var(--red-bg)', border: 'var(--red-dim)', icon: <Wrench size={10} /> },
    handover:   { label: 'Hndvr', color: 'var(--amber)', bg: 'var(--amber-bg)', border: 'var(--amber-dim)', icon: <ArrowLeftRight size={10} /> },
    crate:      { label: 'Crate', color: 'var(--purple)', bg: 'rgba(167,139,250,0.1)', border: 'rgba(167,139,250,0.25)', icon: <Package size={10} /> },
    personnel:  { label: 'Ops', color: 'var(--blue)', bg: 'var(--blue-bg)', border: 'var(--blue-dim)', icon: <User size={10} /> },
    event:      { label: 'Event', color: 'var(--blue)', bg: 'var(--blue-bg)', border: 'var(--blue-dim)', icon: <Activity size={10} /> },
  };

  const formatTs = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  const [showFilters, setShowFilters] = useState(false);

  const activeFilterCount = [filterType !== 'all', filterMachine, filterOperator, filterMould, filterShift, filterSupervisor, filterDateFrom, filterDateTo].filter(Boolean).length;

  const activeChips = [
    filterType !== 'all'  && { key: 'filterType',       label: `Type: ${filterType}`,          clear: () => { setFilterType('all'); setPage(1); } },
    filterMachine         && { key: 'filterMachine',    label: `Machine: ${filterMachine}`,     clear: () => { setFilterMachine(''); setPage(1); } },
    filterOperator        && { key: 'filterOperator',   label: `Op: ${operators.find(o => o.id === filterOperator)?.name || filterOperator}`, clear: () => { setFilterOperator(''); setPage(1); } },
    filterMould           && { key: 'filterMould',      label: `Mould: ${moulds.find(m => m.id === filterMould)?.name || filterMould}`, clear: () => { setFilterMould(''); setPage(1); } },
    filterShift           && { key: 'filterShift',      label: `Shift ${filterShift}`,          clear: () => { setFilterShift(''); setPage(1); } },
    filterSupervisor      && { key: 'filterSupervisor', label: `Sv: ${filterSupervisor}`,       clear: () => { setFilterSupervisor(''); setPage(1); } },
    filterDateFrom        && { key: 'filterDateFrom',   label: `From: ${filterDateFrom}`,       clear: () => { setFilterDateFrom(''); setPage(1); } },
    filterDateTo          && { key: 'filterDateTo',     label: `To: ${filterDateTo}`,           clear: () => { setFilterDateTo(''); setPage(1); } },
  ].filter(Boolean) as { key: string; label: string; clear: () => void }[];

  return (
    <div className="animate-fade-in">

      {/* ── Top bar: search + controls ── */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap' }}>
        {/* Search — always visible */}
        <div style={{ position: 'relative', flex: '1 1 160px', minWidth: '160px' }}>
          <Search size={12} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)', pointerEvents: 'none' }} />
          <input
            className="fi"
            placeholder="Search events, machines, operators…"
            value={searchText}
            onChange={e => { setSearchText(e.target.value); }}
            style={{ paddingLeft: '28px', height: '32px', fontSize: '12px' }}
          />
        </div>

        {/* Filters toggle */}
        <button
          className={`btn bsm ${showFilters ? 'bpri' : 'bsec'}`}
          onClick={() => setShowFilters(v => !v)}
          style={{ whiteSpace: 'nowrap', height: '32px', position: 'relative' }}
        >
          <Filter size={12} /> Filters
          {activeFilterCount > 0 && (
            <span style={{
              position: 'absolute', top: '-5px', right: '-6px',
              background: 'var(--amber)', color: '#000', borderRadius: '50%',
              width: '15px', height: '15px', fontSize: '8px', fontWeight: 800,
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>{activeFilterCount}</span>
          )}
        </button>

        {/* Refresh */}
        <button className="btn bsm bpri" onClick={() => fetchLogs()} disabled={loading} style={{ height: '32px' }}>
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>

        {/* Clear all */}
        {hasFilters && (
          <button className="btn bsm" onClick={resetFilters} style={{ color: 'var(--amber)', height: '32px' }}>
            <X size={12} /> Clear all
          </button>
        )}

        {/* Stat pills */}
        <div style={{ display: 'flex', gap: '6px', marginLeft: 'auto', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '10px', color: 'var(--text3)', padding: '4px 8px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', fontFamily: 'var(--mono)' }}>
            {filtered.length} / {logs.length} events
          </span>
          <span style={{ fontSize: '10px', color: 'var(--text3)', padding: '4px 8px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', fontFamily: 'var(--mono)' }}>
            Pg {page}/{totalPages}
          </span>
        </div>
      </div>

      {/* ── Active filter chips ── */}
      {activeChips.length > 0 && (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
          {activeChips.map(chip => (
            <span key={chip.key} style={{
              display: 'inline-flex', alignItems: 'center', gap: '4px',
              padding: '2px 8px', borderRadius: '20px', fontSize: '10px', fontWeight: 600,
              background: 'var(--blue-bg)', color: 'var(--blue)', border: '1px solid var(--blue-dim)'
            }}>
              {chip.label}
              <button onClick={chip.clear} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--blue)', padding: '0 0 0 2px', lineHeight: 1, display: 'flex' }}>
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* ── Collapsible advanced filter panel ── */}
      {showFilters && (
        <div className="card animate-fade-in" style={{ marginBottom: '10px' }}>
          <div className="cb" style={{ padding: '12px 14px' }}>
            <div className="sl-filter-grid">
              <div>
                <label className="fl" style={{ fontSize: '9px' }}>Event Type</label>
                <select className="fi" value={filterType} onChange={e => { setFilterType(e.target.value); setPage(1); }} style={{ height: '30px', fontSize: '11px' }}>
                  <option value="all">All Types</option>
                  <option value="production">Production</option>
                  <option value="personnel">Personnel</option>
                  <option value="breakdown">Breakdown</option>
                  <option value="handover">Handover</option>
                  <option value="crate">Crates</option>
                  <option value="event">System Events</option>
                </select>
              </div>
              <div>
                <label className="fl" style={{ fontSize: '9px' }}>Machine</label>
                <select className="fi" value={filterMachine} onChange={e => { setFilterMachine(e.target.value); setPage(1); }} style={{ height: '30px', fontSize: '11px' }}>
                  <option value="">All Machines</option>
                  {machines.map(m => <option key={m.id} value={m.id}>{m.id}</option>)}
                </select>
              </div>
              <div>
                <label className="fl" style={{ fontSize: '9px' }}>Operator</label>
                <select className="fi" value={filterOperator} onChange={e => { setFilterOperator(e.target.value); setPage(1); }} style={{ height: '30px', fontSize: '11px' }}>
                  <option value="">All Operators</option>
                  {operators.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
              <div>
                <label className="fl" style={{ fontSize: '9px' }}>Mould</label>
                <select className="fi" value={filterMould} onChange={e => { setFilterMould(e.target.value); setPage(1); }} style={{ height: '30px', fontSize: '11px' }}>
                  <option value="">All Moulds</option>
                  {moulds.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
              <div>
                <label className="fl" style={{ fontSize: '9px' }}>Shift</label>
                <select className="fi" value={filterShift} onChange={e => { setFilterShift(e.target.value); setPage(1); }} style={{ height: '30px', fontSize: '11px' }}>
                  <option value="">All Shifts</option>
                  <option value="A">Shift A</option>
                  <option value="B">Shift B</option>
                  <option value="C">Shift C</option>
                </select>
              </div>
              <div>
                <label className="fl" style={{ fontSize: '9px' }}>Supervisor</label>
                <input className="fi" placeholder="Name…" value={filterSupervisor} onChange={e => { setFilterSupervisor(e.target.value); setPage(1); }} style={{ height: '30px', fontSize: '11px' }} />
              </div>
              <div>
                <label className="fl" style={{ fontSize: '9px' }}>Date From</label>
                <input type="date" className="fi" value={filterDateFrom} onChange={e => { setFilterDateFrom(e.target.value); setPage(1); }} style={{ height: '30px', fontSize: '11px' }} />
              </div>
              <div>
                <label className="fl" style={{ fontSize: '9px' }}>Date To</label>
                <input type="date" className="fi" value={filterDateTo} onChange={e => { setFilterDateTo(e.target.value); setPage(1); }} style={{ height: '30px', fontSize: '11px' }} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Desktop table (hidden on mobile) ── */}
      <div className="card sl-desktop-only">
        <div style={{ overflowX: 'auto' }}>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text3)', fontSize: '12px' }}>Loading...</div>
          ) : (
            <table className="dt sl-table">
              <thead>
                <tr>
                  <th style={{ width: '52px' }}>Type</th>
                  <th style={{ width: '100px' }}>Time</th>
                  <th style={{ width: '52px' }}>Unit</th>
                  <th>Event · Details</th>
                  <th style={{ width: '120px' }}>Personnel</th>
                  <th style={{ width: '90px' }}>Badge</th>
                </tr>
              </thead>
              <tbody>
                {paginated.length === 0 ? (
                  <tr><td colSpan={6} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text3)' }}>No events match the current filters.</td></tr>
                ) : paginated.map(log => {
                  const tl = TYPE_META[log.type] || TYPE_META.event;
                  return (
                    <tr key={log.id} className="sl-row">
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '1px 5px', borderRadius: '8px', fontSize: '9px', fontWeight: 700, background: tl.bg, color: tl.color, border: `1px solid ${tl.border}`, whiteSpace: 'nowrap' }}>
                          {tl.icon} {tl.label}
                        </span>
                      </td>
                      <td className="mono" style={{ fontSize: '10px', color: 'var(--text3)', whiteSpace: 'nowrap' }}>{formatTs(log.timestamp)}</td>
                      <td>
                        {log.machineId
                          ? <span className="tag tb" style={{ fontSize: '9px', padding: '1px 5px' }}>{log.machineId}</span>
                          : <span style={{ color: 'var(--text3)', fontSize: '10px' }}>—</span>}
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: '11px', lineHeight: 1.3 }}>{log.summary}</div>
                        {log.detail && (
                          <div style={{ fontSize: '10px', color: 'var(--text3)', lineHeight: 1.2, marginTop: '1px', maxWidth: '380px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {log.detail}
                          </div>
                        )}
                      </td>
                      <td>
                        {log.operatorName && <div style={{ fontSize: '10px', color: 'var(--text2)', lineHeight: 1.2 }}><span style={{ color: 'var(--text3)', fontSize: '9px' }}>Op </span>{log.operatorName}</div>}
                        {log.supervisorName && <div style={{ fontSize: '10px', color: 'var(--amber)', lineHeight: 1.2 }}><span style={{ color: 'var(--text3)', fontSize: '9px' }}>Sv </span>{log.supervisorName}</div>}
                        {!log.operatorName && !log.supervisorName && <span style={{ color: 'var(--text3)', fontSize: '10px' }}>—</span>}
                      </td>
                      <td>
                        {log.badge && (
                          <span className="mono" style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '3px', background: 'rgba(0,0,0,0.2)', color: log.badgeColor, border: `1px solid ${log.badgeColor}40`, whiteSpace: 'nowrap' }}>
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

        {/* Desktop pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px', padding: '8px 16px', borderTop: '1px solid var(--border)' }}>
            <button className="btn bsec" style={{ padding: '4px 10px' }} disabled={page === 1} onClick={() => setPage(p => p - 1)}><ChevronLeft size={13} /></button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              const p = totalPages <= 7 ? i + 1 : page <= 4 ? i + 1 : page >= totalPages - 3 ? totalPages - 6 + i : page - 3 + i;
              return (
                <button key={p} onClick={() => setPage(p)} style={{ padding: '3px 8px', fontSize: '11px', border: '1px solid', borderColor: p === page ? 'var(--blue)' : 'var(--border)', background: p === page ? 'var(--blue)' : 'transparent', color: p === page ? '#fff' : 'var(--text2)', borderRadius: '4px', cursor: 'pointer', fontWeight: p === page ? 700 : 400 }}>
                  {p}
                </button>
              );
            })}
            <button className="btn bsec" style={{ padding: '4px 10px' }} disabled={page === totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight size={13} /></button>
          </div>
        )}
      </div>

      {/* ── Mobile card list (hidden on desktop) ── */}
      <div className="sl-mobile-only">
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text3)', fontSize: '12px' }}>Loading...</div>
        ) : paginated.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text3)', fontSize: '12px' }}>No events match the current filters.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {paginated.map(log => {
              const tl = TYPE_META[log.type] || TYPE_META.event;
              return (
                <div key={log.id} style={{
                  background: 'var(--bg2)',
                  border: '1px solid var(--border)',
                  borderLeft: `3px solid ${tl.color}`,
                  borderRadius: '6px',
                  padding: '8px 10px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '3px',
                }}>
                  {/* Row 1: type pill + machine tag + timestamp */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '1px 6px', borderRadius: '8px', fontSize: '9px', fontWeight: 700, background: tl.bg, color: tl.color, border: `1px solid ${tl.border}` }}>
                      {tl.icon} {tl.label}
                    </span>
                    {log.machineId && (
                      <span className="tag tb" style={{ fontSize: '9px', padding: '1px 5px' }}>{log.machineId}</span>
                    )}
                    {log.badge && (
                      <span className="mono" style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '3px', background: 'rgba(0,0,0,0.2)', color: log.badgeColor, border: `1px solid ${log.badgeColor}40` }}>
                        {log.badge}
                      </span>
                    )}
                    <span className="mono" style={{ fontSize: '9px', color: 'var(--text3)', marginLeft: 'auto' }}>
                      {formatTs(log.timestamp)}
                    </span>
                  </div>
                  {/* Row 2: event summary */}
                  <div style={{ fontWeight: 600, fontSize: '12px', color: 'var(--text)', lineHeight: 1.3 }}>{log.summary}</div>
                  {/* Row 3: detail (if any) */}
                  {log.detail && (
                    <div style={{ fontSize: '10px', color: 'var(--text3)', lineHeight: 1.3 }}>{log.detail}</div>
                  )}
                  {/* Row 4: personnel */}
                  {(log.operatorName || log.supervisorName) && (
                    <div style={{ display: 'flex', gap: '10px', marginTop: '1px' }}>
                      {log.operatorName && (
                        <span style={{ fontSize: '10px', color: 'var(--text2)' }}>
                          <span style={{ color: 'var(--text3)', fontSize: '9px' }}>Op </span>{log.operatorName}
                        </span>
                      )}
                      {log.supervisorName && (
                        <span style={{ fontSize: '10px', color: 'var(--amber)' }}>
                          <span style={{ color: 'var(--text3)', fontSize: '9px' }}>Sv </span>{log.supervisorName}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Mobile pagination — simple prev/next */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', padding: '0 2px' }}>
            <button className="btn bsec bsm" disabled={page === 1} onClick={() => setPage(p => p - 1)} style={{ flex: 1, marginRight: '8px' }}>
              <ChevronLeft size={13} /> Prev
            </button>
            <span style={{ fontSize: '11px', color: 'var(--text3)', whiteSpace: 'nowrap' }}>
              {page} / {totalPages}
            </span>
            <button className="btn bsec bsm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)} style={{ flex: 1, marginLeft: '8px' }}>
              Next <ChevronRight size={13} />
            </button>
          </div>
        )}
      </div>

      <style>{`
        /* Filter grid */
        .sl-filter-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 8px;
        }
        /* Desktop table tweaks */
        .sl-table thead th {
          padding: 6px 8px !important;
          font-size: 9px !important;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .sl-row td {
          padding: 4px 8px !important;
          border-bottom: 1px solid rgba(255,255,255,0.03) !important;
          vertical-align: middle;
        }
        .sl-row:hover td { background: var(--bg3) !important; }

        /* Visibility: desktop shows table, hides cards */
        .sl-desktop-only { display: block; }
        .sl-mobile-only  { display: none; }

        /* Mobile: hide table, show cards */
        @media (max-width: 768px) {
          .sl-desktop-only { display: none !important; }
          .sl-mobile-only  { display: block; }
          .sl-filter-grid  { grid-template-columns: repeat(2, 1fr); }
        }
      `}</style>
    </div>
  );
};

export default ShiftLogPage;
