import React, { useState, useEffect, useMemo } from 'react';
import { 
  Factory, AlertTriangle, AlertCircle, 
  Clock, User, ShieldCheck, RefreshCw, Box, Cpu, 
  Search, ClipboardCheck, Edit2
} from 'lucide-react';
import type { Machine, Product, Operator, Mould, RawMaterial, BatchRecord, AppSettings, ShiftSetting } from '../types';
import { supabase } from '../lib/supabase';

interface LiveDashboardPageProps {
  machines: Machine[];
  products: Product[];
  operators: Operator[];
  moulds: Mould[];
  rawMaterials: RawMaterial[];
  batchRecords: BatchRecord[];
  appSettings?: AppSettings | null;
  shiftSettings: ShiftSetting[];
  currentUserRole?: string;
  currentSupervisorName?: string;
  onEditBin?: (machineId: string) => void;
}

interface TodayInspectedCrate {
  id: string;
  batch_id: string;
  machine_id: string;
  bin_number: number;
  shift_id: string;
  start_time: string;
  end_time: string;
  net_qty: number;
  rejected_qty: number;
  rejection_details?: Record<string, number>;
  operator_id?: string;
  supervisor_id?: string;
  inspected_by?: string;
  inspected_at?: string;
}

interface ProductShiftStat {
  productId: string;
  productName: string;
  itemCode: string;
  shifts: Record<string, {
    binsCount: number;
    goodQty: number;
    rejectedQty: number;
  }>;
  totalBins: number;
  totalGood: number;
  totalRejected: number;
}

