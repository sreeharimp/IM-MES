import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Warehouse, QrCode, Camera, Search, Filter, RefreshCw, CheckCircle2,
  AlertTriangle, Package, Box as BoxIcon, ArrowRight, Download, Clock,
  Calendar, Layers, Check, ShieldCheck, ShieldAlert, ArrowDownToLine,
  Truck, Eye, ChevronDown, ChevronRight, BarChart3, History, Sparkles, X,
  Trash2, Printer, Zap, CheckCheck, FileText, RotateCcw, CameraOff,
  FlipHorizontal, Flashlight
} from 'lucide-react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { supabase } from '../lib/supabase';
import type { Product, BatchRecord, AppSettings, StorageBin } from '../types';
import { FinalInspectionService, type FinalInspectionRecord } from '../services/finalInspectionService';
import { logSystemChange } from '../utils/systemChanges';
import { CameraScanner } from './CameraScanner';

interface InventoryPageProps {
  products?: Product[];
  batchRecords?: BatchRecord[];
  appSettings?: AppSettings | null;
  currentUser?: {
    id: string;
    name: string;
    role: string;
  };
}

export interface InventoryItem {
  packetId: string;
  batchCode: string;
  productId?: string;
  productName: string;
  productCode?: string;
  quantity: number;
  finalInspectionStatus: 'PASSED' | 'REJECTED' | 'HELD' | 'PENDING';
  inspectedAt?: string;
  inspectorName?: string;
  storeStatus: 'WIP Store' | 'FG Store';
  inwardedAt?: string;
  inwardedBy?: string;
  storageBinId?: string;
}

interface InwardFeedItem {
  id: string;
  packetId: string;
  batchCode: string;
  productName: string;
  quantity: number;
  inwardedAt: string;
  inwardedBy: string;
}

// Audio synth helper for scan feedback
class ScanAudio {
  static playSuccess() {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.08); // A5
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } catch {}
  }

  static playWarning() {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(349.23, ctx.currentTime); // F4
      osc.frequency.setValueAtTime(261.63, ctx.currentTime + 0.1); // C4
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } catch {}
  }

  static playError() {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(196, ctx.currentTime); // G3
      gain.gain.setValueAtTime(0.35, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } catch {}
  }

  static playFanfare() {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.08);
        gain.gain.setValueAtTime(0.3, ctx.currentTime + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + idx * 0.08 + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + idx * 0.08);
        osc.stop(ctx.currentTime + idx * 0.08 + 0.25);
      });
    } catch {}
  }

  static vibrate(pattern = [40]) {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate(pattern); } catch {}
    }
  }
}

const formatNumber = (n: number) => (n || 0).toLocaleString('en-IN');

