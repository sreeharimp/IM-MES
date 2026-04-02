import React, { useState, useEffect } from 'react';
import { 
  LogOut, Wrench, Factory, History, Cpu, Menu, 
  ChevronLeft, ScrollText, CheckCircle2, 
  Play, UserPlus, ClipboardList, Square, AlertCircle
} from 'lucide-react';
import './index.css';
import type { Machine, MachineStatus, Operator, Product, Mould, RawMaterial, ProductMaterial, Crate, BatchRecord, ShiftSetting, AppSettings } from './types';
import { getBatchSummary } from './utils/batchUtils';
import { supabase } from './lib/supabase';

// Modals & Pages
import BinCompleteModal from './components/BinCompleteModal';
import InspectionModal from './components/InspectionModal';
import AdminDashboard from './components/AdminDashboard';
import BreakdownModal from './components/BreakdownModal';
import JobSetupModal from './components/JobSetupModal';
import HandoverSummaryModal from './components/HandoverSummaryModal';
import ResolveBreakdownModal from './components/ResolveBreakdownModal';
import Login from './components/Login';
import ShiftHandoverPage from './components/ShiftHandoverPage';
import ForceOperatorAssignmentModal from './components/ForceOperatorAssignmentModal';
import ShiftLogPage from './components/ShiftLogPage';
import InspectionPage from './components/InspectionPage';
import BreakdownLogPage from './components/BreakdownLogPage';
import BatchLogPage from './components/BatchLogPage';

type Tab = 'Shop Floor' | 'Inspections' | 'Batch Log' | 'Machines' | 'Shift Log' | 'Breakdowns';

