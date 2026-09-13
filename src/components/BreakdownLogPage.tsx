import React, { useState, useEffect } from 'react';
import { Clock, Calendar, User, Search, Factory, UserCheck, RefreshCcw, Timer, ChevronDown, ChevronRight, MessageSquare } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { BreakdownRecord, Machine } from '../types';
import { formatDateDMY } from '../utils/printService';

const LiveTimer: React.FC<{ startTime: string }> = ({ startTime }) => {
  const [elapsed, setElapsed] = useState('');

  useEffect(() => {
    const update = () => {
      const diff = Date.now() - new Date(startTime).getTime();
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setElapsed(`${h > 0 ? h + 'h ' : ''}${m}m ${s}s`);
    };
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [startTime]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--red)', fontWeight: 700, fontSize: '11px' }}>
      <Timer size={12} className="animate-pulse" />
      <span>{elapsed}</span>
    </div>
  );
};

const DurationBadge: React.FC<{ minutes: number | undefined | null }> = ({ minutes }) => {
  if (minutes === null || minutes === undefined) return <span style={{ color: 'var(--text3)', fontSize: '11px' }}>Calculating...</span>;
  if (minutes === 0) return <span style={{ color: 'var(--green)', fontSize: '11px' }}>Under 1m</span>;

  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const label = h > 0 ? `${h}h ${m}m` : `${m}m`;

  let color = 'var(--green)';
  if (minutes > 120) color = 'var(--red)';
  else if (minutes > 30) color = 'var(--amber)';

  return (
    <span style={{ fontWeight: 700, fontSize: '11px', color, fontFamily: 'var(--mono)' }}>{label}</span>
  );
};