export const InventoryPage: React.FC<InventoryPageProps> = ({
  products = [],
  batchRecords = [],
  appSettings,
  currentUser
}) => {
  // Navigation tabs
  const [activeTab, setActiveTab] = useState<'inwarding' | 'product_stock' | 'batch_stock' | 'ledger'>('inwarding');

  // Core Data
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [storageBins, setStorageBins] = useState<StorageBin[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  // Scanner States
  const [scanInput, setScanInput] = useState('');
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isProcessingScan, setIsProcessingScan] = useState(false);
  const [scanFeedback, setScanFeedback] = useState<{
    type: 'success' | 'warning' | 'error';
    title: string;
    message: string;
    packetId?: string;
    details?: string;
  } | null>(null);
  const [recentInwardFeed, setRecentInwardFeed] = useState<InwardFeedItem[]>([]);
  const scanInputRef = useRef<HTMLInputElement>(null);

  // High-Speed Bulk Staging vs Direct Inwarding States
  const [inwardingMode, setInwardingMode] = useState<'bulk' | 'instant'>('bulk');
  const [stagedPackets, setStagedPackets] = useState<InventoryItem[]>([]);
  const [isSubmittingBulk, setIsSubmittingBulk] = useState(false);
  const [completedBatchReceipt, setCompletedBatchReceipt] = useState<{
    receiptId: string;
    packetCount: number;
    totalQty: number;
    timestamp: string;
    storekeeper: string;
    batches: string[];
    products: string[];
    items: InventoryItem[];
  } | null>(null);

  // Mobile View Mode & Always-Open Scanner States
  const [isMobile, setIsMobile] = useState<boolean>(() => typeof window !== 'undefined' && window.innerWidth <= 768);
  const [mobileViewTab, setMobileViewTab] = useState<'scanner' | 'reports'>('scanner');
  const [isCameraActive, setIsCameraActive] = useState<boolean>(true); // Always open by default on mobile
  const [cameraStatus, setCameraStatus] = useState<'idle' | 'starting' | 'scanning' | 'error' | 'stopped'>('idle');
  const [cameraError, setCameraError] = useState<string>('');
  const [hasTorch, setHasTorch] = useState<boolean>(false);
  const [torchOn, setTorchOn] = useState<boolean>(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [lastScannedFeedback, setLastScannedFeedback] = useState<{ id: string; time: number } | null>(null);

  const html5QrScannerRef = useRef<Html5Qrcode | null>(null);
  const lastScanTimestampMap = useRef<Map<string, number>>(new Map());
  const isStartingCameraRef = useRef<boolean>(false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Live Staged Packets Summary
  const stagedSummary = useMemo(() => {
    const totalQty = stagedPackets.reduce((sum, p) => sum + p.quantity, 0);
    const batchMap = new Map<string, number>();
    const productMap = new Map<string, number>();
    stagedPackets.forEach((p) => {
      batchMap.set(p.batchCode, (batchMap.get(p.batchCode) || 0) + 1);
      productMap.set(p.productName, (productMap.get(p.productName) || 0) + 1);
    });
    return {
      totalPackets: stagedPackets.length,
      totalQty,
      batchBreakdown: Array.from(batchMap.entries()).map(([batch, count]) => ({ batch, count })),
      productBreakdown: Array.from(productMap.entries()).map(([product, count]) => ({ product, count }))
    };
  }, [stagedPackets]);

  // Search & Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [batchStockFilter, setBatchStockFilter] = useState<'ALL' | 'WIP_ONLY' | 'FG_ONLY'>('ALL');
  const [expandedBatchIds, setExpandedBatchIds] = useState<Record<string, boolean>>({});

  const storekeeperName = currentUser?.name || appSettings?.activeSupervisorName || 'Store Inwarder';

  // 1. Fetch & Harmonize All Inventory Data
  const fetchInventoryData = useCallback(async () => {
    setIsLoading(true);
    try {
      // 1. Fetch Inspection History (all Final Inspection records)
      const inspectionHistory = await FinalInspectionService.getInspectionHistory();

      // 2. Fetch Storage Bins, Inwarded System Changes, and Packets
      const [
        { data: binsData },
        { data: inwardChanges },
        { data: packetsData },
        { data: labelsData }
      ] = await Promise.all([
        supabase.from('storage_bins').select('*').order('id', { ascending: true }),
        supabase.from('system_changes').select('*').eq('module', 'STORE_INWARDING').order('changed_at', { ascending: false }).limit(2000),
        supabase.from('packets').select('*').limit(3000),
        supabase.from('production_plan_labels').select('id, qr_payload, status, expected_quantity, scanned_at, scanned_by, production_plans(product_id, batch_code, products(name))').limit(3000)
      ]);

      // Storage bins fallback
      if (binsData && binsData.length > 0) {
        setStorageBins(binsData.map((b: any) => ({
          id: b.id,
          currentLocation: b.current_location || 'WIP Warehouse',
          lastTransferredAt: b.last_transferred_at,
          lastReceivedAt: b.last_received_at
        })));
      } else {
        setStorageBins(Array.from({ length: 10 }, (_, i) => ({
          id: `APBIN-${(i + 1).toString().padStart(2, '0')}`,
          currentLocation: 'WIP Warehouse'
        })));
      }

      // Build Map of already Inwarded packets in FG Store
      const fgInwardMap = new Map<string, { inwardedAt: string; inwardedBy: string }>();

      // From local cache
      try {
        const localInwarded = JSON.parse(localStorage.getItem('im_mes_store_inwarded_packets') || '{}');
        for (const [k, v] of Object.entries(localInwarded as Record<string, any>)) {
          fgInwardMap.set(k.toUpperCase(), { inwardedAt: v.inwardedAt, inwardedBy: v.inwardedBy });
        }
      } catch {}

      // From system_changes
      (inwardChanges || []).forEach((ch) => {
        if (!ch.new_value) return;
        try {
          const parsed = JSON.parse(ch.new_value);
          const pid = (parsed.packet_id || ch.record_id || '').toUpperCase();
          if (pid) {
            fgInwardMap.set(pid, {
              inwardedAt: parsed.inwarded_at || ch.changed_at,
              inwardedBy: parsed.inwarded_by || ch.changed_by_name || 'Store Team'
            });
          }
        } catch {}
      });

      // From packets table where location_status is FG Store / Main Store
      (packetsData || []).forEach((p: any) => {
        if (p.location_status === 'FG Store' || p.location_status === 'Main Store' || p.store_received_at) {
          fgInwardMap.set(p.id.toUpperCase(), {
            inwardedAt: p.store_received_at || p.packed_at,
            inwardedBy: p.store_received_by || 'Store'
          });
        }
      });

      // From production_plan_labels where status is inwarded
      (labelsData || []).forEach((l: any) => {
        if (l.status === 'inwarded' && l.qr_payload) {
          fgInwardMap.set(l.qr_payload.toUpperCase(), {
            inwardedAt: l.scanned_at || l.created_at,
            inwardedBy: l.scanned_by || 'Store'
          });
        }
      });

      // Helper to resolve accurate product name
      const resolveProductName = (productId?: string, batchCode?: string, fallbackName?: string) => {
        if (productId) {
          const matched = products.find(p => p.id === productId || p.code === productId);
          if (matched?.name) return matched.name;
        }
        if (batchCode) {
          const matchedBatch = batchRecords.find(b => b.id.toUpperCase() === batchCode.toUpperCase());
          if (matchedBatch?.productName) return matchedBatch.productName;
        }
        if (fallbackName && fallbackName !== 'Medical Device Component' && fallbackName !== 'Component') {
          return fallbackName;
        }
        return fallbackName || 'Medical Device Component';
      };

      // Unified Map of all Passed Final Inspection items
      // Rule: Every item that passed Final Inspection is in WIP Store stock UNTIL inwarded into FG Store
      const itemsMap = new Map<string, InventoryItem>();

      // 1. Process all Passed items from Final Inspection History
      inspectionHistory.forEach((rec) => {
        if (rec.status !== 'PASSED') return;
        const key = rec.packet_id.trim().toUpperCase();
        const fgInfo = fgInwardMap.get(key);
        const batchCode = rec.batch_code || rec.packet_id.split('-')[0] || 'GENERAL';
        const prodName = resolveProductName(rec.product_id, batchCode, rec.product_name);

        itemsMap.set(key, {
          packetId: rec.packet_id,
          batchCode: batchCode,
          productId: rec.product_id,
          productName: prodName,
          quantity: rec.quantity || 1000,
          finalInspectionStatus: 'PASSED',
          inspectedAt: rec.inspected_at,
          inspectorName: rec.inspector_name,
          storeStatus: fgInfo ? 'FG Store' : 'WIP Store',
          inwardedAt: fgInfo?.inwardedAt,
          inwardedBy: fgInfo?.inwardedBy
        });
      });

      // 2. Also incorporate any production plan labels marked as 'inspected' or 'inwarded'
      (labelsData || []).forEach((l: any) => {
        const qr = (l.qr_payload || '').trim().toUpperCase();
        if (!qr) return;

        const isInspected = l.status === 'inspected' || l.status === 'inwarded';
        if (!isInspected && !itemsMap.has(qr)) return;

        const fgInfo = fgInwardMap.get(qr) || (l.status === 'inwarded' ? { inwardedAt: l.scanned_at, inwardedBy: l.scanned_by } : undefined);

        const existing = itemsMap.get(qr);
        if (existing) {
          if (fgInfo && existing.storeStatus !== 'FG Store') {
            existing.storeStatus = 'FG Store';
            existing.inwardedAt = fgInfo.inwardedAt;
            existing.inwardedBy = fgInfo.inwardedBy;
          }
        } else {
          itemsMap.set(qr, {
            packetId: l.qr_payload,
            batchCode: l.production_plans?.batch_code || l.qr_payload.split('-')[0] || 'GENERAL',
            productId: l.production_plans?.product_id,
            productName: l.production_plans?.products?.name || 'Medical Connector',
            quantity: l.expected_quantity || 1500,
            finalInspectionStatus: 'PASSED',
            inspectedAt: l.scanned_at || l.created_at,
            inspectorName: l.scanned_by || 'QC Inspector',
            storeStatus: fgInfo ? 'FG Store' : 'WIP Store',
            inwardedAt: fgInfo?.inwardedAt,
            inwardedBy: fgInfo?.inwardedBy
          });
        }
      });

      // 3. Incorporate packets table records marked as Final Inspected
      (packetsData || []).forEach((p: any) => {
        const key = p.id.trim().toUpperCase();
        const isPassed = p.status === 'Final Inspected' || p.location_status === 'WIP Store';
        const fgInfo = fgInwardMap.get(key);

        if (isPassed || fgInfo) {
          const existing = itemsMap.get(key);
          if (existing) {
            existing.storageBinId = p.storage_bin_id || existing.storageBinId;
            if (fgInfo) {
              existing.storeStatus = 'FG Store';
              existing.inwardedAt = fgInfo.inwardedAt;
              existing.inwardedBy = fgInfo.inwardedBy;
            }
          } else {
            itemsMap.set(key, {
              packetId: p.id,
              batchCode: p.batch_id || p.id.split('-')[0] || 'GENERAL',
              productId: p.product_id,
              productName: p.product_name || 'Component',
              productCode: p.product_code,
              quantity: p.quantity || 1000,
              finalInspectionStatus: 'PASSED',
              inspectedAt: p.packed_at,
              inspectorName: 'QC',
              storeStatus: fgInfo ? 'FG Store' : 'WIP Store',
              inwardedAt: fgInfo?.inwardedAt,
              inwardedBy: fgInfo?.inwardedBy,
              storageBinId: p.storage_bin_id
            });
          }
        }
      });

      setInventoryItems(Array.from(itemsMap.values()));
      setLastRefreshed(new Date());
    } catch (err) {
      console.error('Error fetching inventory stock:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInventoryData();
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchInventoryData();
      }
    }, 20000);
    return () => clearInterval(interval);
  }, [fetchInventoryData]);

  // Focus scan input (only on desktop to prevent mobile virtual keyboard from obscuring camera)
  useEffect(() => {
    if (activeTab === 'inwarding' && !isMobile && !isCameraOpen) {
      scanInputRef.current?.focus();
    }
  }, [activeTab, isMobile, isCameraOpen]);

  // 2. High-Level Summary Metrics
  const metrics = useMemo(() => {
    let wipQty = 0;
    let wipPackets = 0;
    let fgQty = 0;
    let fgPackets = 0;
    let todayInwardQty = 0;
    let todayInwardPackets = 0;

    const todayStr = new Date().toISOString().split('T')[0];

    inventoryItems.forEach((item) => {
      if (item.storeStatus === 'FG Store') {
        fgQty += item.quantity;
        fgPackets += 1;
        if (item.inwardedAt && item.inwardedAt.startsWith(todayStr)) {
          todayInwardQty += item.quantity;
          todayInwardPackets += 1;
        }
      } else {
        // WIP Store: Passed Final Inspection, awaiting inwarding
        wipQty += item.quantity;
        wipPackets += 1;
      }
    });

    return {
      wipQty,
      wipPackets,
      fgQty,
      fgPackets,
      todayInwardQty,
      todayInwardPackets,
      totalStockQty: wipQty + fgQty,
      totalStockPackets: wipPackets + fgPackets
    };
  }, [inventoryItems]);

  // 3. Scan & Inwarding Logic: High-Speed Bulk Staging & Final Submission
  const handleScanSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = scanInput.trim();
    if (!query) {
      // If user presses enter on empty input in bulk mode and has items staged, prompt submission
      if (inwardingMode === 'bulk' && stagedPackets.length > 0 && !isSubmittingBulk) {
        await handleSubmitBulkInwarding();
      }
      return;
    }
    if (isProcessingScan) return;
    await processInwardScan(query);
    setScanInput('');
  };

  const processInwardScan = async (rawCode: string) => {
    const code = rawCode.trim().toUpperCase();
    if (!code) return;

    setIsProcessingScan(true);
    setScanFeedback(null);

    try {
      // 1. Check if scanned code is a Storage Bin (e.g. APBIN-01)
      const matchingBin = storageBins.find(
        (b) => b.id.toUpperCase() === code || code.includes(b.id.toUpperCase())
      );

      if (matchingBin) {
        // Find all inventory items assigned to this storage bin
        const binItems = inventoryItems.filter((i) => i.storageBinId === matchingBin.id);

        if (binItems.length === 0) {
          ScanAudio.playWarning();
          ScanAudio.vibrate([60, 40, 60]);
          setScanFeedback({
            type: 'warning',
            title: `Storage Bin Empty: ${matchingBin.id}`,
            message: `No inspection passed packets are currently assigned to bin ${matchingBin.id}.`
          });
          return;
        }

        // All items in inventoryItems have passed Final Inspection
        const pendingWip = binItems.filter((i) => i.storeStatus === 'WIP Store');

        if (pendingWip.length === 0) {
          ScanAudio.playWarning();
          ScanAudio.vibrate([60]);
          setScanFeedback({
            type: 'warning',
            title: `Already Inwarded: ${matchingBin.id}`,
            message: `All ${binItems.length} packet(s) in bin ${matchingBin.id} are already in FG Store stock.`
          });
          return;
        }

        // High-Speed Bulk Staging Mode for Bin
        if (inwardingMode === 'bulk') {
          const notYetStaged = pendingWip.filter(
            (p) => !stagedPackets.some((sp) => sp.packetId.toUpperCase() === p.packetId.toUpperCase())
          );

          if (notYetStaged.length === 0) {
            ScanAudio.playWarning();
            ScanAudio.vibrate([60]);
            setScanFeedback({
              type: 'warning',
              title: `Bin Already Staged: ${matchingBin.id}`,
              message: `All ${pendingWip.length} pending packet(s) in bin ${matchingBin.id} are already in your staging queue.`
            });
            return;
          }

          const addedQty = notYetStaged.reduce((s, p) => s + p.quantity, 0);
          setStagedPackets((prev) => [...notYetStaged, ...prev]);
          ScanAudio.playSuccess();
          ScanAudio.vibrate([50]);
          setScanFeedback({
            type: 'success',
            title: `Staged Bin: ${matchingBin.id}`,
            message: `Added ${notYetStaged.length} packet(s) (${formatNumber(addedQty)} pcs) from bin ${matchingBin.id} to staging queue.`
          });
          return;
        }

        // Instant Mode for Bin
        const nowIso = new Date().toISOString();
        const totalQty = pendingWip.reduce((s, i) => s + i.quantity, 0);

        try {
          const cached = JSON.parse(localStorage.getItem('im_mes_store_inwarded_packets') || '{}');
          pendingWip.forEach((item) => {
            cached[item.packetId.toUpperCase()] = {
              inwardedAt: nowIso,
              inwardedBy: storekeeperName,
              quantity: item.quantity,
              batchCode: item.batchCode,
              productName: item.productName
            };
          });
          localStorage.setItem('im_mes_store_inwarded_packets', JSON.stringify(cached));
        } catch {}

        await logSystemChange({
          changedByName: storekeeperName,
          changedByRole: currentUser?.role || 'Store',
          module: 'STORE_INWARDING',
          tableName: 'storage_bins',
          recordId: matchingBin.id,
          action: 'INWARD',
          reason: `Bulk inwarded bin ${matchingBin.id} (${pendingWip.length} packets)`,
          newValue: JSON.stringify({
            bin_id: matchingBin.id,
            packet_count: pendingWip.length,
            total_quantity: totalQty,
            packets: pendingWip.map((p) => p.packetId),
            inwarded_at: nowIso,
            inwarded_by: storekeeperName
          })
        }).catch(() => {});

        const inwardedIds = new Set(pendingWip.map((p) => p.packetId.toUpperCase()));
        setInventoryItems((prev) =>
          prev.map((item) =>
            inwardedIds.has(item.packetId.toUpperCase())
              ? {
                  ...item,
                  storeStatus: 'FG Store',
                  inwardedAt: nowIso,
                  inwardedBy: storekeeperName
                }
              : item
          )
        );

        setRecentInwardFeed((prev) => [
          {
            id: `feed-${Date.now()}`,
            packetId: `${matchingBin.id} (${pendingWip.length} packets)`,
            batchCode: pendingWip[0]?.batchCode || 'Multiple',
            productName: pendingWip[0]?.productName || 'Multiple Products',
            quantity: totalQty,
            inwardedAt: nowIso,
            inwardedBy: storekeeperName
          },
          ...prev.slice(0, 14)
        ]);

        ScanAudio.playSuccess();
        ScanAudio.vibrate([50]);
        setScanFeedback({
          type: 'success',
          title: `Bin Inwarded: ${matchingBin.id}`,
          message: `Successfully inwarded ${pendingWip.length} packet(s) totaling ${formatNumber(totalQty)} pcs into FG Store.`
        });
        return;
      }

      // 2. Lookup scanned code as Packet ID / Production Planning QR code
      const matchingItem = inventoryItems.find(
        (i) => i.packetId.toUpperCase() === code || code.includes(i.packetId.toUpperCase())
      );

      // Check if found in inventory passed items
      if (matchingItem) {
        // Condition: Check if already in FG Store
        if (matchingItem.storeStatus === 'FG Store') {
          ScanAudio.playWarning();
          ScanAudio.vibrate([60]);
          const dStr = matchingItem.inwardedAt
            ? new Date(matchingItem.inwardedAt).toLocaleString()
            : 'earlier';
          setScanFeedback({
            type: 'warning',
            title: 'Already Inwarded',
            message: `Packet "${matchingItem.packetId}" was already inwarded into FG Store on ${dStr} by ${matchingItem.inwardedBy || 'Store'}.`
          });
          return;
        }

        // High-Speed Bulk Staging Mode for Packet (0ms Latency)
        if (inwardingMode === 'bulk') {
          const isAlreadyStaged = stagedPackets.some(
            (sp) => sp.packetId.toUpperCase() === matchingItem.packetId.toUpperCase()
          );

          if (isAlreadyStaged) {
            ScanAudio.playWarning();
            ScanAudio.vibrate([40, 40]);
            setScanFeedback({
              type: 'warning',
              title: 'Already in Staging Queue',
              message: `Packet "${matchingItem.packetId}" is already scanned and queued in the current batch.`
            });
            return;
          }

          // Stage it immediately!
          setStagedPackets((prev) => [matchingItem, ...prev]);
          ScanAudio.playSuccess();
          ScanAudio.vibrate([40]);
          setScanFeedback({
            type: 'success',
            title: `Staged: ${matchingItem.packetId}`,
            message: `+${formatNumber(matchingItem.quantity)} pcs (${matchingItem.productName}) staged. Total queued: ${stagedPackets.length + 1} packets.`
          });
          return;
        }

        // Instant Mode for Packet
        const nowIso = new Date().toISOString();

        try {
          const cached = JSON.parse(localStorage.getItem('im_mes_store_inwarded_packets') || '{}');
          cached[matchingItem.packetId.toUpperCase()] = {
            inwardedAt: nowIso,
            inwardedBy: storekeeperName,
            quantity: matchingItem.quantity,
            batchCode: matchingItem.batchCode,
            productName: matchingItem.productName
          };
          localStorage.setItem('im_mes_store_inwarded_packets', JSON.stringify(cached));
        } catch {}

        await logSystemChange({
          changedByName: storekeeperName,
          changedByRole: currentUser?.role || 'Store',
          module: 'STORE_INWARDING',
          tableName: 'packets',
          recordId: matchingItem.packetId,
          action: 'INWARD',
          reason: `Inwarded packet ${matchingItem.packetId} into FG Store`,
          newValue: JSON.stringify({
            packet_id: matchingItem.packetId,
            batch_code: matchingItem.batchCode,
            product_id: matchingItem.productId,
            product_name: matchingItem.productName,
            quantity: matchingItem.quantity,
            inwarded_at: nowIso,
            inwarded_by: storekeeperName
          })
        }).catch(() => {});

        try {
          await supabase
            .from('packets')
            .update({
              location_status: 'FG Store',
              store_received_at: nowIso,
              store_received_by: storekeeperName
            })
            .eq('id', matchingItem.packetId);

          await supabase
            .from('production_plan_labels')
            .update({
              status: 'inwarded',
              scanned_at: nowIso,
              scanned_by: storekeeperName
            })
            .eq('qr_payload', matchingItem.packetId);
        } catch {}

        setInventoryItems((prev) =>
          prev.map((item) =>
            item.packetId.toUpperCase() === matchingItem.packetId.toUpperCase()
              ? {
                  ...item,
                  storeStatus: 'FG Store',
                  inwardedAt: nowIso,
                  inwardedBy: storekeeperName
                }
              : item
          )
        );

        setRecentInwardFeed((prev) => [
          {
            id: `feed-${Date.now()}`,
            packetId: matchingItem.packetId,
            batchCode: matchingItem.batchCode,
            productName: matchingItem.productName,
            quantity: matchingItem.quantity,
            inwardedAt: nowIso,
            inwardedBy: storekeeperName
          },
          ...prev.slice(0, 14)
        ]);

        ScanAudio.playSuccess();
        ScanAudio.vibrate([50]);
        setScanFeedback({
          type: 'success',
          title: `Inwarded to FG: ${matchingItem.packetId}`,
          message: `${formatNumber(matchingItem.quantity)} pcs of ${matchingItem.productName} (Batch: ${matchingItem.batchCode}) moved from WIP Store to FG Store.`
        });
        return;
      }

      // Check if it's a known label in production_plan_labels that has NOT passed final inspection yet
      const { data: rawLabel } = await supabase
        .from('production_plan_labels')
        .select('qr_payload, status, expected_quantity, production_plans(batch_code, products(name))')
        .eq('qr_payload', code)
        .maybeSingle();

      if (rawLabel) {
        ScanAudio.playError();
        ScanAudio.vibrate([120, 60, 120]);
        setScanFeedback({
          type: 'error',
          title: 'Final Inspection NOT Passed!',
          message: `Label "${code}" has status "${rawLabel.status?.toUpperCase() || 'PRINTED'}". It has NOT passed Final QC Inspection yet and cannot be inwarded into FG Store.`,
          details: 'Please send this packet to the Final Inspection station first.'
        });
        return;
      }

      // Completely unrecognized QR
      ScanAudio.playError();
      ScanAudio.vibrate([100, 50, 100]);
      setScanFeedback({
        type: 'error',
        title: 'Unrecognized Code',
        message: `Scanned QR code "${rawCode}" was not recognized as a valid Final Inspection packet or Storage Bin.`
      });
    } catch (err: any) {
      console.error('Inwarding scan error:', err);
      ScanAudio.playError();
      setScanFeedback({
        type: 'error',
        title: 'Scan Inwarding Failed',
        message: err.message || 'An unexpected error occurred while processing the scan.'
      });
    } finally {
      setIsProcessingScan(false);
      scanInputRef.current?.focus();
    }
  };

  // Submit Bulk Inwarding Batch
  const handleSubmitBulkInwarding = async () => {
    if (stagedPackets.length === 0 || isSubmittingBulk) return;
    setIsSubmittingBulk(true);

    try {
      const nowIso = new Date().toISOString();
      const receiptId = `INW-${nowIso.slice(0, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;
      const totalQty = stagedPackets.reduce((s, p) => s + p.quantity, 0);
      const packetIds = stagedPackets.map((p) => p.packetId);
      const packetIdsUpper = new Set(packetIds.map((id) => id.toUpperCase()));
      const uniqueBatches = Array.from(new Set(stagedPackets.map((p) => p.batchCode)));
      const uniqueProducts = Array.from(new Set(stagedPackets.map((p) => p.productName)));

      // 1. Update local storage cache
      try {
        const cached = JSON.parse(localStorage.getItem('im_mes_store_inwarded_packets') || '{}');
        stagedPackets.forEach((p) => {
          cached[p.packetId.toUpperCase()] = {
            inwardedAt: nowIso,
            inwardedBy: storekeeperName,
            quantity: p.quantity,
            batchCode: p.batchCode,
            productName: p.productName,
            receiptId
          };
        });
        localStorage.setItem('im_mes_store_inwarded_packets', JSON.stringify(cached));
      } catch {}

      // 2. Log system change for cross-device sync & permanent audit trail
      await logSystemChange({
        changedByName: storekeeperName,
        changedByRole: currentUser?.role || 'Store',
        module: 'STORE_INWARDING',
        tableName: 'packets',
        recordId: receiptId,
        action: 'BULK_INWARD',
        reason: `Bulk inwarded ${stagedPackets.length} packets (${formatNumber(totalQty)} pcs) into Finished Goods Store`,
        newValue: JSON.stringify({
          receipt_id: receiptId,
          packet_count: stagedPackets.length,
          total_quantity: totalQty,
          batches: uniqueBatches,
          products: uniqueProducts,
          packets: stagedPackets.map((p) => ({
            packet_id: p.packetId,
            batch_code: p.batchCode,
            product_name: p.productName,
            quantity: p.quantity
          })),
          inwarded_at: nowIso,
          inwarded_by: storekeeperName
        })
      }).catch(() => {});

      // 3. Database updates in packets & production_plan_labels
      try {
        await Promise.all([
          supabase
            .from('packets')
            .update({
              location_status: 'FG Store',
              store_received_at: nowIso,
              store_received_by: storekeeperName
            })
            .in('id', packetIds),
          supabase
            .from('production_plan_labels')
            .update({
              status: 'inwarded',
              scanned_at: nowIso,
              scanned_by: storekeeperName
            })
            .in('qr_payload', packetIds)
        ]);
      } catch (err) {
        console.warn('Backend table bulk update note:', err);
      }

      // 4. Update inventoryItems state: move staged packets from WIP Store -> FG Store
      setInventoryItems((prev) =>
        prev.map((item) =>
          packetIdsUpper.has(item.packetId.toUpperCase())
            ? {
                ...item,
                storeStatus: 'FG Store',
                inwardedAt: nowIso,
                inwardedBy: storekeeperName
              }
            : item
        )
      );

      // 5. Prepend to live inward feed
      const newFeedItems: InwardFeedItem[] = stagedPackets.slice(0, 10).map((p) => ({
        id: `feed-${Date.now()}-${p.packetId}`,
        packetId: p.packetId,
        batchCode: p.batchCode,
        productName: p.productName,
        quantity: p.quantity,
        inwardedAt: nowIso,
        inwardedBy: storekeeperName
      }));
      setRecentInwardFeed((prev) => [...newFeedItems, ...prev.slice(0, 15 - newFeedItems.length)]);

      // 6. Set Completed Batch Receipt for modal / printing
      setCompletedBatchReceipt({
        receiptId,
        packetCount: stagedPackets.length,
        totalQty,
        timestamp: nowIso,
        storekeeper: storekeeperName,
        batches: uniqueBatches,
        products: uniqueProducts,
        items: [...stagedPackets]
      });

      // 7. Clear staged queue
      setStagedPackets([]);

      // 8. Audio and haptic feedback
      ScanAudio.playFanfare();
      ScanAudio.vibrate([100, 50, 100]);

      setScanFeedback({
        type: 'success',
        title: `Batch Inwarded Successfully! (${receiptId})`,
        message: `${packetIds.length} packets (${formatNumber(totalQty)} pcs) moved from WIP Store to FG Store.`
      });
    } catch (err: any) {
      console.error('Bulk inwarding error:', err);
      ScanAudio.playError();
      setScanFeedback({
        type: 'error',
        title: 'Bulk Submission Failed',
        message: err.message || 'An error occurred during bulk inwarding.'
      });
    } finally {
      setIsSubmittingBulk(false);
      scanInputRef.current?.focus();
    }
  };

  const handleRemoveStagedPacket = (packetId: string) => {
    setStagedPackets((prev) => prev.filter((p) => p.packetId !== packetId));
    ScanAudio.vibrate([30]);
  };

  const handleClearStagedPackets = () => {
    if (stagedPackets.length === 0) return;
    if (window.confirm(`Clear all ${stagedPackets.length} staged packets from the queue?`)) {
      setStagedPackets([]);
      ScanAudio.vibrate([30]);
    }
  };

  const handlePrintReceipt = () => {
    if (!completedBatchReceipt) return;
    const printWindow = window.open('', '_blank', 'width=850,height=900');
    if (!printWindow) {
      window.print();
      return;
    }
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>GRN - ${completedBatchReceipt.receiptId}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 24px; color: #111; }
            h1 { font-size: 20px; margin: 0 0 4px; text-transform: uppercase; }
            .header { border-bottom: 2px solid #000; padding-bottom: 12px; margin-bottom: 16px; }
            .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 13px; margin-bottom: 16px; }
            table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 12px; }
            th, td { border: 1px solid #ddd; padding: 8px 10px; text-align: left; }
            th { background: #f4f4f4; text-transform: uppercase; font-size: 11px; }
            .totals { font-size: 14px; font-weight: bold; margin-top: 16px; text-align: right; }
            .signatures { display: flex; justify-content: space-between; margin-top: 48px; padding-top: 24px; font-size: 13px; }
            .sig-box { border-top: 1px solid #000; width: 220px; text-align: center; padding-top: 6px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Finished Goods Store Inwarding Receipt (GRN)</h1>
            <div style="font-size: 13px; color: #555;">Agney Polysoft Pvt Ltd &bull; IM-MES Medical Device Inventory</div>
          </div>
          <div class="meta-grid">
            <div><strong>Receipt No:</strong> ${completedBatchReceipt.receiptId}</div>
            <div><strong>Inwarded At:</strong> ${new Date(completedBatchReceipt.timestamp).toLocaleString()}</div>
            <div><strong>Storekeeper:</strong> ${completedBatchReceipt.storekeeper}</div>
            <div><strong>Movement:</strong> WIP Store &rarr; Finished Goods (FG) Store</div>
            <div><strong>Total Packets:</strong> ${completedBatchReceipt.packetCount} Packets</div>
            <div><strong>Total Quantity:</strong> ${formatNumber(completedBatchReceipt.totalQty)} PCS</div>
          </div>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Packet ID / QR</th>
                <th>Batch Code</th>
                <th>Product Description</th>
                <th>QC Status</th>
                <th style="text-align: right;">Quantity (PCS)</th>
              </tr>
            </thead>
            <tbody>
              ${completedBatchReceipt.items.map((it, idx) => `
                <tr>
                  <td>${idx + 1}</td>
                  <td style="font-family: monospace; font-weight: bold;">${it.packetId}</td>
                  <td style="font-family: monospace;">${it.batchCode}</td>
                  <td>${it.productName}</td>
                  <td><span style="color: green; font-weight: bold;">PASSED</span></td>
                  <td style="text-align: right; font-weight: bold;">${formatNumber(it.quantity)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="totals">
            Total Finished Goods Inwarded: ${formatNumber(completedBatchReceipt.totalQty)} PCS (${completedBatchReceipt.packetCount} Packets)
          </div>
          <div class="signatures">
            <div class="sig-box">Store Inwarder Signature</div>
            <div class="sig-box">Warehouse Manager Signature</div>
          </div>
          <script>window.onload = function() { window.print(); };</script>
        </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
  };

  // Inline Continuous Camera Scanner Lifecycle (Always Open for Mobile)
  const startInlineScanner = useCallback(async (facing: 'environment' | 'user' = 'environment') => {
    if (isStartingCameraRef.current) return;
    isStartingCameraRef.current = true;
    setCameraStatus('starting');
    setCameraError('');

    try {
      if (html5QrScannerRef.current) {
        try {
          if (html5QrScannerRef.current.isScanning) {
            await html5QrScannerRef.current.stop();
          }
        } catch (e) {
          console.warn('Stopping previous scanner:', e);
        }
      }

      await new Promise((r) => setTimeout(r, 150));
      const containerEl = document.getElementById('store-inward-camera-viewport');
      if (!containerEl) {
        isStartingCameraRef.current = false;
        setCameraStatus('idle');
        return;
      }

      const qr = new Html5Qrcode('store-inward-camera-viewport', {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.CODE_39
        ],
        verbose: false
      });
      html5QrScannerRef.current = qr;

      await qr.start(
        { facingMode: facing },
        {
          fps: 20,
          qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
            const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
            const size = Math.max(180, Math.floor(minEdge * 0.78));
            return { width: size, height: size };
          },
          aspectRatio: 1.33
        },
        (decodedText: string) => {
          const rawText = decodedText.trim();
          if (!rawText) return;
          const upper = rawText.toUpperCase();
          const now = Date.now();

          // Continuous cooldown: suppress repeat reads of same code for 2.5s while held in view
          const lastScannedAt = lastScanTimestampMap.current.get(upper) || 0;
          if (now - lastScannedAt < 2500) {
            return;
          }
          lastScanTimestampMap.current.set(upper, now);

          // Visual feedback
          setLastScannedFeedback({ id: rawText, time: now });

          // Process the scan without closing camera!
          processInwardScan(rawText);
        },
        () => {}
      );

      setCameraStatus('scanning');
      setIsCameraActive(true);

      // Check torch support
      try {
        const videoElem = document.querySelector('#store-inward-camera-viewport video') as HTMLVideoElement | null;
        if (videoElem && videoElem.srcObject) {
          const stream = videoElem.srcObject as MediaStream;
          const track = stream.getVideoTracks()[0];
          const capabilities = (track as any)?.getCapabilities?.();
          setHasTorch(Boolean(capabilities?.torch));
        }
      } catch {}
    } catch (err: any) {
      console.warn('Inline camera scanner error:', err);
      setCameraStatus('error');
      setCameraError(err?.message || 'Could not access device camera.');
      setIsCameraActive(false);
    } finally {
      isStartingCameraRef.current = false;
    }
  }, [processInwardScan]);

  const stopInlineScanner = useCallback(async () => {
    if (html5QrScannerRef.current) {
      try {
        if (html5QrScannerRef.current.isScanning) {
          await html5QrScannerRef.current.stop();
        }
      } catch (e) {}
    }
    setCameraStatus('stopped');
    setIsCameraActive(false);
  }, []);

  const toggleTorch = async () => {
    try {
      const videoElem = document.querySelector('#store-inward-camera-viewport video') as HTMLVideoElement | null;
      if (videoElem && videoElem.srcObject) {
        const stream = videoElem.srcObject as MediaStream;
        const track = stream.getVideoTracks()[0];
        const next = !torchOn;
        await (track as any)?.applyConstraints?.({
          advanced: [{ torch: next }]
        });
        setTorchOn(next);
      }
    } catch (e) {
      console.warn('Torch toggle error:', e);
    }
  };

  const flipCamera = async () => {
    const nextFacing = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextFacing);
    await startInlineScanner(nextFacing);
  };

  // Auto-start camera when inwarding tab is active and on mobile scanner view or when user toggles camera
  useEffect(() => {
    const shouldCameraRun = activeTab === 'inwarding' && (!isMobile || mobileViewTab === 'scanner') && isCameraActive;
    if (shouldCameraRun) {
      const timer = setTimeout(() => {
        startInlineScanner(facingMode);
      }, 350);
      return () => {
        clearTimeout(timer);
        stopInlineScanner();
      };
    } else {
      stopInlineScanner();
    }
  }, [activeTab, isMobile, mobileViewTab, isCameraActive, facingMode, startInlineScanner, stopInlineScanner]);

  // 4. Product-wise Stock Aggregation
  const productStockReport = useMemo(() => {
    const map = new Map<
      string,
      {
        productId: string;
        productName: string;
        productCode: string;
        wipQty: number;
        wipPackets: number;
        fgQty: number;
        fgPackets: number;
        totalQty: number;
        batches: Set<string>;
      }
    >();

    // Seed from products
    products.forEach((p) => {
      map.set(p.id, {
        productId: p.id,
        productName: p.name,
        productCode: p.itemCode || p.batchIdentifier || '',
        wipQty: 0,
        wipPackets: 0,
        fgQty: 0,
        fgPackets: 0,
        totalQty: 0,
        batches: new Set<string>()
      });
    });

    // Populate from all Final Inspection passed items
    inventoryItems.forEach((item) => {
      const pid = item.productId || item.productName;
      let entry = map.get(pid);
      if (!entry) {
        entry = {
          productId: pid,
          productName: item.productName,
          productCode: item.productCode || '',
          wipQty: 0,
          wipPackets: 0,
          fgQty: 0,
          fgPackets: 0,
          totalQty: 0,
          batches: new Set<string>()
        };
        map.set(pid, entry);
      }

      if (item.batchCode) entry.batches.add(item.batchCode);

      if (item.storeStatus === 'FG Store') {
        entry.fgQty += item.quantity;
        entry.fgPackets += 1;
        entry.totalQty += item.quantity;
      } else {
        // WIP Store
        entry.wipQty += item.quantity;
        entry.wipPackets += 1;
        entry.totalQty += item.quantity;
      }
    });

    let list = Array.from(map.values());

    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      list = list.filter(
        (p) =>
          p.productName.toLowerCase().includes(q) ||
          p.productCode.toLowerCase().includes(q)
      );
    }

    return list.sort((a, b) => b.totalQty - a.totalQty);
  }, [products, inventoryItems, searchTerm]);

  // 5. Batch-wise Stock Aggregation
  const batchStockReport = useMemo(() => {
    const map = new Map<
      string,
      {
        batchCode: string;
        productName: string;
        productCode: string;
        wipQty: number;
        wipPackets: number;
        fgQty: number;
        fgPackets: number;
        totalQty: number;
        items: InventoryItem[];
      }
    >();

    inventoryItems.forEach((item) => {
      const bid = item.batchCode || 'GENERAL';
      let entry = map.get(bid);
      if (!entry) {
        entry = {
          batchCode: bid,
          productName: item.productName,
          productCode: item.productCode || '',
          wipQty: 0,
          wipPackets: 0,
          fgQty: 0,
          fgPackets: 0,
          totalQty: 0,
          items: []
        };
        map.set(bid, entry);
      }

      entry.items.push(item);

      if (item.storeStatus === 'FG Store') {
        entry.fgQty += item.quantity;
        entry.fgPackets += 1;
        entry.totalQty += item.quantity;
      } else {
        entry.wipQty += item.quantity;
        entry.wipPackets += 1;
        entry.totalQty += item.quantity;
      }
    });

    let list = Array.from(map.values());

    if (batchStockFilter === 'WIP_ONLY') {
      list = list.filter((b) => b.wipQty > 0);
    } else if (batchStockFilter === 'FG_ONLY') {
      list = list.filter((b) => b.fgQty > 0);
    }

    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      list = list.filter(
        (b) =>
          b.batchCode.toLowerCase().includes(q) ||
          b.productName.toLowerCase().includes(q)
      );
    }

    return list.sort((a, b) => b.totalQty - a.totalQty);
  }, [inventoryItems, batchStockFilter, searchTerm]);

  // 6. Movement Ledger (FG Inwarded Items)
  const inwardingLedger = useMemo(() => {
    let list = inventoryItems.filter((i) => i.storeStatus === 'FG Store');

    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      list = list.filter(
        (i) =>
          i.packetId.toLowerCase().includes(q) ||
          i.batchCode.toLowerCase().includes(q) ||
          i.productName.toLowerCase().includes(q) ||
          (i.inwardedBy && i.inwardedBy.toLowerCase().includes(q))
      );
    }

    return list.sort(
      (a, b) =>
        new Date(b.inwardedAt || b.inspectedAt || 0).getTime() -
        new Date(a.inwardedAt || a.inspectedAt || 0).getTime()
    );
  }, [inventoryItems, searchTerm]);

  // CSV Export utility
  const exportCSV = (filename: string, headers: string[], rows: (string | number)[][]) => {
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((r) => r.map((c) => `"${c}"`).join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${filename}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="tab-page inv-page-container" style={{ padding: '20px 24px', maxWidth: '1600px', margin: '0 auto' }}>
      {/* Mobile Optimization Styles */}
      <style>{`
        @media (max-width: 768px) {
          .inv-page-container {
            padding: 10px 12px 90px !important; /* Bottom pad for sticky action bar and mobile nav */
          }
          .inv-header {
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 12px !important;
            margin-bottom: 16px !important;
          }
          .inv-header-actions {
            width: 100% !important;
            display: grid !important;
            grid-template-columns: 1fr 1fr !important;
            gap: 8px !important;
          }
          .inv-header-actions .btn {
            justify-content: center !important;
            padding: 10px 8px !important;
            font-size: 13px !important;
          }
          .inv-kpi-grid {
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 10px !important;
            margin-bottom: 16px !important;
          }
          .inv-kpi-card {
            padding: 12px 14px !important;
          }
          .inv-kpi-title {
            font-size: 11px !important;
          }
          .inv-kpi-value {
            font-size: 20px !important;
          }
          .inv-kpi-subtitle {
            display: none !important;
          }
          .inv-tab-strip {
            overflow-x: auto !important;
            -webkit-overflow-scrolling: touch !important;
            width: 100% !important;
            padding-bottom: 6px !important;
            margin-bottom: 16px !important;
            scrollbar-width: none !important;
          }
          .inv-tab-strip::-webkit-scrollbar {
            display: none !important;
          }
          .inv-tab-btn {
            flex-shrink: 0 !important;
            padding: 8px 12px !important;
            font-size: 12px !important;
            white-space: nowrap !important;
          }
          .inv-scanner-grid {
            grid-template-columns: 1fr !important;
            gap: 16px !important;
          }
          .inv-scanner-card {
            padding: 16px 14px !important;
          }
          .inv-scan-input-box {
            font-size: 16px !important; /* Prevents auto-zoom on iOS */
            height: 48px !important;
          }
          .inv-mode-selector {
            width: 100% !important;
            display: grid !important;
            grid-template-columns: 1fr 1fr !important;
          }
          .inv-staged-queue-header {
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 10px !important;
          }
          .inv-staged-actions {
            width: 100% !important;
            display: grid !important;
            grid-template-columns: 1fr auto !important;
            gap: 8px !important;
          }
          .inv-staged-item-card {
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 8px !important;
          }
          .inv-staged-item-right {
            width: 100% !important;
            display: flex !important;
            justify-content: space-between !important;
            align-items: center !important;
            border-top: 1px dashed var(--border) !important;
            padding-top: 8px !important;
          }
          .inv-mobile-sticky-bar {
            display: flex !important;
          }
        }
        @media (min-width: 769px) {
          .inv-mobile-sticky-bar {
            display: none !important;
          }
        }
        @keyframes laserSweep {
          0% { top: 12%; opacity: 0.9; }
          50% { top: 88%; opacity: 0.9; }
          100% { top: 12%; opacity: 0.9; }
        }
        .inv-laser-beam {
          position: absolute;
          left: 6%;
          right: 6%;
          height: 2.5px;
          background: linear-gradient(90deg, transparent, #3b82f6 20%, #60a5fa 50%, #3b82f6 80%, transparent);
          box-shadow: 0 0 14px 2px rgba(59, 130, 246, 0.9);
          animation: laserSweep 2.2s ease-in-out infinite;
          z-index: 6;
          pointer-events: none;
        }
        #store-inward-camera-viewport video {
          width: 100% !important;
          height: 100% !important;
          object-fit: cover !important;
          border-radius: 12px !important;
        }
        #store-inward-camera-viewport {
          border: none !important;
          padding: 0 !important;
          overflow: hidden !important;
        }
        #store-inward-camera-viewport img,
        #store-inward-camera-viewport__header_message {
          display: none !important;
        }
        #store-inward-camera-viewport__scan_region {
          min-height: 200px !important;
        }
      `}</style>

      {/* 1. Header Bar */}
      <div className="inv-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'rgba(59, 130, 246, 0.12)', border: '1px solid rgba(59, 130, 246, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--blue)', flexShrink: 0 }}>
            <Warehouse size={24} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em' }}>
              Inventory & Stores
            </h2>
            <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <span>WIP Store Stock &bull; FG Inwarding &bull; Stock Ledger</span>
              <span style={{ fontSize: '11px', color: 'var(--text3)' }}>&bull; {lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          </div>
        </div>

        <div className="inv-header-actions" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {!isMobile && (
            <button
              onClick={() => setIsCameraOpen(true)}
              className="btn btn-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', padding: '9px 14px', borderRadius: '8px' }}
            >
              <Camera size={16} style={{ color: 'var(--blue)' }} /> Camera Scan
            </button>
          )}
          <button
            onClick={() => fetchInventoryData()}
            disabled={isLoading}
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', padding: isMobile ? '8px 12px' : '9px 14px', borderRadius: '8px' }}
            title="Refresh Stock Data"
          >
            <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
            {!isMobile && 'Refresh'}
          </button>
        </div>
      </div>

      {/* Mobile-First Mode Segmented Switch */}
      {isMobile && (
        <div style={{ display: 'flex', width: '100%', background: 'var(--bg2)', padding: '4px', borderRadius: '12px', border: '1px solid var(--border)', marginBottom: '16px', gap: '4px' }}>
          <button
            type="button"
            onClick={() => {
              setMobileViewTab('scanner');
              setActiveTab('inwarding');
            }}
            style={{
              flex: 1,
              padding: '10px 14px',
              borderRadius: '9px',
              fontSize: '13px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              background: mobileViewTab === 'scanner' ? 'var(--blue)' : 'transparent',
              color: mobileViewTab === 'scanner' ? '#fff' : 'var(--text2)',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            <QrCode size={16} /> Fast Inward Scanner {stagedPackets.length > 0 && <span style={{ background: '#10b981', color: '#fff', padding: '1px 7px', borderRadius: '10px', fontSize: '11px', fontWeight: 800 }}>{stagedPackets.length}</span>}
          </button>
          <button
            type="button"
            onClick={() => {
              setMobileViewTab('reports');
              if (activeTab === 'inwarding') setActiveTab('product_stock');
            }}
            style={{
              flex: 1,
              padding: '10px 14px',
              borderRadius: '9px',
              fontSize: '13px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              background: mobileViewTab === 'reports' ? 'var(--blue)' : 'transparent',
              color: mobileViewTab === 'reports' ? '#fff' : 'var(--text2)',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            <Package size={16} /> Stock Reports
          </button>
        </div>
      )}

      {/* Mobile Scanner Compact KPI Strip */}
      {isMobile && mobileViewTab === 'scanner' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
          <div style={{ padding: '10px 12px', background: 'var(--card-bg)', borderRadius: '10px', border: '1px solid var(--border)', borderLeft: '4px solid #f59e0b' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase' }}>WIP Store Stock</div>
            <div style={{ fontSize: '17px', fontWeight: 800, color: '#f59e0b', fontFamily: 'monospace', marginTop: '2px' }}>
              {formatNumber(metrics.wipQty)} <span style={{ fontSize: '10px', fontWeight: 600 }}>PCS</span>
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text3)' }}>{metrics.wipPackets} pkts passed QC</div>
          </div>
          <div style={{ padding: '10px 12px', background: 'var(--card-bg)', borderRadius: '10px', border: '1px solid var(--border)', borderLeft: '4px solid #10b981' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: '#10b981', textTransform: 'uppercase' }}>FG Store Stock</div>
            <div style={{ fontSize: '17px', fontWeight: 800, color: '#10b981', fontFamily: 'monospace', marginTop: '2px' }}>
              {formatNumber(metrics.fgQty)} <span style={{ fontSize: '10px', fontWeight: 600 }}>PCS</span>
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text3)' }}>{metrics.fgPackets} pkts inwarded</div>
          </div>
        </div>
      )}

      {/* 2. Top Summary KPI Cards (Desktop or Mobile Reports View) */}
      {(!isMobile || mobileViewTab === 'reports') && (
        <div className="inv-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginBottom: '20px' }}>
          {/* WIP Store Stock */}
          <div className="card inv-kpi-card" style={{ padding: '16px 18px', borderLeft: '4px solid #f59e0b', background: 'var(--card-bg)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span className="inv-kpi-title" style={{ fontSize: '11px', fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                WIP Store Stock
              </span>
              <div style={{ width: '26px', height: '26px', borderRadius: '6px', background: 'rgba(245, 158, 11, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f59e0b' }}>
                <Layers size={14} />
              </div>
            </div>
            <div className="inv-kpi-value" style={{ fontSize: '24px', fontWeight: 800, color: '#f59e0b', fontFamily: 'monospace' }}>
              {formatNumber(metrics.wipQty)} <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text3)' }}>PCS</span>
            </div>
            <div className="inv-kpi-subtitle" style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '4px' }}>
              {metrics.wipPackets} packets passed Final Inspection awaiting inwarding
            </div>
          </div>

          {/* FG Store Stock */}
          <div className="card inv-kpi-card" style={{ padding: '16px 18px', borderLeft: '4px solid #10b981', background: 'var(--card-bg)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span className="inv-kpi-title" style={{ fontSize: '11px', fontWeight: 700, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                FG Store Stock
              </span>
              <div style={{ width: '26px', height: '26px', borderRadius: '6px', background: 'rgba(16, 185, 129, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981' }}>
                <Warehouse size={14} />
              </div>
            </div>
            <div className="inv-kpi-value" style={{ fontSize: '24px', fontWeight: 800, color: '#10b981', fontFamily: 'monospace' }}>
              {formatNumber(metrics.fgQty)} <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text3)' }}>PCS</span>
            </div>
            <div className="inv-kpi-subtitle" style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '4px' }}>
              {metrics.fgPackets} packets inwarded into Finished Goods Store
            </div>
          </div>

          {/* Today's Inwarded */}
          <div className="card inv-kpi-card" style={{ padding: '16px 18px', borderLeft: '4px solid #3b82f6', background: 'var(--card-bg)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span className="inv-kpi-title" style={{ fontSize: '11px', fontWeight: 700, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Inwarded Today
              </span>
              <div style={{ width: '26px', height: '26px', borderRadius: '6px', background: 'rgba(59, 130, 246, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6' }}>
                <ArrowDownToLine size={14} />
              </div>
            </div>
            <div className="inv-kpi-value" style={{ fontSize: '24px', fontWeight: 800, color: '#3b82f6', fontFamily: 'monospace' }}>
              {formatNumber(metrics.todayInwardQty)} <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text3)' }}>PCS</span>
            </div>
            <div className="inv-kpi-subtitle" style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '4px' }}>
              {metrics.todayInwardPackets} packets received today by {storekeeperName}
            </div>
          </div>

          {/* Total Passed Inventory */}
          <div className="card inv-kpi-card" style={{ padding: '16px 18px', borderLeft: '4px solid #8b5cf6', background: 'var(--card-bg)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span className="inv-kpi-title" style={{ fontSize: '11px', fontWeight: 700, color: '#8b5cf6', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Total Inspected Stock
              </span>
              <div style={{ width: '26px', height: '26px', borderRadius: '6px', background: 'rgba(139, 92, 246, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8b5cf6' }}>
                <Package size={14} />
              </div>
            </div>
            <div className="inv-kpi-value" style={{ fontSize: '24px', fontWeight: 800, color: '#8b5cf6', fontFamily: 'monospace' }}>
              {formatNumber(metrics.totalStockQty)} <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text3)' }}>PCS</span>
            </div>
            <div className="inv-kpi-subtitle" style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '4px' }}>
              {metrics.totalStockPackets} total verified packets across WIP & FG
            </div>
          </div>
        </div>
      )}

      {/* 3. Navigation Sub-Tabs (Desktop or Mobile Reports View) */}
      {(!isMobile || mobileViewTab === 'reports') && (
        <div className="inv-tab-strip" style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--border)', paddingBottom: '12px', marginBottom: '20px' }}>
          {!isMobile && (
            <button
              onClick={() => setActiveTab('inwarding')}
              className="inv-tab-btn"
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '9px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                cursor: 'pointer', transition: 'all 0.15s ease',
                border: activeTab === 'inwarding' ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid transparent',
                background: activeTab === 'inwarding' ? 'rgba(59, 130, 246, 0.12)' : 'transparent',
                color: activeTab === 'inwarding' ? 'var(--blue)' : 'var(--text2)'
              }}
            >
              <QrCode size={16} /> Store Inwarding {stagedPackets.length > 0 && <span style={{ background: '#10b981', color: '#fff', padding: '1px 7px', borderRadius: '10px', fontSize: '11px', fontWeight: 800 }}>{stagedPackets.length}</span>}
            </button>
          )}

          <button
            onClick={() => setActiveTab('product_stock')}
            className="inv-tab-btn"
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '9px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
              cursor: 'pointer', transition: 'all 0.15s ease',
              border: activeTab === 'product_stock' ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid transparent',
              background: activeTab === 'product_stock' ? 'rgba(59, 130, 246, 0.12)' : 'transparent',
              color: activeTab === 'product_stock' ? 'var(--blue)' : 'var(--text2)'
            }}
          >
            <Package size={16} /> Product-wise Stock
          </button>

          <button
            onClick={() => setActiveTab('batch_stock')}
            className="inv-tab-btn"
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '9px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
              cursor: 'pointer', transition: 'all 0.15s ease',
              border: activeTab === 'batch_stock' ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid transparent',
              background: activeTab === 'batch_stock' ? 'rgba(59, 130, 246, 0.12)' : 'transparent',
              color: activeTab === 'batch_stock' ? 'var(--blue)' : 'var(--text2)'
            }}
          >
            <Layers size={16} /> Batch-wise Stock
          </button>

          <button
            onClick={() => setActiveTab('ledger')}
            className="inv-tab-btn"
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '9px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
              cursor: 'pointer', transition: 'all 0.15s ease',
              border: activeTab === 'ledger' ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid transparent',
              background: activeTab === 'ledger' ? 'rgba(59, 130, 246, 0.12)' : 'transparent',
              color: activeTab === 'ledger' ? 'var(--blue)' : 'var(--text2)'
            }}
          >
            <History size={16} /> Movement Ledger ({inwardingLedger.length})
          </button>
        </div>
      )}

      {/* 4. SUB-TAB 1: High-Speed Store Inwarding Scanner & Bulk Staging */}
      {activeTab === 'inwarding' && (
        <div className="inv-scanner-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(340px, 1.15fr) minmax(320px, 0.85fr)', gap: '20px' }}>
          {/* Scanner Console & Staging Queue */}
          <div className="card inv-scanner-card" style={{ padding: '22px', background: 'var(--card-bg)' }}>
            {/* Header with Mode Switch */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(59, 130, 246, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--blue)' }}>
                  <QrCode size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text)' }}>
                    Store Inwarding Scanner
                  </h3>
                  <div style={{ fontSize: '12px', color: 'var(--text3)' }}>
                    Scan packet QR (e.g. <code>APTP26J17-20</code>) or Bin (<code>APBIN-01</code>)
                  </div>
                </div>
              </div>

              {/* Mode Selector Pill */}
              <div className="inv-mode-selector" style={{ display: 'flex', background: 'var(--bg2)', padding: '3px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <button
                  type="button"
                  onClick={() => setInwardingMode('bulk')}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '5px',
                    padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 700,
                    cursor: 'pointer', border: 'none', transition: 'all 0.15s ease',
                    background: inwardingMode === 'bulk' ? 'rgba(16, 185, 129, 0.15)' : 'transparent',
                    color: inwardingMode === 'bulk' ? '#10b981' : 'var(--text3)'
                  }}
                  title="Scan multiple packets continuously, review batch, then submit all at once"
                >
                  <Zap size={13} /> Bulk Staging
                </button>
                <button
                  type="button"
                  onClick={() => setInwardingMode('instant')}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '5px',
                    padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 700,
                    cursor: 'pointer', border: 'none', transition: 'all 0.15s ease',
                    background: inwardingMode === 'instant' ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                    color: inwardingMode === 'instant' ? 'var(--blue)' : 'var(--text3)'
                  }}
                  title="Direct 1-click inwarding immediately on every scan"
                >
                  <ArrowDownToLine size={13} /> Direct Scan
                </button>
              </div>
            </div>

            {/* Always-Open Continuous Camera Viewfinder */}
            <div
              className="inv-camera-box"
              style={{
                position: 'relative',
                width: '100%',
                borderRadius: '14px',
                overflow: 'hidden',
                background: '#0a0f1d',
                border: lastScannedFeedback && (Date.now() - lastScannedFeedback.time < 1200)
                  ? '2.5px solid #10b981'
                  : '1.5px solid rgba(59, 130, 246, 0.35)',
                boxShadow: lastScannedFeedback && (Date.now() - lastScannedFeedback.time < 1200)
                  ? '0 0 25px rgba(16, 185, 129, 0.5)'
                  : '0 6px 18px rgba(0, 0, 0, 0.25)',
                marginBottom: '16px',
                transition: 'all 0.2s ease'
              }}
            >
              {/* HTML5 QR Mount Node */}
              <div
                id="store-inward-camera-viewport"
                style={{
                  width: '100%',
                  minHeight: '220px',
                  maxHeight: isMobile ? '280px' : '320px',
                  background: '#05070d',
                  display: isCameraActive ? 'block' : 'none'
                }}
              />

              {/* Floating Camera Quick Controls Overlay */}
              <div
                style={{
                  position: 'absolute',
                  top: '10px',
                  right: '10px',
                  zIndex: 10,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                {hasTorch && (
                  <button
                    type="button"
                    onClick={toggleTorch}
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '50%',
                      background: torchOn ? '#f59e0b' : 'rgba(0, 0, 0, 0.65)',
                      color: '#fff',
                      border: '1px solid rgba(255, 255, 255, 0.25)',
                      backdropFilter: 'blur(4px)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer'
                    }}
                    title={torchOn ? 'Turn Flashlight Off' : 'Turn Flashlight On'}
                  >
                    <Flashlight size={17} />
                  </button>
                )}

                <button
                  type="button"
                  onClick={flipCamera}
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    background: 'rgba(0, 0, 0, 0.65)',
                    color: '#fff',
                    border: '1px solid rgba(255, 255, 255, 0.25)',
                    backdropFilter: 'blur(4px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer'
                  }}
                  title="Switch Front/Back Camera"
                >
                  <FlipHorizontal size={17} />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (isCameraActive) {
                      stopInlineScanner();
                    } else {
                      setIsCameraActive(true);
                      startInlineScanner(facingMode);
                    }
                  }}
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    background: isCameraActive ? 'rgba(0, 0, 0, 0.65)' : '#3b82f6',
                    color: '#fff',
                    border: '1px solid rgba(255, 255, 255, 0.25)',
                    backdropFilter: 'blur(4px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer'
                  }}
                  title={isCameraActive ? 'Pause Camera' : 'Resume Camera'}
                >
                  {isCameraActive ? <CameraOff size={17} /> : <Camera size={17} />}
                </button>
              </div>

              {/* Laser Sweep & Reticle Target (when scanning) */}
              {isCameraActive && cameraStatus === 'scanning' && (
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    pointerEvents: 'none',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <div className="inv-laser-beam" />

                  {/* Reticle Target Frame */}
                  <div
                    style={{
                      width: '180px',
                      height: '180px',
                      border: '1.5px dashed rgba(59, 130, 246, 0.6)',
                      borderRadius: '14px',
                      boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.25)',
                      position: 'relative'
                    }}
                  >
                    <div style={{ position: 'absolute', top: '-2px', left: '-2px', width: '22px', height: '22px', borderTop: '3.5px solid #3b82f6', borderLeft: '3.5px solid #3b82f6', borderTopLeftRadius: '10px' }} />
                    <div style={{ position: 'absolute', top: '-2px', right: '-2px', width: '22px', height: '22px', borderTop: '3.5px solid #3b82f6', borderRight: '3.5px solid #3b82f6', borderTopRightRadius: '10px' }} />
                    <div style={{ position: 'absolute', bottom: '-2px', left: '-2px', width: '22px', height: '22px', borderBottom: '3.5px solid #3b82f6', borderLeft: '3.5px solid #3b82f6', borderBottomLeftRadius: '10px' }} />
                    <div style={{ position: 'absolute', bottom: '-2px', right: '-2px', width: '22px', height: '22px', borderBottom: '3.5px solid #3b82f6', borderRight: '3.5px solid #3b82f6', borderBottomRightRadius: '10px' }} />
                  </div>

                  {/* Scanned Confirmation Pill Overlay */}
                  {lastScannedFeedback && (Date.now() - lastScannedFeedback.time < 1800) && (
                    <div
                      style={{
                        position: 'absolute',
                        bottom: '14px',
                        background: '#10b981',
                        color: '#fff',
                        padding: '6px 14px',
                        borderRadius: '20px',
                        fontSize: '12px',
                        fontWeight: 800,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        boxShadow: '0 4px 14px rgba(16, 185, 129, 0.6)'
                      }}
                    >
                      <CheckCircle2 size={14} /> SCANNED: {lastScannedFeedback.id}
                    </div>
                  )}
                </div>
              )}

              {/* Camera Status Overlay (Starting / Error / Stopped) */}
              {(!isCameraActive || cameraStatus !== 'scanning') && (
                <div
                  style={{
                    minHeight: '220px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '24px',
                    textAlign: 'center',
                    color: 'var(--text3)'
                  }}
                >
                  {cameraStatus === 'starting' && (
                    <>
                      <RefreshCw size={28} className="animate-spin" style={{ color: 'var(--blue)', marginBottom: '10px' }} />
                      <div style={{ fontSize: '13px', color: 'var(--text)', fontWeight: 600 }}>Starting Camera...</div>
                      <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px' }}>Please allow camera access in browser</div>
                    </>
                  )}
                  {cameraStatus === 'error' && (
                    <>
                      <AlertTriangle size={28} style={{ color: '#ef4444', marginBottom: '10px' }} />
                      <div style={{ fontSize: '13px', color: '#ef4444', fontWeight: 700 }}>Camera Access Error</div>
                      <div style={{ fontSize: '11px', color: 'var(--text3)', margin: '4px 0 12px' }}>{cameraError || 'Could not start camera.'}</div>
                      <button
                        type="button"
                        onClick={() => {
                          setIsCameraActive(true);
                          startInlineScanner(facingMode);
                        }}
                        className="btn btn-secondary"
                        style={{ fontSize: '12px', padding: '6px 14px' }}
                      >
                        <RefreshCw size={13} /> Retry Camera
                      </button>
                    </>
                  )}
                  {cameraStatus === 'stopped' && (
                    <>
                      <Camera size={28} style={{ color: 'var(--text3)', marginBottom: '10px', opacity: 0.6 }} />
                      <div style={{ fontSize: '13px', color: 'var(--text)', fontWeight: 600 }}>Scanner Paused</div>
                      <div style={{ fontSize: '11px', color: 'var(--text3)', margin: '4px 0 12px' }}>Tap below to activate camera scanner</div>
                      <button
                        type="button"
                        onClick={() => {
                          setIsCameraActive(true);
                          startInlineScanner(facingMode);
                        }}
                        className="btn btn-primary"
                        style={{ fontSize: '12px', padding: '7px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}
                      >
                        <Camera size={14} /> Start Camera Scanner
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Scan Form */}
            <form onSubmit={handleScanSubmit} style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  ref={scanInputRef}
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="characters"
                  spellCheck="false"
                  placeholder={inwardingMode === 'bulk' ? "⚡ High-speed scan: Scan packet QR code..." : "Scan or enter QR code to inward immediately..."}
                  value={scanInput}
                  onChange={(e) => setScanInput(e.target.value)}
                  disabled={isProcessingScan}
                  className="inv-scan-input-box"
                  style={{
                    flex: 1,
                    height: '48px',
                    padding: '0 16px',
                    borderRadius: '10px',
                    background: 'var(--bg2)',
                    border: '1.5px solid var(--border)',
                    color: 'var(--text)',
                    fontSize: '15px',
                    fontFamily: 'monospace',
                    outline: 'none',
                    boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.06)'
                  }}
                />
                <button
                  type="submit"
                  disabled={!scanInput.trim() || isProcessingScan}
                  className="btn btn-primary"
                  style={{
                    height: '48px',
                    padding: '0 18px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '14px',
                    fontWeight: 700,
                    borderRadius: '10px',
                    flexShrink: 0
                  }}
                >
                  {inwardingMode === 'bulk' ? (
                    <><Zap size={16} /> Stage</>
                  ) : (
                    <><ArrowDownToLine size={16} /> Inward</>
                  )}
                </button>
              </div>
            </form>

            {/* Scan Feedback Banner */}
            {scanFeedback && (
              <div
                style={{
                  padding: '14px 16px',
                  borderRadius: '10px',
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  border:
                    scanFeedback.type === 'success'
                      ? '1px solid rgba(16, 185, 129, 0.4)'
                      : scanFeedback.type === 'warning'
                      ? '1px solid rgba(245, 158, 11, 0.4)'
                      : '1px solid rgba(239, 68, 68, 0.4)',
                  background:
                    scanFeedback.type === 'success'
                      ? 'rgba(16, 185, 129, 0.08)'
                      : scanFeedback.type === 'warning'
                      ? 'rgba(245, 158, 11, 0.08)'
                      : 'rgba(239, 68, 68, 0.08)'
                }}
              >
                {scanFeedback.type === 'success' && <CheckCircle2 size={20} style={{ color: '#10b981', flexShrink: 0, marginTop: '2px' }} />}
                {scanFeedback.type === 'warning' && <AlertTriangle size={20} style={{ color: '#f59e0b', flexShrink: 0, marginTop: '2px' }} />}
                {scanFeedback.type === 'error' && <ShieldAlert size={20} style={{ color: '#ef4444', flexShrink: 0, marginTop: '2px' }} />}
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontWeight: 700, fontSize: '14px',
                    color: scanFeedback.type === 'success' ? '#10b981' : scanFeedback.type === 'warning' ? '#f59e0b' : '#ef4444'
                  }}>
                    {scanFeedback.title}
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--text)', marginTop: '2px', wordBreak: 'break-word' }}>
                    {scanFeedback.message}
                  </div>
                  {scanFeedback.details && (
                    <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px', fontStyle: 'italic' }}>
                      {scanFeedback.details}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setScanFeedback(null)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text3)', cursor: 'pointer', padding: '4px' }}
                >
                  <X size={15} />
                </button>
              </div>
            )}

            {/* STAGING QUEUE (Active in Bulk Mode) */}
            {inwardingMode === 'bulk' && (
              <div style={{
                borderRadius: '12px',
                border: stagedPackets.length > 0 ? '1.5px solid rgba(16, 185, 129, 0.35)' : '1px solid var(--border)',
                background: stagedPackets.length > 0 ? 'rgba(16, 185, 129, 0.02)' : 'var(--bg2)',
                padding: '16px',
                marginBottom: '16px'
              }}>
                {/* Staging Summary & Action Header */}
                <div className="inv-staged-queue-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: stagedPackets.length > 0 ? '14px' : '0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '32px', height: '32px', borderRadius: '8px',
                      background: stagedPackets.length > 0 ? '#10b981' : 'var(--border)',
                      color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 800, fontSize: '14px'
                    }}>
                      {stagedPackets.length}
                    </div>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>Staged Inwarding Batch</span>
                        {stagedPackets.length > 0 && (
                          <span style={{ fontSize: '11px', color: '#10b981', fontWeight: 800 }}>
                            &bull; {formatNumber(stagedSummary.totalQty)} PCS
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text3)' }}>
                        {stagedPackets.length === 0
                          ? 'Scan packets continuously with barcode scanner. Verified items stage here.'
                          : `${stagedSummary.batchBreakdown.length} batch(es), ${stagedSummary.productBreakdown.length} product(s) ready for FG Store`}
                      </div>
                    </div>
                  </div>

                  {/* Actions: Big Submit Button & Clear */}
                  {stagedPackets.length > 0 && (
                    <div className="inv-staged-actions" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={handleSubmitBulkInwarding}
                        disabled={isSubmittingBulk}
                        className="btn btn-primary"
                        style={{
                          background: 'linear-gradient(135deg, #10b981, #059669)',
                          borderColor: '#059669',
                          color: '#fff',
                          fontWeight: 700,
                          fontSize: '13px',
                          padding: '10px 18px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          borderRadius: '8px',
                          boxShadow: '0 2px 8px rgba(16, 185, 129, 0.25)'
                        }}
                      >
                        {isSubmittingBulk ? (
                          <RefreshCw size={15} className="animate-spin" />
                        ) : (
                          <CheckCheck size={16} />
                        )}
                        Submit Inwarding Batch ({stagedPackets.length})
                      </button>

                      <button
                        type="button"
                        onClick={handleClearStagedPackets}
                        disabled={isSubmittingBulk}
                        className="btn btn-secondary"
                        style={{ padding: '10px 12px', borderRadius: '8px', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}
                        title="Clear entire staged batch"
                      >
                        <Trash2 size={14} /> Clear
                      </button>
                    </div>
                  )}
                </div>

                {/* Staged Packets List */}
                {stagedPackets.length > 0 && (
                  <div style={{ maxHeight: '340px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px' }}>
                    {stagedPackets.map((item, idx) => (
                      <div
                        key={item.packetId}
                        className="inv-staged-item-card"
                        style={{
                          padding: '10px 14px',
                          borderRadius: '8px',
                          background: idx === 0 ? 'rgba(16, 185, 129, 0.08)' : 'var(--card-bg)',
                          border: idx === 0 ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid var(--border)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '10px',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                          <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)', width: '22px' }}>
                            #{stagedPackets.length - idx}
                          </span>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <span className="mono" style={{ fontWeight: 800, fontSize: '13px', color: 'var(--text)' }}>
                                {item.packetId}
                              </span>
                              {idx === 0 && (
                                <span style={{ fontSize: '9px', fontWeight: 800, background: '#10b981', color: '#fff', padding: '1px 6px', borderRadius: '6px' }}>
                                  JUST SCANNED
                                </span>
                              )}
                              <span style={{ fontSize: '10px', fontWeight: 700, color: '#f59e0b', background: 'rgba(245, 158, 11, 0.12)', padding: '1px 6px', borderRadius: '4px' }}>
                                Batch: {item.batchCode}
                              </span>
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--text2)', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {item.productName}
                            </div>
                          </div>
                        </div>

                        <div className="inv-staged-item-right" style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '14px', fontWeight: 800, color: '#10b981', fontFamily: 'monospace' }}>
                              +{formatNumber(item.quantity)} <span style={{ fontSize: '10px' }}>PCS</span>
                            </div>
                            <div style={{ fontSize: '10px', color: 'var(--text3)' }}>
                              QC: {item.inspectorName || 'Passed'}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleRemoveStagedPacket(item.packetId)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--text3)',
                              cursor: 'pointer',
                              padding: '6px',
                              borderRadius: '6px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'color 0.15s ease'
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
                            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text3)')}
                            title="Remove this packet from batch"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Final Inspection Gatekeeper Information Notice */}
            <div style={{ padding: '14px 16px', borderRadius: '10px', background: 'var(--bg2)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <ShieldCheck size={16} style={{ color: '#10b981' }} /> Final Inspection Gatekeeper Enforced:
              </div>
              <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '11.5px', color: 'var(--text3)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <li><strong>WIP Store Stock:</strong> Items appear in WIP Store automatically as soon as Final QC inspection is PASSED.</li>
                <li><strong>Gatekeeper Validation:</strong> Scanner only accepts packets with status PASSED. Uninspected, held, or rejected items cannot be inwarded.</li>
                <li><strong>Automatic Stock Movement:</strong> Bulk submission inwarding immediately deducts from WIP Store stock and adds to Finished Goods Store.</li>
              </ul>
            </div>
          </div>

          {/* Live Inward Activity Feed */}
          <div className="card inv-scanner-card" style={{ padding: '22px', background: 'var(--card-bg)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Clock size={16} style={{ color: 'var(--blue)' }} />
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>
                  Live Inwarding Activity
                </h3>
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text3)' }}>Recently Moved to FG</span>
            </div>

            {recentInwardFeed.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text3)', fontSize: '13px' }}>
                <Package size={36} style={{ opacity: 0.3, margin: '0 auto 12px' }} />
                Ready to scan. Inwarded packets will appear here in real-time.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '520px', overflowY: 'auto' }}>
                {recentInwardFeed.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      padding: '12px 14px',
                      borderRadius: '8px',
                      background: 'var(--bg2)',
                      border: '1px solid var(--border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '8px'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span className="pill pg" style={{ fontSize: '9px', fontWeight: 800 }}>
                          INWARDED
                        </span>
                        <span className="mono" style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text)' }}>
                          {item.packetId}
                        </span>
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text2)', marginTop: '2px' }}>
                        {item.productName} &bull; Batch: <span className="mono">{item.batchCode}</span>
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '14px', fontWeight: 800, color: '#10b981', fontFamily: 'monospace' }}>
                        +{formatNumber(item.quantity)} <span style={{ fontSize: '10px' }}>PCS</span>
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--text3)' }}>
                        {new Date(item.inwardedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} by {item.inwardedBy}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Floating / Sticky Mobile Action Bar for Fast Submission */}
      {inwardingMode === 'bulk' && stagedPackets.length > 0 && activeTab === 'inwarding' && (
        <div
          className="inv-mobile-sticky-bar"
          style={{
            position: 'fixed',
            bottom: '20px',
            left: '14px',
            right: '14px',
            zIndex: 990,
            background: 'var(--card-bg)',
            border: '2px solid #10b981',
            borderRadius: '14px',
            padding: '12px 16px',
            boxShadow: '0 10px 25px -5px rgba(16, 185, 129, 0.4), 0 8px 10px -6px rgba(0, 0, 0, 0.2)',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px'
          }}
        >
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#10b981', textTransform: 'uppercase' }}>
              Staged Queue
            </div>
            <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text)' }}>
              {stagedPackets.length} Packets <span style={{ color: 'var(--text3)', fontSize: '12px' }}>({formatNumber(stagedSummary.totalQty)} pcs)</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSubmitBulkInwarding}
            disabled={isSubmittingBulk}
            className="btn btn-primary"
            style={{
              background: 'linear-gradient(135deg, #10b981, #059669)',
              borderColor: '#059669',
              color: '#fff',
              fontWeight: 800,
              fontSize: '14px',
              padding: '10px 18px',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            {isSubmittingBulk ? <RefreshCw size={16} className="animate-spin" /> : <CheckCheck size={16} />}
            Submit Inwarding
          </button>
        </div>
      )}

      {/* Inwarding Completed Modal / Receipt Dialog */}
      {completedBatchReceipt && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0, 0, 0, 0.7)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '16px'
        }}>
          <div className="card" style={{
            background: 'var(--card-bg)',
            borderRadius: '16px',
            maxWidth: '540px',
            width: '100%',
            padding: '24px',
            border: '1.5px solid rgba(16, 185, 129, 0.4)',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)',
            animation: 'fadeIn 0.2s ease-out'
          }}>
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <div style={{
                width: '56px', height: '56px', borderRadius: '50%',
                background: 'rgba(16, 185, 129, 0.15)', color: '#10b981',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 12px'
              }}>
                <CheckCircle2 size={32} />
              </div>
              <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: 'var(--text)' }}>
                Batch Inwarding Complete!
              </h3>
              <div style={{ fontSize: '13px', color: 'var(--text3)', marginTop: '4px' }}>
                Goods Receipt Note: <span className="mono" style={{ fontWeight: 700, color: 'var(--text)' }}>{completedBatchReceipt.receiptId}</span>
              </div>
            </div>

            <div style={{
              background: 'var(--bg2)',
              borderRadius: '10px',
              padding: '16px',
              marginBottom: '20px',
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '12px'
            }}>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text3)', textTransform: 'uppercase', fontWeight: 600 }}>Total Inwarded</div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#10b981', fontFamily: 'monospace', marginTop: '2px' }}>
                  {formatNumber(completedBatchReceipt.totalQty)} <span style={{ fontSize: '11px' }}>PCS</span>
                </div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text3)', textTransform: 'uppercase', fontWeight: 600 }}>Packets Count</div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text)', fontFamily: 'monospace', marginTop: '2px' }}>
                  {completedBatchReceipt.packetCount} <span style={{ fontSize: '11px' }}>Packets</span>
                </div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text3)', textTransform: 'uppercase', fontWeight: 600 }}>Movement</div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text2)', marginTop: '2px' }}>
                  WIP Store &rarr; FG Store
                </div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text3)', textTransform: 'uppercase', fontWeight: 600 }}>Storekeeper</div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text2)', marginTop: '2px' }}>
                  {completedBatchReceipt.storekeeper}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                onClick={handlePrintReceipt}
                className="btn btn-secondary"
                style={{ flex: 1, padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '13px', fontWeight: 700, borderRadius: '8px' }}
              >
                <Printer size={16} /> Print Slip (GRN)
              </button>
              <button
                type="button"
                onClick={() => setCompletedBatchReceipt(null)}
                className="btn btn-primary"
                style={{ flex: 1, padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '13px', fontWeight: 700, borderRadius: '8px' }}
              >
                <Check size={16} /> Continue Scanning
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. SUB-TAB 2: Product-wise Stock */}
      {activeTab === 'product_stock' && (
        <div className="card" style={{ padding: '24px', background: 'var(--card-bg)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ position: 'relative', width: '280px' }}>
                <Search size={15} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text3)' }} />
                <input
                  type="text"
                  placeholder="Search products or item codes..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{
                    width: '100%',
                    height: '38px',
                    padding: '0 12px 0 36px',
                    borderRadius: '8px',
                    background: 'var(--bg2)',
                    border: '1px solid var(--border)',
                    color: 'var(--text)',
                    fontSize: '13px',
                    outline: 'none'
                  }}
                />
              </div>
              <span style={{ fontSize: '12px', color: 'var(--text3)' }}>
                {productStockReport.length} products
              </span>
            </div>

            <button
              onClick={() =>
                exportCSV(
                  'product_stock_report',
                  ['Product Name', 'Item Code', 'WIP Store Qty (pcs)', 'WIP Packets', 'FG Store Qty (pcs)', 'FG Packets', 'Total Stock (pcs)'],
                  productStockReport.map((p) => [
                    p.productName,
                    p.productCode,
                    p.wipQty,
                    p.wipPackets,
                    p.fgQty,
                    p.fgPackets,
                    p.totalQty
                  ])
                )
              }
              className="btn btn-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '7px 12px' }}
            >
              <Download size={14} /> Export CSV
            </button>
          </div>

          <div className="table-responsive">
            <table className="dt" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Product Details</th>
                  <th style={{ textAlign: 'right' }}>WIP Store Stock</th>
                  <th style={{ textAlign: 'right' }}>FG Store Stock</th>
                  <th style={{ textAlign: 'right' }}>Total Stock</th>
                  <th style={{ minWidth: '180px' }}>WIP vs FG Distribution</th>
                </tr>
              </thead>
              <tbody>
                {productStockReport.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '30px', color: 'var(--text3)' }}>
                      No product inventory found matching search.
                    </td>
                  </tr>
                ) : (
                  productStockReport.map((prod) => {
                    const fgRatio = prod.totalQty > 0 ? (prod.fgQty / prod.totalQty) * 100 : 0;
                    const wipRatio = prod.totalQty > 0 ? (prod.wipQty / prod.totalQty) * 100 : 0;

                    return (
                      <tr key={prod.productId}>
                        <td>
                          <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text)' }}>
                            {prod.productName}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                            {prod.productCode && <span>Code: <strong style={{ color: 'var(--text2)' }}>{prod.productCode}</strong></span>}
                            <span>&bull; {prod.batches.size} batch(es)</span>
                          </div>
                        </td>

                        <td style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '15px', fontWeight: 700, color: '#f59e0b', fontFamily: 'monospace' }}>
                            {formatNumber(prod.wipQty)} <span style={{ fontSize: '11px', color: 'var(--text3)' }}>PCS</span>
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text3)' }}>
                            {prod.wipPackets} packets (Passed QC)
                          </div>
                        </td>

                        <td style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '15px', fontWeight: 700, color: '#10b981', fontFamily: 'monospace' }}>
                            {formatNumber(prod.fgQty)} <span style={{ fontSize: '11px', color: 'var(--text3)' }}>PCS</span>
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text3)' }}>
                            {prod.fgPackets} packets (Inwarded)
                          </div>
                        </td>

                        <td style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text)', fontFamily: 'monospace' }}>
                            {formatNumber(prod.totalQty)} <span style={{ fontSize: '11px', color: 'var(--text3)' }}>PCS</span>
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text3)' }}>
                            {prod.wipPackets + prod.fgPackets} total packets
                          </div>
                        </td>

                        <td>
                          <div style={{ display: 'flex', height: '8px', borderRadius: '4px', overflow: 'hidden', background: 'var(--bg2)', border: '1px solid var(--border)' }}>
                            <div
                              style={{ width: `${wipRatio}%`, background: '#f59e0b', transition: 'width 0.3s ease' }}
                              title={`WIP Store: ${formatNumber(prod.wipQty)} pcs (${Math.round(wipRatio)}%)`}
                            />
                            <div
                              style={{ width: `${fgRatio}%`, background: '#10b981', transition: 'width 0.3s ease' }}
                              title={`FG Store: ${formatNumber(prod.fgQty)} pcs (${Math.round(fgRatio)}%)`}
                            />
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text3)', marginTop: '4px' }}>
                            <span style={{ color: '#f59e0b' }}>WIP: {Math.round(wipRatio)}%</span>
                            <span style={{ color: '#10b981' }}>FG: {Math.round(fgRatio)}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 6. SUB-TAB 3: Batch-wise Stock */}
      {activeTab === 'batch_stock' && (
        <div className="card" style={{ padding: '24px', background: 'var(--card-bg)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', width: '280px' }}>
                <Search size={15} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text3)' }} />
                <input
                  type="text"
                  placeholder="Search batch ID or product..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{
                    width: '100%',
                    height: '38px',
                    padding: '0 12px 0 36px',
                    borderRadius: '8px',
                    background: 'var(--bg2)',
                    border: '1px solid var(--border)',
                    color: 'var(--text)',
                    fontSize: '13px',
                    outline: 'none'
                  }}
                />
              </div>

              {/* Filter Pills */}
              <div style={{ display: 'flex', gap: '4px', background: 'var(--bg2)', padding: '3px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <button
                  onClick={() => setBatchStockFilter('ALL')}
                  style={{
                    padding: '5px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                    background: batchStockFilter === 'ALL' ? 'var(--card-bg)' : 'transparent',
                    color: batchStockFilter === 'ALL' ? 'var(--text)' : 'var(--text3)',
                    border: 'none'
                  }}
                >
                  All Batches
                </button>
                <button
                  onClick={() => setBatchStockFilter('WIP_ONLY')}
                  style={{
                    padding: '5px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                    background: batchStockFilter === 'WIP_ONLY' ? 'var(--card-bg)' : 'transparent',
                    color: batchStockFilter === 'WIP_ONLY' ? '#f59e0b' : 'var(--text3)',
                    border: 'none'
                  }}
                >
                  Has WIP Stock
                </button>
                <button
                  onClick={() => setBatchStockFilter('FG_ONLY')}
                  style={{
                    padding: '5px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                    background: batchStockFilter === 'FG_ONLY' ? 'var(--card-bg)' : 'transparent',
                    color: batchStockFilter === 'FG_ONLY' ? '#10b981' : 'var(--text3)',
                    border: 'none'
                  }}
                >
                  Has FG Stock
                </button>
              </div>

              <span style={{ fontSize: '12px', color: 'var(--text3)' }}>
                {batchStockReport.length} batches
              </span>
            </div>

            <button
              onClick={() =>
                exportCSV(
                  'batch_stock_report',
                  ['Batch ID', 'Product Name', 'WIP Store Qty (pcs)', 'WIP Packets', 'FG Store Qty (pcs)', 'FG Packets', 'Total Stock (pcs)'],
                  batchStockReport.map((b) => [
                    b.batchCode,
                    b.productName,
                    b.wipQty,
                    b.wipPackets,
                    b.fgQty,
                    b.fgPackets,
                    b.totalQty
                  ])
                )
              }
              className="btn btn-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '7px 12px' }}
            >
              <Download size={14} /> Export CSV
            </button>
          </div>

          <div className="table-responsive">
            <table className="dt" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ width: '30px' }}></th>
                  <th>Batch ID & Product</th>
                  <th style={{ textAlign: 'right' }}>WIP Store Stock</th>
                  <th style={{ textAlign: 'right' }}>FG Store Stock</th>
                  <th style={{ textAlign: 'right' }}>Total Stock</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {batchStockReport.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '30px', color: 'var(--text3)' }}>
                      No batch inventory records found.
                    </td>
                  </tr>
                ) : (
                  batchStockReport.map((batch) => {
                    const isExpanded = Boolean(expandedBatchIds[batch.batchCode]);

                    return (
                      <React.Fragment key={batch.batchCode}>
                        <tr
                          onClick={() =>
                            setExpandedBatchIds((prev) => ({
                              ...prev,
                              [batch.batchCode]: !prev[batch.batchCode]
                            }))
                          }
                          style={{ cursor: 'pointer' }}
                        >
                          <td style={{ textAlign: 'center', color: 'var(--text3)' }}>
                            {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                          </td>

                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span className="pill pg" style={{ fontSize: '11px', fontWeight: 800 }}>
                                {batch.batchCode}
                              </span>
                              <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text)' }}>
                                {batch.productName}
                              </span>
                            </div>
                          </td>

                          <td style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '14px', fontWeight: 700, color: '#f59e0b', fontFamily: 'monospace' }}>
                              {formatNumber(batch.wipQty)} <span style={{ fontSize: '11px' }}>PCS</span>
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--text3)' }}>
                              {batch.wipPackets} packets
                            </div>
                          </td>

                          <td style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '14px', fontWeight: 700, color: '#10b981', fontFamily: 'monospace' }}>
                              {formatNumber(batch.fgQty)} <span style={{ fontSize: '11px' }}>PCS</span>
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--text3)' }}>
                              {batch.fgPackets} packets
                            </div>
                          </td>

                          <td style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text)', fontFamily: 'monospace' }}>
                              {formatNumber(batch.totalQty)} <span style={{ fontSize: '11px' }}>PCS</span>
                            </div>
                          </td>

                          <td>
                            <span style={{ fontSize: '11px', color: 'var(--blue)', fontWeight: 600 }}>
                              {isExpanded ? 'Hide Packets' : `View ${batch.items.length} Packets`}
                            </span>
                          </td>
                        </tr>

                        {/* Expanded Packet Breakdown Accordion */}
                        {isExpanded && (
                          <tr>
                            <td colSpan={6} style={{ padding: '0 0 16px 40px', background: 'rgba(0,0,0,0.02)' }}>
                              <div style={{ padding: '16px', borderRadius: '8px', background: 'var(--bg2)', border: '1px solid var(--border)' }}>
                                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)', marginBottom: '10px' }}>
                                  Individual Inspected Packets in Batch {batch.batchCode} ({batch.items.length} units)
                                </div>
                                <table className="dt sub-table" style={{ width: '100%', background: 'transparent' }}>
                                  <thead>
                                    <tr>
                                      <th>Packet QR / ID</th>
                                      <th>Quantity</th>
                                      <th>Current Status</th>
                                      <th>Final Inspection</th>
                                      <th>Store Inwarding</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {batch.items.map((item) => (
                                      <tr key={item.packetId}>
                                        <td className="mono" style={{ fontWeight: 600 }}>{item.packetId}</td>
                                        <td className="mono" style={{ fontWeight: 700 }}>{formatNumber(item.quantity)} pcs</td>
                                        <td>
                                          {item.storeStatus === 'FG Store' ? (
                                            <span className="pill" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', fontWeight: 700, fontSize: '10px' }}>
                                              IN FG STORE
                                            </span>
                                          ) : (
                                            <span className="pill" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', fontWeight: 700, fontSize: '10px' }}>
                                              IN WIP STORE
                                            </span>
                                          )}
                                        </td>
                                        <td>
                                          <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 600 }}>
                                            <CheckCircle2 size={12} /> Passed ({item.inspectorName || 'QC'})
                                          </span>
                                        </td>
                                        <td>
                                          {item.inwardedAt ? (
                                            <div style={{ fontSize: '11px', color: 'var(--text2)' }}>
                                              {new Date(item.inwardedAt).toLocaleDateString()} by {item.inwardedBy || 'Store'}
                                            </div>
                                          ) : (
                                            <span style={{ fontSize: '11px', color: '#f59e0b', fontWeight: 600 }}>Awaiting Inwarding</span>
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 7. SUB-TAB 4: Movement Ledger */}
      {activeTab === 'ledger' && (
        <div className="card" style={{ padding: '24px', background: 'var(--card-bg)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ position: 'relative', width: '280px' }}>
                <Search size={15} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text3)' }} />
                <input
                  type="text"
                  placeholder="Search inwarding transactions..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{
                    width: '100%',
                    height: '38px',
                    padding: '0 12px 0 36px',
                    borderRadius: '8px',
                    background: 'var(--bg2)',
                    border: '1px solid var(--border)',
                    color: 'var(--text)',
                    fontSize: '13px',
                    outline: 'none'
                  }}
                />
              </div>
              <span style={{ fontSize: '12px', color: 'var(--text3)' }}>
                {inwardingLedger.length} inwarded transaction(s) recorded
              </span>
            </div>

            <button
              onClick={() =>
                exportCSV(
                  'store_inwarding_ledger',
                  ['Inward Date', 'Packet QR / ID', 'Batch Code', 'Product Name', 'Quantity (pcs)', 'Inwarded By'],
                  inwardingLedger.map((item) => [
                    item.inwardedAt || '',
                    item.packetId,
                    item.batchCode,
                    item.productName,
                    item.quantity,
                    item.inwardedBy || ''
                  ])
                )
              }
              className="btn btn-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '7px 12px' }}
            >
              <Download size={14} /> Export Ledger CSV
            </button>
          </div>

          <div className="table-responsive">
            <table className="dt" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Inwarded Timestamp</th>
                  <th>Packet & Batch Details</th>
                  <th>Product</th>
                  <th style={{ textAlign: 'right' }}>Quantity</th>
                  <th>Movement Track</th>
                  <th>Inwarded By</th>
                </tr>
              </thead>
              <tbody>
                {inwardingLedger.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '30px', color: 'var(--text3)' }}>
                      No stock inwarding transactions logged yet. Use the Store Inwarding scanner tab to scan and move stock from WIP to FG Store.
                    </td>
                  </tr>
                ) : (
                  inwardingLedger.map((item) => (
                    <tr key={item.packetId}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text)' }}>
                          <Calendar size={13} style={{ color: 'var(--text3)' }} />
                          {item.inwardedAt ? new Date(item.inwardedAt).toLocaleDateString() : 'N/A'}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>
                          <Clock size={12} style={{ color: 'var(--blue)' }} />
                          {item.inwardedAt ? new Date(item.inwardedAt).toLocaleTimeString() : ''}
                        </div>
                      </td>

                      <td>
                        <div className="mono" style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text)' }}>
                          {item.packetId}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>
                          Batch: <strong style={{ color: 'var(--text2)' }}>{item.batchCode}</strong>
                        </div>
                      </td>

                      <td>
                        <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text)' }}>
                          {item.productName}
                        </div>
                      </td>

                      <td style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: '15px', fontWeight: 800, color: '#10b981', fontFamily: 'monospace' }}>
                          +{formatNumber(item.quantity)}
                        </span>
                        <span style={{ fontSize: '11px', color: 'var(--text3)', marginLeft: '4px' }}>PCS</span>
                      </td>

                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px' }}>
                          <span style={{ color: '#f59e0b', fontWeight: 600 }}>WIP Store</span>
                          <ArrowRight size={12} style={{ color: 'var(--text3)' }} />
                          <span style={{ color: '#10b981', fontWeight: 700 }}>FG Store</span>
                        </div>
                      </td>

                      <td>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>
                          {item.inwardedBy || 'Store Inwarder'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Camera Scanner Modal */}
      {isCameraOpen && (
        <CameraScanner
          onSuccess={(text) => {
            setIsCameraOpen(false);
            processInwardScan(text);
          }}
          onClose={() => setIsCameraOpen(false)}
        />
      )}
    </div>
  );
};

export default InventoryPage;
