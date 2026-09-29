import React, { useState, useEffect, useCallback } from 'react';
import './index.css';
import type { Machine, Crate, BatchRecord, Product, Operator, DefectType, AppSettings } from './types';
import { supabase } from './lib/supabase';
import { RefreshCw, LogOut, ClipboardList, ScanBarcode, Printer, Package, ListFilter, ArrowUpDown, ArrowRight, CheckCircle2, Calendar, ShieldAlert } from 'lucide-react';
import { FinalInspectionPage } from './components/FinalInspectionPage';
import { QRCodeSVG } from 'qrcode.react';

// Components & Modals
import InspectionModal from './components/InspectionModal';
import Login from './components/Login';
import { CameraScanner } from './components/CameraScanner';
import { printProductionSlip, formatDateDMY } from './utils/printService';
import { formatUnitId, parseScannedUnitId } from './utils/batchUtils';

const AppInspection: React.FC = () => {
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<{ fullName: string, email: string, role: string, employeeCode?: string } | null>(null);
  
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'reconnecting' | 'offline'>('connected');
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  
  const [pendingCrates, setPendingCrates] = useState<Crate[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [batchRecords, setBatchRecords] = useState<BatchRecord[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [defectTypes, setDefectTypes] = useState<DefectType[]>([]);
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);

  const [inspectingBin, setInspectingBin] = useState<{ id: string, netQty: number, machineId: string } | null>(null);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [reprintCrate, setReprintCrate] = useState<Crate | null>(null);

  // Tab and filtering/sorting state
  const [activeTab, setActiveTab] = useState<'overview' | 'inspections' | 'final-inspection'>('overview');
  const [filterProduct, setFilterProduct] = useState<string>('');
  const [filterDate, setFilterDate] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Sidebar collapsible state
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Fetch live stats for list updates
  const fetchLiveStats = useCallback(async () => {
    try {
      const [{data: machs}, {data: batRecs}, {data: crates}] = await Promise.all([
        supabase.from('machines').select('*').order('id'),
        supabase.from('batch_records').select('*').order('start_time', { ascending: false }).limit(100),
        supabase.from('crates').select('*').eq('status', 'Pending Inspection')
      ]);

      if (machs) setMachines(machs.map((m: any) => ({
        id: m.id, name: m.name, model: m.model,
        currentMouldId: m.current_mould_id, currentOperatorId: m.current_operator_id,
        activeProductId: m.active_product_id, currentBinNumber: m.current_bin_number || 1,
        currentShiftProduction: m.current_shift_production || 0, currentDayProduction: m.current_day_production || 0,
        status: m.status, binTarget: m.bin_target, binStartTime: m.bin_start_time ? Number(m.bin_start_time) : undefined,
        activeBatchId: m.active_batch_id, activeBatchDate: m.active_batch_date,
        breakdownStartTime: m.breakdown_start_time ? Number(m.breakdown_start_time) : undefined,
        oee: m.oee || 0, lastCleaningDone: m.last_cleaning_done, faiApproved: m.fai_approved
      })));

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
    } catch (err) {
      console.error('Fetch live sync error:', err);
    }
  }, []);

  // Sync session and handle auth changes
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
  }, []);

  // Network connection state listeners
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

  // Initial and periodic sync when session is active
  useEffect(() => {
    if (!session) return;
    
    const fetchData = async () => {
      try {
        const [{data: appData}, {data: machs}, {data: pData}, {data: prdData}, {data: opers}, {data: batRecs}, {data: crates}, {data: dTypes}] = await Promise.all([
          supabase.from('app_settings').select('*').eq('id', 'global').maybeSingle(),
          supabase.from('machines').select('*').order('id'),
          supabase.from('profiles').select('full_name, email, role, employee_code').eq('id', session.user.id).maybeSingle(),
          supabase.from('products').select('*'),
          supabase.from('operators').select('*'),
          supabase.from('batch_records').select('*').order('start_time', { ascending: false }).limit(100),
          supabase.from('crates').select('*').eq('status', 'Pending Inspection'),
          supabase.from('defect_types').select('*').order('name'),
        ]);

        if (appData) setAppSettings({
          id: appData.id,
          currentShift: appData.current_shift,
          pendingHandover: appData.pending_handover,
          lastHandoverSummary: appData.last_handover_summary,
          outgoingSupervisorEmail: appData.last_handover_summary?.outgoing_supervisor_email,
          activeSupervisorName: appData.active_supervisor_name,
          printLabels: appData.print_labels,
          role_permissions: appData.role_permissions
        });

        if (pData) setProfile({ fullName: pData.full_name, email: pData.email, role: pData.role || 'Inspector', employeeCode: pData.employee_code });
        if (machs) setMachines(machs.map((m: any) => ({
          id: m.id, name: m.name, model: m.model,
          currentMouldId: m.current_mould_id, currentOperatorId: m.current_operator_id,
          activeProductId: m.active_product_id, currentBinNumber: m.current_bin_number || 1,
          currentShiftProduction: m.current_shift_production || 0, currentDayProduction: m.current_day_production || 0,
          status: m.status, binTarget: m.bin_target, binStartTime: m.bin_start_time ? Number(m.bin_start_time) : undefined,
          activeBatchId: m.active_batch_id, activeBatchDate: m.active_batch_date,
          breakdownStartTime: m.breakdown_start_time ? Number(m.breakdown_start_time) : undefined,
          oee: m.oee || 0, lastCleaningDone: m.last_cleaning_done, faiApproved: m.fai_approved
        })));
        if (prdData) setProducts(prdData.map((p: any) => ({ ...p, mouldId: p.mould_id, itemCode: p.item_code, batchIdentifier: p.batch_identifier, binQty: p.bin_qty, stdPackSize: p.std_pack_size })));
        if (opers) setOperators(opers.map((o: any) => ({ ...o, employeeId: o.employee_id, isCertified: o.is_certified })));
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
        if (dTypes) setDefectTypes(dTypes);
        setLastUpdated(new Date());
      } catch (err) {
        console.error('Fetch initial data error:', err);
      }
    };
    fetchData();

    // Subscribe to supabase realtime modifications
    const channel = supabase.channel('realtime_inspection')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'machines' }, (p) => {
        const m = p.new as any;
        if (p.eventType === 'DELETE') {
          setMachines(prev => prev.filter(mach => mach.id !== p.old.id));
        } else {
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
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'crates' }, (p) => {
        const c = p.new as any;
        setPendingCrates(prev => {
          if (prev.some(crate => crate.id === c.id)) return prev;
          return [...prev, {
            id: c.id, batchId: c.batch_id, machineId: c.machine_id, binNumber: c.bin_number,
            startTime: c.start_time, endTime: c.end_time, grossQty: c.gross_qty,
            startupScrap: c.startup_scrap, qcSample: c.qc_sample, netQty: c.net_qty,
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
          printLabels: a.print_labels,
          role_permissions: a.role_permissions
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
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setConnectionStatus('connected');
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') setConnectionStatus('offline');
        else setConnectionStatus('reconnecting');
      });

    const pollTimer = setInterval(fetchLiveStats, 30000);
    const handleVisibility = () => { if (document.visibilityState === 'visible') fetchLiveStats(); };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollTimer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [session, fetchLiveStats]);

  // Barcode scanning callback with database verification fallback
  const handleGlobalScanSuccess = useCallback(async (decodedText: string) => {
    const parsed = parseScannedUnitId(decodedText);
    const trimmed = (parsed.raw || decodedText).trim();
    const normalized = (parsed.normalized || trimmed).trim();
    setIsScannerOpen(false);
    if (navigator.vibrate) navigator.vibrate([50, 30, 50]);

    const rawLower = trimmed.toLowerCase();
    const normLower = normalized.toLowerCase();

    // 1. Search pending crates list in memory
    const match = pendingCrates.find(c => {
      const cid = c.id.trim().toLowerCase();
      const normCid = formatUnitId(c.id).toLowerCase();
      if (cid === rawLower || cid === normLower || normCid === normLower || normCid === rawLower) return true;
      if (parsed.batchId && parsed.binNumber && c.batchId.toLowerCase() === parsed.batchId.toLowerCase() && c.binNumber === parsed.binNumber) return true;
      return false;
    });

    if (match) {
      setInspectingBin({ id: match.id, netQty: match.netQty, machineId: match.machineId });
      return;
    }

    // 2. Direct database search fallback using multi-level matching
    try {
      let dbCrate: any = null;

      // 2a. Try exact ID match first (most common case)
      const { data: exactMatch } = await supabase
        .from('crates')
        .select('*')
        .eq('id', trimmed)
        .maybeSingle();

      if (exactMatch) {
        dbCrate = exactMatch;
      }

      // 2b. If not found and normalized differs, try normalized
      if (!dbCrate && normalized !== trimmed) {
        const { data: normMatch } = await supabase
          .from('crates')
          .select('*')
          .eq('id', normalized)
          .maybeSingle();
        if (normMatch) dbCrate = normMatch;
      }

      // 2c. If still not found and we have batchId+binNumber, search by those
      if (!dbCrate && parsed.batchId && parsed.binNumber) {
        const { data: binMatch } = await supabase
          .from('crates')
          .select('*')
          .eq('batch_id', parsed.batchId)
          .eq('bin_number', parsed.binNumber)
          .maybeSingle();
        if (binMatch) dbCrate = binMatch;
      }

      // 2d. Last resort: partial text search on id
      if (!dbCrate) {
        const { data: likeMatch } = await supabase
          .from('crates')
          .select('*')
          .ilike('id', `%${trimmed}%`)
          .limit(1);
        if (likeMatch && likeMatch.length > 0) dbCrate = likeMatch[0];
      }

      // errors handled per-query above

      if (!dbCrate) {
        alert(`Barcode Unit ID "${trimmed}" is not recognized in the system.`);
        return;
      }

      if (dbCrate.status === 'Completed') {
        const dateStr = new Date(dbCrate.inspected_at || dbCrate.end_time).toLocaleString();
        alert(`Unit ID "${dbCrate.id}" has ALREADY been inspected!\n\nInspected By: ${dbCrate.inspected_by || 'System'}\nInspected At: ${dateStr}\nNet Acceptable Qty: ${dbCrate.net_qty} pcs\nRejected Qty: ${dbCrate.rejected_qty || 0} pcs`);
      } else if (dbCrate.status === 'Pending Inspection') {
        // Crate is pending, let's inject it into list and start inspection modal
        const mappedCrate = {
          id: dbCrate.id,
          batchId: dbCrate.batch_id,
          machineId: dbCrate.machine_id,
          binNumber: dbCrate.bin_number,
          startTime: dbCrate.start_time,
          endTime: dbCrate.end_time,
          grossQty: dbCrate.gross_qty,
          startupScrap: dbCrate.startup_scrap,
          qcSample: dbCrate.qc_sample,
          netQty: dbCrate.net_qty,
          operatorId: dbCrate.operator_id,
          supervisorId: dbCrate.supervisor_id,
          status: dbCrate.status
        } as unknown as Crate;
        
        setPendingCrates(prev => {
          if (prev.some(c => c.id === mappedCrate.id)) return prev;
          return [mappedCrate, ...prev];
        });
        setInspectingBin({ id: dbCrate.id, netQty: dbCrate.net_qty, machineId: dbCrate.machine_id });
      } else {
        alert(`Unit ID "${dbCrate.id}" has status "${dbCrate.status}" and cannot be inspected.`);
      }
    } catch (err) {
      console.error('Database query exception:', err);
      alert('An unexpected error occurred during database lookup.');
    }
  }, [pendingCrates]);

  const handleScannerClose = useCallback(() => {
    setIsScannerOpen(false);
  }, []);

  // Helper: Retrieve product name for a crate
  const getProductName = useCallback((crate: Crate) => {
    const batch = batchRecords.find(b => b.id === crate.batchId);
    if (batch?.productName) return batch.productName;
    const machine = machines.find(m => m.id === crate.machineId);
    if (machine?.activeProductId) {
      const product = products.find(p => p.id === machine.activeProductId);
      if (product?.name) return product.name;
    }
    return 'QC Audit / General WIP';
  }, [batchRecords, machines, products]);

  // Group pending crates product-wise for the Overview Page summaries
  const getProductSummaries = useCallback(() => {
    const groups: Record<string, Crate[]> = {};
    pendingCrates.forEach(crate => {
      const name = getProductName(crate);
      if (!groups[name]) groups[name] = [];
      groups[name].push(crate);
    });

    return Object.entries(groups).map(([name, crates]) => {
      const totalQty = crates.reduce((sum, c) => sum + (c.netQty || 0), 0);
      return {
        productName: name,
        count: crates.length,
        totalQty,
        crates
      };
    }).sort((a, b) => b.count - a.count); // sort by highest number of pending bins
  }, [pendingCrates, getProductName]);

  // Handle reprinting a production slip
  const handleReprint = (crate: Crate, e: React.MouseEvent) => {
    e.stopPropagation(); // Avoid triggering inspection modal click
    setReprintCrate(crate);
    const productName = getProductName(crate);
    const machine = machines.find(m => m.id === crate.machineId) || { id: crate.machineId } as Machine;
    const operator = operators.find(o => o.id === crate.operatorId);
    const supervisorName = appSettings?.activeSupervisorName || profile?.fullName;
    
    setTimeout(() => {
      printProductionSlip(crate, machine, operator?.name, true, productName, supervisorName, appSettings?.printLabels);
      setReprintCrate(null);
    }, 500);
  };

  // Get list of unique product names currently pending for dropdown filters
  const getFilterProductOptions = useCallback(() => {
    const namesSet = new Set<string>();
    pendingCrates.forEach(crate => {
      namesSet.add(getProductName(crate));
    });
    return Array.from(namesSet).sort();
  }, [pendingCrates, getProductName]);

  // Filter and sort the raw crates list for the Inspections view
  const getFilteredAndSortedCrates = useCallback(() => {
    return pendingCrates
      .filter(crate => {
        if (filterProduct && getProductName(crate) !== filterProduct) return false;
        
        if (filterDate) {
          const dateObj = new Date(crate.endTime);
          const yyyy = dateObj.getFullYear();
          const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
          const dd = String(dateObj.getDate()).padStart(2, '0');
          const crateDateStr = `${yyyy}-${mm}-${dd}`;
          if (crateDateStr !== filterDate) return false;
        }
        
        return true;
      })
      .sort((a, b) => {
        const timeA = new Date(a.endTime).getTime();
        const timeB = new Date(b.endTime).getTime();
        return sortOrder === 'asc' ? timeA - timeB : timeB - timeA;
      });
  }, [pendingCrates, filterProduct, filterDate, sortOrder, getProductName]);

    // Access Management: Separate permissions for Visual Inspection and Final Inspection
  const { hasVisualInspection, hasFinalInspection } = React.useMemo(() => {
    const role = profile?.role || 'QC';

    // Admin and PowerUser always have access to both
    if (role === 'Admin' || role === 'PowerUser') {
      return { hasVisualInspection: true, hasFinalInspection: true };
    }

    // Check appSettings.role_permissions from Supabase or localStorage
    const permissionsMap = appSettings?.role_permissions || (appSettings as any)?.printLabels?.role_permissions;
    let rolePerms: string[] | null = null;
    if (permissionsMap && permissionsMap[role]) {
      rolePerms = permissionsMap[role];
    } else {
      try {
        const cached = localStorage.getItem('mes_role_permissions');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed && parsed[role]) {
            rolePerms = parsed[role];
          }
        }
      } catch (e) {}
    }

    if (rolePerms) {
      const hasVisual = rolePerms.includes('Inspections') || rolePerms.includes('QC Inspections') || rolePerms.includes('QC Inspections (Visual)');
      const hasFinal = rolePerms.includes('Final Inspection') || rolePerms.includes('FINAL_INSPECTION') || rolePerms.includes('Final QC Inspection');
      return { hasVisualInspection: hasVisual, hasFinalInspection: hasFinal };
    }

    // Fallback defaults based on role naming
    const norm = role.toLowerCase().trim();
    if (norm === 'final_inspector' || norm === 'final inspector') {
      return { hasVisualInspection: false, hasFinalInspection: true };
    }
    if (norm === 'qc' || norm === 'inspector' || norm === 'qc inspector' || norm === 'supervisor') {
      return { hasVisualInspection: true, hasFinalInspection: true };
    }

    return { hasVisualInspection: false, hasFinalInspection: false };
  }, [profile?.role, appSettings?.role_permissions, (appSettings as any)?.printLabels?.role_permissions]);

  // Tab auto-selection based on access levels
  useEffect(() => {
    if (!hasVisualInspection && hasFinalInspection) {
      setActiveTab('final-inspection');
    } else if (hasVisualInspection && !hasFinalInspection && activeTab === 'final-inspection') {
      setActiveTab('overview');
    }
  }, [hasVisualInspection, hasFinalInspection, activeTab]);

  if (!session) return <Login onSuccess={() => {}} />;
  if (!profile) return <div className="loading">Initializing Inspection Portal...</div>;



  const productSummaries = getProductSummaries();
  const filterOptions = getFilterProductOptions();
  const filteredCrates = getFilteredAndSortedCrates();
  const totalPages = Math.ceil(filteredCrates.length / 15);
  const displayedCrates = filteredCrates.slice((currentPage - 1) * 15, currentPage * 15);

  return (
    <div id="app-layout" className="inspection-app" style={{ flexDirection: 'column' }}>
      
      {/* Sidebar Drawer Overlay */}
      {isSidebarOpen && (
        <div 
          className="sidebar-overlay open" 
          style={{ display: 'block', zIndex: 1000 }}
          onClick={() => setIsSidebarOpen(false)} 
        />
      )}

      {/* Collapsible Sidebar Drawer Panel */}
      <div 
        id="sidebar" 
        className="open"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          bottom: 0,
          width: '280px',
          zIndex: 1001,
          transform: isSidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          background: 'var(--bg2)',
          borderRight: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: isSidebarOpen ? '10px 0 30px rgba(0,0,0,0.5)' : 'none'
        }}
      >
        {/* Sidebar Header */}
        <div style={{ padding: '20px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text)', textTransform: 'uppercase' }}>
            IM-MES
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '2px', fontFamily: 'var(--mono)' }}>
            Inspection Portal
          </div>
        </div>

        {/* User Profile Section */}
        <div className="su" style={{ padding: '16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div className="ua" style={{ width: '32px', height: '32px', fontSize: '12px', background: 'var(--blue-bg)', borderColor: 'var(--blue)', color: 'var(--blue)' }}>
            {(profile.fullName || 'I').split(' ').map(n => n[0]).join('')}
          </div>
          <div>
            <div className="un" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>{profile.fullName}</div>
            <div className="ur" style={{ fontSize: '11px', color: 'var(--text3)' }}>{profile.role || 'Inspector'}</div>
          </div>
        </div>

        {/* Session Details */}
        <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: '20px', flex: 1, overflowY: 'auto' }}>
          
          {/* Shift */}
          <div>
            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: '6px', letterSpacing: '0.05em' }}>Current Shift</div>
            <span className="pill pa" style={{ padding: '4px 12px', fontSize: '11px', fontWeight: 800 }}>
              Shift {appSettings?.currentShift || 'A'}
            </span>
          </div>

          {/* Connection Status */}
          <div>
            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: '6px', letterSpacing: '0.05em' }}>Network Status</div>
            <div
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: '4px 12px', borderRadius: '20px', fontSize: '10px', fontWeight: 800,
                letterSpacing: '0.04em', textTransform: 'uppercase',
                background: connectionStatus === 'connected' ? 'var(--green-bg)' : connectionStatus === 'reconnecting' ? 'var(--amber-bg)' : 'var(--red-bg)',
                border: `1px solid ${connectionStatus === 'connected' ? 'var(--green-dim)' : connectionStatus === 'reconnecting' ? 'var(--amber-dim)' : 'var(--red-dim)'}`,
                color: connectionStatus === 'connected' ? 'var(--green)' : connectionStatus === 'reconnecting' ? 'var(--amber)' : 'var(--red)',
              }}
            >
              <span className={`conn-dot ${connectionStatus}`} />
              <span>{connectionStatus === 'connected' ? 'Connected' : connectionStatus === 'reconnecting' ? 'Reconnecting…' : 'Offline'}</span>
            </div>
          </div>

          {/* Last Sync */}
          <div>
            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: '4px', letterSpacing: '0.05em' }}>Last Synced</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: '13px', fontWeight: 600, color: 'var(--text2)' }}>
              {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
          </div>
        </div>

        {/* Action Controls in Sidebar Footer */}
        <div style={{ padding: '16px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button 
            className="btn bfull bsec" 
            style={{ width: '100%', height: '42px', fontSize: '12px', fontWeight: 700, gap: '8px', boxShadow: 'none' }}
            onClick={() => {
              fetchLiveStats();
              setIsSidebarOpen(false);
            }}
          >
            <RefreshCw size={14} /> Sync Records
          </button>
          
          <button 
            className="btn bfull bdan" 
            style={{ width: '100%', height: '42px', fontSize: '12px', fontWeight: 700, gap: '8px', boxShadow: 'none' }}
            onClick={() => {
              supabase.auth.signOut();
              setIsSidebarOpen(false);
            }}
          >
            <LogOut size={14} /> Log Out
          </button>
        </div>
      </div>

      {/* Extremely Clean and Minimal Top Bar */}
      <header id="topbar" style={{ width: '100%', borderBottom: '1px solid var(--border)', background: 'var(--bg2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Hamburger Menu Toggle */}
          <button 
            onClick={() => setIsSidebarOpen(true)}
            style={{ 
              background: 'transparent', 
              border: 'none', 
              color: 'var(--text)', 
              cursor: 'pointer', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              padding: '6px',
              borderRadius: '4px',
              transition: 'background 0.2s'
            }}
            className="menu-toggle-btn"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ClipboardList size={18} style={{ color: 'var(--md-primary)' }} />
            <span className="pt" style={{ fontWeight: 800, letterSpacing: '-0.2px', fontSize: '15px' }}>IM-MES QC Inspector</span>
          </div>
        </div>

        {/* Minimal Passive Network Health Dot */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingRight: '4px' }}>
          <div 
            title={connectionStatus === 'connected' ? 'Realtime Connected' : 'Offline'}
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: connectionStatus === 'connected' ? 'var(--green)' : 'var(--red)',
              boxShadow: `0 0 6px ${connectionStatus === 'connected' ? 'var(--green)' : 'var(--red)'}`,
              transition: 'all 0.3s ease'
            }}
          />
        </div>
      </header>

      {/* Sub-Navigation: Just Two Simple Buttons */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg2)', padding: '8px 14px', gap: '10px' }}>
        {hasVisualInspection && (
          <button 
            onClick={() => setActiveTab('overview')}
            style={{
              flex: 1,
              padding: '12px 14px',
              borderRadius: '10px',
              background: activeTab === 'overview' || activeTab === 'inspections' ? 'var(--md-primary, #3b82f6)' : 'rgba(255,255,255,0.05)',
              border: activeTab === 'overview' || activeTab === 'inspections' ? '1px solid rgba(59,130,246,0.5)' : '1px solid var(--border)',
              color: activeTab === 'overview' || activeTab === 'inspections' ? '#ffffff' : 'var(--text2)',
              fontWeight: 800,
              cursor: 'pointer',
              fontSize: '14px',
              letterSpacing: '0.3px',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            Visual Inspection
          </button>
        )}
        {hasFinalInspection && (
          <button 
            onClick={() => setActiveTab('final-inspection')}
            style={{
              flex: 1,
              padding: '12px 14px',
              borderRadius: '10px',
              background: activeTab === 'final-inspection' ? '#10b981' : 'rgba(255,255,255,0.05)',
              border: activeTab === 'final-inspection' ? '1px solid rgba(16,185,129,0.5)' : '1px solid var(--border)',
              color: activeTab === 'final-inspection' ? '#022c22' : 'var(--text2)',
              fontWeight: 800,
              cursor: 'pointer',
              fontSize: '14px',
              letterSpacing: '0.3px',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            Final Inspection
          </button>
        )}
      </div>

      {/* Main Content Pane */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', width: '100%', overflowY: 'auto' }}>
        <div style={{ flex: 1, padding: activeTab === 'final-inspection' ? '0' : '24px 20px', maxWidth: activeTab === 'final-inspection' ? '100%' : '800px', margin: '0 auto', width: '100%' }}>
          
          {!hasVisualInspection && !hasFinalInspection ? (
            <div className="card" style={{ padding: '48px 24px', textAlign: 'center', maxWidth: '480px', margin: '40px auto' }}>
              <ShieldAlert size={48} color="var(--red)" style={{ margin: '0 auto 16px' }} />
              <h3 style={{ fontSize: '18px', fontWeight: 800, marginBottom: '8px' }}>Access Restricted</h3>
              <p style={{ color: 'var(--text3)', fontSize: '13px', lineHeight: 1.5, marginBottom: '20px' }}>
                Your assigned role (<strong>{profile.role}</strong>) does not have access permissions for Visual Inspection or Final Inspection.
              </p>
              <div style={{ fontSize: '12px', color: 'var(--text2)' }}>
                Please contact your Plant Administrator to update your Access Management settings in the Admin Console.
              </div>
              <button className="btn bsec bsm" style={{ marginTop: '24px' }} onClick={() => supabase.auth.signOut()}>
                Sign Out
              </button>
            </div>
          ) : activeTab === 'final-inspection' && hasFinalInspection ? (
            <FinalInspectionPage
              currentUser={{
                id: session?.user?.id || '',
                name: profile?.fullName || 'QC Inspector',
                email: profile?.email || '',
                role: profile?.role || 'QC'
              }}
              appSettings={appSettings}
              onBackToVisualInspection={() => {
                if (hasVisualInspection) setActiveTab('overview');
              }}
            />
          ) : activeTab === 'overview' && hasVisualInspection ? (
            /* ========================================================
               TAB 1: OVERVIEW PAGE
               ======================================================== */
            <div>
              {/* Big Scan Button Container */}
              <div className="card" style={{ padding: '40px 24px', textAlign: 'center', background: 'linear-gradient(135deg, var(--bg2), var(--bg3))', border: '1px solid var(--border)', borderRadius: '16px', marginBottom: '28px', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
                <button 
                  onClick={() => setIsScannerOpen(true)}
                  style={{
                    width: '110px',
                    height: '110px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, var(--md-primary), #00d2c4)',
                    border: 'none',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 20px',
                    cursor: 'pointer',
                    boxShadow: '0 12px 35px rgba(0, 173, 181, 0.4)',
                    position: 'relative'
                  }}
                  className="pulse-button"
                >
                  <div className="pulse-ring"></div>
                  <ScanBarcode size={48} />
                </button>
                <h2 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '6px', color: 'var(--text)', letterSpacing: '-0.3px' }}>TAP TO SCAN BARCODE</h2>
                <p style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '28px' }}>Instantly launch the camera to scan a crate QR code or barcode.</p>
                
                {/* Manual Entry field */}
                <div style={{ display: 'flex', gap: '8px', maxWidth: '420px', margin: '0 auto' }}>
                  <input 
                    id="manual-id-input"
                    type="text" 
                    className="fi"
                    placeholder="Or enter Unit ID manually..."
                    style={{ textAlign: 'center', letterSpacing: '0.5px', height: '42px', fontSize: '14px', background: 'var(--bg)', borderColor: 'var(--border)' }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const inputVal = (document.getElementById('manual-id-input') as HTMLInputElement).value;
                        if (inputVal.trim()) {
                          handleGlobalScanSuccess(inputVal.trim());
                          (document.getElementById('manual-id-input') as HTMLInputElement).value = '';
                        }
                      }
                    }}
                  />
                  <button 
                    className="btn bpri" 
                    style={{ height: '42px', padding: '0 24px', borderRadius: 'var(--r)', background: 'var(--md-primary)', fontWeight: 700 }}
                    onClick={() => {
                      const inputVal = (document.getElementById('manual-id-input') as HTMLInputElement).value;
                      if (inputVal.trim()) {
                        handleGlobalScanSuccess(inputVal.trim());
                        (document.getElementById('manual-id-input') as HTMLInputElement).value = '';
                      }
                    }}
                  >
                    Inspect
                  </button>
                </div>
              </div>

              {/* Grouped Pending Inspections Cards Only */}
              <div style={{ marginBottom: '32px' }}>
                <h3 style={{ fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <Package size={16} style={{ color: 'var(--md-primary)' }} /> Product Summaries
                </h3>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                  {productSummaries.map(summary => (
                    <div 
                      key={summary.productName} 
                      onClick={() => {
                        setFilterProduct(summary.productName);
                        setActiveTab('inspections');
                        setCurrentPage(1);
                      }}
                      className="card hover-card" 
                      style={{ 
                        background: 'var(--bg2)', 
                        border: '1px solid var(--border)', 
                        borderRadius: '12px', 
                        padding: '20px', 
                        cursor: 'pointer',
                        display: 'flex', 
                        flexDirection: 'column', 
                        justifyContent: 'space-between',
                        minHeight: '140px',
                        transition: 'all 0.2s ease',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                      }}
                    >
                      <div>
                        {/* Dot indicator and Product Title */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--md-primary)' }}></div>
                          <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={summary.productName}>
                            {summary.productName}
                          </span>
                        </div>
                      </div>
                      
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                        <div>
                          <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text3)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '4px' }}>WIP Crates</div>
                          <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--md-primary)', fontFamily: 'var(--mono)', lineHeight: 1 }}>
                            {summary.count} <span style={{ fontSize: '12px', color: 'var(--text2)', fontWeight: 400 }}>bins</span>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text3)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '4px' }}>Quantity</div>
                          <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--mono)', lineHeight: 1 }}>
                            {summary.totalQty.toLocaleString()} <span style={{ fontSize: '11px', color: 'var(--text3)', fontWeight: 400 }}>pcs</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}

                  {productSummaries.length === 0 && (
                    <div style={{ gridColumn: '1 / -1', padding: '56px 24px', textAlign: 'center', border: '1px dashed var(--border)', borderRadius: '12px', background: 'var(--bg2)' }}>
                      <div style={{ fontSize: '36px', marginBottom: '12px' }}>✅</div>
                      <h4 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text2)', marginBottom: '4px' }}>All Caught Up!</h4>
                      <p style={{ fontSize: '13px', color: 'var(--text3)' }}>No pending inspections in the system.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* ========================================================
               TAB 2: INSPECTION LIST PAGE
               ======================================================== */
            <div className="animate-fade-in">
              
              {/* Filters Header card */}
              <div className="card" style={{ padding: '16px 20px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '12px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center' }}>
                  
                  {/* Product Filter */}
                  <div style={{ flex: '2 1 200px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label className="fl" style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <ListFilter size={12} /> FILTER BY PRODUCT
                    </label>
                    <select 
                      className="fi"
                      value={filterProduct}
                      onChange={(e) => {
                        setFilterProduct(e.target.value);
                        setCurrentPage(1);
                      }}
                      style={{ height: '38px', fontSize: '13px', background: 'var(--bg)', borderColor: 'var(--border)' }}
                    >
                      <option value="">All Products ({pendingCrates.length})</option>
                      {filterOptions.map(name => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Date Filter */}
                  <div style={{ flex: '1 1 150px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label className="fl" style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Calendar size={12} /> FILTER BY DATE
                    </label>
                    <input 
                      type="date"
                      className="fi"
                      value={filterDate}
                      onChange={(e) => {
                        setFilterDate(e.target.value);
                        setCurrentPage(1);
                      }}
                      style={{ 
                        height: '38px', 
                        fontSize: '13px', 
                        background: 'var(--bg)', 
                        borderColor: 'var(--border)',
                        color: 'var(--text)',
                        padding: '0 10px',
                        borderRadius: 'var(--r)'
                      }}
                    />
                  </div>

                  {/* Sorting Filter */}
                  <div style={{ flex: '1 1 150px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label className="fl" style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <ArrowUpDown size={12} /> SORT BY TIME
                    </label>
                    <select 
                      className="fi"
                      value={sortOrder}
                      onChange={(e) => {
                        setSortOrder(e.target.value as 'asc' | 'desc');
                        setCurrentPage(1);
                      }}
                      style={{ height: '38px', fontSize: '13px', background: 'var(--bg)', borderColor: 'var(--border)' }}
                    >
                      <option value="desc">Newest First (Oldest Last)</option>
                      <option value="asc">Oldest First (Newest Last)</option>
                    </select>
                  </div>

                  {/* Reset Button */}
                  <button 
                    className="btn bsec" 
                    style={{ height: '38px', padding: '0 16px', alignSelf: 'flex-end', minWidth: '80px', borderRadius: '4px', boxShadow: 'none' }} 
                    onClick={() => {
                      setFilterProduct('');
                      setFilterDate('');
                      setSortOrder('desc');
                      setCurrentPage(1);
                    }}
                  >
                    Reset
                  </button>
                </div>
              </div>

              {/* List of crates */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '32px' }}>
                {displayedCrates.map(crate => {
                  const prodName = getProductName(crate);
                  return (
                    <div 
                      key={crate.id} 
                      className="card hover-card" 
                      style={{ 
                        background: 'var(--bg2)', 
                        border: '1px solid var(--border)', 
                        borderRadius: '12px', 
                        overflow: 'hidden',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                      }}
                    >
                      {/* Crate Header with Product name & printer reprint */}
                      <div style={{ padding: '10px 16px', background: 'var(--bg3)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                          <Package size={14} style={{ color: 'var(--md-primary)', flexShrink: 0 }} />
                          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{prodName}</span>
                        </div>
                        <button 
                          className="btn bsm bsec" 
                          style={{ padding: '4px 8px', fontSize: '10px', boxShadow: 'none', height: '24px' }} 
                          onClick={(e) => handleReprint(crate, e)}
                        >
                          <Printer size={11} /> Reprint Slip
                        </button>
                      </div>

                      {/* Crate Body details */}
                      <div style={{ padding: '16px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                          <div>
                            <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: '2px' }}>Unit ID</div>
                            <div style={{ fontSize: '13px', fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--amber)' }}>{crate.id}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: '2px' }}>Machine & Bin</div>
                            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
                              MC-{crate.machineId} <span style={{ color: 'var(--text3)' }}>•</span> Bin #{crate.binNumber}
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: '2px' }}>Crate Finished</div>
                            <div style={{ fontSize: '13px', color: 'var(--text2)', fontFamily: 'var(--mono)' }}>
                              {new Date(crate.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ({new Date(crate.endTime).toLocaleDateString([], { month: 'short', day: 'numeric' })})
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: '2px' }}>Net Quantity</div>
                            <div style={{ fontSize: '15px', fontFamily: 'var(--mono)', fontWeight: 800, color: 'var(--text)' }}>
                              {crate.netQty.toLocaleString()} <span style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: 400 }}>pcs</span>
                            </div>
                          </div>
                        </div>

                        {/* Start Inspection action button */}
                        <button 
                          className="btn bpri" 
                          style={{ width: '100%', height: '40px', background: 'var(--md-primary)', display: 'flex', gap: '8px', fontWeight: 700, borderRadius: '6px' }}
                          onClick={() => setInspectingBin({ id: crate.id, netQty: crate.netQty, machineId: crate.machineId })}
                        >
                          Start QC Inspection <ArrowRight size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })}

                {displayedCrates.length === 0 && (
                  <div style={{ padding: '60px 24px', textAlign: 'center', border: '1px dashed var(--border)', borderRadius: '12px', background: 'var(--bg2)' }}>
                    <div style={{ background: 'var(--bg3)', width: '60px', height: '60px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: 'var(--text3)' }}>
                      <CheckCircle2 size={30} />
                    </div>
                    <h4 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text2)', marginBottom: '4px' }}>No Pending Inspections</h4>
                    <p style={{ fontSize: '13px', color: 'var(--text3)' }}>
                      {filterProduct || filterDate ? `No pending bins match your filter.` : 'All caught up! No bins are waiting for audit.'}
                    </p>
                  </div>
                )}
              </div>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between', 
                  background: 'var(--bg2)',
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  padding: '12px 16px',
                  marginTop: '20px', 
                  marginBottom: '20px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                }}>
                  <button 
                    disabled={currentPage === 1}
                    onClick={() => {
                      setCurrentPage(prev => Math.max(prev - 1, 1));
                      document.getElementById('topbar')?.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className="btn bsec"
                    style={{ 
                      height: '36px', 
                      padding: '0 14px', 
                      opacity: currentPage === 1 ? 0.4 : 1, 
                      cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                      boxShadow: 'none',
                      fontSize: '13px'
                    }}
                  >
                    &larr; Prev
                  </button>
                  
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text2)' }}>
                    Page <span style={{ color: 'var(--md-primary)', fontFamily: 'var(--mono)' }}>{currentPage}</span> of <span style={{ fontFamily: 'var(--mono)' }}>{totalPages}</span>
                  </span>

                  <button 
                    disabled={currentPage === totalPages}
                    onClick={() => {
                      setCurrentPage(prev => Math.min(prev + 1, totalPages));
                      document.getElementById('topbar')?.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className="btn bsec"
                    style={{ 
                      height: '36px', 
                      padding: '0 14px', 
                      opacity: currentPage === totalPages ? 0.4 : 1, 
                      cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                      boxShadow: 'none',
                      fontSize: '13px'
                    }}
                  >
                    Next &rarr;
                  </button>
                </div>
              )}

            </div>
          )}

        </div>
      </main>

      {/* Camera Barcode Scanner View */}
      {isScannerOpen && (
        <CameraScanner
          onSuccess={handleGlobalScanSuccess}
          onClose={handleScannerClose}
        />
      )}

      {/* Visual Quality Inspection Dialog */}
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
            
            // Save state in crates table
            await supabase.from('crates').update({ 
              status: 'Completed', 
              net_qty: data.goodQty,
              rejected_qty: rejQty,
              rejection_details: rejDetails,
              inspected_by: inspectorDisplay,
              inspected_at: new Date().toISOString()
            }).eq('id', inspectingBin.id);

            // Update batch records if there is a quantity difference
            if (diff !== 0) {
              const crate = pendingCrates.find(c => c.id === inspectingBin.id);
              if (crate?.batchId) {
                const b = batchRecords.find(br => br.id === crate.batchId);
                if (b) {
                  await supabase.from('batch_records').update({ total_output: (b.totalOutput || 0) + diff }).eq('id', crate.batchId);
                }
              }
            }

            setPendingCrates(prev => prev.filter(c => c.id !== inspectingBin.id));
            setInspectingBin(null);
          }} 
        />
      )}

      {/* Auto-closing Reprint Overlay */}
      {reprintCrate && (
        <div className="ov animate-fade-in" style={{ zIndex: 100000, background: 'rgba(0,0,0,0.85)' }}>
           <div className="modal animate-scale-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px' }}>
              <div style={{ color: 'var(--text)', marginBottom: '20px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px' }}>
                <Printer size={18} style={{ color: 'var(--md-primary)' }} /> Printing Production Slip...
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
                  boxShadow: '0 4px 20px rgba(0,0,0,0.25)'
                }}
              >
                <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '14px', borderBottom: '2px solid #000', paddingBottom: '6px', marginBottom: '10px' }}>
                  PRODUCTION SLIP (REPRINT)
                </div>
                <div style={{ marginBottom: '8px', borderBottom: '1px solid #eee', paddingBottom: '4px', fontSize: '11px' }}>
                  Date/Time: {formatDateDMY(reprintCrate.endTime)} {new Date(reprintCrate.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span>SHIFT: {reprintCrate.shiftId || 'A'}</span>
                  <span>MC: {reprintCrate.machineId}</span>
                </div>
                
                <div style={{ margin: '6px 0', borderBottom: '1px solid #eee', paddingBottom: '4px' }}>
                  PRODUCT: {getProductName(reprintCrate)}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontWeight: 'bold' }}>
                  <span>BATCH: {reprintCrate.batchId.split('-')[0]}</span>
                  <span>BIN: #{reprintCrate.binNumber}</span>
                </div>

                <div style={{ fontSize: '11px', marginBottom: '2px' }}>
                  OPERATOR: {operators.find(o => o.id === reprintCrate.operatorId)?.name || 'UNASSIGNED'}
                </div>
                <div style={{ fontSize: '11px', marginBottom: '10px' }}>
                  SUPERVISOR: {appSettings?.activeSupervisorName || profile?.fullName}
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
                  <div style={{ fontSize: '11px', marginBottom: '8px', fontWeight: 'bold' }}>UNIT ID: {reprintCrate.id}</div>
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <QRCodeSVG value={reprintCrate.id} size={140} level="M" />
                  </div>
                </div>
              </div>
           </div>
        </div>
      )}

      {/* Styled pulse effects and hover animations */}
      <style>{`
        .pulse-button {
          transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
        .pulse-button:hover {
          transform: scale(1.06);
        }
        .pulse-button:active {
          transform: scale(0.94);
        }
        .pulse-ring {
          position: absolute;
          width: 100%;
          height: 100%;
          border-radius: 50%;
          background: var(--md-primary);
          opacity: 0.3;
          animation: pulse-ring-anim 2.2s cubic-bezier(0.215, 0.610, 0.355, 1) infinite;
          z-index: -1;
        }
        @keyframes pulse-ring-anim {
          0% { transform: scale(1); opacity: 0.45; }
          100% { transform: scale(1.45); opacity: 0; }
        }
        .hover-card {
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .hover-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 12px 24px rgba(0, 173, 181, 0.15) !important;
          border-color: var(--md-primary) !important;
        }
        .menu-toggle-btn:hover {
          background: var(--bg3);
        }
      `}</style>
    </div>
  );
};

export default AppInspection;