const BreakdownLogPage: React.FC<{ machines?: Machine[] }> = ({ machines = [] }) => {
  const [breakdowns, setBreakdowns] = useState<BreakdownRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<'All' | 'Open' | 'Resolved'>('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Advanced Filters
  const [selMachine, setSelMachine] = useState('All');
  const [selSupervisor, setSelSupervisor] = useState('All');
  const [selOperator, setSelOperator] = useState('All');
  const [selDate, setSelDate] = useState('');

  const fetchBreakdowns = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('breakdown_records')
        .select('*')
        .order('start_time', { ascending: false });

      if (error) throw error;
      if (data) {
        setBreakdowns(data.map((b: any) => ({
          id: b.id,
          machineId: b.machine_id,
          machineName: b.machine_name || 'Unit ' + b.machine_id,
          startTime: b.start_time,
          endTime: b.end_time,
          durationMinutes: b.duration_minutes,
          reason: b.reason || 'System Alert',
          remarks: b.remarks || '---',
          operatorId: b.operator_id || 'Unassigned',
          supervisorName: b.supervisor_name || 'System',
          status: (b.status === 'Open' || b.status === 'Resolved') ? b.status : 'Open'
        })));
      }
    } catch (err) {
      console.error('Error fetching breakdowns:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBreakdowns();

    const channel = supabase
      .channel('brk-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'breakdown_records' }, () => {
        fetchBreakdowns();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // Derived filter options
  const supervisors = ['All', ...new Set(breakdowns.map(b => b.supervisorName).filter(Boolean))];
  const operators = ['All', ...new Set(breakdowns.map(b => b.operatorId).filter(Boolean))];

  const filtered = breakdowns.filter(b => {
    const matchesStatus = filterStatus === 'All' || b.status === filterStatus;
    const matchesMachine = selMachine === 'All' || b.machineName === selMachine;
    const matchesSupervisor = selSupervisor === 'All' || b.supervisorName === selSupervisor;
    const matchesOperator = selOperator === 'All' || b.operatorId === selOperator;
    const matchesDate = !selDate || b.startTime.startsWith(selDate);
    const matchesSearch = b.machineName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          b.reason.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          b.id.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesMachine && matchesSupervisor && matchesOperator && matchesSearch && matchesDate;
  });

  const formatDate = (iso: string) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return formatDateDMY(d) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // MTTR: average duration of resolved breakdowns in current filter
  const resolvedInFilter = filtered.filter(b => b.status === 'Resolved' && b.durationMinutes != null);
  const mttr = resolvedInFilter.length > 0
    ? Math.round(resolvedInFilter.reduce((sum, b) => sum + (b.durationMinutes || 0), 0) / resolvedInFilter.length)
    : null;

  const formatMttr = (mins: number | null) => {
    if (mins === null) return '—';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  return (
    <div className="animate-fade-in" style={{ padding: '0 4px' }}>
      {/* Stat cards — 4 with MTTR */}
      <div className="mg" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '16px', marginBottom: '20px' }}>
        <div className="mc2" style={{ borderLeft: '3px solid var(--red)' }}>
          <div className="ml">Active Breakdowns</div>
          <div className="mv red">{breakdowns.filter(b => b.status === 'Open').length} <span className="ms">UNRESOLVED</span></div>
        </div>
        <div className="mc2" style={{ borderLeft: '3px solid var(--green)' }}>
          <div className="ml">Resolution Rate</div>
          <div className="mv green">{Math.round((breakdowns.filter(b => b.status === 'Resolved').length / (breakdowns.length || 1)) * 100)}% <span className="ms">EFFICIENCY</span></div>
        </div>
        <div className="mc2" style={{ borderLeft: '3px solid var(--blue)' }}>
          <div className="ml">Total Events</div>
          <div className="mv blue">{breakdowns.length} <span className="ms">LOGGED</span></div>
        </div>
        <div className="mc2" style={{ borderLeft: '3px solid var(--amber)' }}>
          <div className="ml">MTTR (filtered)</div>
          <div className="mv amber">
            {formatMttr(mttr)} <span className="ms">AVG REPAIR</span>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '20px' }}>
        {/* Advanced filters */}
        <div className="cb" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px', padding: '16px 20px', background: 'var(--bg3)', borderBottom: '1px solid var(--border)' }}>
          <div>
            <label className="fl"><Factory size={10} style={{ marginRight: '4px' }} />Machine</label>
            <select className="fi" value={selMachine} onChange={e => setSelMachine(e.target.value)} style={{ fontSize: '12px', height: '32px' }}>
              <option value="All">All IDs</option>
              {machines.map(m => (
                <option key={m.id} value={m.name}>{m.id}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="fl"><User size={10} style={{ marginRight: '4px' }} />Supervisor</label>
            <select className="fi" value={selSupervisor} onChange={e => setSelSupervisor(e.target.value)} style={{ fontSize: '12px', height: '32px' }}>
              {supervisors.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="fl"><UserCheck size={10} style={{ marginRight: '4px' }} />Operator</label>
            <select className="fi" value={selOperator} onChange={e => setSelOperator(e.target.value)} style={{ fontSize: '12px', height: '32px' }}>
              {operators.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label className="fl"><Calendar size={10} style={{ marginRight: '4px' }} />Date</label>
            <input type="date" className="fi" value={selDate} onChange={e => setSelDate(e.target.value)} style={{ fontSize: '12px', height: '32px' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button className="btn bsec bsm bfull" onClick={() => { setSelMachine('All'); setSelSupervisor('All'); setSelOperator('All'); setSelDate(''); setSearchTerm(''); setFilterStatus('All'); }}>
              <RefreshCcw size={12} style={{ marginRight: '6px' }} /> Reset
            </button>
          </div>
        </div>

        {/* Table toolbar */}
        <div className="ch" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span className="ct2">Maintenance Audit Trail</span>
            <div style={{ display: 'flex', background: 'var(--bg4)', borderRadius: 'var(--r)', padding: '2px' }}>
              {(['All', 'Open', 'Resolved'] as const).map(s => (
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

          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
            <input
              type="text"
              placeholder="Search logs..."
              className="fi"
              style={{ width: '240px', paddingLeft: '32px', height: '32px', fontSize: '12px' }}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="cb" style={{ padding: 0 }}>
          {loading ? (
            <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text3)' }}>Loading audit records...</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text3)' }}>No logs match your current filter settings.</div>
          ) : (
            <table className="dt">
              <thead>
                <tr>
                  <th style={{ paddingLeft: '20px' }}>Identity</th>
                  <th>Incident Details</th>
                  <th>Duration</th>
                  <th>Audit Trail</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(b => (
                  <React.Fragment key={b.id}>
                    <tr
                      onClick={() => setExpandedId(expandedId === b.id ? null : b.id)}
                      style={{ cursor: 'pointer', transition: 'background 0.2s' }}
                      className={expandedId === b.id ? 'active-brk-row' : ''}
                    >
                      <td style={{ paddingLeft: '20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {expandedId === b.id ? <ChevronDown size={14} color="var(--amber)" /> : <ChevronRight size={14} color="var(--text3)" />}
                          <div className={`dot ${b.status === 'Open' ? 'r' : 'g'}`} />
                          <div>
                            <div style={{ fontSize: '13px', fontWeight: 600 }}>
                              <span style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: 400, marginRight: '4px' }}>[{b.machineId}]</span>
                              {b.machineName}
                            </div>
                            <div style={{ fontSize: '10px', color: 'var(--text3)' }} className="mono">{b.id}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--red)' }}>{b.reason}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text3)', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.remarks}</div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text2)' }}>
                            <Clock size={12} /> {formatDate(b.startTime)}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {b.status === 'Open' ? (
                              <LiveTimer startTime={b.startTime} />
                            ) : (
                              <DurationBadge minutes={b.durationMinutes} />
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text2)' }}>
                            <User size={12} /> <span style={{ color: 'var(--amber)', fontWeight: 600 }}>{b.supervisorName || 'System'}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text3)' }}>
                            <UserCheck size={12} /> {b.operatorId || 'Unassigned'}
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`pill ${b.status === 'Open' ? 'pr' : 'pg'}`}>
                          {b.status}
                        </span>
                      </td>
                    </tr>

                    {/* Expandable resolution notes */}
                    {expandedId === b.id && (
                      <tr>
                        <td colSpan={5} style={{ padding: 0, background: 'var(--bg2)' }}>
                          <div className="animate-fade-in" style={{ padding: '12px 20px 16px 52px', borderBottom: '1px solid var(--border)' }}>
                            <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
                              {/* Timestamps */}
                              <div>
                                <div style={{ fontSize: '9px', color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '4px' }}>Timeline</div>
                                <div style={{ fontSize: '11px', color: 'var(--text2)', marginBottom: '2px' }}>
                                  🔴 Start: <strong>{formatDate(b.startTime)}</strong>
                                </div>
                                {b.endTime && (
                                  <div style={{ fontSize: '11px', color: 'var(--text2)' }}>
                                    🟢 Resolved: <strong>{formatDate(b.endTime)}</strong>
                                  </div>
                                )}
                              </div>

                              {/* Resolution notes */}
                              <div style={{ flex: 1, minWidth: '200px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '9px', color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '6px' }}>
                                  <MessageSquare size={10} /> Resolution Notes / Corrective Actions
                                </div>
                                <div style={{
                                  padding: '10px 12px',
                                  background: b.status === 'Resolved' ? 'var(--green-bg)' : 'var(--bg3)',
                                  border: `1px solid ${b.status === 'Resolved' ? 'var(--green-dim)' : 'var(--border)'}`,
                                  borderRadius: 'var(--r)',
                                  fontSize: '12px',
                                  color: b.remarks === '---' ? 'var(--text3)' : 'var(--text)',
                                  fontStyle: b.remarks === '---' ? 'italic' : 'normal',
                                  lineHeight: 1.5
                                }}>
                                  {b.remarks === '---' ? 'No resolution notes recorded.' : b.remarks}
                                </div>
                              </div>

                              {/* Duration summary */}
                              {b.status === 'Resolved' && (
                                <div>
                                  <div style={{ fontSize: '9px', color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '4px' }}>Downtime Impact</div>
                                  <div style={{ fontSize: '22px', fontWeight: 800, fontFamily: 'var(--mono)' }}>
                                    <DurationBadge minutes={b.durationMinutes} />
                                  </div>
                                  <div style={{ fontSize: '9px', color: 'var(--text3)', marginTop: '2px' }}>
                                    {(b.durationMinutes || 0) <= 30 ? '✅ Within SLA' : (b.durationMinutes || 0) <= 120 ? '⚠ Exceeded 30min' : '🔴 Critical Delay'}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <style>{`
        .active-brk-row {
          background: rgba(251, 191, 36, 0.04) !important;
        }
      `}</style>
    </div>
  );
};

export default BreakdownLogPage;