export const LiveDashboardPage: React.FC<LiveDashboardPageProps> = ({
  machines,
  products,
  operators,
  moulds,
  rawMaterials,
  batchRecords,
  appSettings,
  shiftSettings,
  currentUserRole: _currentUserRole,
  currentSupervisorName,
  onEditBin
}) => {
  const [machineFilter, setMachineFilter] = useState<'All' | 'Running' | 'Idle' | 'Maintenance'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedShiftFilter, setSelectedShiftFilter] = useState<string>('All');
  const [todayInspections, setTodayInspections] = useState<TodayInspectedCrate[]>([]);
  const [isLoadingInspections, setIsLoadingInspections] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [currentTime, setCurrentTime] = useState<string>(new Date().toLocaleTimeString());

  // Real-time clock for elapsed indicators
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch today's completed inspections from Supabase
  const fetchTodayInspections = async () => {
    setIsLoadingInspections(true);
    try {
      const todayDateStr = new Date().toISOString().split('T')[0];
      const todayStart = `${todayDateStr}T00:00:00`;

      const { data, error } = await supabase
        .from('crates')
        .select('*')
        .eq('status', 'Completed')
        .or(`inspected_at.gte.${todayStart},end_time.gte.${todayStart}`)
        .order('inspected_at', { ascending: false });

      if (error) {
        console.error('Error fetching today inspections:', error);
      } else if (data) {
        setTodayInspections(data as TodayInspectedCrate[]);
      }
      setLastRefreshed(new Date());
    } catch (err) {
      console.error('Fetch today inspections error:', err);
    } finally {
      setIsLoadingInspections(false);
    }
  };

  // Initial fetch and Realtime subscription for crates table
  useEffect(() => {
    fetchTodayInspections();

    const channel = supabase.channel('live_dashboard_crates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crates' }, () => {
        fetchTodayInspections();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Fleet Statistics
  const totalMachines = machines.length;
  const runningMachines = machines.filter(m => m.status === 'Running').length;
  const idleMachines = machines.filter(m => m.status === 'Idle').length;
  const downMachines = machines.filter(m => m.status === 'Maintenance').length;
  const activeUtilization = totalMachines > 0 ? Math.round((runningMachines / totalMachines) * 100) : 0;
  const assignedOperators = machines.filter(m => !!m.currentOperatorId).length;

  // Filtered Machines
  const filteredMachines = useMemo(() => {
    return machines.filter(m => {
      const matchesStatus = machineFilter === 'All' ? true : m.status === machineFilter;
      if (!matchesStatus) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const p = products.find(prod => prod.id === m.activeProductId);
      const op = operators.find(o => o.id === m.currentOperatorId);

      return (
        m.id.toLowerCase().includes(q) ||
        m.name.toLowerCase().includes(q) ||
        (p?.name && p.name.toLowerCase().includes(q)) ||
        (p?.itemCode && p.itemCode.toLowerCase().includes(q)) ||
        (op?.name && op.name.toLowerCase().includes(q)) ||
        (m.materialGrade && m.materialGrade.toLowerCase().includes(q)) ||
        (m.activeBatchId && m.activeBatchId.toLowerCase().includes(q))
      );
    });
  }, [machines, machineFilter, searchQuery, products, operators]);

  // Aggregate today's inspections by product and shift
  const { productStats, totals, defectStats } = useMemo(() => {
    const shiftIds = shiftSettings.length > 0 ? shiftSettings.map(s => s.id) : ['A', 'B', 'C'];
    const pMap: Record<string, ProductShiftStat> = {};
    const defectsMap: Record<string, number> = {};

    let totalBins = 0;
    let totalGood = 0;
    let totalRej = 0;

    const shiftTotals: Record<string, { bins: number; good: number; rej: number }> = {};
    shiftIds.forEach(sid => {
      shiftTotals[sid] = { bins: 0, good: 0, rej: 0 };
    });

    todayInspections.forEach(crate => {
      // Find matching product from batch
      const batch = batchRecords.find(b => b.id === crate.batch_id);
      const prod = products.find(p => p.id === batch?.productId) || 
                   products.find(p => p.name === batch?.productName);

      const pId = prod?.id || batch?.productId || 'UNKNOWN';
      const pName = prod?.name || batch?.productName || 'Unassigned Product';
      const pCode = prod?.itemCode || batch?.productCode || 'N/A';

      if (!pMap[pId]) {
        pMap[pId] = {
          productId: pId,
          productName: pName,
          itemCode: pCode,
          shifts: {},
          totalBins: 0,
          totalGood: 0,
          totalRejected: 0
        };
        shiftIds.forEach(sid => {
          pMap[pId].shifts[sid] = { binsCount: 0, goodQty: 0, rejectedQty: 0 };
        });
      }

      const sId = crate.shift_id || appSettings?.currentShift || 'A';
      if (!pMap[pId].shifts[sId]) {
        pMap[pId].shifts[sId] = { binsCount: 0, goodQty: 0, rejectedQty: 0 };
      }

      const good = crate.net_qty || 0;
      const rej = crate.rejected_qty || 0;

      pMap[pId].shifts[sId].binsCount += 1;
      pMap[pId].shifts[sId].goodQty += good;
      pMap[pId].shifts[sId].rejectedQty += rej;

      pMap[pId].totalBins += 1;
      pMap[pId].totalGood += good;
      pMap[pId].totalRejected += rej;

      totalBins += 1;
      totalGood += good;
      totalRej += rej;

      if (!shiftTotals[sId]) {
        shiftTotals[sId] = { bins: 0, good: 0, rej: 0 };
      }
      shiftTotals[sId].bins += 1;
      shiftTotals[sId].good += good;
      shiftTotals[sId].rej += rej;

      // Defect breakdown
      if (crate.rejection_details) {
        Object.entries(crate.rejection_details).forEach(([reason, count]) => {
          if (typeof count === 'number' && count > 0) {
            defectsMap[reason] = (defectsMap[reason] || 0) + count;
          }
        });
      }
    });

    const productList = Object.values(pMap).sort((a, b) => b.totalGood - a.totalGood);
    const defectList = Object.entries(defectsMap)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count);

    return {
      productStats: productList,
      totals: {
        totalBins,
        totalGood,
        totalRej,
        totalInspectedUnits: totalGood + totalRej,
        passRate: (totalGood + totalRej) > 0 ? ((totalGood / (totalGood + totalRej)) * 100).toFixed(1) : '100.0',
        shiftTotals
      },
      defectStats: defectList
    };
  }, [todayInspections, products, batchRecords, shiftSettings, appSettings?.currentShift]);

  const activeSupervisorDisplay = currentSupervisorName || appSettings?.activeSupervisorName || 'On Duty';

  return (
    <div className="animate-fade-in" style={{ padding: '4px 0 30px 0' }}>
      {/* ── TOP LIVE HEADER ── */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(20, 23, 32, 0.95) 0%, rgba(30, 36, 50, 0.95) 100%)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        padding: '16px 20px',
        marginBottom: '20px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: 'var(--green)',
              boxShadow: '0 0 10px var(--green)',
              animation: 'pulse 1.5s infinite'
            }} />
            <h1 style={{ fontSize: '20px', fontWeight: 800, margin: 0, letterSpacing: '-0.02em', color: 'var(--text)' }}>
              Live Plant Operations Dashboard
            </h1>
            <span className="pill pg" style={{ fontSize: '10px', padding: '2px 8px', fontWeight: 700 }}>
              S-{appSettings?.currentShift || 'A'}
            </span>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text2)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span>Supervisor: <strong style={{ color: 'var(--blue)' }}>{activeSupervisorDisplay}</strong></span>
            <span>•</span>
            <span>Live Clock: <strong className="mono" style={{ color: 'var(--text)' }}>{currentTime}</strong></span>
            <span>•</span>
            <span>Synced: <strong className="mono">{lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</strong></span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button 
            className="btn bsm bsec" 
            onClick={fetchTodayInspections}
            disabled={isLoadingInspections}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', height: '34px' }}
          >
            <RefreshCw size={13} className={isLoadingInspections ? 'animate-spin' : ''} />
            <span>{isLoadingInspections ? 'Refreshing...' : 'Refresh Live Data'}</span>
          </button>
        </div>
      </div>


      {/* ── FLEET KPI SUMMARY CARDS ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
        gap: '12px',
        marginBottom: '24px'
      }}>
        <div className="card" style={{ padding: '14px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text3)' }}>Total Fleet</span>
            <Factory size={16} style={{ color: 'var(--text3)' }} />
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, marginTop: '8px', color: 'var(--text)', fontFamily: 'var(--mono)' }}>
            {totalMachines}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text2)', marginTop: '4px' }}>
            {assignedOperators} with operators
          </div>
        </div>

        <div className="card" style={{ padding: '14px', background: 'rgba(0, 214, 143, 0.05)', border: '1px solid rgba(0, 214, 143, 0.25)', borderRadius: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--green)' }}>Running Machines</span>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--green)', boxShadow: '0 0 8px var(--green)' }} />
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, marginTop: '8px', color: 'var(--green)', fontFamily: 'var(--mono)' }}>
            {runningMachines}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text2)', marginTop: '4px' }}>
            {activeUtilization}% fleet utilization
          </div>
        </div>

        <div className="card" style={{ padding: '14px', background: 'rgba(245, 166, 35, 0.05)', border: '1px solid rgba(245, 166, 35, 0.25)', borderRadius: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--amber)' }}>Idle Machines</span>
            <Clock size={16} style={{ color: 'var(--amber)' }} />
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, marginTop: '8px', color: 'var(--amber)', fontFamily: 'var(--mono)' }}>
            {idleMachines}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text2)', marginTop: '4px' }}>
            Ready for setup / mould load
          </div>
        </div>

        <div className="card" style={{ padding: '14px', background: 'rgba(255, 77, 77, 0.05)', border: '1px solid rgba(255, 77, 77, 0.25)', borderRadius: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--red)' }}>Breakdown / Maint</span>
            <AlertTriangle size={16} style={{ color: 'var(--red)' }} />
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, marginTop: '8px', color: 'var(--red)', fontFamily: 'var(--mono)' }}>
            {downMachines}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text2)', marginTop: '4px' }}>
            Active stoppage reports
          </div>
        </div>

        <div className="card" style={{ padding: '14px', background: 'rgba(77, 159, 255, 0.05)', border: '1px solid rgba(77, 159, 255, 0.25)', borderRadius: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--blue)' }}>QC Passed Today</span>
            <ShieldCheck size={16} style={{ color: 'var(--blue)' }} />
          </div>
          <div style={{ fontSize: '24px', fontWeight: 800, marginTop: '8px', color: 'var(--blue)', fontFamily: 'var(--mono)' }}>
            {totals.passRate}%
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text2)', marginTop: '4px' }}>
            {totals.totalGood.toLocaleString()} pcs cleared
          </div>
        </div>
      </div>

      {/* ── SECTION 1: LIVE MACHINE CARDS ── */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text)' }}>
              <Cpu size={18} style={{ color: 'var(--blue)' }} />
              Live Machine Fleet Status
            </h2>
            <div style={{ fontSize: '12px', color: 'var(--text3)' }}>
              Real-time monitor of machine cycle, current operator, active batch & live bin count
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
            {/* Search filter */}
            <div style={{ position: 'relative', width: '220px' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text3)' }} />
              <input
                type="text"
                className="fi"
                placeholder="Search machine, product..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ paddingLeft: '32px', height: '32px', fontSize: '11px' }}
              />
            </div>

            {/* Status Filter buttons */}
            <div style={{ display: 'flex', background: 'var(--bg3)', borderRadius: '6px', border: '1px solid var(--border)', padding: '2px' }}>
              {(['All', 'Running', 'Idle', 'Maintenance'] as const).map(st => (
                <button
                  key={st}
                  onClick={() => setMachineFilter(st)}
                  style={{
                    padding: '4px 10px',
                    fontSize: '11px',
                    fontWeight: 600,
                    borderRadius: '4px',
                    border: 'none',
                    background: machineFilter === st ? 'var(--blue)' : 'transparent',
                    color: machineFilter === st ? '#ffffff' : 'var(--text2)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {st} {st === 'All' ? `(${totalMachines})` : st === 'Running' ? `(${runningMachines})` : st === 'Idle' ? `(${idleMachines})` : `(${downMachines})`}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Machine Cards Grid */}
        {filteredMachines.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', background: 'var(--bg2)', borderRadius: '10px', border: '1px dashed var(--border)', color: 'var(--text3)' }}>
            No machines matched your current filter criteria.
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: '14px'
          }}>
            {filteredMachines.map(m => {
              const prod = products.find(p => p.id === m.activeProductId);
              const op = operators.find(o => o.id === m.currentOperatorId);
              const mld = moulds.find(mo => mo.id === m.currentMouldId);
              const rm = rawMaterials.find(r => r.id === m.currentMaterialId);
              const rmDisplay = rm?.name || m.materialGrade || 'Standard Material';

              // Status flags
              const isRunning = m.status === 'Running';
              const isDown = m.status === 'Maintenance';

              // Batch Target Calculation
              const target = m.binTarget || prod?.binQty || 1000;
              const binElapsedSeconds = (isRunning && m.binStartTime) 
                ? Math.floor((Date.now() - m.binStartTime) / 1000) 
                : 0;
              const cycleTime = mld?.cycleTime || 60;
              const estCurrentBinQty = (isRunning && mld?.cycleTime)
                ? Math.min(target, Math.floor(binElapsedSeconds / cycleTime) * (mld.cavities || 1))
                : 0;
              const binProgressPct = target > 0 ? Math.min(100, Math.round((estCurrentBinQty / target) * 100)) : 0;

              // Down duration
              const downDurationMin = (isDown && m.breakdownStartTime)
                ? Math.floor((Date.now() - m.breakdownStartTime) / 60000)
                : 0;

              return (
                <div
                  key={m.id}
                  className="card"
                  style={{
                    background: 'var(--bg2)',
                    borderRadius: '10px',
                    border: `1px solid ${isRunning ? 'rgba(0, 214, 143, 0.6)' : isDown ? 'rgba(255, 77, 77, 0.6)' : 'rgba(245, 166, 35, 0.6)'}`,
                    boxShadow: isRunning ? '0 4px 14px rgba(0, 214, 143, 0.12)' : isDown ? '0 4px 14px rgba(255, 77, 77, 0.12)' : '0 4px 14px rgba(245, 166, 35, 0.12)',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    transition: 'transform 0.15s ease, box-shadow 0.15s ease'
                  }}
                >
                  {/* Card Header */}
                  <div style={{
                    padding: '10px 14px',
                    background: 'var(--bg3)',
                    borderBottom: '1px solid var(--border)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: isRunning ? 'var(--green)' : isDown ? 'var(--red)' : 'var(--amber)',
                        boxShadow: isRunning ? '0 0 6px var(--green)' : isDown ? '0 0 6px var(--red)' : 'none'
                      }} />
                      <span className="mono" style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text)' }}>
                        {m.id}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--text3)' }}>
                        {m.name}
                      </span>
                    </div>

                    <span 
                      className={`pill ${isRunning ? 'pg' : isDown ? 'pr' : 'pa'}`}
                      style={{ fontSize: '10px', padding: '2px 8px', fontWeight: 700 }}
                    >
                      {isRunning ? 'RUNNING' : isDown ? 'BREAKDOWN' : 'IDLE'}
                    </span>
                  </div>

                  {/* Card Body */}
                  <div style={{ padding: '12px 14px', flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {/* Product & Mould */}
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)', lineHeight: 1.2 }}>
                          {prod?.name || 'No Product Loaded'}
                        </div>
                        <div className="tag tl" style={{ fontSize: '10px', padding: '2px 6px', background: 'var(--blue-dim, rgba(77,159,255,0.1))', color: 'var(--blue)', border: '1px solid rgba(77,159,255,0.2)' }}>
                          {m.activeBatchId || 'NO BATCH'}
                        </div>
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>Item Code: <strong className="mono" style={{ color: 'var(--text2)' }}>{prod?.itemCode || 'N/A'}</strong></span>
                        <span>•</span>
                        <span>Mould: <strong style={{ color: 'var(--text2)' }}>{mld?.name || 'N/A'} ({mld?.cavities || 1}C)</strong></span>
                      </div>
                    </div>

                    {/* Batch & Bin Production Status */}
                    <div style={{
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      padding: '8px 10px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Box size={13} style={{ color: 'var(--blue)' }} />
                          <span 
                            style={{ 
                              fontSize: '11px', 
                              fontWeight: 700, 
                              color: 'var(--text)',
                              cursor: onEditBin ? 'pointer' : 'default',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px'
                            }}
                            onClick={() => onEditBin && onEditBin(m.id)}
                            title={onEditBin ? "Click to set current bin number" : undefined}
                          >
                            Bin #{m.currentBinNumber || 1}
                            {onEditBin && <Edit2 size={10} style={{ opacity: 0.7, color: 'var(--blue)' }} />}
                          </span>
                          <span className="mono" style={{ fontSize: '10px', color: 'var(--text3)' }}>
                            ({m.activeBatchId || 'NO BATCH'})
                          </span>
                        </div>
                        <span className="mono" style={{ fontSize: '11px', fontWeight: 700, color: isRunning ? 'var(--green)' : 'var(--text2)' }}>
                          {estCurrentBinQty} / {target} pcs
                        </span>
                      </div>

                      {/* Bin Progress Bar */}
                      <div style={{ width: '100%', height: '6px', background: 'var(--bg)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{
                          width: `${binProgressPct}%`,
                          height: '100%',
                          background: isRunning ? 'linear-gradient(90deg, var(--green-dim), var(--green))' : 'var(--amber)',
                          borderRadius: '3px',
                          transition: 'width 0.3s ease'
                        }} />
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text3)', marginTop: '4px' }}>
                        <span>Shift Total: <strong style={{ color: 'var(--text2)' }}>{m.currentShiftProduction || 0} pcs</strong></span>
                        <span>Bin Progress: <strong style={{ color: 'var(--text2)' }}>{binProgressPct}%</strong></span>
                      </div>
                    </div>

                    {/* Operator & Supervisor Details */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '8px',
                      paddingTop: '6px',
                      borderTop: '1px solid var(--border)',
                      fontSize: '11px'
                    }}>
                      <div>
                        <div style={{ color: 'var(--text3)', fontSize: '10px', textTransform: 'uppercase', fontWeight: 600 }}>
                          Operator
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px', fontWeight: 600, color: 'var(--text)' }}>
                          <User size={12} style={{ color: op ? 'var(--green)' : 'var(--text3)' }} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {op ? op.name : 'Unassigned'}
                          </span>
                        </div>
                        {op?.employeeId && (
                          <div className="mono" style={{ fontSize: '9px', color: 'var(--text3)' }}>
                            ID: {op.employeeId}
                          </div>
                        )}
                      </div>

                      <div>
                        <div style={{ color: 'var(--text3)', fontSize: '10px', textTransform: 'uppercase', fontWeight: 600 }}>
                          Supervisor
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px', fontWeight: 600, color: 'var(--text)' }}>
                          <ShieldCheck size={12} style={{ color: 'var(--blue)' }} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {activeSupervisorDisplay}
                          </span>
                        </div>
                        <div style={{ fontSize: '9px', color: 'var(--text3)' }}>
                          Shift S-{appSettings?.currentShift || 'A'}
                        </div>
                      </div>
                    </div>

                    {/* Raw Material Traceability */}
                    <div style={{
                      fontSize: '10px',
                      color: 'var(--text3)',
                      background: 'rgba(255,255,255,0.02)',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <span>RM: <strong style={{ color: 'var(--text2)' }}>{rmDisplay}</strong></span>
                      <span>Lot: <strong className="mono" style={{ color: 'var(--text2)' }}>{m.materialBatch || 'Standard Lot'}</strong></span>
                    </div>

                    {/* Live Timing Indicator */}
                    {isRunning && (
                      <div style={{ fontSize: '10px', color: 'var(--green)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--green)' }} />
                        <span>Active Bin Time: <strong>{Math.floor(binElapsedSeconds / 60)}m {binElapsedSeconds % 60}s</strong></span>
                      </div>
                    )}
                    {isDown && (
                      <div style={{ fontSize: '10px', color: 'var(--red)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <AlertCircle size={11} />
                        <span>Machine Down for: <strong>{downDurationMin} minutes</strong></span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── SECTION 2: TODAY'S QC INSPECTION STATISTICS ── */}
      <div style={{
        background: 'var(--bg2)',
        borderRadius: '12px',
        border: '1px solid var(--border)',
        padding: '20px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.25)'
      }}>
        {/* Section Header */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '14px',
          borderBottom: '1px solid var(--border)',
          paddingBottom: '16px',
          marginBottom: '20px'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ClipboardCheck size={20} style={{ color: 'var(--blue)' }} />
              <h2 style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: 'var(--text)' }}>
                Today's Inspection Statistics
              </h2>
              <span className="pill pb" style={{ fontSize: '10px', fontWeight: 700 }}>
                {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
              </span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '2px' }}>
              Per-shift breakdown of inspected crates, good production quantity, and scrap rates for each product
            </div>
          </div>

          {/* Shift selector pills */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11px', color: 'var(--text3)', fontWeight: 600 }}>Filter Shift:</span>
            <div style={{ display: 'flex', background: 'var(--bg3)', borderRadius: '6px', border: '1px solid var(--border)', padding: '2px' }}>
              {['All', 'A', 'B', 'C'].map(s => (
                <button
                  key={s}
                  onClick={() => setSelectedShiftFilter(s)}
                  style={{
                    padding: '4px 10px',
                    fontSize: '11px',
                    fontWeight: 600,
                    borderRadius: '4px',
                    border: 'none',
                    background: selectedShiftFilter === s ? 'var(--blue)' : 'transparent',
                    color: selectedShiftFilter === s ? '#ffffff' : 'var(--text2)',
                    cursor: 'pointer'
                  }}
                >
                  {s === 'All' ? 'All Shifts' : `Shift ${s}`}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Inspection KPI Summary Tiles */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: '12px',
          marginBottom: '20px'
        }}>
          <div style={{ background: 'var(--bg3)', padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '11px', color: 'var(--text3)', textTransform: 'uppercase', fontWeight: 700 }}>Bins Inspected</div>
            <div className="mono" style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text)', marginTop: '4px' }}>
              {totals.totalBins}
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '2px' }}>Crates verified by QC</div>
          </div>

          <div style={{ background: 'rgba(0, 214, 143, 0.05)', padding: '12px 14px', borderRadius: '8px', border: '1px solid rgba(0, 214, 143, 0.25)' }}>
            <div style={{ fontSize: '11px', color: 'var(--green)', textTransform: 'uppercase', fontWeight: 700 }}>Total Good Units</div>
            <div className="mono" style={{ fontSize: '20px', fontWeight: 800, color: 'var(--green)', marginTop: '4px' }}>
              {totals.totalGood.toLocaleString()}
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text2)', marginTop: '2px' }}>Accepted for packing</div>
          </div>

          <div style={{ background: 'rgba(255, 77, 77, 0.05)', padding: '12px 14px', borderRadius: '8px', border: '1px solid rgba(255, 77, 77, 0.25)' }}>
            <div style={{ fontSize: '11px', color: 'var(--red)', textTransform: 'uppercase', fontWeight: 700 }}>Total Rejections</div>
            <div className="mono" style={{ fontSize: '20px', fontWeight: 800, color: 'var(--red)', marginTop: '4px' }}>
              {totals.totalRej.toLocaleString()}
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text2)', marginTop: '2px' }}>Defective units logged</div>
          </div>

          <div style={{ background: 'rgba(77, 159, 255, 0.05)', padding: '12px 14px', borderRadius: '8px', border: '1px solid rgba(77, 159, 255, 0.25)' }}>
            <div style={{ fontSize: '11px', color: 'var(--blue)', textTransform: 'uppercase', fontWeight: 700 }}>Quality Acceptance</div>
            <div className="mono" style={{ fontSize: '20px', fontWeight: 800, color: 'var(--blue)', marginTop: '4px' }}>
              {totals.passRate}%
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text2)', marginTop: '2px' }}>First-pass quality rate</div>
          </div>
        </div>

        {/* Per-Shift Product Table */}
        <div style={{ overflowX: 'auto', marginBottom: '24px' }}>
          <table className="tbl" style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg3)' }}>
                <th style={{ textAlign: 'left', padding: '10px 12px' }}>Product Details</th>
                {(selectedShiftFilter === 'All' || selectedShiftFilter === 'A') && (
                  <th style={{ textAlign: 'center', padding: '10px 8px', borderLeft: '1px solid var(--border)' }}>
                    Shift A (Bins · Good · Rej)
                  </th>
                )}
                {(selectedShiftFilter === 'All' || selectedShiftFilter === 'B') && (
                  <th style={{ textAlign: 'center', padding: '10px 8px', borderLeft: '1px solid var(--border)' }}>
                    Shift B (Bins · Good · Rej)
                  </th>
                )}
                {(selectedShiftFilter === 'All' || selectedShiftFilter === 'C') && (
                  <th style={{ textAlign: 'center', padding: '10px 8px', borderLeft: '1px solid var(--border)' }}>
                    Shift C (Bins · Good · Rej)
                  </th>
                )}
                <th style={{ textAlign: 'center', padding: '10px 12px', borderLeft: '1px solid var(--border)', background: 'rgba(77, 159, 255, 0.06)' }}>
                  Total Today (Bins)
                </th>
                <th style={{ textAlign: 'right', padding: '10px 12px', background: 'rgba(77, 159, 255, 0.06)' }}>
                  Net Good Qty
                </th>
                <th style={{ textAlign: 'right', padding: '10px 12px', background: 'rgba(77, 159, 255, 0.06)' }}>
                  Rej Qty (Scrap %)
                </th>
              </tr>
            </thead>
            <tbody>
              {productStats.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '30px', color: 'var(--text3)', fontStyle: 'italic' }}>
                    No crates inspected yet today. Inspected crates will display here automatically in real time.
                  </td>
                </tr>
              ) : (
                productStats.map(stat => {
                  const shiftA = stat.shifts['A'] || { binsCount: 0, goodQty: 0, rejectedQty: 0 };
                  const shiftB = stat.shifts['B'] || { binsCount: 0, goodQty: 0, rejectedQty: 0 };
                  const shiftC = stat.shifts['C'] || { binsCount: 0, goodQty: 0, rejectedQty: 0 };
                  const scrapPct = (stat.totalGood + stat.totalRejected) > 0 
                    ? ((stat.totalRejected / (stat.totalGood + stat.totalRejected)) * 100).toFixed(1) 
                    : '0.0';

                  return (
                    <tr key={stat.productId} style={{ borderBottom: '1px solid var(--border)' }}>
                      {/* Product Column */}
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ fontWeight: 700, color: 'var(--text)' }}>{stat.productName}</div>
                        <div className="mono" style={{ fontSize: '10px', color: 'var(--text3)' }}>
                          {stat.itemCode}
                        </div>
                      </td>

                      {/* Shift A */}
                      {(selectedShiftFilter === 'All' || selectedShiftFilter === 'A') && (
                        <td style={{ textAlign: 'center', padding: '10px 8px', borderLeft: '1px solid var(--border)' }}>
                          {shiftA.binsCount > 0 ? (
                            <div>
                              <span className="mono" style={{ fontWeight: 700, color: 'var(--text)' }}>{shiftA.binsCount} bins</span>
                              <div style={{ fontSize: '10px', color: 'var(--text3)' }}>
                                <span style={{ color: 'var(--green)' }}>{shiftA.goodQty}</span> / <span style={{ color: shiftA.rejectedQty > 0 ? 'var(--red)' : 'var(--text3)' }}>{shiftA.rejectedQty} rej</span>
                              </div>
                            </div>
                          ) : (
                            <span style={{ color: 'var(--text3)', fontSize: '11px' }}>-</span>
                          )}
                        </td>
                      )}

                      {/* Shift B */}
                      {(selectedShiftFilter === 'All' || selectedShiftFilter === 'B') && (
                        <td style={{ textAlign: 'center', padding: '10px 8px', borderLeft: '1px solid var(--border)' }}>
                          {shiftB.binsCount > 0 ? (
                            <div>
                              <span className="mono" style={{ fontWeight: 700, color: 'var(--text)' }}>{shiftB.binsCount} bins</span>
                              <div style={{ fontSize: '10px', color: 'var(--text3)' }}>
                                <span style={{ color: 'var(--green)' }}>{shiftB.goodQty}</span> / <span style={{ color: shiftB.rejectedQty > 0 ? 'var(--red)' : 'var(--text3)' }}>{shiftB.rejectedQty} rej</span>
                              </div>
                            </div>
                          ) : (
                            <span style={{ color: 'var(--text3)', fontSize: '11px' }}>-</span>
                          )}
                        </td>
                      )}

                      {/* Shift C */}
                      {(selectedShiftFilter === 'All' || selectedShiftFilter === 'C') && (
                        <td style={{ textAlign: 'center', padding: '10px 8px', borderLeft: '1px solid var(--border)' }}>
                          {shiftC.binsCount > 0 ? (
                            <div>
                              <span className="mono" style={{ fontWeight: 700, color: 'var(--text)' }}>{shiftC.binsCount} bins</span>
                              <div style={{ fontSize: '10px', color: 'var(--text3)' }}>
                                <span style={{ color: 'var(--green)' }}>{shiftC.goodQty}</span> / <span style={{ color: shiftC.rejectedQty > 0 ? 'var(--red)' : 'var(--text3)' }}>{shiftC.rejectedQty} rej</span>
                              </div>
                            </div>
                          ) : (
                            <span style={{ color: 'var(--text3)', fontSize: '11px' }}>-</span>
                          )}
                        </td>
                      )}

                      {/* Total Bins */}
                      <td style={{ textAlign: 'center', padding: '10px 12px', borderLeft: '1px solid var(--border)', background: 'rgba(77, 159, 255, 0.03)' }}>
                        <span className="pill pb mono" style={{ fontSize: '11px', fontWeight: 700 }}>
                          {stat.totalBins} bins
                        </span>
                      </td>

                      {/* Total Good Qty */}
                      <td className="mono" style={{ textAlign: 'right', padding: '10px 12px', fontWeight: 700, color: 'var(--green)', background: 'rgba(77, 159, 255, 0.03)' }}>
                        {stat.totalGood.toLocaleString()}
                      </td>

                      {/* Total Rejected Qty */}
                      <td className="mono" style={{ textAlign: 'right', padding: '10px 12px', background: 'rgba(77, 159, 255, 0.03)' }}>
                        <span style={{ color: stat.totalRejected > 0 ? 'var(--red)' : 'var(--text3)', fontWeight: 700 }}>
                          {stat.totalRejected}
                        </span>
                        <span style={{ fontSize: '10px', color: 'var(--text3)', marginLeft: '4px' }}>
                          ({scrapPct}%)
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>

            {/* Grand Summary Footer */}
            {productStats.length > 0 && (
              <tfoot>
                <tr style={{ background: 'var(--bg3)', fontWeight: 800, borderTop: '2px solid var(--border)' }}>
                  <td style={{ padding: '10px 12px', color: 'var(--text)' }}>GRAND TOTALS</td>
                  {(selectedShiftFilter === 'All' || selectedShiftFilter === 'A') && (
                    <td style={{ textAlign: 'center', padding: '10px 8px', borderLeft: '1px solid var(--border)' }}>
                      <div className="mono">{totals.shiftTotals['A']?.bins || 0} bins</div>
                      <div style={{ fontSize: '10px', color: 'var(--text3)' }}>
                        <span style={{ color: 'var(--green)' }}>{totals.shiftTotals['A']?.good || 0}</span> / <span style={{ color: 'var(--red)' }}>{totals.shiftTotals['A']?.rej || 0}</span>
                      </div>
                    </td>
                  )}
                  {(selectedShiftFilter === 'All' || selectedShiftFilter === 'B') && (
                    <td style={{ textAlign: 'center', padding: '10px 8px', borderLeft: '1px solid var(--border)' }}>
                      <div className="mono">{totals.shiftTotals['B']?.bins || 0} bins</div>
                      <div style={{ fontSize: '10px', color: 'var(--text3)' }}>
                        <span style={{ color: 'var(--green)' }}>{totals.shiftTotals['B']?.good || 0}</span> / <span style={{ color: 'var(--red)' }}>{totals.shiftTotals['B']?.rej || 0}</span>
                      </div>
                    </td>
                  )}
                  {(selectedShiftFilter === 'All' || selectedShiftFilter === 'C') && (
                    <td style={{ textAlign: 'center', padding: '10px 8px', borderLeft: '1px solid var(--border)' }}>
                      <div className="mono">{totals.shiftTotals['C']?.bins || 0} bins</div>
                      <div style={{ fontSize: '10px', color: 'var(--text3)' }}>
                        <span style={{ color: 'var(--green)' }}>{totals.shiftTotals['C']?.good || 0}</span> / <span style={{ color: 'var(--red)' }}>{totals.shiftTotals['C']?.rej || 0}</span>
                      </div>
                    </td>
                  )}
                  <td className="mono" style={{ textAlign: 'center', padding: '10px 12px', borderLeft: '1px solid var(--border)', color: 'var(--blue)' }}>
                    {totals.totalBins} bins
                  </td>
                  <td className="mono" style={{ textAlign: 'right', padding: '10px 12px', color: 'var(--green)' }}>
                    {totals.totalGood.toLocaleString()}
                  </td>
                  <td className="mono" style={{ textAlign: 'right', padding: '10px 12px', color: 'var(--red)' }}>
                    {totals.totalRej.toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Top Defects Detected Today */}
        {defectStats.length > 0 && (
          <div style={{ background: 'var(--bg3)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <AlertTriangle size={14} style={{ color: 'var(--amber)' }} />
              Today's Logged Defect Categories
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {defectStats.map(d => (
                <div 
                  key={d.reason}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '4px 10px',
                    borderRadius: '20px',
                    background: 'rgba(255, 77, 77, 0.1)',
                    border: '1px solid rgba(255, 77, 77, 0.25)',
                    fontSize: '11px'
                  }}
                >
                  <span style={{ color: 'var(--text)' }}>{d.reason}:</span>
                  <span className="mono" style={{ fontWeight: 800, color: 'var(--red)' }}>{d.count} pcs</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LiveDashboardPage;
