import React, { useState, useEffect, useCallback } from 'react';
import './index.css';
import type { Machine, MachineStatus, Operator, Product, Mould, RawMaterial, ProductMaterial, Crate, BatchRecord, ShiftSetting, AppSettings, DefectType, BreakdownReason, CleaningTask } from './types';
import { getBatchSummary } from './utils/batchUtils';
import { supabase } from './lib/supabase';
import { RefreshCw, LogOut, Factory, CheckCircle2, ScanBarcode, ClipboardList, History, ChevronRight, ChevronLeft, ScrollText, AlertCircle, Cpu, Info, Menu, FileSpreadsheet } from 'lucide-react';
import { printProductionSlip } from './utils/printService';

// Components
import MachineCardMUI from './components/MachineCardMUI';

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
import AboutPage from './components/AboutPage';
import { ShiftReportPage } from './components/ShiftReportPage';
import { CameraScanner } from './components/CameraScanner';

type Tab = 'Shop Floor' | 'Overview' | 'Inspections' | 'Batch Log' | 'Machines' | 'Shift Log' | 'Breakdowns' | 'About' | 'Shift Reports';

function MachineCard(props: any) {
  return <MachineCardMUI {...props} />;
}


const App: React.FC = () => {
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<{ fullName: string, email: string, role: string, employeeCode?: string } | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);

  const NavItem = ({ icon, label, active, onClick }: { icon: any, label: string, active: boolean, onClick: () => void }) => (
    <div className={`ni ${active ? 'active' : ''}`} onClick={onClick}>
      <div className="nic">{icon}</div>
      {!isSidebarCollapsed && <span>{label}</span>}
    </div>
  );
  const [isViewOnly, setIsViewOnly] = useState(false);
  const [isAuthorizedSession, setIsAuthorizedSession] = useState(false);
  const [hasSelectedMode, setHasSelectedMode] = useState(false);
  const [loginTime, setLoginTime] = useState<number>(() => {
    const stored = localStorage.getItem('loginTime');
    return stored ? parseInt(stored) : Date.now();
  });
  const [showShiftEndAlert, setShowShiftEndAlert] = useState<{ machineId: string } | null>(null);
  const [showTakeControlModal, setShowTakeControlModal] = useState(false);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('Shop Floor');
  const [, setCurrentTime] = useState(new Date());
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const [pendingCrates, setPendingCrates] = useState<Crate[]>([]);
  const [selectedMachineId, setSelectedMachineId] = useState<string | null>(null);
  const [isHandoverSummaryOpen, setIsHandoverSummaryOpen] = useState(false);
  const [showPrevShift, setShowPrevShift] = useState(false);
  const [prevShiftStats, setPrevShiftStats] = useState<Record<string, { bins: number, output: number }>>({});
  const [inspectingBin, setInspectingBin] = useState<{ id: string, netQty: number, machineId: string } | null>(null);
  const [breakingMachineId, setBreakingMachineId] = useState<string | null>(null);
  const [resolvingMachineId, setResolvingMachineId] = useState<string | null>(null);
  const [settingUpMachineId, setSettingUpMachineId] = useState<string | null>(null);
  const [assigningOperatorMachineId, setAssigningOperatorMachineId] = useState<string | null>(null);
  const [isInitialAssignmentOpen, setIsInitialAssignmentOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ type: 'status' | 'complete', data: any } | null>(null);
  const [pendingBreakdownMachineId, setPendingBreakdownMachineId] = useState<string | null>(null);
  const [breakdownPromptMachineId, setBreakdownPromptMachineId] = useState<string | null>(null);
  const [editingBinMachineId, setEditingBinMachineId] = useState<string | null>(null);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannerSearchTerm, setScannerSearchTerm] = useState('');
  
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  const [shiftSettings, setShiftSettings] = useState<ShiftSetting[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [moulds, setMoulds] = useState<Mould[]>([]);
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);
  const [productMaterials, setProductMaterials] = useState<ProductMaterial[]>([]);
  const [batchRecords, setBatchRecords] = useState<BatchRecord[]>([]);
  const [defectTypes, setDefectTypes] = useState<DefectType[]>([]);
  const [breakdownReasons, setBreakdownReasons] = useState<BreakdownReason[]>([]);
  const [cleaningTasks, setCleaningTasks] = useState<CleaningTask[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'reconnecting' | 'offline'>('connected');

  const handleGlobalScanSuccess = useCallback((decodedText: string) => {
    // Trim whitespace/newlines that barcodes sometimes include
    const trimmed = decodedText.trim();
    setIsScannerOpen(false);
    if (navigator.vibrate) navigator.vibrate([50, 30, 50]);

    // Find the pending crate matching the scanned ID (case-insensitive, trimmed)
    const match = pendingCrates.find(
      c => c.id.trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (match) {
      setInspectingBin({ id: match.id, netQty: match.netQty, machineId: match.machineId });
    } else {
      if (activeTab === 'Inspections') {
        setScannerSearchTerm(trimmed);
      } else {
        // Switch to Inspections tab and populate search so user can see what was scanned
        setActiveTab('Inspections');
        setScannerSearchTerm(trimmed);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCrates, activeTab]);

  const handleScannerClose = useCallback(() => {
    setIsScannerOpen(false);
  }, []);

  // Track browser online/offline as a baseline
  useEffect(() => {
    const goOffline = () => setConnectionStatus('offline');
    const goOnline  = () => setConnectionStatus(prev => prev === 'offline' ? 'reconnecting' : prev);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online',  goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online',  goOnline);
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    supabase.auth.onAuthStateChange((_event, session) => {
        setSession(session);
        if (session) {
          const now = Date.now();
          setLoginTime(now);
          localStorage.setItem('loginTime', now.toString());
        } else {
          localStorage.removeItem('loginTime');
          setHasSelectedMode(false);
        }
        // Reset local flow states on session change
        setIsHandoverSummaryOpen(false);
        setIsInitialAssignmentOpen(false);
    });
  }, []);

  // Sync authorization state in real-time across devices
  // If the active supervisor in the DB changes and does not match the logged-in supervisor,
  // we revoke authorized access and show the Take Control prompt.
  useEffect(() => {
    if (session && profile && profile.role === 'Supervisor' && appSettings?.activeSupervisorName) {
      if (isAuthorizedSession && appSettings.activeSupervisorName !== profile.fullName) {
        setIsAuthorizedSession(false);
        setHasSelectedMode(false);
      }
    }
  }, [appSettings?.activeSupervisorName, profile, session, isAuthorizedSession]);

  const fetchLiveStats = React.useCallback(async () => {
    try {
      const [{data: machs}, {data: batRecs}, {data: crates}] = await Promise.all([
        supabase.from('machines').select('*').order('id'),
        supabase.from('batch_records').select('*').order('start_time', { ascending: false }).limit(50),
        supabase.from('crates').select('*').eq('status', 'Pending Inspection')
      ]);
      if (machs) setMachines(prev => machs.map((m: any) => {
          const old = prev.find(om => om.id === m.id);
          if (!old) return {
              id: m.id, name: m.name, model: m.model,
              currentMouldId: m.current_mould_id, currentOperatorId: m.current_operator_id,
              activeProductId: m.active_product_id, currentBinNumber: m.current_bin_number || 1,
              currentShiftProduction: m.current_shift_production || 0, currentDayProduction: m.current_day_production || 0,
              status: m.status, binTarget: m.bin_target, binStartTime: m.bin_start_time ? Number(m.bin_start_time) : undefined,
              activeBatchId: m.active_batch_id, activeBatchDate: m.active_batch_date,
              breakdownStartTime: m.breakdown_start_time ? Number(m.breakdown_start_time) : undefined,
              oee: m.oee || 0, lastCleaningDone: m.last_cleaning_done, faiApproved: m.fai_approved
          };
          return {
              ...old, status: m.status ?? old.status, currentMouldId: m.current_mould_id ?? old.currentMouldId, 
              currentOperatorId: m.current_operator_id ?? old.currentOperatorId, activeProductId: m.active_product_id ?? old.activeProductId, 
              currentBinNumber: m.current_bin_number ?? old.currentBinNumber, currentShiftProduction: m.current_shift_production ?? old.currentShiftProduction, 
              currentDayProduction: m.current_day_production ?? old.currentDayProduction, binStartTime: m.bin_start_time ? Number(m.bin_start_time) : old.binStartTime,
              binTarget: m.bin_target ?? old.binTarget, activeBatchId: m.active_batch_id ?? old.activeBatchId, activeBatchDate: m.active_batch_date ?? old.activeBatchDate,
              breakdownStartTime: m.breakdown_start_time ? Number(m.breakdown_start_time) : old.breakdownStartTime,
              oee: m.oee ?? old.oee, lastCleaningDone: m.last_cleaning_done ?? old.lastCleaningDone, faiApproved: m.fai_approved ?? old.faiApproved
          };
      }));
      if (batRecs) setBatchRecords(batRecs.map((b: any) => ({ 
          id: b.id, machineId: b.machine_id, productId: b.product_id, productName: b.product_name, productCode: b.product_code,
          mouldId: b.mould_id, materialGrade: b.material_grade, materialBatch: b.material_batch, operatorId: b.operator_id,
          startTime: b.start_time, endTime: b.end_time, crates: b.crates, totalOutput: b.total_output || 0, status: b.status, batchDate: b.batch_date
      })));
      if (crates) setPendingCrates(crates.map((c: any) => ({ 
        id: c.id, batchId: c.batch_id, machineId: c.machine_id, binNumber: c.bin_number, 
        startTime: c.start_time, endTime: c.end_time, grossQty: c.gross_qty, 
        startupScrap: c.startup_scrap, qcSample: c.qc_sample, netQty: c.net_qty, 
        operatorId: c.operator_id, supervisorId: c.supervisor_id, status: c.status 
      })));
      setLastUpdated(new Date());
    } catch (err) { console.error('Live Sync Error:', err); }
  }, []);


  useEffect(() => {
    if (!session) return;
    const pollTimer = setInterval(fetchLiveStats, 30000);
    const handleVisibility = () => { if (document.visibilityState === 'visible') fetchLiveStats(); };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => { 
      clearInterval(pollTimer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [session, fetchLiveStats]);

  // Fetch previous shift stats when toggled
  useEffect(() => {
    if (showPrevShift && Object.keys(prevShiftStats).length === 0) {
      const fetchPrevShift = async () => {
        try {
          const { data: lastHandover } = await supabase
            .from('shift_summaries')
            .select('shift_id, handover_time')
            .order('handover_time', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (lastHandover) {
            const twelveHoursBefore = new Date(new Date(lastHandover.handover_time).getTime() - 14 * 60 * 60 * 1000).toISOString();
            const { data: prevCrates } = await supabase
              .from('crates')
              .select('machine_id, net_qty')
              .eq('shift_id', lastHandover.shift_id)
              .gte('end_time', twelveHoursBefore)
              .lte('end_time', lastHandover.handover_time);
              
            if (prevCrates) {
              const stats: Record<string, { bins: number, output: number }> = {};
              prevCrates.forEach((c: any) => {
                if (!stats[c.machine_id]) stats[c.machine_id] = { bins: 0, output: 0 };
                stats[c.machine_id].bins += 1;
                stats[c.machine_id].output += c.net_qty;
              });
              setPrevShiftStats(stats);
            }
          }
        } catch (err) {
          console.error('Failed to fetch previous shift:', err);
        }
      };
      fetchPrevShift();
    }
  }, [showPrevShift, prevShiftStats]);

  // Automated Background Rollover Check (Runs every 5 mins)
  useEffect(() => {
    if (!session || machines.length === 0) return;
    
    const runAutoRollover = async () => {
      const { batchDateStr: currentBatchDate } = getBatchSummary('XX');
      
      const machinesToRollover = machines.filter(m => 
        m.activeBatchId && 
        (!m.activeBatchDate || m.activeBatchDate !== currentBatchDate)
      );
      
      if (machinesToRollover.length === 0) return;

      console.log(`[Auto-Rollover] Processing ${machinesToRollover.length} machines...`);
      
      for (const m of machinesToRollover) {
        try {
          const p = products.find(pr => pr.id === m.activeProductId);
          const { batchId: baseBatchId, batchDateStr: bDate } = getBatchSummary(p?.batchIdentifier || 'XX');
          const bid = `${baseBatchId}-${m.id}`;

          // Create new batch record if it doesn't exist
          const { data: oldBatch } = await supabase.from('batch_records').select('*').eq('id', m.activeBatchId).maybeSingle();
          
          await supabase.from('batch_records').upsert({ 
            id: bid, 
            machine_id: m.id, 
            product_id: m.activeProductId, 
            product_name: p?.name || '', 
            product_code: p?.itemCode || '', 
            mould_id: m.currentMouldId, 
            material_grade: oldBatch?.material_grade || '', 
            material_batch: oldBatch?.material_batch || '', 
            operator_id: m.currentOperatorId || '', 
            start_time: new Date().toISOString(), 
            crates: 0, 
            total_output: 0, 
            status: 'Active', 
            batch_date: bDate 
          });

          await supabase.from('machines').update({ 
            active_batch_id: bid, 
            active_batch_date: bDate,
            current_bin_number: 1,
            current_day_production: 0
          }).eq('id', m.id);

          await addLogEntry(m.id, 'Auto Rollover', `Batch automatically rolled over to ${bid} (Time passed 06:00)`);
        } catch (err) {
          console.error(`[Auto-Rollover] Failed for ${m.id}:`, err);
        }
      }
      
      // Refresh state after updates
      fetchLiveStats();
    };

    const timer = setInterval(runAutoRollover, 300000); // 5 mins
    // Also run once on mount (after a short delay to ensure machines are loaded)
    const initialTimeout = setTimeout(runAutoRollover, 5000);

    return () => {
      clearInterval(timer);
      clearTimeout(initialTimeout);
    };
  }, [session, machines, products, fetchLiveStats]);

  // Fetch previous shift stats when toggled
  useEffect(() => {
    if (showPrevShift && Object.keys(prevShiftStats).length === 0) {
      const fetchPrevShift = async () => {
        try {
          const { data: lastHandover } = await supabase
            .from('shift_summaries')
            .select('shift_id, handover_time')
            .order('handover_time', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (lastHandover) {
            const twelveHoursBefore = new Date(new Date(lastHandover.handover_time).getTime() - 14 * 60 * 60 * 1000).toISOString();
            const { data: prevCrates } = await supabase
              .from('crates')
              .select('machine_id, net_qty')
              .eq('shift_id', lastHandover.shift_id)
              .gte('end_time', twelveHoursBefore)
              .lte('end_time', lastHandover.handover_time);
              
            if (prevCrates) {
              const stats: Record<string, { bins: number, output: number }> = {};
              prevCrates.forEach((c: any) => {
                if (!stats[c.machine_id]) stats[c.machine_id] = { bins: 0, output: 0 };
                stats[c.machine_id].bins += 1;
                stats[c.machine_id].output += c.net_qty;
              });
              setPrevShiftStats(stats);
            }
          }
        } catch (err) {
          console.error('Failed to fetch previous shift:', err);
        }
      };
      fetchPrevShift();
    }
  }, [showPrevShift, prevShiftStats]);

  useEffect(() => {
    if (!session) return;
    const fetchData = async () => {
      try {
        const [{data: appData}, {data: shiftData}, {data: machs}, {data: pData}, {data: prdData}, {data: opers}, {data: batRecs}, {data: mldData}, {data: rmData}, {data: pmData}, {data: crates}, {data: dTypes}, {data: bReasons}, {data: cTasks}] = await Promise.all([
          supabase.from('app_settings').select('*').eq('id', 'global').maybeSingle(),
          supabase.from('shift_settings').select('*').order('id'),
          supabase.from('machines').select('*').order('id'),
          supabase.from('profiles').select('full_name, email, role, employee_code').eq('id', session.user.id).maybeSingle(),
          supabase.from('products').select('*'),
          supabase.from('operators').select('*'),
          supabase.from('batch_records').select('*').order('start_time', { ascending: false }).limit(50),
          supabase.from('moulds').select('*'),
          supabase.from('raw_materials').select('*'),
          supabase.from('approved_materials').select('*'),
          supabase.from('crates').select('*').eq('status', 'Pending Inspection'),
          supabase.from('defect_types').select('*').order('name'),
          supabase.from('breakdown_reasons').select('*').order('name'),
          supabase.from('cleaning_tasks').select('*').order('label')
        ]);
        if (cTasks) setCleaningTasks(cTasks);
        if (bReasons) setBreakdownReasons(bReasons);

        if (appData) setAppSettings({ 
          id: appData.id, 
          currentShift: appData.current_shift, 
          pendingHandover: appData.pending_handover, 
          lastHandoverSummary: appData.last_handover_summary, 
          outgoingSupervisorEmail: appData.last_handover_summary?.outgoing_supervisor_email,
          activeSupervisorName: appData.active_supervisor_name,
          printLabels: appData.print_labels
        });

        // 2b. Auto-Authorize if user is the active supervisor
        if (pData && appData.active_supervisor_name === pData.full_name && !appData.pending_handover) {
           setIsAuthorizedSession(true);
           if (localStorage.getItem('pendingOperatorAssignment') === 'true' && pData.role !== 'Admin' && pData.role !== 'PowerUser') {
             setIsInitialAssignmentOpen(true);
           }
        }

        // 2c. Check localStorage for View-Only persistence
        const wasViewOnly = localStorage.getItem('isViewOnly') === 'true';
        if (wasViewOnly) setIsViewOnly(true);
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
          setProfile({ fullName: pData.full_name, email: pData.email, role: pData.role || 'Supervisor', employeeCode: pData.employee_code });
        } else {
          // Auto-create missing profile from whitelist for new signups
          const { data: whitelist } = await supabase.from('authorized_supervisors').select('*').eq('email', session.user.email).maybeSingle();
          const { data: neu, error: createErr } = await supabase.from('profiles').insert({
            id: session.user.id,
            full_name: whitelist?.full_name || 'New User',
            email: session.user.email,
            employee_code: whitelist?.employee_code || null,
            role: 'Supervisor'
          }).select().maybeSingle();

          if (createErr) console.error('Auto-Profile Error:', createErr);
          if (neu) setProfile({ fullName: neu.full_name, email: neu.email, role: neu.role, employeeCode: neu.employee_code });
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
        if (dTypes) setDefectTypes(dTypes);
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
          if (appData.current_shift !== detected && !appData.pending_handover && pData?.role !== 'Admin' && pData?.role !== 'PowerUser') {
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
            }, ...prev].slice(0, 50));
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
            activeSupervisorName: a.active_supervisor_name,
            printLabels: a.print_labels
          });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'operators' }, (p) => {
          if (p.eventType === 'DELETE') {
            setOperators(prev => prev.filter(o => o.id !== p.old.id));
          } else if (p.eventType === 'INSERT') {
            const o = p.new as any;
            setOperators(prev => [...prev, { id: o.id, name: o.name, employeeId: o.employee_id, isCertified: o.is_certified }]);
          } else if (p.eventType === 'UPDATE') {
            const o = p.new as any;
            setOperators(prev => prev.map(op => op.id === o.id ? { id: o.id, name: o.name, employeeId: o.employee_id, isCertified: o.is_certified } : op));
          }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'defect_types' }, (p) => {
          if (p.eventType === 'DELETE') {
            setDefectTypes(prev => prev.filter(d => d.id !== p.old.id));
          } else if (p.eventType === 'INSERT') {
            const d = p.new as any;
            setDefectTypes(prev => [...prev, d].sort((a,b) => a.name.localeCompare(b.name)));
          } else if (p.eventType === 'UPDATE') {
            const d = p.new as any;
            setDefectTypes(prev => prev.map(dt => dt.id === d.id ? d : dt).sort((a,b) => a.name.localeCompare(b.name)));
          }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'breakdown_reasons' }, (p) => {
          if (p.eventType === 'DELETE') {
            setBreakdownReasons(prev => prev.filter(r => r.id !== p.old.id));
          } else if (p.eventType === 'INSERT') {
            const r = p.new as any;
            setBreakdownReasons(prev => [...prev, r].sort((a,b) => a.name.localeCompare(b.name)));
          } else if (p.eventType === 'UPDATE') {
            const r = p.new as any;
            setBreakdownReasons(prev => prev.map(rt => rt.id === r.id ? r : rt).sort((a,b) => a.name.localeCompare(b.name)));
          }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cleaning_tasks' }, (p) => {
          if (p.eventType === 'DELETE') {
            setCleaningTasks(prev => prev.filter(t => t.id !== p.old.id));
          } else if (p.eventType === 'INSERT') {
            const t = p.new as any;
            setCleaningTasks(prev => [...prev, t].sort((a,b) => a.label.localeCompare(b.label)));
          } else if (p.eventType === 'UPDATE') {
            const t = p.new as any;
            setCleaningTasks(prev => prev.map(ct => ct.id === t.id ? t : ct).sort((a,b) => a.label.localeCompare(b.label)));
          }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setConnectionStatus('connected');
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') setConnectionStatus('offline');
        else setConnectionStatus('reconnecting');
      });

    const profileSubscription = supabase.channel(`profile_${session.user.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${session.user.id}` }, (payload) => {
        const p = payload.new as any;
        setProfile({ fullName: p.full_name, email: p.email, role: p.role || 'Supervisor', employeeCode: p.employee_code });
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
    else if (action === 'Maintenance') {
      setBreakdownPromptMachineId(mid);
    }
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
    else if (action === 'EditBin') {
      setEditingBinMachineId(mid);
    }
    else if (action === 'AssignOperator') {
      setAssigningOperatorMachineId(mid);
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

      // Update the main settings to clear the pending flag
      const { error } = await supabase.from('app_settings').update({ 
        pending_handover: false, 
        current_shift: sid, 
        last_handover_summary: null,
        active_supervisor_name: profile?.fullName || 'Unknown'
      }).eq('id', 'global');
      
      localStorage.removeItem('isViewOnly'); // Clear view-mode when taking control

      // Update the previous handover record with the incoming supervisor name
      const { data: latestSummaries } = await supabase
        .from('shift_summaries')
        .select('id')
        .order('handover_time', { ascending: false })
        .limit(1);

      if (latestSummaries && latestSummaries.length > 0) {
        await supabase
          .from('shift_summaries')
          .update({ incoming_supervisor_name: profile?.fullName || 'Unknown' })
          .eq('id', latestSummaries[0].id);
      }

      if (error) {
        console.error('Handover Error:', error.message);
        alert(`Could not save handover: ${error.message}`);
        return;
      }

      setMachines(prev => prev.map(m => ({ ...m, currentShiftProduction: 0 })));
      setAppSettings(prev => prev ? { ...prev, pendingHandover: false, currentShift: sid, activeSupervisorName: profile?.fullName || 'Unknown' } : null);
      if (profile.role !== 'Admin' && profile.role !== 'PowerUser') {
        localStorage.setItem('pendingOperatorAssignment', 'true');
        setIsInitialAssignmentOpen(true);
      } else {
        setIsAuthorizedSession(true);
      }
    } catch (err) { 
      console.error('Handover Acknowledge Catch:', err); 
      alert('An unexpected error occurred during handover acknowledgment.');
    }
  };

  const handleBinComplete = async (data: any): Promise<boolean> => {
    if (!selectedMachineId) return false;
    
    // 1. Fetch latest machine state
    const { data: latestMachine } = await supabase.from('machines').select('*').eq('id', selectedMachineId).single();
    if (!latestMachine) return false;

    if (!latestMachine.current_operator_id) {
      alert("Error: Operator must be assigned before completing the bin.");
      return false;
    }

    const p = products.find(pr => pr.id === latestMachine.active_product_id);
    const { batchId: currentBatchId, batchDateStr: currentBatchDate } = getBatchSummary(p?.batchIdentifier || 'XX');
    
    let absBatchId = latestMachine.active_batch_id || currentBatchId;

    // Auto-fix: If the current activeBatchId is a shared ID (no machine suffix), 
    // migrate it to a machine-specific ID now.
    if (absBatchId && !absBatchId.includes(`-${selectedMachineId}`)) {
      const fixedId = `${absBatchId}-${selectedMachineId}`;
      const { data: oldBatch } = await supabase.from('batch_records').select('*').eq('id', absBatchId).maybeSingle();
      
      await supabase.from('batch_records').upsert({ 
        id: fixedId, 
        machine_id: selectedMachineId, 
        product_id: latestMachine.active_product_id, 
        product_name: p?.name || '', 
        product_code: p?.itemCode || '', 
        mould_id: latestMachine.current_mould_id, 
        material_grade: oldBatch?.material_grade || '', 
        material_batch: oldBatch?.material_batch || '', 
        operator_id: latestMachine.current_operator_id || '', 
        start_time: oldBatch?.start_time || new Date().toISOString(), 
        crates: 0, 
        total_output: 0, 
        status: 'Active', 
        batch_date: oldBatch?.batch_date || currentBatchDate 
      });

      await supabase.from('machines').update({ active_batch_id: fixedId }).eq('id', selectedMachineId);
      absBatchId = fixedId;
      console.log(`Migrated machine ${selectedMachineId} to machine-specific batch ID: ${fixedId}`);
    }

    // 2. Fetch/Update Batch Record to get global bin count
    const { data: latestBatch } = await supabase.from('batch_records').select('*').eq('id', absBatchId).maybeSingle();
    
    // Auto Rollover at 6 AM
    const isRollover = latestMachine.active_batch_id && (!latestMachine.active_batch_date || latestMachine.active_batch_date !== currentBatchDate);
    
    let bNo: number;
    if (isRollover) {
      const { data: oldBatch } = await supabase.from('batch_records').select('*').eq('id', latestMachine.active_batch_id).maybeSingle();
      
      // Initialize new batch record for the new day
      const machineSpecificBatchId = `${currentBatchId}-${latestMachine.id}`;

      await supabase.from('batch_records').upsert({ 
        id: machineSpecificBatchId, 
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
        active_batch_id: machineSpecificBatchId, 
        active_batch_date: currentBatchDate,
        current_bin_number: 1,
        current_day_production: 0
      }).eq('id', latestMachine.id);

      await addLogEntry(latestMachine.id, 'Batch Rollover', `New production day reset. New Batch: ${machineSpecificBatchId}`);
      
      absBatchId = machineSpecificBatchId;
      bNo = 1;
    } else {
      // Not a rollover, use batch-wide count plus one
      bNo = (latestBatch?.crates || 0) + 1;
    }

    // New Bin Identification: Batch#-MachineID-Bin# (absBatchId already includes MachineID)
    const cid = `${absBatchId}-${bNo}`;
    
    const neu: any = { 
      id: cid, batch_id: absBatchId, machine_id: latestMachine.id, bin_number: bNo, 
      start_time: new Date(latestMachine.bin_start_time || Date.now()).toISOString(), end_time: new Date().toISOString(), gross_qty: data.grossQty, 
      startup_scrap: data.startupScrap, qc_sample: data.qcSample, net_qty: data.netQty, 
      operator_id: latestMachine.current_operator_id || 'UNASSIGNED', supervisor_id: profile?.email || 'System', 
      mould_id: latestMachine.current_mould_id || null, material_batch: latestMachine.material_batch || null,
      shift_id: appSettings?.currentShift || 'A',
      status: 'Pending Inspection' 
    };

    const { error: crateErr } = await supabase.from('crates').insert(neu);
    if (crateErr) {
      console.error('Crate Insert Error:', crateErr);
      if (crateErr.code === '23505') { 
        alert(`Bin collision detected! This batch already has a record for ${cid}.`);
      } else {
        alert(`Could not log bin: ${crateErr.message}`);
      }
      return false;
    }

    // Trigger printing AFTER successful database insertion
    const operatorName = operators.find(o => o.id === latestMachine.current_operator_id)?.name || 'Unknown Operator';
    const supervisorName = appSettings?.activeSupervisorName || profile?.fullName;
    const crateDataForPrint = {
      id: cid,
      batchId: absBatchId,
      machineId: latestMachine.id,
      binNumber: bNo,
      endTime: neu.end_time,
      grossQty: data.grossQty,
      startupScrap: data.startupScrap,
      qcSample: data.qcSample,
      netQty: data.netQty,
      shiftId: neu.shift_id
    };
    printProductionSlip(crateDataForPrint as any, latestMachine, operatorName, false, p?.name, supervisorName, appSettings?.printLabels);

    // Performance: Optimistic UI updates
    setMachines(prev => prev.map(m => m.id === latestMachine.id ? { 
      ...m, 
      currentBinNumber: bNo + 1, 
      currentShiftProduction: (m.currentShiftProduction || 0) + data.netQty,
      currentDayProduction: (m.currentDayProduction || 0) + data.netQty,
      binStartTime: Date.now()
    } : m));

    setBatchRecords(prev => {
      const exists = prev.find(rec => rec.id === absBatchId);
      if (exists) {
        return prev.map(rec => rec.id === absBatchId ? { ...rec, crates: bNo, totalOutput: (rec.totalOutput || 0) + data.netQty } : rec);
      }
      return [{
        id: absBatchId, machineId: latestMachine.id, productId: latestMachine.active_product_id, 
        productName: p?.name || '', productCode: p?.itemCode || '', mouldId: latestMachine.current_mould_id, 
        materialGrade: '', materialBatch: '', operatorId: latestMachine.current_operator_id || '', 
        startTime: new Date().toISOString(), crates: bNo, totalOutput: data.netQty, 
        status: 'Active', batchDate: currentBatchDate || new Date().toISOString().split('T')[0]
      }, ...prev];
    });

    setPendingCrates(prev => [{ 
      id: cid, batchId: neu.batch_id, machineId: neu.machine_id, binNumber: neu.bin_number, 
      startTime: neu.start_time, endTime: neu.end_time, grossQty: neu.gross_qty, 
      startupScrap: neu.startup_scrap, qcSample: neu.qc_sample, netQty: neu.net_qty, 
      operatorId: neu.operator_id, supervisorId: neu.supervisor_id, status: 'Pending Inspection' 
    } as unknown as Crate, ...prev]);

    // Ensure we have the absolute latest total before adding to prevent race conditions
    const { data: freshBatch } = await supabase.from('batch_records').select('total_output').eq('id', absBatchId).single();
    const currentTotal = freshBatch ? freshBatch.total_output : 0;

    // Update global state
    await supabase.from('batch_records').update({ 
      crates: bNo, 
      total_output: currentTotal + data.netQty 
    }).eq('id', absBatchId);

    await supabase.from('machines').update({ 
      current_bin_number: bNo + 1, 
      current_shift_production: (latestMachine.current_shift_production || 0) + data.netQty, 
      current_day_production: (latestMachine.current_day_production || 0) + data.netQty, 
      bin_start_time: Date.now() 
    }).eq('id', latestMachine.id);

    setSelectedMachineId(null);
    // If this was triggered by a breakdown request, open the breakdown modal now
    if (pendingBreakdownMachineId === latestMachine.id) {
      setBreakingMachineId(latestMachine.id);
      setPendingBreakdownMachineId(null);
    }
    return true;
  };

  const getLogicalShiftDate = (shiftId: string): string => {
    const now = new Date();
    // If Shift C and we are in the morning (hour < 12), the shift started yesterday
    if (shiftId === 'C' && now.getHours() < 12) {
      now.setDate(now.getDate() - 1);
    }
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const isShiftEnded = () => {
    // 1. Duration check (Security: Auto-flag after 9 hours)
    const hoursSinceLogin = (Date.now() - loginTime) / (3600000);
    if (hoursSinceLogin > 9) return true;

    if (!appSettings || shiftSettings.length === 0) return false;
    const currentShiftId = appSettings.currentShift;
    const shift = shiftSettings.find(s => s.id === currentShiftId);
    if (!shift) return false;

    const now = new Date();
    const [sH, sM] = shift.startTime.split(':').map(Number);
    const [eH, eM] = shift.endTime.split(':').map(Number);
    
    const sTime = new Date(); sTime.setHours(sH, sM, 0, 0);
    const eTime = new Date(); eTime.setHours(eH, eM, 0, 0);

    // Allow 30 minute buffer for early entry or late finish
    const sTimeBuffered = new Date(sTime.getTime() - 30 * 60000);
    const eTimeBuffered = new Date(eTime.getTime() + 30 * 60000);

    if (eTime < sTime) {
      // Overnight shift (e.g. 22:00 to 06:00)
      // Ended if now is after buffer (e.g. 06:30) but before start buffer (e.g. 21:30)
      if (now < sTimeBuffered && now > eTimeBuffered) return true;
    } else {
      // Normal shift (e.g. 06:00 to 14:00)
      // Ended if now is before start buffer (e.g. 05:30) or after end buffer (e.g. 14:30)
      if (now < sTimeBuffered || now > eTimeBuffered) return true;
    }
    return false;
  };

  const handleOpenBinComplete = async (mid: string) => {
    const m = machines.find(ma => ma.id === mid);
    if (!m) return;

    if (!m.currentOperatorId) {
      alert(`Operator is not assigned for machine ${m.name || m.id}. Please assign an operator first.`);
      setAssigningOperatorMachineId(mid);
      return;
    }

    // 1. Check for Rollover (6 AM Logic)
    const p = products.find(pr => pr.id === m.activeProductId);
    const { batchId: baseBatchId, batchDateStr: currentBatchDate } = getBatchSummary(p?.batchIdentifier || 'XX');
    const machineSpecificBatchId = `${baseBatchId}-${mid}`;

    const isRollover = m.activeBatchId && (!m.activeBatchDate || m.activeBatchDate !== currentBatchDate);

    if (isRollover) {
      // Perform Rollover immediately so the modal has correct data
      const { data: oldBatch } = await supabase.from('batch_records').select('*').eq('id', m.activeBatchId).maybeSingle();
      
      await supabase.from('batch_records').upsert({ 
        id: machineSpecificBatchId, 
        machine_id: mid, 
        product_id: m.activeProductId, 
        product_name: p?.name || '', 
        product_code: p?.itemCode || '', 
        mould_id: m.currentMouldId, 
        material_grade: oldBatch?.material_grade || '', 
        material_batch: oldBatch?.material_batch || '', 
        operator_id: m.currentOperatorId || '', 
        start_time: new Date().toISOString(), 
        crates: 0, 
        total_output: 0, 
        status: 'Active', 
        batch_date: currentBatchDate 
      });

      await supabase.from('machines').update({ 
        active_batch_id: machineSpecificBatchId, 
        active_batch_date: currentBatchDate,
        current_bin_number: 1,
        current_day_production: 0
      }).eq('id', mid);

      setMachines(prev => prev.map(ma => ma.id === mid ? { 
        ...ma, 
        activeBatchId: machineSpecificBatchId, 
        activeBatchDate: currentBatchDate, 
        currentBinNumber: 1,
        currentDayProduction: 0
      } : ma));

      await addLogEntry(mid, 'Batch Rollover', `New production day detected during bin completion. New Batch: ${machineSpecificBatchId}`);
    } else if (m.activeBatchId) {
      // Regular sync with global batch count
      const { data: latestBatch } = await supabase.from('batch_records').select('crates').eq('id', m.activeBatchId).maybeSingle();
      if (latestBatch) {
        const nextBin = (latestBatch.crates || 0) + 1;
        await supabase.from('machines').update({ current_bin_number: nextBin }).eq('id', mid);
        setMachines(prev => prev.map(ma => ma.id === mid ? { ...ma, currentBinNumber: nextBin } : ma));
      }
    }
    
    if (isShiftEnded() && profile?.role === 'Supervisor') {
        setShowShiftEndAlert({ machineId: mid });
        return;
      }
      
    setSelectedMachineId(mid);
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'Shop Floor':
        return (
          <div className="animate-fade-in shop-floor-compact">
            <div className="mach-grid compact-grid">
              {machines.map(m => (
                <MachineCard key={m.id} machine={m} products={products} operators={operators} moulds={moulds} batchRecords={batchRecords} onAction={isViewOnly ? () => {} : handleAction} onComplete={isViewOnly ? () => {} : handleOpenBinComplete} onResolve={isViewOnly ? () => {} : () => setResolvingMachineId(m.id)} />
              ))}
            </div>
          </div>
        );
      case 'Overview':
        return (
          <div className="animate-fade-in">
            <div className="mg overview-grid" style={{ marginBottom: '24px' }}>
              <div className="mc2"><div className="ml">Running Units</div><div className="mv green">{machines.filter(m => m.status === 'Running').length} <span className="ms">Active</span></div></div>
              <div className="mc2"><div className="ml">Pending WIP</div><div className="mv amber">{pendingCrates.length} <span className="ms">Bins</span></div></div>
              <div className="mc2"><div className="ml">Plant OEE</div><div className="mv" style={{color:'var(--purple)'}}>{Math.round(machines.reduce((acc, m) => acc + (m.oee || 0), 0) / (machines.length || 1))}% <span className="ms">Avg</span></div></div>
              <div className="mc2"><div className="ml">Shift Output</div><div className="mv">{(machines.reduce((acc, m) => acc + (m.currentShiftProduction || 0), 0)).toLocaleString()} <span className="ms">Pcs</span></div></div>
              <div className="mc2"><div className="ml">Maintenance</div><div className="mv red">{machines.filter(m => m.status === 'Maintenance').length} <span className="ms">Down</span></div></div>
            </div>

            <div className="card animate-scale-in">
              <div className="ch" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="ct2" style={{ fontWeight: 600 }}>
                  {showPrevShift ? 'Previous Shift Production' : 'Current Shift Production'}
                </span>
                <button 
                  className="btn bsm bsec" 
                  onClick={() => setShowPrevShift(!showPrevShift)}
                >
                  <History size={12} style={{ marginRight: '6px' }} /> 
                  {showPrevShift ? 'Show Current Shift' : 'Show Previous Shift'}
                </button>
              </div>
              <div className="cb">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                  {machines.map(m => {
                    const mPending = pendingCrates.filter(c => c.machineId === m.id).length;
                    const activeProduct = products.find(p => p.id === m.activeProductId);
                    
                    const binsCompleted = showPrevShift 
                      ? (prevShiftStats[m.id]?.bins || 0) 
                      : (m.currentBinNumber > 1 ? m.currentBinNumber - 1 : 0);
                      
                    const shiftOutput = showPrevShift 
                      ? (prevShiftStats[m.id]?.output || 0) 
                      : (m.currentShiftProduction || 0);
                    
                    return (
                      <div key={m.id} style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '12px', background: 'var(--bg2)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
                          <div style={{ fontWeight: 600, fontSize: '14px' }}>{m.name || m.id}</div>
                          <span className={`pill ${m.status === 'Running' ? 'pg' : m.status === 'Maintenance' ? 'pr' : 'pd'}`}>
                            {m.status}
                          </span>
                        </div>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                          <div>
                            <div style={{ fontSize: '10px', color: 'var(--text3)', textTransform: 'uppercase', marginBottom: '2px' }}>Product Name</div>
                            <div style={{ fontSize: '12px', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={activeProduct?.name}>{activeProduct?.name || 'N/A'}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: '10px', color: 'var(--text3)', textTransform: 'uppercase', marginBottom: '2px' }}>Batch Number</div>
                            <div className="mono" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--purple)' }}>{m.activeBatchId ? m.activeBatchId.split('-')[0] : 'N/A'}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: '10px', color: 'var(--text3)', textTransform: 'uppercase', marginBottom: '2px' }}>Bins Completed</div>
                            <div className="mono" style={{ fontSize: '14px', fontWeight: 600 }}>
                              {binsCompleted} 
                              {(!showPrevShift && mPending > 0) && <span style={{ fontSize: '10px', color: 'var(--amber)', fontWeight: 500, marginLeft: '4px' }}>({mPending} WIP)</span>}
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: '10px', color: 'var(--text3)', textTransform: 'uppercase', marginBottom: '2px' }}>{showPrevShift ? 'Prev Shift Output' : 'Current Shift Output'}</div>
                            <div className="mono" style={{ fontSize: '14px', fontWeight: 600, color: 'var(--green)' }}>
                              {shiftOutput.toLocaleString()} <span style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: 500 }}>pcs</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        );
      case 'Inspections': return <InspectionPage pendingCrates={pendingCrates} machines={machines} products={products} batchRecords={batchRecords} operators={operators} onStartInspection={setInspectingBin} onTriggerScan={() => setIsScannerOpen(true)} scannerSearchTerm={scannerSearchTerm} onClearScannerSearchTerm={() => setScannerSearchTerm('')} supervisorName={appSettings?.activeSupervisorName || profile?.fullName} appSettings={appSettings} />;
      case 'Batch Log': return <BatchLogPage batchRecords={batchRecords} products={products} pendingCrates={pendingCrates} operators={operators} />;
      case 'Machines': 
        if (profile?.role !== 'Admin' && profile?.role !== 'PowerUser') {
          setActiveTab('Shop Floor');
          return null;
        }
        return <AdminDashboard machines={machines} operators={operators} moulds={moulds} products={products} rawMaterials={rawMaterials} productMaterials={productMaterials} supervisors={[]} shiftSettings={shiftSettings} defectTypes={defectTypes} breakdownReasons={breakdownReasons} cleaningTasks={cleaningTasks} currentUserRole={profile.role} appSettings={appSettings} />;
      case 'Shift Log': return <ShiftLogPage machines={machines} operators={operators} products={products} moulds={moulds} />;
      case 'Breakdowns': return <BreakdownLogPage machines={machines} />;
      case 'About': return <AboutPage />;
      case 'Shift Reports':
        if (profile?.role !== 'Admin' && profile?.role !== 'PowerUser') {
          setActiveTab('Shop Floor');
          return null;
        }
        return <ShiftReportPage />;
      default: return null;
    }
  };

  if (!session) return <Login onSuccess={() => {}} />;
  if (!profile) return <div className="loading">Initializing...</div>;

  // 1. Handover Flow (Only for supervisors in transition)
  if (appSettings?.pendingHandover && !isAuthorizedSession && !isViewOnly && profile.role !== 'Admin' && profile.role !== 'PowerUser') {
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

  // 2. Login Mode Selection Logic
  if (!hasSelectedMode && !isAuthorizedSession && !isViewOnly && profile.role !== 'Admin' && profile.role !== 'PowerUser' && !appSettings?.pendingHandover) {
    const isConflict = appSettings?.activeSupervisorName && appSettings.activeSupervisorName !== profile.fullName;
    
    return (
      <div className="ov">
        <div className="modal animate-scale-in" style={{ textAlign:'center' }}>
          <div className="mbd" style={{padding:'30px'}}>
             <div className="ua" style={{background: isConflict ? 'var(--amber)' : 'var(--blue)', color:'white', marginBottom:'20px'}}>{isConflict ? '!' : 'S'}</div>
             <h2 style={{fontSize:'20px', marginBottom:'10px'}}>{isConflict ? 'Active Session Detected' : 'Station Access Mode'}</h2>
             <p style={{color:'var(--text3)', fontSize:'13px', marginBottom:'30px'}}>
                {isConflict 
                  ? `Supervisor ${appSettings.activeSupervisorName} is currently active. Would you like to take control or continue in view-only mode?`
                  : `Welcome, ${profile.fullName}. Choose your access mode for this session.`}
             </p>
             <div style={{display:'flex', flexDirection:'column', gap:'12px'}}>
                <button className="btn bpri bfull" onClick={() => {
                  if (isConflict) setShowTakeControlModal(true);
                  else {
                    setHasSelectedMode(true);
                    setIsAuthorizedSession(true);
                    handleHandoverAcknowledge(appSettings?.currentShift || 'A');
                  }
                }}>
                  {isConflict ? 'Take Control' : 'Authorized Access'}
                </button>
                <button className="btn bsec bfull" onClick={() => {
                   setHasSelectedMode(true);
                   setIsViewOnly(true);
                   localStorage.setItem('isViewOnly', 'true');
                }}>View Only Mode</button>
                <button className="btn bdan bfull" style={{background:'none', border:'none', color:'var(--red)'}} onClick={() => {
                   localStorage.removeItem('isViewOnly');
                   supabase.auth.signOut();
                }}>Sign Out / Exit</button>
             </div>
          </div>
        </div>

        {/* Local Takeover Confirmation Modal (Needed because main App isn't rendered yet) */}
        {showTakeControlModal && (
          <div className="ov" style={{zIndex:10001}}>
            <div className="modal animate-scale-in" style={{ width: '400px' }}>
              <div className="mhd">
                 <div className="mtit">Taking Station Control</div>
              </div>
              <div className="mbd" style={{padding:'20px'}}>
                 <p style={{color:'var(--text2)', fontSize:'14px', marginBottom:'20px'}}>
                    You are taking over the system without a formal handover summary. Please confirm to proceed.
                 </p>
                 <div style={{display:'flex', gap:'12px'}}>
                    <button className="btn bsec" style={{flex:1}} onClick={() => setShowTakeControlModal(false)}>Cancel</button>
                    <button className="btn bpri" style={{flex:1}} onClick={() => {
                       setShowTakeControlModal(false);
                       setIsAuthorizedSession(true);
                       handleHandoverAcknowledge(appSettings?.currentShift || 'A');
                    }}>Confirm Takeover</button>
                 </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // 3. Initial Onboarding Step (Operator Assignment)
  if (isInitialAssignmentOpen && profile.role !== 'Admin' && profile.role !== 'PowerUser') {
    return (
      <div style={{ minHeight: '100dvh', background: 'var(--bg)' }}>
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
            setIsAuthorizedSession(true);
            setIsInitialAssignmentOpen(false);
            localStorage.removeItem('pendingOperatorAssignment');
          }}
        />
      </div>
    );
  }


  return (
    <div id="app-layout">
      {/* 1. Session Modals */}
      {showTakeControlModal && (
        <div className="ov" style={{ zIndex: 10000 }}>
          <div className="modal animate-scale-in">
            <div className="mhd">
              <div className="mtit">Taking Station Control</div>
            </div>
            <div className="mbd" style={{ padding: '20px' }}>
              <p style={{ color: 'var(--text2)', fontSize: '14px', marginBottom: '20px' }}>
                {isViewOnly ? 'Upgrade your current view-only session to an active supervisor session?' : 'You are taking over the system without a formal handover summary. Please confirm to proceed.'}
              </p>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button className="btn bsec" style={{ flex: 1 }} onClick={() => setShowTakeControlModal(false)}>Cancel</button>
                <button className="btn bpri" style={{ flex: 1 }} onClick={() => {
                  setShowTakeControlModal(false);
                  setIsViewOnly(false);
                  handleHandoverAcknowledge(appSettings?.currentShift || 'A');
                }}>Confirm Takeover</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {breakdownPromptMachineId && (
        <div className="ov animate-fade-in" style={{ zIndex: 10001, alignItems: 'flex-start', paddingTop: '20px' }}>
          <div className="modal animate-scale-in" style={{ padding: '24px', textAlign: 'center', position: 'relative', bottom: 'auto', top: '0', margin: '0 auto' }}>
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>Log Breakdown: {breakdownPromptMachineId}</div>
              <div style={{ fontSize: '13px', color: 'var(--text2)' }}>
                Was any component produced in the current bin before this breakdown?
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button 
                className="btn bpri bfull" 
                onClick={() => {
                  setPendingBreakdownMachineId(breakdownPromptMachineId);
                  setSelectedMachineId(breakdownPromptMachineId);
                  setBreakdownPromptMachineId(null);
                }}
              >
                Yes, Complete Bin
              </button>
              <button 
                className="btn bdan bfull" 
                style={{ backgroundColor: 'var(--red)', color: '#ffffff', borderColor: 'var(--red)' }}
                onClick={() => {
                  setBreakingMachineId(breakdownPromptMachineId);
                  setBreakdownPromptMachineId(null);
                }}
              >
                No Components Produced
              </button>
              <button 
                className="btn bsec bfull" 
                onClick={() => setBreakdownPromptMachineId(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingAction && (
        <div className="ov animate-fade-in">
          <div className="modal animate-scale-in" style={{ padding: '24px', textAlign: 'center' }}>
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>Safety Confirmation</div>
              <div style={{ fontSize: '13px', color: 'var(--text2)' }}>Enter PIN (1234) to confirm machine STOP</div>
            </div>
            <input
              type="password"
              className="fi"
              style={{ width: '100%', textAlign: 'center', fontSize: '24px', letterSpacing: '8px', marginBottom: '20px' }}
              autoFocus
              maxLength={4}
              onChange={async (e) => {
                if (e.target.value === '1234') {
                  const { machineId, nextStatus } = pendingAction.data;
                  setMachines((prev: Machine[]) => prev.map(m => m.id === machineId ? { ...m, status: nextStatus as MachineStatus, currentOperatorId: null as any } : m));
                  await supabase.from('machines').update({ status: nextStatus, current_operator_id: null }).eq('id', machineId);
                  await addLogEntry(machineId, 'Machine Stopped', 'Machine manually stopped by supervisor');
                  setPendingAction(null);
                }
              }}
            />
            <button className="btn bfull bsec" onClick={() => setPendingAction(null)}>Cancel</button>
          </div>
        </div>
      )}

      {editingBinMachineId && (() => {
        const m = machines.find(ma => ma.id === editingBinMachineId);
        if (!m) return null;
        return (
          <div className="ov animate-fade-in" style={{ zIndex: 10000 }}>
            <div className="modal animate-scale-in" style={{ padding: '24px', textAlign: 'center', width: '300px', margin: 'auto' }}>
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>Set Current Bin</div>
                <div style={{ fontSize: '13px', color: 'var(--text2)' }}>Machine {m.id}</div>
              </div>
              <input
                id="edit-bin-input"
                type="number"
                className="fi"
                style={{ width: '100%', textAlign: 'center', fontSize: '24px', marginBottom: '20px' }}
                autoFocus
                defaultValue={m.currentBinNumber}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') document.getElementById('edit-bin-save-btn')?.click();
                }}
              />
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn bsec" style={{ flex: 1 }} onClick={() => setEditingBinMachineId(null)}>Cancel</button>
                <button id="edit-bin-save-btn" className="btn bpri" style={{ flex: 1 }} onClick={async () => {
                  const val = parseInt((document.getElementById('edit-bin-input') as HTMLInputElement).value);
                  if (isNaN(val) || val < 1) return alert('Invalid bin number');
                  
                  setMachines(prev => prev.map(ma => ma.id === editingBinMachineId ? { ...ma, currentBinNumber: val } : ma));
                  await supabase.from('machines').update({ current_bin_number: val }).eq('id', editingBinMachineId);
                  
                  if (m.activeBatchId) {
                    await supabase.from('batch_records').update({ crates: val - 1 }).eq('id', m.activeBatchId);
                  }
                  
                  setEditingBinMachineId(null);
                }}>Save</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 2. Navigation Components */}
      <div 
        className={`sidebar-overlay ${!isSidebarCollapsed ? 'open' : ''}`} 
        onClick={() => setIsSidebarCollapsed(true)} 
      />

      <div id="sidebar" className={isSidebarCollapsed ? 'collapsed' : 'open'}>
        <div className="sl" style={{ display: 'flex', alignItems: 'center', justifyContent: isSidebarCollapsed ? 'center' : 'space-between', minHeight: '64px' }}>
          {!isSidebarCollapsed && (
            <div style={{ flex: 1 }}>
              <div className="sl-t">IM-MES</div>
              <div className="sl-s">Execution System</div>
            </div>
          )}
          <button className="btn bsm desktop-only" onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)} style={{ padding: '8px', marginLeft: isSidebarCollapsed ? '0' : '8px' }}>
            {isSidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>

        </div>
        <div className="su">
          <div className="ua">{(profile?.fullName || 'U').split(' ').map(n => n[0]).join('')}</div>
          {!isSidebarCollapsed && (
            <div>
              <div className="un">{profile?.fullName}</div>
              <div className="ur">{profile?.role || 'Supervisor'}</div>
            </div>
          )}
        </div>
        <nav className="snav">
            <NavItem icon={<Factory size={16}/>} label="Shop Floor" active={activeTab==='Shop Floor'} onClick={()=>{setActiveTab('Shop Floor'); if(window.innerWidth <= 1024) setIsSidebarCollapsed(true);}}/>
            <NavItem icon={<CheckCircle2 size={16}/>} label="Overview" active={activeTab==='Overview'} onClick={()=>{setActiveTab('Overview'); if(window.innerWidth <= 1024) setIsSidebarCollapsed(true);}}/>
            <NavItem icon={<ClipboardList size={16}/>} label="Inspections" active={activeTab==='Inspections'} onClick={()=>{setActiveTab('Inspections'); if(window.innerWidth <= 1024) setIsSidebarCollapsed(true);}}/>
            <NavItem icon={<History size={16}/>} label="Batch Log" active={activeTab==='Batch Log'} onClick={()=>{setActiveTab('Batch Log'); if(window.innerWidth <= 1024) setIsSidebarCollapsed(true);}}/>
            <NavItem icon={<ScrollText size={16}/>} label="Shift Log" active={activeTab==='Shift Log'} onClick={()=>{setActiveTab('Shift Log'); if(window.innerWidth <= 1024) setIsSidebarCollapsed(true);}}/>
            <NavItem icon={<AlertCircle size={16}/>} label="Breakdowns" active={activeTab==='Breakdowns'} onClick={()=>{setActiveTab('Breakdowns'); if(window.innerWidth <= 1024) setIsSidebarCollapsed(true);}}/>
            {(profile?.role === 'Admin' || profile?.role === 'PowerUser') && (
              <>
                {!isViewOnly && <NavItem icon={<Cpu size={16}/>} label="Admin Console" active={activeTab==='Machines'} onClick={()=>{setActiveTab('Machines'); if(window.innerWidth <= 1024) setIsSidebarCollapsed(true);}}/>}
                <NavItem icon={<FileSpreadsheet size={16}/>} label="Shift Reports" active={activeTab==='Shift Reports'} onClick={()=>{setActiveTab('Shift Reports'); if(window.innerWidth <= 1024) setIsSidebarCollapsed(true);}}/>
              </>
            )}
            <div style={{ flex: 1 }} />
            <NavItem icon={<Info size={16}/>} label="About" active={activeTab==='About'} onClick={()=>{setActiveTab('About'); if(window.innerWidth <= 1024) setIsSidebarCollapsed(true);}}/>
            <div className="ni" style={{ color: 'var(--red)', marginTop: '4px' }} onClick={(profile?.role === 'Admin' || profile?.role === 'PowerUser' || isViewOnly || !appSettings) ? () => supabase.auth.signOut() : () => setIsHandoverSummaryOpen(true)}>
              <div className="nic"><LogOut size={16}/></div>
              <span>End Shift</span>
            </div>
        </nav>
      </div>

      {/* 3. Main Content Area */}
      <main id="main">
        <header id="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button 
              className="btn bsm mobile-only" 
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)} 
              style={{ padding: '8px' }}
            >
              <Menu size={20} />
            </button>
            <div className="desktop-only">
              <div className="pt">{activeTab}</div>
              <div className="ps">LIVE · Unit Output Dashboard</div>
            </div>
            <div className="mobile-only" style={{ fontSize: '15px', fontWeight: 700 }}>
              {activeTab}
            </div>
          </div>

          <div className="topbar-center" style={{ display: 'flex', alignItems: 'center', gap: '15px', background: 'rgba(255,255,255,0.03)', padding: '6px 12px', borderRadius: '30px', border: '1px solid var(--border)' }}>
            <div className="desktop-only" style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--text)' }}>
                {new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
            <div className="desktop-only" style={{ width: '1px', height: '20px', background: 'var(--border)' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div className="pill pg" style={{ padding: '2px 8px', fontSize: '10px', fontWeight: 800 }}>S-{appSettings?.currentShift || 'A'}</div>
              <div className="desktop-only">
                {(profile?.fullName || appSettings?.activeSupervisorName) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text2)', borderLeft: '1px solid var(--border)', paddingLeft: '12px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 600 }}>{profile?.fullName || appSettings?.activeSupervisorName}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div style={{ textAlign: 'right', display: 'flex', gap: '8px', justifyContent: 'flex-end', alignItems: 'center' }}>
            {/* Connection status indicator */}
            <div
              title={connectionStatus === 'connected' ? 'Realtime: Connected' : connectionStatus === 'reconnecting' ? 'Realtime: Reconnecting…' : 'Realtime: Offline'}
              style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                padding: '3px 8px', borderRadius: '20px', fontSize: '9px', fontWeight: 700,
                letterSpacing: '0.04em', textTransform: 'uppercase',
                background: connectionStatus === 'connected' ? 'var(--green-bg)' : connectionStatus === 'reconnecting' ? 'var(--amber-bg)' : 'var(--red-bg)',
                border: `1px solid ${connectionStatus === 'connected' ? 'var(--green-dim)' : connectionStatus === 'reconnecting' ? 'var(--amber-dim)' : 'var(--red-dim)'}`,
                color: connectionStatus === 'connected' ? 'var(--green)' : connectionStatus === 'reconnecting' ? 'var(--amber)' : 'var(--red)',
              }}
            >
              <span className={`conn-dot ${connectionStatus}`} />
              <span className="desktop-only">{connectionStatus === 'connected' ? 'Live' : connectionStatus === 'reconnecting' ? 'Sync…' : 'Offline'}</span>
            </div>
            <div style={{ fontSize: '9px', color: 'var(--text3)', textAlign: 'right', lineHeight: 1.1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <span>LAST SYNC</span>
              <span style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>{lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
            </div>
            <button className="btn bsm bsec" onClick={() => fetchLiveStats()} style={{ padding: '8px', borderRadius: '50%', width: '32px', height: '32px' }}>
              <RefreshCw size={14} />
            </button>
            <button 
              className="btn bsm bdan" 
              style={{ borderRadius: '50%', width: '32px', height: '32px', padding: 0 }}
              onClick={(profile?.role === 'Admin' || profile?.role === 'PowerUser' || isViewOnly || !appSettings) ? () => supabase.auth.signOut() : () => setIsHandoverSummaryOpen(true)}
              title="End Shift / Logout"
            >
              <LogOut size={16} />
            </button>
          </div>
        </header>

        <section id="content">
          {renderContent()}
          <div className="mobile-only" style={{ height: '70px' }} />
        </section>
      </main>

      {/* Bottom Navigation for Mobile */}
      <nav className="bottom-nav">
        <div className={`bn-item ${activeTab === 'Shop Floor' ? 'active' : ''}`} onClick={() => setActiveTab('Shop Floor')}>
          <Factory size={20} />
          <span>Shop Floor</span>
        </div>
        <div className={`bn-item ${activeTab === 'Overview' ? 'active' : ''}`} onClick={() => setActiveTab('Overview')}>
          <CheckCircle2 size={20} />
          <span>Overview</span>
        </div>
        
        <div className="bn-scan" onClick={() => setIsScannerOpen(true)}>
          <div className="bn-scan-inner">
            <ScanBarcode size={24} color="#fff" />
          </div>
        </div>

        <div className={`bn-item ${activeTab === 'Inspections' ? 'active' : ''}`} onClick={() => setActiveTab('Inspections')}>
          <ClipboardList size={20} />
          <span>Inspection</span>
        </div>
        <div className={`bn-item ${activeTab === 'Batch Log' ? 'active' : ''}`} onClick={() => setActiveTab('Batch Log')}>
          <History size={20} />
          <span>Log</span>
        </div>
      </nav>

      {/* 4. Global Modals */}
      {isHandoverSummaryOpen && (
        <HandoverSummaryModal 
          machines={machines} 
          pendingCrates={pendingCrates} 
          onClose={() => setIsHandoverSummaryOpen(false)} 
          onConfirm={async (data) => {
            try {
              const { error: logErr } = await supabase.from('shift_summaries').insert({
                id: `S-${Date.now()}`,
                shift_date: getLogicalShiftDate(appSettings?.currentShift || 'A'),
                shift_id: appSettings?.currentShift || 'A',
                supervisor_name: profile?.fullName || 'Supervisor',
                handover_time: new Date().toISOString(),
                total_output: data.totalOutput,
                running_machines: data.runningMachines,
                pending_crates: data.pendingCrates,
                remarks: data.notes || 'End of shift handover summary'
              });
              if (logErr) throw new Error(`Log Error: ${logErr.message}`);
              const { error: setErr } = await supabase.from('app_settings').update({ 
                pending_handover: true, 
                last_handover_summary: data, 
                outgoing_supervisor_email: profile?.email || null,
                current_shift: appSettings?.currentShift || 'A'
              }).eq('id', 'global');
              if (setErr) throw new Error(`State Error: ${setErr.message}`);
              await supabase.auth.signOut();
            } catch (err: any) {
              console.error('Sign Out Handover Error:', err);
              alert(`Handover failed! Your summary was not saved: ${err.message}`);
            }
          }} 
        />
      )}

      {selectedMachineId && (
        <BinCompleteModal 
          machine={machines.find(m => m.id === selectedMachineId)!} 
          binNumber={machines.find(m => m.id === selectedMachineId)!.currentBinNumber} 
          operatorName={operators.find(o => o.id === machines.find(m => m.id === selectedMachineId)!.currentOperatorId)?.name || 'Unknown Operator'}
          operatorCode={operators.find(o => o.id === machines.find(m => m.id === selectedMachineId)!.currentOperatorId)?.employeeId || 'N/A'}
          shift={appSettings?.currentShift || 'A'}
          productName={products.find(p => p.id === machines.find(m => m.id === selectedMachineId)?.activeProductId)?.name || 'N/A'}
          supervisorName={appSettings?.activeSupervisorName || profile?.fullName}
          appSettings={appSettings}
          defaultBinQty={products.find(p => p.id === machines.find(m => m.id === selectedMachineId)?.activeProductId)?.binQty}
          onClose={() => { setSelectedMachineId(null); setPendingBreakdownMachineId(null); }} 
          onConfirm={handleBinComplete} 
        />
      )}

      {inspectingBin && (
        <InspectionModal 
          binId={inspectingBin.id} 
          netQty={inspectingBin.netQty} 
          defectTypes={defectTypes} 
          operators={operators} 
          onClose={() => setInspectingBin(null)} 
          onConfirm={async (data) => {
            const rejDetails = data.rejections.reduce((acc: any, r: any) => { if (r.count > 0) acc[r.category] = r.count; return acc; }, {});
            const rejQty = data.rejections.reduce((sum: number, r: any) => sum + r.count, 0);
            const diff = data.goodQty - inspectingBin.netQty;
            const inspector = operators.find(o => o.id === data.inspectorId);
            const inspectorDisplay = inspector ? `${inspector.name} (${inspector.employeeId})` : 'System';
            await supabase.from('crates').update({ 
              status: 'Completed', 
              net_qty: data.goodQty,
              rejected_qty: rejQty,
              rejection_details: rejDetails,
              inspected_by: inspectorDisplay,
              inspected_at: new Date().toISOString()
            }).eq('id', inspectingBin.id);
            if (diff !== 0) {
              const crate = pendingCrates.find(c => c.id === inspectingBin.id);
              if (crate?.batchId) {
                const b = batchRecords.find(br => br.id === crate.batchId);
                if (b) await supabase.from('batch_records').update({ total_output: (b.totalOutput || 0) + diff }).eq('id', crate.batchId);
              }
            }
            setPendingCrates(prev => prev.filter(c => c.id !== inspectingBin.id));
            setInspectingBin(null);
          }} 
        />
      )}

      {showShiftEndAlert && (
        <div className="ov" style={{ zIndex: 10001 }}>
          <div className="modal animate-scale-in" style={{ width: '400px' }}>
            <div className="mhd">
               <div className="mtit">Shift Time Ended</div>
            </div>
            <div className="mbd" style={{ padding: '20px' }}>
               <p style={{ color: 'var(--text2)', fontSize: '14px', marginBottom: '20px' }}>
                  The current shift ({appSettings?.currentShift}) has officially ended. Do you still want to continue completing this bin?
               </p>
               <div style={{ display: 'flex', gap: '12px' }}>
                  <button className="btn bsec" style={{ flex: 1 }} onClick={() => setShowShiftEndAlert(null)}>Cancel</button>
                  <button className="btn bpri" style={{ flex: 1 }} onClick={() => {
                     const mid = showShiftEndAlert.machineId;
                     setShowShiftEndAlert(null);
                     setSelectedMachineId(mid);
                  }}>Continue</button>
               </div>
            </div>
          </div>
        </div>
      )}

      {breakingMachineId && (
        <BreakdownModal 
          machineId={breakingMachineId} 
          machineName={machines.find(m => m.id === breakingMachineId)?.name || ''} 
          breakdownReasons={breakdownReasons} 
          onClose={() => setBreakingMachineId(null)} 
          onConfirm={async (data) => {
            const m = machines.find(ma => ma.id === breakingMachineId)!;
            await supabase.from('breakdown_records').insert({ id: `BRK-${Date.now()}`, machine_id: m.id, machine_name: m.name, start_time: new Date().toISOString(), reason: data.event, remarks: data.remarks, operator_id: m.currentOperatorId || 'UNASSIGNED', supervisor_name: profile?.fullName || 'Supervisor', status: 'Open' });
            await supabase.from('machines').update({ status: 'Maintenance', breakdown_start_time: Date.now() }).eq('id', m.id);
            await addLogEntry(m.id, 'Breakdown Reported', `Machine into maintenance: ${data.event}`, m.currentOperatorId || undefined);
            setBreakingMachineId(null);
          }} 
        />
      )}

      {resolvingMachineId && (
        <ResolveBreakdownModal 
          machineName={machines.find(m => m.id === resolvingMachineId)?.name || ''} 
          onClose={() => setResolvingMachineId(null)} 
          onConfirm={async () => {
            const m = machines.find(ma => ma.id === resolvingMachineId)!;
            const endTime = new Date();
            const startTime = m.breakdownStartTime ? new Date(m.breakdownStartTime) : new Date();
            const duration = Math.round((endTime.getTime() - startTime.getTime()) / 60000);
            await supabase.from('breakdown_records').update({ status: 'Resolved', end_time: endTime.toISOString(), duration_minutes: duration }).eq('machine_id', resolvingMachineId).eq('status', 'Open');
            
            // Go back to Running if it was a mid-job breakdown (has an active product)
            const nextStatus = m.activeProductId ? 'Running' : 'Idle';
            await supabase.from('machines').update({ status: nextStatus, breakdown_start_time: null }).eq('id', resolvingMachineId);
            setMachines((prev: Machine[]) => prev.map(ma => ma.id === resolvingMachineId ? { ...ma, status: nextStatus, breakdownStartTime: undefined } : ma));
            await addLogEntry(resolvingMachineId, 'Breakdown Resolved', `Maintenance completed in ${duration}m, machine ${nextStatus === 'Running' ? 'resumed job' : 'ready'}`);
            setResolvingMachineId(null);
          }} 
        />
      )}

      {settingUpMachineId && (
        <JobSetupModal 
          machine={machines.find(m => m.id === settingUpMachineId)!} 
          allMachines={machines} 
          products={products} 
          moulds={moulds} 
          rawMaterials={rawMaterials} 
          productMaterials={productMaterials} 
          cleaningTasks={cleaningTasks} 
          onClose={() => setSettingUpMachineId(null)} 
          onAssignOperator={() => setAssigningOperatorMachineId(settingUpMachineId)} 
          onConfirm={async (data) => {
            const p = products.find(pr => pr.id === data.productId);
            if (!p) return;
            const { batchId: baseBatchId, batchDateStr: batchDate } = getBatchSummary(p.batchIdentifier || 'XX');
            const bid = `${baseBatchId}-${settingUpMachineId}`;
            
            if (data.isMouldChanged) {
              await supabase.from('batch_records').upsert({ 
                id: bid, machine_id: settingUpMachineId, product_id: data.productId, 
                product_name: p.name, product_code: p.itemCode, mould_id: data.mouldId, 
                material_id: data.materialId, material_grade: data.materialGrade, 
                material_batch: data.materialBatch, operator_id: '', 
                start_time: new Date().toISOString(), crates: 0, total_output: 0, 
                status: 'Active', batch_date: batchDate 
              });
              await supabase.from('machines').update({ 
                status: 'Running', current_mould_id: data.mouldId, active_product_id: data.productId, 
                active_batch_id: bid, active_batch_date: batchDate, current_bin_number: 1, 
                current_shift_production: 0, current_day_production: 0, bin_start_time: Date.now(), bin_target: data.binTarget
              }).eq('id', settingUpMachineId);
              await addLogEntry(settingUpMachineId, 'Machine Started', `New job started for ${p.name} (Batch: ${bid})`);
            } else {
              const m = machines.find(ma => ma.id === settingUpMachineId);
              const isDiffDay = m?.activeBatchDate && m.activeBatchDate !== batchDate;
              if (isDiffDay) {
                await supabase.from('batch_records').upsert({ 
                  id: bid, machine_id: settingUpMachineId, product_id: data.productId, 
                  product_name: p.name, product_code: p.itemCode, mould_id: data.mouldId, 
                  material_id: data.materialId, material_grade: data.materialGrade, 
                  material_batch: data.materialBatch, operator_id: '', 
                  start_time: new Date().toISOString(), crates: 0, total_output: 0, 
                  status: 'Active', batch_date: batchDate 
                });
                await supabase.from('machines').update({ 
                  status: 'Running', active_batch_id: bid, active_batch_date: batchDate, 
                  current_bin_number: 1, current_shift_production: 0, current_day_production: 0, 
                  bin_start_time: Date.now(), bin_target: data.binTarget
                }).eq('id', settingUpMachineId);
                await addLogEntry(settingUpMachineId, 'Machine Resumed', `Resumed with rollover for ${p.name}`);
              } else {
                const { data: latestBatch } = await supabase.from('batch_records').select('crates').eq('id', bid).maybeSingle();
                const nextBin = (latestBatch?.crates || 0) + 1;
                await supabase.from('machines').update({ status: 'Running', bin_start_time: Date.now(), bin_target: data.binTarget, current_bin_number: nextBin }).eq('id', settingUpMachineId);
                setMachines(prev => prev.map(ma => ma.id === settingUpMachineId ? { ...ma, status: 'Running', binStartTime: Date.now(), binTarget: data.binTarget, currentBinNumber: nextBin } : ma));
                await addLogEntry(settingUpMachineId, 'Machine Resumed', `Resumed for ${p.name}. Next Bin: #${nextBin}`);
              }
            }
            setSettingUpMachineId(null);
          }} 
        />
      )}

      {assigningOperatorMachineId && (
        <ForceOperatorAssignmentModal 
          machines={machines.filter(m => m.id === assigningOperatorMachineId)} 
          operators={operators} 
          onClose={() => setAssigningOperatorMachineId(null)} 
          onConfirm={async (asgs) => { 
            setMachines(prev => prev.map(m => { const a = asgs.find(asg => asg.machineId === m.id); return a ? { ...m, currentOperatorId: a.operatorId } : m; }));
            for (const a of asgs) {
              if (a.operatorId) {
                await supabase.from('machines').update({ current_operator_id: a.operatorId }).eq('id', a.machineId);
                const opName = operators.find(o => o.id === a.operatorId)?.name || a.operatorId;
                await addLogEntry(a.machineId, 'Operator Assigned', `Operator ${opName} reassigned mid-shift`, a.operatorId);
              }
            } 
            setAssigningOperatorMachineId(null); 
          }} 
        />
      )}

      {isScannerOpen && (
        <CameraScanner
          onSuccess={handleGlobalScanSuccess}
          onClose={handleScannerClose}
        />
      )}
    </div>
  );
};

export default App;