const App: React.FC = () => {
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<{ fullName: string, email: string, role: string } | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('Shop Floor');
  const [, setCurrentTime] = useState(new Date());

  const [pendingCrates, setPendingCrates] = useState<Crate[]>([]);
  const [selectedMachineId, setSelectedMachineId] = useState<string | null>(null);
  const [isHandoverSummaryOpen, setIsHandoverSummaryOpen] = useState(false);
  const [inspectingBin, setInspectingBin] = useState<{ id: string, netQty: number, machineId: string } | null>(null);
  const [breakingMachineId, setBreakingMachineId] = useState<string | null>(null);
  const [resolvingMachineId, setResolvingMachineId] = useState<string | null>(null);
  const [settingUpMachineId, setSettingUpMachineId] = useState<string | null>(null);
  const [assigningOperatorMachineId, setAssigningOperatorMachineId] = useState<string | null>(null);
  const [isInitialAssignmentOpen, setIsInitialAssignmentOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ type: 'status' | 'complete', data: any } | null>(null);
  
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  const [shiftSettings, setShiftSettings] = useState<ShiftSetting[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [moulds, setMoulds] = useState<Mould[]>([]);
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);
  const [productMaterials, setProductMaterials] = useState<ProductMaterial[]>([]);
  const [batchRecords, setBatchRecords] = useState<BatchRecord[]>([]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    supabase.auth.onAuthStateChange((_event, session) => {
        setSession(session);
        // Reset local flow states on session change
        setIsHandoverSummaryOpen(false);
        setIsInitialAssignmentOpen(false);
    });
  }, []);

  useEffect(() => {
    if (!session) return;
    const fetchData = async () => {
      try {
        const [{data: appData}, {data: shiftData}, {data: machs}, {data: pData}, {data: prdData}, {data: opers}, {data: batRecs}, {data: mldData}, {data: rmData}, {data: pmData}, {data: crates}] = await Promise.all([
          supabase.from('app_settings').select('*').eq('id', 'global').maybeSingle(),
          supabase.from('shift_settings').select('*').order('id'),
          supabase.from('machines').select('*').order('id'),
          supabase.from('profiles').select('full_name, email, role').eq('id', session.user.id).maybeSingle(),
          supabase.from('products').select('*'),
          supabase.from('operators').select('*'),
          supabase.from('batch_records').select('*').order('start_time', { ascending: false }),
          supabase.from('moulds').select('*'),
          supabase.from('raw_materials').select('*'),
          supabase.from('approved_materials').select('*'),
          supabase.from('crates').select('*').eq('status', 'Pending Inspection')
        ]);

        if (appData) setAppSettings({ 
          id: appData.id, 
          currentShift: appData.current_shift, 
          pendingHandover: appData.pending_handover, 
          lastHandoverSummary: appData.last_handover_summary, 
          outgoingSupervisorEmail: appData.last_handover_summary?.outgoing_supervisor_email,
          activeSupervisorName: appData.active_supervisor_name
        });
        if (shiftData) setShiftSettings(shiftData.map((s: any) => ({ id: s.id, name: s.name, startTime: s.start_time, endTime: s.end_time })));
        if (machs) setMachines(machs.map((m: any) => ({
            id: m.id, name: m.name, model: m.model,
            currentMouldId: m.current_mould_id, currentOperatorId: m.current_operator_id,
            activeProductId: m.active_product_id, currentBinNumber: m.current_bin_number || 1,
            currentShiftProduction: m.current_shift_production || 0,
            currentDayProduction: m.current_day_production || 0,
            status: m.status, binTarget: m.bin_target,
            binStartTime: m.bin_start_time ? Number(m.bin_start_time) : undefined,
            activeBatchId: m.active_batch_id,
            activeBatchDate: m.active_batch_date,
            breakdownStartTime: m.breakdown_start_time ? Number(m.breakdown_start_time) : undefined,
            oee: m.oee || 0, lastCleaningDone: m.last_cleaning_done, faiApproved: m.fai_approved
        })));
        if (pData) {
          setProfile({ fullName: pData.full_name, email: pData.email, role: pData.role || 'Supervisor' });
        } else {
          // Auto-create missing profile from whitelist for new signups
          const { data: whitelist } = await supabase.from('authorized_supervisors').select('*').eq('email', session.user.email).maybeSingle();
          const { data: neu, error: createErr } = await supabase.from('profiles').insert({
            id: session.user.id,
            full_name: whitelist?.full_name || 'New User',
            email: session.user.email,
            role: 'Supervisor'
          }).select().maybeSingle();

          if (createErr) console.error('Auto-Profile Error:', createErr);
          if (neu) setProfile({ fullName: neu.full_name, email: neu.email, role: neu.role });
        }
        if (prdData) setProducts(prdData.map((p: any) => ({ ...p, mouldId: p.mould_id, itemCode: p.item_code, batchIdentifier: p.batch_identifier, binQty: p.bin_qty, stdPackSize: p.std_pack_size })));
        if (opers) setOperators(opers.map((o: any) => ({ ...o, employeeId: o.employee_id, isCertified: o.is_certified })));
        if (batRecs) setBatchRecords(batRecs.map((b: any) => ({ 
            id: b.id, machineId: b.machine_id, productId: b.product_id, productName: b.product_name, productCode: b.product_code,
            mouldId: b.mould_id, materialGrade: b.material_grade, materialBatch: b.material_batch, operatorId: b.operator_id,
            startTime: b.start_time, endTime: b.end_time, crates: b.crates, totalOutput: b.total_output || 0, status: b.status, batchDate: b.batch_date
        })));
        if (mldData) setMoulds(mldData.map((m: any) => ({ ...m, cycleTime: m.cycle_time })));
        if (rmData) setRawMaterials(rmData);
        if (pmData) setProductMaterials(pmData.map((pm: any) => ({ productId: pm.product_id, materialId: pm.material_id })));
        if (crates) setPendingCrates(crates.map((c: any) => ({ 
          id: c.id, batchId: c.batch_id, machineId: c.machine_id, binNumber: c.bin_number, 
          startTime: c.start_time, endTime: c.end_time, grossQty: c.gross_qty, 
          startupScrap: c.startup_scrap, qcSample: c.qc_sample, netQty: c.net_qty, 
          operatorId: c.operator_id, supervisorId: c.supervisor_id, status: c.status 
        })));
        if (appData && shiftData) {
          const ct = new Date().getHours() + new Date().getMinutes() / 60;
          let detected = shiftData[0].id;
          for (const s of shiftData) {
            const [sh, sm] = s.start_time.split(':').map(Number);
            const [eh, em] = s.end_time.split(':').map(Number);
            const sv = sh + sm/60, ev = eh + em/60;
            if (sv < ev) { if (ct >= sv && ct < ev) detected = s.id; } 
            else { if (ct >= sv || ct < ev) detected = s.id; }
          }
          if (appData.current_shift !== detected && !appData.pending_handover && pData?.role !== 'Admin') {
            setAppSettings(prev => prev ? { ...prev, pendingHandover: true } : null);
          }
        }
      } catch (err) { console.error('Fetch Error:', err); }
    };
    fetchData();

    const channel = supabase.channel('realtime_app')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'machines' }, (p) => {
          if (p.eventType === 'DELETE') {
            setMachines(prev => prev.filter(mach => mach.id !== p.old.id));
            return;
          }
          const m = p.new as any;
          setMachines(prev => prev.map(mach => mach.id === m.id ? { 
              ...mach, 
              status: m.status ?? mach.status, 
              currentMouldId: m.current_mould_id ?? mach.currentMouldId, 
              currentOperatorId: m.current_operator_id ?? mach.currentOperatorId,
              activeProductId: m.active_product_id ?? mach.activeProductId, 
              currentBinNumber: m.current_bin_number ?? mach.currentBinNumber,
              currentShiftProduction: m.current_shift_production ?? mach.currentShiftProduction, 
              currentDayProduction: m.current_day_production ?? mach.currentDayProduction,
              binStartTime: m.bin_start_time ? Number(m.bin_start_time) : mach.binStartTime,
              binTarget: m.bin_target ?? mach.binTarget,
              activeBatchId: m.active_batch_id ?? mach.activeBatchId,
              activeBatchDate: m.active_batch_date ?? mach.activeBatchDate,
              breakdownStartTime: m.breakdown_start_time ? Number(m.breakdown_start_time) : mach.breakdownStartTime,
              oee: m.oee ?? mach.oee,
              lastCleaningDone: m.last_cleaning_done ?? mach.lastCleaningDone,
              faiApproved: m.fai_approved ?? mach.faiApproved
          } : mach));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'crates' }, (p) => {
          const c = p.new as any;
          setPendingCrates(prev => {
            if (prev.some(crate => crate.id === c.id)) return prev;
            return [...prev, { 
              id: c.id, batchId: c.batch_id, machineId: c.machine_id, binNumber: c.bin_number, 
              startTime: c.start_time, endTime: c.end_time, grossQty: c.gross_qty, 
              startup_scrap: c.startup_scrap, qcSample: c.qc_sample, netQty: c.net_qty, 
              operatorId: c.operator_id, supervisorId: c.supervisor_id, status: c.status 
            } as unknown as Crate];
          });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'crates' }, (p) => {
          const c = p.new as any;
          if (c.status === 'Completed') {
            setPendingCrates(prev => prev.filter(crate => crate.id !== c.id));
          }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'batch_records' }, (p) => {
          const b = p.new as any;
          if (p.eventType === 'INSERT') {
            setBatchRecords(prev => [{
              id: b.id, machineId: b.machine_id, productId: b.product_id, productName: b.product_name, productCode: b.product_code,
              mouldId: b.mould_id, materialGrade: b.material_grade, materialBatch: b.material_batch, operatorId: b.operator_id,
              startTime: b.start_time, endTime: b.end_time, crates: b.crates, totalOutput: b.total_output || 0, status: b.status, batchDate: b.batch_date
            }, ...prev]);
          } else if (p.eventType === 'UPDATE') {
            setBatchRecords(prev => prev.map(rec => rec.id === b.id ? {
              ...rec, crates: b.crates, totalOutput: b.total_output || 0, status: b.status, endTime: b.end_time
            } : rec));
          }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_settings' }, (p) => {
          const a = p.new as any;
          if (a.id === 'global') setAppSettings({ 
            id: a.id, 
            currentShift: a.current_shift, 
            pendingHandover: a.pending_handover, 
            lastHandoverSummary: a.last_handover_summary, 
            outgoingSupervisorEmail: a.last_handover_summary?.outgoing_supervisor_email,
            activeSupervisorName: a.active_supervisor_name
          });
      })
      .subscribe();

    const profileSubscription = supabase.channel(`profile_${session.user.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${session.user.id}` }, (payload) => {
        const p = payload.new as any;
        setProfile({ fullName: p.full_name, email: p.email, role: p.role || 'Supervisor' });
      })
      .subscribe();

    return () => { 
      supabase.removeChannel(channel); 
      supabase.removeChannel(profileSubscription);
    };
  }, [session]);

  const addLogEntry = async (mid: string, type: string, details: string, opId?: string) => {
    try {
      await supabase.from('activity_logs').insert({
        id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        timestamp: new Date().toISOString(),
        event_type: type,
        machine_id: mid,
        operator_id: opId || null,
        supervisor_name: profile?.fullName || 'System',
        details
      });
    } catch (err) { console.error('Log Error:', err); }
  };

  const handleAction = async (mid: string, action: string) => {
    if (action === 'Start') setSettingUpMachineId(mid);
    else if (action === 'Maintenance') setBreakingMachineId(mid);
    else if (action === 'Stop') {
      setPendingAction({ type: 'status', data: { machineId: mid, nextStatus: 'Idle' } });
    }
    else if (action === 'Unload') {
      setMachines(prev => prev.map(m => m.id === mid ? { ...m, currentMouldId: null, activeProductId: null, activeBatchId: null } : m));
      await supabase.from('machines').update({ current_mould_id: null, active_product_id: null, active_batch_id: null, status: 'Idle' }).eq('id', mid);
    }
    else if (action === 'Offline') {
      setMachines(prev => prev.map(m => m.id === mid ? { ...m, status: 'Idle' } : m));
      await supabase.from('machines').update({ status: 'Idle' }).eq('id', mid);
    }
  };

  const handleHandoverAcknowledge = async (sid: string) => {
    if (!profile) return;
    try {
      // Clear shift metrics across all machines before starting new shift
      const { data: machs } = await supabase.from('machines').select('id');
      if (machs) {
        for (const m of machs) {
          await supabase.from('machines').update({ current_shift_production: 0 }).eq('id', m.id);
        }
      }

      // Upsert the main settings to clear the pending flag
      const { error } = await supabase.from('app_settings').upsert({ 
        id: 'global',
        pending_handover: false, 
        current_shift: sid, 
        last_handover_summary: null,
        active_supervisor_name: profile?.fullName || 'Unknown'
      });

      if (error) {
        console.error('Handover Error:', error.message);
        alert(`Could not save handover: ${error.message}`);
        return;
      }

      setMachines(prev => prev.map(m => ({ ...m, currentShiftProduction: 0 })));
      setAppSettings(prev => prev ? { ...prev, pendingHandover: false, currentShift: sid, activeSupervisorName: profile?.fullName || 'Unknown' } : null);
      setIsInitialAssignmentOpen(true);
    } catch (err) { 
      console.error('Handover Acknowledge Catch:', err); 
      alert('An unexpected error occurred during handover acknowledgment.');
    }
  };

  const handleBinComplete = async (data: any) => {
    if (!selectedMachineId) return;
    
    // 1. Fetch latest machine state to prevent bin number collisions
    const { data: latestMachine } = await supabase.from('machines').select('*').eq('id', selectedMachineId).single();
    if (!latestMachine) return;

    const p = products.find(pr => pr.id === latestMachine.active_product_id);
    const { batchId: currentBatchId, batchDateStr: currentBatchDate } = getBatchSummary(p?.batchIdentifier || 'XX');
    
    let absBatchId = latestMachine.active_batch_id || currentBatchId;
    let bNo = latestMachine.current_bin_number || 1;

    // Auto Rollover at 6 AM
    if (latestMachine.active_batch_id && latestMachine.active_batch_date && latestMachine.active_batch_date !== currentBatchDate) {
      const { data: oldBatch } = await supabase.from('batch_records').select('*').eq('id', latestMachine.active_batch_id).single();
      
      // Use upsert to handle multiple machines producing same product
      await supabase.from('batch_records').upsert({ 
        id: currentBatchId, 
        machine_id: latestMachine.id, 
        product_id: latestMachine.active_product_id, 
        product_name: p?.name || '', 
        product_code: p?.itemCode || '', 
        mould_id: latestMachine.current_mould_id, 
        material_grade: oldBatch?.material_grade || '', 
        material_batch: oldBatch?.material_batch || '', 
        operator_id: latestMachine.current_operator_id || '', 
        start_time: new Date().toISOString(), 
        crates: 0, 
        total_output: 0, 
        status: 'Active', 
        batch_date: currentBatchDate 
      });

      await supabase.from('machines').update({ 
        active_batch_id: currentBatchId, 
        active_batch_date: currentBatchDate,
        current_bin_number: 1,
        current_day_production: 0
      }).eq('id', latestMachine.id);

      await addLogEntry(latestMachine.id, 'Batch Rollover', `New production day reset. New Batch: ${currentBatchId}`);
      
      absBatchId = currentBatchId;
      bNo = 1;
    }

    // Include machine ID in CID to prevent collisions when multiple machines produce same batch
    const cid = `${absBatchId}-${latestMachine.id}-B${String(bNo).padStart(2, '0')}`;
    const neu = { 
      id: cid, batch_id: absBatchId, machine_id: latestMachine.id, bin_number: bNo, 
      start_time: new Date(latestMachine.bin_start_time || Date.now()).toISOString(), end_time: new Date().toISOString(), gross_qty: data.grossQty, 
      startup_scrap: data.startupScrap, qc_sample: data.qcSample, net_qty: data.netQty, 
      operator_id: latestMachine.current_operator_id || 'UNASSIGNED', supervisor_id: profile?.email || 'System', status: 'Pending Inspection' 
    };

    const { error: crateErr } = await supabase.from('crates').insert(neu);
    if (crateErr) {
      console.error('Crate Insert Error:', crateErr);
      if (crateErr.code === '23505') { 
        alert(`This bin (number ${bNo}) has already been logged for this machine. If you just did a rollover, please check your records.`);
      } else {
        alert(`Could not log bin: ${crateErr.message}`);
      }
      setSelectedMachineId(null);
      return;
    }

    // Optimistic Update
    setMachines(prev => prev.map(m => m.id === latestMachine.id ? { 
      ...m, 
      currentBinNumber: bNo + 1, 
      currentShiftProduction: (m.currentShiftProduction || 0) + data.netQty,
      currentDayProduction: (m.currentDayProduction || 0) + data.netQty,
      binStartTime: Date.now()
    } : m));

    await supabase.from('machines').update({ 
      current_bin_number: bNo + 1, 
      current_shift_production: (latestMachine.current_shift_production || 0) + data.netQty, 
      current_day_production: (latestMachine.current_day_production || 0) + data.netQty, 
      bin_start_time: Date.now() 
    }).eq('id', latestMachine.id);
    
    if (absBatchId) {
      const { data: latestBatch } = await supabase.from('batch_records').select('crates, total_output').eq('id', absBatchId).single();
      if (latestBatch) {
        await supabase.from('batch_records').update({ 
          crates: (latestBatch.crates || 0) + 1, 
          total_output: (latestBatch.total_output || 0) + data.netQty 
        }).eq('id', absBatchId);
      }
    }

    setPendingCrates(prev => [...prev, { 
      id: cid, batchId: neu.batch_id, machineId: neu.machine_id, binNumber: neu.bin_number, 
      startTime: neu.start_time, endTime: neu.end_time, grossQty: neu.gross_qty, 
      startupScrap: neu.startup_scrap, qcSample: neu.qc_sample, netQty: neu.net_qty, 
      operatorId: neu.operator_id, supervisorId: neu.supervisor_id, status: neu.status 
    } as unknown as Crate]);
    setSelectedMachineId(null);
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'Shop Floor':
        return (
          <div className="animate-fade-in">
            <div className="mg">
              <div className="mc2"><div className="ml">Running Units</div><div className="mv green">{machines.filter(m => m.status === 'Running').length} <span className="ms">Active</span></div></div>
              <div className="mc2"><div className="ml">Pending WIP</div><div className="mv amber">{pendingCrates.length} <span className="ms">Bins</span></div></div>
              <div className="mc2"><div className="ml">Plant OEE</div><div className="mv" style={{color:'var(--purple)'}}>{Math.round(machines.reduce((acc, m) => acc + (m.oee || 0), 0) / (machines.length || 1))}% <span className="ms">Avg</span></div></div>
              <div className="mc2"><div className="ml">Shift Output</div><div className="mv">{(machines.reduce((acc, m) => acc + (m.currentShiftProduction || 0), 0)).toLocaleString()} <span className="ms">Pcs</span></div></div>
              <div className="mc2"><div className="ml">Maintenance</div><div className="mv red">{machines.filter(m => m.status === 'Maintenance').length} <span className="ms">Down</span></div></div>
            </div>
            <div className="mach-grid">
              {machines.map(m => (
                <MachineCard key={m.id} machine={m} products={products} operators={operators} moulds={moulds} onAction={handleAction} onComplete={() => setSelectedMachineId(m.id)} onAssign={() => setAssigningOperatorMachineId(m.id)} onResolve={() => setResolvingMachineId(m.id)} />
              ))}
            </div>
          </div>
        );
      case 'Inspections': return <InspectionPage pendingCrates={pendingCrates} machines={machines} products={products} batchRecords={batchRecords} onStartInspection={setInspectingBin} />;
      case 'Batch Log': return <BatchLogPage batchRecords={batchRecords} products={products} pendingCrates={pendingCrates} />;
      case 'Machines': 
        if (profile?.role !== 'Admin' && profile?.role !== 'PowerUser') {
          setActiveTab('Shop Floor');
          return null;
        }
        return <AdminDashboard machines={machines} operators={operators} moulds={moulds} products={products} rawMaterials={rawMaterials} productMaterials={productMaterials} supervisors={[]} shiftSettings={shiftSettings} currentUserRole={profile.role} />;
      case 'Shift Log': return <ShiftLogPage machines={machines} operators={operators} products={products} moulds={moulds} />;
      case 'Breakdowns': return <BreakdownLogPage machines={machines} />;
      default: return null;
    }
  };

  if (!session) return <Login onSuccess={() => {}} />;
  if (!profile) return <div className="loading">Initializing...</div>;

  // Handover Flow (Supervisors Only)
  if (appSettings?.pendingHandover && profile.role !== 'Admin') {
    if (profile.email.toLowerCase() === appSettings.lastHandoverSummary?.outgoing_supervisor_email?.toLowerCase()) {
      return (
        <div className="loading" style={{flexDirection:'column', gap:'20px'}}>
          <div className="ua animate-pulse" style={{width:'80px', height:'80px', fontSize:'24px', background:'var(--amber)', color:'white'}}>H</div>
          <div style={{textAlign:'center'}}>
            <div style={{fontSize:'20px', fontWeight:600}}>Handover in Progress</div>
            <div style={{color:'var(--text3)', marginTop:'8px', maxWidth:'300px'}}>Waiting for the incoming supervisor to acknowledge your shift summary.</div>
            <button className="btn bdan bsm" style={{marginTop:'24px'}} onClick={() => supabase.auth.signOut()}>Sign Out Anyway</button>
          </div>
        </div>
      );
    }
    return (
      <ShiftHandoverPage 
        summary={appSettings.lastHandoverSummary} 
        shiftSettings={shiftSettings} 
        supervisorName={profile.fullName} 
        outgoingSupervisorEmail={appSettings.lastHandoverSummary?.outgoing_supervisor_email} 
        onAcknowledge={handleHandoverAcknowledge} 
      />
    );
  }

  // Initial Onboarding Step (Operator Assignment - Supervisors Only)
  if (isInitialAssignmentOpen && profile.role !== 'Admin') {
    return (
      <div style={{ height: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <ForceOperatorAssignmentModal 
          machines={machines.filter(m => m.status === 'Running')} 
          operators={operators} 
          onConfirm={async (asgs) => {
            for (const a of asgs) {
              if (a.operatorId) {
                await supabase.from('machines').update({ current_operator_id: a.operatorId }).eq('id', a.machineId);
                const opName = operators.find(o => o.id === a.operatorId)?.name || a.operatorId;
                await addLogEntry(a.machineId, 'Operator Assigned', `Operator ${opName} assigned for new shift`, a.operatorId);
              }
            }
            setMachines(prev => prev.map(m => {
              const a = asgs.find(asg => asg.machineId === m.id);
              return a ? { ...m, currentOperatorId: a.operatorId } : m;
            }));
            setIsInitialAssignmentOpen(false);
          }}
          onClose={() => setIsInitialAssignmentOpen(false)}
        />
      </div>
    );
  }

  return (
    <div id="app-layout">
      <div id="sidebar" className={isSidebarCollapsed ? 'collapsed' : ''}>
        <div className="sl" style={{ display: 'flex', alignItems: 'center', justifyContent: isSidebarCollapsed ? 'center' : 'space-between', minHeight: '64px' }}>
          {!isSidebarCollapsed && (
            <div style={{ flex: 1 }}>
              <div className="sl-t">IMM CORE</div>
              <div className="sl-s">Execution System</div>
            </div>
          )}
          <button className="btn bsm" onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)} style={{ padding: '8px', marginLeft: isSidebarCollapsed ? '0' : '8px' }}>
            {isSidebarCollapsed ? <Menu size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>
        <div className="su">
          <div className="ua">{(profile.fullName || 'U').split(' ').map(n=>n[0]).join('')}</div>
          {!isSidebarCollapsed && <div><div className="un">{profile.fullName}</div><div className="ur">{profile.role || 'Supervisor'}</div></div>}
        </div>
        <nav className="snav">
            <NavItem icon={<Factory size={16}/>} label="Shop Floor" active={activeTab==='Shop Floor'} onClick={()=>setActiveTab('Shop Floor')}/>
            <NavItem icon={<ClipboardList size={16}/>} label="Inspections" active={activeTab==='Inspections'} onClick={()=>setActiveTab('Inspections')}/>
            <NavItem icon={<History size={16}/>} label="Batch Log" active={activeTab==='Batch Log'} onClick={()=>setActiveTab('Batch Log')}/>
            <NavItem icon={<ScrollText size={16}/>} label="Shift Log" active={activeTab==='Shift Log'} onClick={()=>setActiveTab('Shift Log')}/>
            <NavItem icon={<AlertCircle size={16}/>} label="Breakdowns" active={activeTab==='Breakdowns'} onClick={()=>setActiveTab('Breakdowns')}/>
            {(profile?.role === 'Admin' || profile?.role === 'PowerUser') && (
              <NavItem icon={<Cpu size={16}/>} label="Admin Console" active={activeTab==='Machines'} onClick={()=>setActiveTab('Machines')}/>
            )}
        </nav>
      </div>

      <main id="main">
        <header id="topbar" style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center' }}>
          <div>
            <div className="pt">{activeTab}</div>
            <div className="ps">LIVE · Unit Output Dashboard</div>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px', background: 'rgba(255,255,255,0.03)', padding: '6px 20px', borderRadius: '30px', border: '1px solid var(--border)' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '15px', fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--text)' }}>
                {new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
              </div>
              <div style={{ fontSize: '9px', fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase' }}>
                {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
              </div>
            </div>
            <div style={{ width: '1px', height: '24px', background: 'var(--border)' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div className="pill pg" style={{ padding: '2px 10px', fontSize: '11px', fontWeight: 800 }}>SHIFT {appSettings?.currentShift || 'A'}</div>
              {(profile?.role === 'Supervisor' ? profile?.fullName : appSettings?.activeSupervisorName) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text2)', borderLeft: '1px solid var(--border)', paddingLeft: '12px' }}>
                  <UserPlus size={14} style={{ color: 'var(--blue)' }} />
                  <span style={{ fontSize: '11px', fontWeight: 600 }}>{profile?.role === 'Supervisor' ? profile?.fullName : appSettings?.activeSupervisorName}</span>
                </div>
              )}
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <button className="btn bdan bsm" onClick={profile.role === 'Admin' ? () => supabase.auth.signOut() : ()=>setIsHandoverSummaryOpen(true)}>
              <LogOut size={16}/> Sign Out
            </button>
          </div>
        </header>
        <section id="content">{renderContent()}</section>
      </main>

      {pendingAction && (
        <div className="ov animate-fade-in">
          <div className="modal animate-scale-in" style={{width:'320px', padding:'24px', textAlign:'center'}}>
            <div style={{marginBottom:'20px'}}>
              <div style={{fontSize:'18px',fontWeight:600,marginBottom:'8px'}}>Safety Confirmation</div>
              <div style={{fontSize:'13px',color:'var(--text2)'}}>Enter PIN (1234) to confirm machine STOP</div>
            </div>
            <input 
              type="password" 
              className="fi" 
              style={{width:'100%',textAlign:'center',fontSize:'24px',letterSpacing:'8px',marginBottom:'20px'}}
              autoFocus
              maxLength={4}
              onChange={async (e) => {
                if (e.target.value === '1234') {
                  const { machineId, nextStatus } = pendingAction.data;
                  setMachines((prev: Machine[]) => prev.map(m => m.id === machineId ? { ...m, status: nextStatus as MachineStatus, currentOperatorId: null as any } : m));
                  await supabase.from('machines').update({ status: nextStatus, current_operator_id: null }).eq('id', machineId);
                  
                  // Log the stop event
                  await addLogEntry(machineId, 'Machine Stopped', 'Machine manually stopped by supervisor');
                  
                  setPendingAction(null);
                }
              }}
            />
            <button className="btn bbfull bsec" onClick={()=>setPendingAction(null)}>Cancel</button>
          </div>
        </div>
      )}
      {isHandoverSummaryOpen && <HandoverSummaryModal machines={machines} pendingCrates={pendingCrates} onClose={()=>setIsHandoverSummaryOpen(false)} onConfirm={async (data) => {
          try {
            // 1. Log the audit summary
            const { error: logErr } = await supabase.from('shift_summaries').insert({
                id: `S-${Date.now()}`,
                shift_date: new Date().toISOString().split('T')[0],
                shift_id: appSettings?.currentShift || 'A',
                supervisor_name: profile?.fullName || 'Supervisor',
                handover_time: new Date().toISOString(),
                total_output: data.totalOutput,
                running_machines: data.runningMachines,
                pending_crates: data.pendingCrates,
                remarks: data.notes || 'End of shift handover summary'
            });

            if (logErr) throw new Error(`Log Error: ${logErr.message}`);

            // 2. Alert the system that a handover is pending for the next user
            const { error: setErr } = await supabase.from('app_settings').upsert({ 
                id: 'global',
                pending_handover: true, 
                last_handover_summary: data, 
                outgoing_supervisor_email: profile?.email || null,
                current_shift: appSettings?.currentShift || 'A'
            });

            if (setErr) throw new Error(`State Error: ${setErr.message}`);

            // 3. Only sign out IF the above succeeded
            await supabase.auth.signOut();
          } catch (err: any) {
            console.error('Sign Out Handover Error:', err);
            alert(`Handover failed! Your summary was not saved: ${err.message}`);
          }
      }} />}
      {selectedMachineId && <BinCompleteModal machine={machines.find(m=>m.id===selectedMachineId)!} binNumber={machines.find(m=>m.id===selectedMachineId)!.currentBinNumber} onClose={()=>setSelectedMachineId(null)} onConfirm={handleBinComplete} />}
      {inspectingBin && <InspectionModal binId={inspectingBin.id} netQty={inspectingBin.netQty} onClose={()=>setInspectingBin(null)} onConfirm={async (data)=>{
          const diff = data.goodQty - inspectingBin.netQty;
          
          await supabase.from('crates').update({ status: 'Completed', net_qty: data.goodQty }).eq('id', inspectingBin.id);
          
          if (diff !== 0) {
            const crate = pendingCrates.find(c => c.id === inspectingBin.id);
            if (crate && crate.batchId) {
              const b = batchRecords.find(br => br.id === crate.batchId);
              if (b) {
                await supabase.from('batch_records')
                  .update({ total_output: (b.totalOutput || 0) + diff })
                  .eq('id', crate.batchId);
              }
            }
          }

          setPendingCrates(prev => prev.filter(c => c.id !== inspectingBin.id));
          setInspectingBin(null);
      }} />}
      {breakingMachineId && <BreakdownModal machineId={breakingMachineId} machineName={machines.find(m=>m.id===breakingMachineId)?.name || ''} onClose={()=>setBreakingMachineId(null)} onConfirm={async (data)=>{
          const m = machines.find(ma=>ma.id===breakingMachineId)!;
          await supabase.from('breakdown_records').insert({ id: `BRK-${Date.now()}`, machine_id: m.id, machine_name: m.name, start_time: new Date().toISOString(), reason: data.event, remarks: data.remarks, operator_id: m.currentOperatorId || 'UNASSIGNED', supervisor_name: profile?.fullName || 'Supervisor', status: 'Open' });
          await supabase.from('machines').update({ status: 'Maintenance', breakdown_start_time: Date.now() }).eq('id', m.id);
          await addLogEntry(m.id, 'Breakdown Reported', `Machine into maintenance: ${data.event}`, m.currentOperatorId || undefined);
          setBreakingMachineId(null);
      }} />}
      {resolvingMachineId && <ResolveBreakdownModal machineName={machines.find(m=>m.id===resolvingMachineId)?.name || ''} onClose={()=>setResolvingMachineId(null)} onConfirm={async ()=>{
          const m = machines.find(ma=>ma.id===resolvingMachineId)!;
          const endTime = new Date();
          const startTime = m.breakdownStartTime ? new Date(m.breakdownStartTime) : new Date();
          const duration = Math.round((endTime.getTime() - startTime.getTime()) / 60000);

          // Update the open breakdown record
          await supabase.from('breakdown_records')
            .update({ status: 'Resolved', end_time: endTime.toISOString(), duration_minutes: duration })
            .eq('machine_id', resolvingMachineId)
            .eq('status', 'Open');

          await supabase.from('machines').update({ status: 'Idle', breakdown_start_time: null }).eq('id', resolvingMachineId);
          setMachines((prev: Machine[]) => prev.map(m => m.id === resolvingMachineId ? { ...m, status: 'Idle', breakdownStartTime: undefined } : m));
          await addLogEntry(resolvingMachineId, 'Breakdown Resolved', `Maintenance completed in ${duration}m, machine ready`);
          setResolvingMachineId(null);
      }} />}
      {settingUpMachineId && <JobSetupModal machine={machines.find(m=>m.id===settingUpMachineId)!} allMachines={machines} products={products} moulds={moulds} rawMaterials={rawMaterials} productMaterials={productMaterials} onClose={()=>setSettingUpMachineId(null)} onAssignOperator={()=>setAssigningOperatorMachineId(settingUpMachineId)} onConfirm={async (data)=>{
          const p = products.find(pr => pr.id === data.productId);
          if (!p) return;

          const { batchId: bid, batchDateStr: batchDate } = getBatchSummary(p.batchIdentifier || 'XX');
          
          if (data.isMouldChanged) {
            // New Job - Always start new batch
            await supabase.from('batch_records').upsert({ 
              id: bid, 
              machine_id: settingUpMachineId, 
              product_id: data.productId, 
              product_name: p.name, 
              product_code: p.itemCode, 
              mould_id: data.mouldId, 
              material_id: data.materialId, 
              material_grade: data.materialGrade, 
              material_batch: data.materialBatch, 
              operator_id: '', 
              start_time: new Date().toISOString(), 
              crates: 0, 
              total_output: 0, 
              status: 'Active', 
              batch_date: batchDate 
            });
            await supabase.from('machines').update({ 
              status: 'Running', 
              current_mould_id: data.mouldId, 
              active_product_id: data.productId, 
              active_batch_id: bid, 
              active_batch_date: batchDate, 
              current_bin_number: 1, 
              current_shift_production: 0, 
              current_day_production: 0,
              bin_start_time: Date.now(),
              bin_target: data.binTarget
            }).eq('id', settingUpMachineId);
            
            await addLogEntry(settingUpMachineId, 'Machine Started', `New job started for ${p.name} (Batch: ${bid})`);
          } else {
            // Resume Production
            const m = machines.find(ma => ma.id === settingUpMachineId);
            const isDifferentDay = m?.activeBatchDate && m.activeBatchDate !== batchDate;

            if (isDifferentDay) {
              // Day has changed since last stop, do a rollover even on resume
              await supabase.from('batch_records').upsert({ 
                id: bid, 
                machine_id: settingUpMachineId, 
                product_id: data.productId, 
                product_name: p.name, 
                product_code: p.itemCode, 
                mould_id: data.mouldId, 
                material_id: data.materialId, 
                material_grade: data.materialGrade, 
                material_batch: data.materialBatch, 
                operator_id: '', 
                start_time: new Date().toISOString(), 
                crates: 0, 
                total_output: 0, 
                status: 'Active', 
                batch_date: batchDate 
              });
              await supabase.from('machines').update({ 
                status: 'Running', 
                active_batch_id: bid, 
                active_batch_date: batchDate, 
                current_bin_number: 1, 
                current_shift_production: 0, 
                current_day_production: 0,
                bin_start_time: Date.now(),
                bin_target: data.binTarget
              }).eq('id', settingUpMachineId);
              await addLogEntry(settingUpMachineId, 'Machine Resumed', `Resumed with new batch rollover for ${p.name}`);
            } else {
              // Same day - just start running
              await supabase.from('machines').update({ 
                status: 'Running', 
                bin_start_time: Date.now(),
                bin_target: data.binTarget
              }).eq('id', settingUpMachineId);
              await addLogEntry(settingUpMachineId, 'Machine Resumed', `Resumed production for ${p.name}`);
            }
          }
          
          setSettingUpMachineId(null);
      }} />}
      {assigningOperatorMachineId && <ForceOperatorAssignmentModal machines={machines.filter(m=>m.id===assigningOperatorMachineId)} operators={operators} onClose={()=>setAssigningOperatorMachineId(null)} onConfirm={async (asgs) => { 
        setMachines(prev => prev.map(m => { const a = asgs.find(asg => asg.machineId === m.id); return a ? { ...m, currentOperatorId: a.operatorId } : m; }));
        for (const a of asgs) {
          if (a.operatorId) {
            await supabase.from('machines').update({ current_operator_id: a.operatorId }).eq('id', a.machineId);
            const opName = operators.find(o => o.id === a.operatorId)?.name || a.operatorId;
            await addLogEntry(a.machineId, 'Operator Assigned', `Operator ${opName} reassigned mid-shift`, a.operatorId);
          }
        } 
        setAssigningOperatorMachineId(null); 
      }} />}
    </div>
  );
};

const NavItem = ({ icon, label, active, onClick }: any) => <div className={`ni ${active ? 'active' : ''}`} onClick={onClick}><div className="nic">{icon}</div><span>{label}</span></div>;
const MachineCard = ({ machine, products, operators, moulds, onAction, onComplete, onAssign, onResolve }: any) => {
  const p = products.find((pr:any) => pr.id === machine.activeProductId);
  const o = operators.find((op:any) => op.id === machine.currentOperatorId);
  const mld = moulds.find((m:any) => m.id === machine.currentMouldId);
  const [prog, setProg] = useState(0);

  useEffect(() => {
    if (machine.status !== 'Running' || !machine.binStartTime || !mld?.cycleTime || !machine.binTarget) {
      setProg(0); return;
    }
    const update = () => {
      const elapsed = (Date.now() - machine.binStartTime) / 1000;
      const targetSecs = machine.binTarget! * mld.cycleTime!;
      setProg(Math.min(100, Math.max(0, (elapsed / targetSecs) * 100)));
    };
    update();
    const t = setInterval(update, 2000);
    return () => clearInterval(t);
  }, [machine.status, machine.binStartTime, mld, machine.binTarget]);

  // Normalize maintenance to breakdown for css
  const statusClass = machine.status.toLowerCase() === 'maintenance' ? 'breakdown' : machine.status.toLowerCase();
  
  return (
    <div className={`mach ${statusClass}`}>
      <div className="mh">
        <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
          <div className="tag mono" style={{fontSize:'10px',background:'var(--bg4)',padding:'1px 6px'}}>{machine.id}</div>
          <div className="mid">{machine.name}</div>
        </div>
        <div className={`pill ${machine.status==='Running'?'pg':machine.status==='Maintenance'?'pr':'pd'}`}><span className={`dot ${machine.status==='Running'?'g':machine.status==='Maintenance'?'r':'i'}`} />{machine.status}</div>
      </div>
      <div className="mb2">
        {machine.status === 'Running' ? (
          <>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
              <div>
                <div className="ml">Active Job</div>
                <div style={{display:'flex',alignItems:'center',gap:'8px',marginTop:'4px'}}>
                   <div style={{fontSize:'15px',fontWeight:600}}>{p?.name || '---'}</div>
                   <div className="tag tl" style={{fontSize:'12px',fontWeight:700,padding:'2px 8px'}}>{machine.activeBatchId || 'NO BATCH'}</div>
                </div>
              </div>
              <button className="btn bsm" onClick={onAssign}><UserPlus size={12}/></button>
            </div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end',marginBottom:'4px',marginTop:'12px'}}>
              <div className="ml">Bin Progress</div>
              <div style={{fontSize:'11px',fontWeight:700,fontFamily:'var(--mono)',color:'var(--text2)'}}>
                {machine.status === 'Running' && machine.binStartTime && mld?.cycleTime ? 
                  Math.min(machine.binTarget || 1000, Math.floor((Date.now() - machine.binStartTime) / (mld.cycleTime * 1000)) * (mld.cavities || 1)) 
                  : 0} / {machine.binTarget || 1000}
              </div>
            </div>
            <div className="pbg" style={{marginTop:0}}><div className="pf g" style={{width:`${prog}%` }} /></div>
            <div className="omg">
                <div className="om"><div className="oml">Bin</div><div className="omv">#{machine.currentBinNumber}</div></div>
                <div className="om"><div className="oml">Output</div><div className="omv">{machine.currentShiftProduction}</div></div>
                <div className="om"><div className="oml">Operator</div><div className="omv" style={{fontSize:'10px'}}>{o?.name || '---'}</div></div>
            </div>
            <div className="mbr">
               <button className="mbtn mpri" style={{flex:2}} onClick={onComplete}><CheckCircle2 size={13}/> Complete Bin</button>
               <button className="mbtn mwrn" style={{flex:1}} onClick={()=>onAction(machine.id,'Maintenance')}><Wrench size={12}/> Breakdown</button>
               <button className="mbtn mdan" style={{flex:1}} onClick={()=>onAction(machine.id,'Stop')}><Square size={12}/> STOP</button>
            </div>
          </>
        ) : (
          <div style={{padding:'4px 0'}}>
             {(machine.currentMouldId) && (
               <div style={{marginBottom:'12px', padding:'10px', background:'var(--bg3)', borderRadius:'var(--r)', border:'1px solid var(--border)'}}>
                 <div className="ml">Current Mould</div>
                 <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                   <div style={{fontSize:'13px', fontWeight:600}}>{moulds.find((m: any) => m.id === machine.currentMouldId)?.name || machine.currentMouldId}</div>
                   <button className="btn bsm bdan" style={{fontSize:'10px', padding:'2px 8px'}} onClick={()=>onAction(machine.id, 'Unload')}>Unload</button>
                 </div>
               </div>
             )}
              <div className="mbr" style={{marginTop:0}}>
                 {machine.status === 'Idle' && <button className="mbtn mpri" style={{flex:1.5}} onClick={()=>onAction(machine.id,'Start')}><Play size={13}/> Start Job</button>}
                 {machine.status === 'Maintenance' && <button className="mbtn mwrn" style={{flex:1.5}} onClick={onResolve}><CheckCircle2 size={13}/> Resolve</button>}
                 {machine.status !== 'Maintenance' && <button className="mbtn mwrn" style={{flex:1}} onClick={()=>onAction(machine.id,'Maintenance')}><Wrench size={12}/> Breakdown</button>}
                 {machine.status !== 'Idle' && <button className="mbtn mdan" style={{flex:1}} onClick={()=>onAction(machine.id,'Stop')}><Square size={12}/> STOP</button>}
              </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
