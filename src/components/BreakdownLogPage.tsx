import React, { useState, useEffect } from 'react';
import { Clock, Calendar, User, Search, Filter, Factory, UserCheck, RefreshCcw, Timer } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { BreakdownRecord, Machine } from '../types';

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

const BreakdownLogPage: React.FC<{ machines?: Machine[] }> = ({ machines = [] }) => {
  const [breakdowns, setBreakdowns] = useState<BreakdownRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<'All' | 'Open' | 'Resolved'>('All');
  const [searchTerm, setSearchTerm] = useState('');
  
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

  // Options for filters
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

  const formatDuration = (mins: number | undefined | null) => {
    if (mins === null || mins === undefined) return 'Calculating...';
    if (mins === 0) return 'Under 1m';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="animate-fade-in" style={{ padding: '0 4px' }}>
      <div className="mg" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '20px' }}>
        <div className="mc2"><div className="ml">Active Breakdowns</div><div className="mv red">{breakdowns.filter(b => b.status === 'Open').length} <span className="ms">UNRESOLVED</span></div></div>
        <div className="mc2"><div className="ml">Resolution Rate</div><div className="mv green">{Math.round((breakdowns.filter(b=>b.status==='Resolved').length / (breakdowns.length || 1)) * 100)}% <span className="ms">EFFICIENCY</span></div></div>
        <div className="mc2"><div className="ml">Total Events</div><div className="mv blue">{breakdowns.length} <span className="ms">LOGGED</span></div></div>
      </div>

      <div className="card" style={{marginBottom:'20px'}}>
        <div className="cb" style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))', gap:'16px', padding:'16px 20px', background:'var(--bg3)', borderBottom:'1px solid var(--border)'}}>
           <div>
              <label className="fl"><Factory size={10} style={{marginRight:'4px'}}/> Machine</label>
              <select className="fi" value={selMachine} onChange={e=>setSelMachine(e.target.value)} style={{fontSize:'12px', height:'32px'}}>
                <option value="All">All IDs</option>
                {machines.map(m => (
                  <option key={m.id} value={m.name}>{m.id}</option>
                ))}
              </select>
           </div>
           <div>
              <label className="fl"><User size={10} style={{marginRight:'4px'}}/> Supervisor</label>
              <select className="fi" value={selSupervisor} onChange={e=>setSelSupervisor(e.target.value)} style={{fontSize:'12px', height:'32px'}}>
                {supervisors.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
           </div>
           <div>
              <label className="fl"><UserCheck size={10} style={{marginRight:'4px'}}/> Operator</label>
              <select className="fi" value={selOperator} onChange={e=>setSelOperator(e.target.value)} style={{fontSize:'12px', height:'32px'}}>
                {operators.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
           </div>
           <div>
              <label className="fl"><Calendar size={10} style={{marginRight:'4px'}}/> Date</label>
              <input type="date" className="fi" value={selDate} onChange={e=>setSelDate(e.target.value)} style={{fontSize:'12px', height:'32px'}} />
           </div>
           <div style={{display:'flex', alignItems:'flex-end'}}>
              <button className="btn bsec bsm bfull" onClick={()=>{setSelMachine('All');setSelSupervisor('All');setSelOperator('All');setSelDate('');setSearchTerm('');setFilterStatus('All')}}>
                <RefreshCcw size={12} style={{marginRight:'6px'}}/> Reset
              </button>
           </div>
        </div>

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
                  <th>Production Impact</th>
                  <th>Audit Trail</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(b => (
                  <tr key={b.id}>
                    <td style={{ paddingLeft: '20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
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
                       <div style={{ fontSize: '12px', fontWeight: 500, color:'var(--red)' }}>{b.reason}</div>
                       <div style={{ fontSize: '11px', color: 'var(--text3)', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.remarks}</div>
                    </td>
                    <td>
                       <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text2)' }}>
                             <Clock size={12} /> {formatDate(b.startTime)}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text3)' }}>
                              <Filter size={12} /> 
                              {b.status === 'Open' ? (
                                <LiveTimer startTime={b.startTime} />
                              ) : (
                                formatDuration(b.durationMinutes)
                              )}
                           </div>
                       </div>
                    </td>
                    <td>
                       <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text2)' }}>
                             <User size={12} /> <span style={{color:'var(--amber)', fontWeight:600}}>{b.supervisorName || 'System'}</span>
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
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default BreakdownLogPage;
