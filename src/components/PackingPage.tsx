import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Boxes, Package, RefreshCw, CheckCircle2, Printer, 
  Plus, Camera, QrCode, AlertTriangle, X, ShieldCheck, Warehouse, AlertCircle, Scan, ArrowLeft, RotateCcw
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatUnitId, parseScannedUnitId } from '../utils/batchUtils';
import type { Machine, Product, Crate, BatchRecord, Operator, AppSettings, Packet, CrateSourceContribution, StorageBin } from '../types';
import PacketLabelPrintModal from './PacketLabelPrintModal';

interface PackingPageProps {
  machines: Machine[];
  products: Product[];
  batchRecords: BatchRecord[];
  operators: Operator[];
  appSettings?: AppSettings | null;
  supervisorName?: string;
  scannerSearchTerm?: string;
  onClearScannerSearchTerm?: () => void;
  onTriggerScan?: () => void;
}

interface EnrichedCrate extends Crate {
  product?: Product;
  productName: string;
  productCode: string;
  stdPackSize: number;
  consumedQty: number;
  remainingQty: number;
  packingState: 'Unpacked' | 'Partially Packed' | 'Fully Packed';
}

interface EnrichedStorageBin extends StorageBin {
  packetsCount: number;
  totalQty: number;
  currentLocation: 'WIP Warehouse' | 'In Transit' | 'Main Store' | 'Empty';
  assignedBatchId?: string;
  assignedProductId?: string;
  assignedProductName?: string;
  isAvailableForPacking: boolean;
  blockReason?: string;
}

interface PendingPackingJob {
  targetProduct: Product | null;
  batchId: string;
  quantity: number;
  sources: CrateSourceContribution[];
  firstCrate: EnrichedCrate;
}

const formatQty = (n: number) => n.toLocaleString('en-IN');

const PackingPage: React.FC<PackingPageProps> = ({
  products,
  batchRecords,
  operators,
  appSettings,
  supervisorName,
  scannerSearchTerm = '',
  onClearScannerSearchTerm,
  onTriggerScan
}) => {
  const [selectedBatchId, setSelectedBatchId] = useState<string>('ALL');
  const [selectedProductId, _setSelectedProductId] = useState<string>('ALL');
  const [selectedPackerId] = useState<string>('');
  const [activeStorageBin, setActiveStorageBin] = useState<string>('APBIN-01');
  const [_storageBinScanInput, setStorageBinScanInput] = useState<string>('');
  const [storageBinsList, setStorageBinsList] = useState<StorageBin[]>([]);
  const [inspectedCrates, setInspectedCrates] = useState<Crate[]>([]);
  const [packetsHistory, setPacketsHistory] = useState<Packet[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isPacking, setIsPacking] = useState<boolean>(false);
  const [activeModalPacket, setActiveModalPacket] = useState<Packet | null>(null);
  const [isReprintModal, setIsReprintModal] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [customQtyInput, setCustomQtyInput] = useState<string>('');
  const [showCustomModal, setShowCustomModal] = useState<boolean>(false);
  const [_activeTab, _setActiveTab] = useState<'queue' | 'history'>('queue');
  const [_lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [scannedCrateId, setScannedCrateId] = useState<string>('');
  const [scanBinSuccessMessage, setScanBinSuccessMessage] = useState<string>('');
  const [lastPackedMessage, setLastPackedMessage] = useState<string>('');

  // Pre-Printed Label Binding Modal State
  const [pendingJob, setPendingJob] = useState<PendingPackingJob | null>(null);
  const [scannedQrInput, setScannedQrInput] = useState<string>('');
  const [qrValidationError, setQrValidationError] = useState<string>('');

  // Fetch inspected crates, packets, and storage bins
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [{ data: cratesData, error: cratesErr }, { data: packetsData, error: packetsErr }, { data: binsData, error: binsErr }] = await Promise.all([
        supabase
          .from('crates')
          .select('*')
          .eq('status', 'Completed')
          .order('bin_number', { ascending: true }),
        supabase
          .from('packets')
          .select('*')
          .order('packed_at', { ascending: false })
          .limit(200),
        supabase
          .from('storage_bins')
          .select('*')
          .order('id', { ascending: true })
      ]);

      if (cratesErr) console.error('Error fetching crates for packing:', cratesErr);
      if (packetsErr) console.error('Error fetching packets:', packetsErr);
      if (binsErr) console.error('Error fetching storage bins:', binsErr);

      if (cratesData) {
        setInspectedCrates(cratesData.map((c: any) => ({
          id: c.id,
          batchId: c.batch_id,
          machineId: c.machine_id,
          binNumber: c.bin_number,
          startTime: c.start_time,
          endTime: c.end_time,
          grossQty: c.gross_qty,
          startupScrap: c.startup_scrap,
          qcSample: c.qc_sample,
          netQty: c.net_qty,
          rejectedQty: c.rejected_qty,
          rejectionDetails: c.rejection_details,
          operatorId: c.operator_id,
          supervisorId: c.supervisor_id,
          inspectedBy: c.inspected_by,
          inspectedAt: c.inspected_at,
          mouldId: c.mould_id,
          materialBatch: c.material_batch,
          shiftId: c.shift_id,
          packedQty: c.packed_qty || 0,
          status: c.status
        })));
      }

      if (packetsData) {
        setPacketsHistory(packetsData.map((p: any) => ({
          id: p.id,
          batchId: p.batch_id,
          productId: p.product_id,
          productName: p.product_name,
          productCode: p.product_code,
          quantity: p.quantity,
          crateSources: p.crate_sources || [],
          packedBy: p.packed_by,
          packedAt: p.packed_at,
          shiftId: p.shift_id,
          status: p.status || 'Packed',
          storageBinId: p.storage_bin_id,
          locationStatus: p.location_status || 'WIP Storage',
          storageBinBoundAt: p.storage_bin_bound_at,
          storeReceivedAt: p.store_received_at,
          storeReceivedBy: p.store_received_by,
          cartonId: p.carton_id
        })));
      }

      if (binsData && binsData.length > 0) {
        setStorageBinsList(binsData.map((b: any) => ({
          id: b.id,
          currentLocation: b.current_location || 'WIP Warehouse'
        })));
      } else {
        setStorageBinsList(Array.from({ length: 10 }, (_, i) => ({
          id: `APBIN-${(i + 1).toString().padStart(2, '0')}`,
          currentLocation: 'WIP Warehouse'
        })));
      }

      setLastRefresh(new Date());
    } catch (err) {
      console.error('Packing fetch exception:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 20000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Compute crate consumption from packet history + packedQty fallback, enrich with Product Master stdPackSize
  const enrichedCrates = useMemo<EnrichedCrate[]>(() => {
    const consumptionMap = new Map<string, number>();

    packetsHistory.forEach((pkt) => {
      if (Array.isArray(pkt.crateSources)) {
        pkt.crateSources.forEach((src) => {
          consumptionMap.set(src.crateId, (consumptionMap.get(src.crateId) || 0) + src.qty);
        });
      }
    });

    return inspectedCrates.map((crate) => {
      const fromPackets = consumptionMap.get(crate.id) || 0;
      const consumedQty = Math.max(fromPackets, crate.packedQty || 0);
      const remainingQty = Math.max(0, (crate.netQty || 0) - consumedQty);

      const batchRec = batchRecords.find((b) => b.id === crate.batchId);
      const product = products.find((p) => p.id === batchRec?.productId);
      const stdPackSize = product?.stdPackSize || 2000;

      let packingState: 'Unpacked' | 'Partially Packed' | 'Fully Packed' = 'Unpacked';
      if (remainingQty === 0) {
        packingState = 'Fully Packed';
      } else if (consumedQty > 0) {
        packingState = 'Partially Packed';
      }

      return {
        ...crate,
        product,
        productName: product?.name || batchRec?.productName || 'Product',
        productCode: product?.itemCode || batchRec?.productCode || '',
        stdPackSize,
        consumedQty,
        remainingQty,
        packingState
      };
    });
  }, [inspectedCrates, packetsHistory, batchRecords, products]);

  // Enriched Storage Bins with Single-Batch & Store lock tracking
  const enrichedStorageBins = useMemo<EnrichedStorageBin[]>(() => {
    const binPacketsMap = new Map<string, Packet[]>();
    packetsHistory.forEach((p) => {
      if (p.storageBinId && p.locationStatus !== 'Carton Packed') {
        const list = binPacketsMap.get(p.storageBinId) || [];
        list.push(p);
        binPacketsMap.set(p.storageBinId, list);
      }
    });

    return storageBinsList.map((bin) => {
      const contained = binPacketsMap.get(bin.id) || [];
      const packetsCount = contained.length;
      const totalQty = contained.reduce((sum, p) => sum + p.quantity, 0);

      let currentLocation: 'WIP Warehouse' | 'In Transit' | 'Main Store' | 'Empty' = bin.currentLocation;
      let assignedBatchId: string | undefined;
      let assignedProductId: string | undefined;
      let assignedProductName: string | undefined;

      if (packetsCount === 0) {
        currentLocation = 'Empty';
      } else {
        const anyInStore = contained.some((p) => p.locationStatus === 'Main Store');
        currentLocation = anyInStore ? 'Main Store' : 'WIP Warehouse';
        assignedBatchId = contained[0].batchId;
        assignedProductId = contained[0].productId;
        assignedProductName = contained[0].productName;
      }

      let isAvailableForPacking = true;
      let blockReason: string | undefined;

      // RULE 1: If in store with items, cannot select for packing!
      if (currentLocation === 'Main Store' && packetsCount > 0) {
        isAvailableForPacking = false;
        blockReason = 'In Store with items (Unavailable for packing)';
      }

      return {
        ...bin,
        currentLocation,
        packetsCount,
        totalQty,
        assignedBatchId,
        assignedProductId,
        assignedProductName,
        isAvailableForPacking,
        blockReason
      };
    });
  }, [storageBinsList, packetsHistory]);

  // Unique batches available in inspected crates
  const availableBatches = useMemo(() => {
    const batchesMap = new Map<string, { batchId: string; productName: string; productCode: string; productId: string; stdPackSize: number }>();
    
    enrichedCrates.forEach((c) => {
      if (!batchesMap.has(c.batchId)) {
        batchesMap.set(c.batchId, {
          batchId: c.batchId,
          productName: c.productName,
          productCode: c.productCode,
          productId: c.product?.id || '',
          stdPackSize: c.stdPackSize
        });
      }
    });

    return Array.from(batchesMap.values());
  }, [enrichedCrates]);

  // Spotlit scanned crate object
  const spotlitCrate = useMemo(() => {
    if (!scannedCrateId) return null;
    const parsed = parseScannedUnitId(scannedCrateId);
    const raw = (parsed.raw || scannedCrateId).toLowerCase();
    const norm = (parsed.normalized || raw).toLowerCase();

    return enrichedCrates.find((c) => {
      const cid = c.id.toLowerCase();
      const normCid = formatUnitId(c.id).toLowerCase();
      if (cid === raw || cid === norm || normCid === norm || normCid === raw) return true;
      if (parsed.batchId && parsed.binNumber && c.batchId.toLowerCase() === parsed.batchId.toLowerCase() && c.binNumber === parsed.binNumber) return true;
      if (cid.includes(raw) || normCid.includes(norm)) return true;
      return false;
    }) || null;
  }, [scannedCrateId, enrichedCrates]);

  // Filtered crates based on batch/product selection
  const filteredCrates = useMemo(() => {
    return enrichedCrates.filter((c) => {
      if (selectedBatchId !== 'ALL' && c.batchId !== selectedBatchId) return false;
      
      if (selectedProductId !== 'ALL') {
        const batchRec = batchRecords.find((b) => b.id === c.batchId);
        if (batchRec && batchRec.productId !== selectedProductId) return false;
      }

      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const matchBatch = c.batchId.toLowerCase().includes(q);
        const matchId = c.id.toLowerCase().includes(q);
        const matchProd = c.productName.toLowerCase().includes(q);
        if (!matchBatch && !matchId && !matchProd) return false;
      }

      return true;
    });
  }, [enrichedCrates, selectedBatchId, selectedProductId, searchTerm, batchRecords]);

  // Active target product info for standard packaging
  const activeProduct = useMemo(() => {
    if (spotlitCrate?.product) {
      return spotlitCrate.product;
    }
    if (selectedBatchId !== 'ALL') {
      const batchRec = batchRecords.find((b) => b.id === selectedBatchId);
      if (batchRec?.productId) {
        return products.find((p) => p.id === batchRec.productId);
      }
    }
    if (selectedProductId !== 'ALL') {
      return products.find((p) => p.id === selectedProductId);
    }
    const firstActiveCrate = filteredCrates.find((c) => c.remainingQty > 0);
    if (firstActiveCrate?.product) {
      return firstActiveCrate.product;
    }
    if (availableBatches.length === 1) {
      return products.find((p) => p.id === availableBatches[0].productId);
    }
    return products[0] || null;
  }, [spotlitCrate, selectedBatchId, selectedProductId, batchRecords, products, filteredCrates, availableBatches]);

  // Target batch ID for active packing
  const activeBatchId = useMemo(() => {
    if (spotlitCrate) return spotlitCrate.batchId;
    if (selectedBatchId !== 'ALL') return selectedBatchId;
    const firstActiveCrate = filteredCrates.find((c) => c.remainingQty > 0);
    return firstActiveCrate?.batchId || '';
  }, [spotlitCrate, selectedBatchId, filteredCrates]);

  // Active Storage Bin Object & Compatibility Check
  const currentActiveBin = useMemo(() => {
    return enrichedStorageBins.find((b) => b.id === activeStorageBin);
  }, [enrichedStorageBins, activeStorageBin]);

  // Check if active storage bin is compatible with current target batch & product
  const binCompatibility = useMemo(() => {
    if (!currentActiveBin) return { valid: true };

    if (!currentActiveBin.isAvailableForPacking) {
      return {
        valid: false,
        error: `Storage Bin "${currentActiveBin.id}" is currently in the Main Store with items. It cannot be used in WIP packing until inwarded and emptied.`
      };
    }

    if (currentActiveBin.packetsCount > 0 && activeBatchId) {
      const isSameBatch = currentActiveBin.assignedBatchId === activeBatchId;
      const isSameProduct = !activeProduct || currentActiveBin.assignedProductId === activeProduct.id;

      if (!isSameBatch || !isSameProduct) {
        return {
          valid: false,
          error: `Storage Bin "${currentActiveBin.id}" already contains Batch ${currentActiveBin.assignedBatchId?.split('-')[0]} (${currentActiveBin.assignedProductName}). Only one batch/item can be packed in a storage bin! Please scan an empty bin.`
        };
      }
    }

    return { valid: true };
  }, [currentActiveBin, activeBatchId, activeProduct]);

  // Handler: Scan physical Storage Bin barcode
  const handleScanStorageBin = (rawScannedCode: string) => {
    const query = rawScannedCode.trim().toUpperCase();
    if (!query) return;

    const matchedBin = enrichedStorageBins.find((b) => b.id.toUpperCase() === query || query.includes(b.id.toUpperCase()));
    if (!matchedBin) {
      alert(`Unrecognized storage bin code "${rawScannedCode}". Must match asset codes like APBIN-01, APBIN-02.`);
      return;
    }

    setActiveStorageBin(matchedBin.id);
    setStorageBinScanInput(matchedBin.id);

    if (!matchedBin.isAvailableForPacking) {
      setScanBinSuccessMessage('');
      alert(`Cannot select ${matchedBin.id}: Currently located in Store with items!`);
      return;
    }

    setScanBinSuccessMessage(`... Storage Bin ${matchedBin.id} scanned & selected (${matchedBin.packetsCount === 0 ? 'Empty & Ready' : `${matchedBin.packetsCount} boxes inside`})`);
    setTimeout(() => setScanBinSuccessMessage(''), 4000);
  };

  // Handle external scanner input (when binding modal is open vs when on queue)
  useEffect(() => {
    if (scannerSearchTerm) {
      const trimmed = scannerSearchTerm.trim();

      // If pre-printed binding modal is active, populate the QR input and auto-confirm!
      if (pendingJob) {
        setScannedQrInput(trimmed);
        setQrValidationError('');
        if (onClearScannerSearchTerm) onClearScannerSearchTerm();
        handleConfirmBindQr(trimmed);
        return;
      }

      // If it matches a Storage Bin (e.g. APBIN-01), scan the bin!
      if (trimmed.toUpperCase().startsWith('APBIN') || enrichedStorageBins.some(b => b.id.toUpperCase() === trimmed.toUpperCase())) {
        handleScanStorageBin(trimmed);
        if (onClearScannerSearchTerm) onClearScannerSearchTerm();
        setWizardStep(3);
        return;
      }

      // Otherwise, match crate production slip using parseScannedUnitId
      const parsed = parseScannedUnitId(trimmed);
      const raw = (parsed.raw || trimmed).toLowerCase();
      const norm = (parsed.normalized || raw).toLowerCase();

      const match = enrichedCrates.find((c) => {
        const cid = c.id.toLowerCase();
        const normCid = formatUnitId(c.id).toLowerCase();
        if (cid === raw || cid === norm || normCid === norm || normCid === raw) return true;
        if (parsed.batchId && parsed.binNumber && c.batchId.toLowerCase() === parsed.batchId.toLowerCase() && c.binNumber === parsed.binNumber) return true;
        if (c.batchId.toLowerCase() === raw) return true;
        return false;
      });
      if (match) {
        if (match.remainingQty <= 0) {
          alert(`Production Slip "${match.id}" (Gross: ${match.grossQty.toLocaleString()} pcs) has already been fully packed (0 pcs remaining balance)! Please scan an unpacked slip.`);
          if (onClearScannerSearchTerm) onClearScannerSearchTerm();
          return;
        }
        setScannedCrateId(match.id);
        setSearchTerm(match.id);
        setSelectedBatchId(match.batchId);
        setWizardStep(2);
      } else {
        setScannedCrateId(trimmed);
        setSearchTerm(trimmed);
        setWizardStep(2);
      }

      if (onClearScannerSearchTerm) {
        onClearScannerSearchTerm();
      }
    }
  }, [scannerSearchTerm, pendingJob, enrichedCrates, enrichedStorageBins, onClearScannerSearchTerm]);

  // Product-specific standard pack size configured in Product Master
  const activeStdPackSize = activeProduct?.stdPackSize || 2000;

  // Unpacked pieces available for the active selection
  // STRICT RULE: If a particular packing slip/crate is scanned (spotlitCrate),
  // ONLY that particular slip's pending balance quantity can be packed!
  const availableUnpackedCrates = useMemo(() => {
    if (spotlitCrate) {
      return spotlitCrate.remainingQty > 0 ? [spotlitCrate] : [];
    }
    return filteredCrates.filter((c) => c.remainingQty > 0);
  }, [spotlitCrate, filteredCrates]);

  const totalAvailableUnpackedQty = useMemo(() => {
    return availableUnpackedCrates.reduce((sum, c) => sum + c.remainingQty, 0);
  }, [availableUnpackedCrates]);

  // const possibleFullBoxes = Math.floor(totalAvailableUnpackedQty / activeStdPackSize);

  // Core Carry-Forward Fulfillment Function
  const fulfillQuantityFromCrates = (
    cratesQueue: EnrichedCrate[],
    targetQty: number
  ): { sources: CrateSourceContribution[]; remainingQueue: EnrichedCrate[] } => {
    let needed = targetQty;
    const sources: CrateSourceContribution[] = [];
    const updatedQueue: EnrichedCrate[] = cratesQueue.map((c) => ({ ...c }));

    for (const crate of updatedQueue) {
      if (needed <= 0) break;
      if (crate.remainingQty <= 0) continue;

      const take = Math.min(crate.remainingQty, needed);
      sources.push({
        crateId: crate.id,
        binNumber: crate.binNumber,
        qty: take
      });

      crate.remainingQty -= take;
      crate.consumedQty += take;
      needed -= take;
    }

    return { sources, remainingQueue: updatedQueue };
  };

  // Step 1: Initiate Pack Job -> Opens Pre-Printed QR Scan & Bind Modal
  const initiatePackSingleBox = (packSizeOverride?: number) => {
    if (availableUnpackedCrates.length === 0) {
      alert('No unpacked pieces available in the selected batch/product.');
      return;
    }

    if (!binCompatibility.valid) {
      alert(binCompatibility.error);
      return;
    }

    const firstCrate = availableUnpackedCrates[0];
    const targetProduct = firstCrate.product || activeProduct || null;
    const productStdPackSize = targetProduct?.stdPackSize || activeStdPackSize;
    
    // If pending balance on this slip is less than full pack, automatically pack remaining balance
    const isBalancePack = totalAvailableUnpackedQty < productStdPackSize;
    const packSize = packSizeOverride || (isBalancePack ? totalAvailableUnpackedQty : productStdPackSize);

    if (totalAvailableUnpackedQty < packSize && !packSizeOverride) {
      alert(`Insufficient pieces on this slip to pack ${packSize.toLocaleString()} pcs (Only ${totalAvailableUnpackedQty.toLocaleString()} pcs pending balance remaining).`);
      return;
    }

    const effectivePackSize = Math.min(packSize, totalAvailableUnpackedQty);
    const { sources } = fulfillQuantityFromCrates(availableUnpackedCrates, effectivePackSize);

    if (sources.length === 0) {
      alert('Could not allocate pieces from available crates.');
      return;
    }

    setPendingJob({
      targetProduct,
      batchId: firstCrate.batchId,
      quantity: effectivePackSize,
      sources,
      firstCrate
    });

    setScannedQrInput('');
    setQrValidationError('');
  };

  // Step 2: Confirm & Bind the Pre-Printed Scanned QR Code + Assign Storage Bin
  const handleConfirmBindQr = async (manualIdOverride?: string) => {
    if (!pendingJob) return;

    // Double check bin compatibility
    if (!binCompatibility.valid) {
      setQrValidationError(binCompatibility.error || 'Invalid storage bin selected.');
      return;
    }

    const qrCode = (manualIdOverride || scannedQrInput).trim();
    if (!qrCode) {
      setQrValidationError('Please scan or enter the pre-printed label QR code / ID.');
      return;
    }

    // Check if this label QR ID is already used
    const isAlreadyUsed = packetsHistory.some((p) => p.id.toLowerCase() === qrCode.toLowerCase());
    if (isAlreadyUsed) {
      setQrValidationError(`Label "${qrCode}" has already been bound to another pack! Please scan a new pre-printed sticker.`);
      return;
    }

    setIsPacking(true);
    setQrValidationError('');

    try {
      const { targetProduct, batchId, quantity, sources, firstCrate } = pendingJob;
      const batchRec = batchRecords.find((b) => b.id === batchId);

      const packerName = operators.find((o) => o.id === selectedPackerId)?.name 
        || supervisorName 
        || appSettings?.activeSupervisorName 
        || 'Operator';

      const nowIso = new Date().toISOString();

      const newPacket: Packet = {
        id: qrCode, // Bound pre-printed QR code is the primary ID
        batchId: firstCrate.batchId,
        productId: targetProduct?.id || batchRec?.productId || '',
        productName: targetProduct?.name || batchRec?.productName || 'Product',
        productCode: targetProduct?.itemCode || batchRec?.productCode || '',
        quantity,
        crateSources: sources,
        packedBy: packerName,
        packedAt: nowIso,
        shiftId: appSettings?.currentShift || 'A',
        status: 'Packed',
        qrCode,
        storageBinId: activeStorageBin,
        locationStatus: 'WIP Storage',
        storageBinBoundAt: nowIso
      };

      // 1. Insert packet into Supabase
      const { error: packetErr } = await supabase.from('packets').insert({
        id: newPacket.id,
        batch_id: newPacket.batchId,
        product_id: newPacket.productId,
        product_name: newPacket.productName,
        product_code: newPacket.productCode,
        quantity: newPacket.quantity,
        crate_sources: newPacket.crateSources,
        packed_by: newPacket.packedBy,
        packed_at: newPacket.packedAt,
        shift_id: newPacket.shiftId,
        status: newPacket.status,
        storage_bin_id: newPacket.storageBinId,
        location_status: newPacket.locationStatus,
        storage_bin_bound_at: newPacket.storageBinBoundAt
      });

      if (packetErr) {
        console.error('Supabase packet insert error:', packetErr);
      }

      // 2. Update packed_qty on each touched crate in DB
      for (const s of sources) {
        const matchingCrate = inspectedCrates.find((c) => c.id === s.crateId);
        if (matchingCrate) {
          const newPackedTotal = (matchingCrate.packedQty || 0) + s.qty;
          await supabase
            .from('crates')
            .update({ packed_qty: newPackedTotal })
            .eq('id', s.crateId);
        }
      }

      // 3. Update storage bin location in DB
      await supabase
        .from('storage_bins')
        .upsert({
          id: activeStorageBin,
          current_location: 'WIP Warehouse'
        });

      // 4. Update local state
      setPacketsHistory((prev) => [newPacket, ...prev]);
      setInspectedCrates((prev) =>
        prev.map((c) => {
          const s = sources.find((src) => src.crateId === c.id);
          return s ? { ...c, packedQty: (c.packedQty || 0) + s.qty } : c;
        })
      );

      // Close binding modal and open label details / reprint modal
      setPendingJob(null);
      setActiveModalPacket(newPacket);
      setIsReprintModal(false);
    } catch (err: any) {
      console.error('Binding error:', err);
      setQrValidationError(`Binding failed: ${err.message || err}`);
    } finally {
      setIsPacking(false);
    }
  };

  // Helper: Generate a fallback system ID if no pre-printed label is on hand
  const handleGenerateFallbackId = () => {
    if (!pendingJob) return;
    const batchCode = pendingJob.firstCrate.batchId.split('-')[0];
    const packetNumber = (packetsHistory.filter((p) => p.batchId === pendingJob.firstCrate.batchId).length + 1)
      .toString()
      .padStart(3, '0');
    const autoId = `PKT-${batchCode}-${packetNumber}`;
    setScannedQrInput(autoId);
  };

  // Handler: Custom Loose Box
  const handleCustomBoxSubmit = () => {
    const val = parseInt(customQtyInput, 10);
    if (isNaN(val) || val <= 0) {
      alert('Please enter a valid quantity.');
      return;
    }
    if (val > totalAvailableUnpackedQty) {
      alert(`Quantity cannot exceed available unpacked pieces (${totalAvailableUnpackedQty.toLocaleString()} pcs).`);
      return;
    }
    setShowCustomModal(false);
    setCustomQtyInput('');
    initiatePackSingleBox(val);
  };

  // Wizard step: 1=scan slip, 2=scan bin, 3=ready to pack
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [manualSlipInput, setManualSlipInput] = useState('');
  const [manualBinInput, setManualBinInput] = useState('');
  const [wizardTab, setWizardTab] = useState<'pack' | 'history'>('pack');

  // Auto-advance wizard when crate is scanned externally
  useEffect(() => {
    if (spotlitCrate && wizardStep === 1) setWizardStep(2);
  }, [spotlitCrate, wizardStep]);

  // Auto-advance to step 3 after bin is confirmed via scan
  useEffect(() => {
    if (scanBinSuccessMessage && wizardStep === 2) {
      const t = setTimeout(() => setWizardStep(3), 600);
      return () => clearTimeout(t);
    }
  }, [scanBinSuccessMessage, wizardStep]);

  const handleManualSlipSubmit = () => {
    const val = manualSlipInput.trim();
    if (!val) return;
    setScannedCrateId(val);
    setSearchTerm(val);
    const match = enrichedCrates.find(
      (c) => c.id.toLowerCase() === val.toLowerCase() || c.batchId.toLowerCase() === val.toLowerCase()
    );
    if (match) setSelectedBatchId(match.batchId);
    setManualSlipInput('');
  };

  const handleManualBinSubmit = () => {
    const val = manualBinInput.trim();
    if (!val) return;
    handleScanStorageBin(val);
    setManualBinInput('');
  };

  // Native Android Hardware / Gesture Back Button Handler
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let listener: any = null;
    CapApp.addListener('backButton', ({ canGoBack }) => {
      // 1. Close label print / reprint modal
      if (activeModalPacket) {
        setActiveModalPacket(null);
        return;
      }
      // 2. Close custom quantity modal
      if (showCustomModal) {
        setShowCustomModal(false);
        return;
      }
      // 3. Cancel / close pre-printed scan & bind job
      if (pendingJob) {
        setPendingJob(null);
        return;
      }
      // 4. In Step 3 (Pack) -> go back to Step 2 (Bin)
      if (wizardStep === 3) {
        setWizardStep(2);
        return;
      }
      // 5. In Step 2 (Bin) -> go back to Step 1 (Slip)
      if (wizardStep === 2) {
        resetWizard();
        return;
      }
      // 6. In Step 1 -> exit app if supported
      if (!canGoBack) {
        CapApp.exitApp();
      }
    }).then((l) => {
      listener = l;
    });

    return () => {
      if (listener) listener.remove();
    };
  }, [activeModalPacket, showCustomModal, pendingJob, wizardStep]);

  const resetWizard = () => {
    setWizardStep(1);
    setScannedCrateId('');
    setSearchTerm('');
    setSelectedBatchId('ALL');
    setScanBinSuccessMessage('');
    setManualSlipInput('');
    setManualBinInput('');
  };

  // "" Style tokens """"""""""""""""""""""""""""""""""""""""""""""""""""""""""
  const S = {
    page: {
      minHeight: '100dvh',
      paddingBottom: '80px',
      maxWidth: '600px',
      margin: '0 auto',
    } as React.CSSProperties,

    header: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '14px 4px 10px',
      marginBottom: '4px',
    } as React.CSSProperties,

    stepDots: {
      display: 'flex',
      alignItems: 'center',
      gap: '0',
      margin: '0 auto 20px',
      justifyContent: 'center',
    } as React.CSSProperties,

    bigBtn: (color: string, disabled?: boolean): React.CSSProperties => ({
      width: '100%',
      height: '72px',
      borderRadius: '16px',
      border: 'none',
      background: disabled ? 'var(--bg3)' : `var(--${color})`,
      color: disabled ? 'var(--text3)' : '#fff',
      fontSize: '18px',
      fontWeight: 800,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '12px',
      cursor: disabled ? 'not-allowed' : 'pointer',
      letterSpacing: '0.02em',
      transition: 'opacity 0.15s',
      opacity: disabled ? 0.5 : 1,
      WebkitTapHighlightColor: 'transparent',
    }),

    card: (borderColor?: string): React.CSSProperties => ({
      background: 'var(--bg2)',
      borderRadius: '16px',
      border: `1.5px solid ${borderColor || 'var(--border2)'}`,
      padding: '20px',
      marginBottom: '16px',
    }),

    stepLabel: (active: boolean, done: boolean): React.CSSProperties => ({
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '4px',
      opacity: active || done ? 1 : 0.35,
    }),
  };

  const StepDot = ({ n, label }: { n: 1 | 2 | 3; label: string }) => {
    const active = wizardStep === n;
    const done = wizardStep > n;
    const canClick = n === 1 || (n === 2 && (spotlitCrate || selectedBatchId !== 'ALL')) || (n === 3 && binCompatibility.valid);

    return (
      <button
        type="button"
        onClick={() => {
          if (n === 1) resetWizard();
          else if (n === 2 && canClick) setWizardStep(2);
          else if (n === 3 && canClick) setWizardStep(3);
        }}
        disabled={!canClick && !active}
        style={{
          ...S.stepLabel(active, done),
          background: 'transparent',
          border: 'none',
          cursor: canClick || active ? 'pointer' : 'default',
          padding: 0,
        }}
      >
        <div style={{
          width: 34, height: 34, borderRadius: '50%',
          background: done ? 'var(--green)' : active ? 'var(--blue)' : 'var(--bg3)',
          border: `2px solid ${done ? 'var(--green)' : active ? 'var(--blue)' : 'var(--border)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '13px', fontWeight: 800, color: done || active ? '#fff' : 'var(--text3)',
          transition: 'all 0.2s',
          boxShadow: active ? '0 0 12px rgba(51, 153, 255, 0.4)' : 'none',
        }}>
          {done ? '✓' : n}
        </div>
        <div style={{ fontSize: '11px', fontWeight: 700, color: active ? 'var(--blue)' : done ? 'var(--green)' : 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {label}
        </div>
      </button>
    );
  };

  const StepLine = ({ done }: { done: boolean }) => (
    <div style={{ width: 40, height: 2, background: done ? 'var(--green)' : 'var(--border)', borderRadius: 2, margin: '0 6px', marginBottom: 16, transition: 'background 0.3s' }} />
  );

  return (
    <div className="animate-fade-in" style={S.page}>
      {/* "" Header "" */}
      <div style={S.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Boxes size={22} style={{ color: 'var(--blue)' }} />
          <div>
            <div style={{ fontSize: '17px', fontWeight: 800, lineHeight: 1 }}>Packing</div>
            <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>
              Shift {appSettings?.currentShift || 'A'}  •  {activeStorageBin}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {/* Verified Packer Badge */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            background: 'rgba(51, 153, 255, 0.12)',
            border: '1px solid rgba(51, 153, 255, 0.35)',
            borderRadius: '20px', padding: '6px 12px',
            fontSize: '12px', fontWeight: 700, color: 'var(--blue)'
          }}>
            <ShieldCheck size={14} />
            <span>{supervisorName || 'Packer'}</span>
          </div>
          <button
            className="btn bsec"
            onClick={fetchData}
            disabled={isLoading}
            style={{ height: '34px', padding: '0 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* "" Bottom tab switcher "" */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: '20px' }}>
        {(['pack', 'history'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setWizardTab(tab)}
            style={{
              flex: 1, background: 'transparent', border: 'none',
              borderBottom: wizardTab === tab ? '3px solid var(--blue)' : '3px solid transparent',
              padding: '10px 0', fontWeight: 700, fontSize: '13px',
              color: wizardTab === tab ? 'var(--text)' : 'var(--text3)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            }}
          >
            {tab === 'pack' ? <><QrCode size={14} /> Pack</> : <><Boxes size={14} /> History ({packetsHistory.length})</>}
          </button>
        ))}
      </div>

      {/* --------------------------------------------
          PACK TAB - 3-Step Wizard
          -------------------------------------------- */}
      {wizardTab === 'pack' && (
        <>
          {/* Step progress */}
          <div style={S.stepDots}>
            <StepDot n={1} label="Slip" />
            <StepLine done={wizardStep > 1} />
            <StepDot n={2} label="Bin" />
            <StepLine done={wizardStep > 2} />
            <StepDot n={3} label="Pack" />
          </div>

          {/* "" STEP 1: Scan Production Slip "" */}
          {wizardStep === 1 && (
            <div style={S.card('var(--blue-dim, var(--border2))')}>
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '12px', color: 'var(--blue)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>
                  Step 1 of 3
                </div>
                <div style={{ fontSize: '22px', fontWeight: 900 }}>Scan Production Slip</div>
                <div style={{ fontSize: '13px', color: 'var(--text3)', marginTop: '4px' }}>
                  Point camera at the crate's QR / barcode
                </div>
              </div>

              {onTriggerScan && (
                <button
                  style={S.bigBtn('blue')}
                  onClick={onTriggerScan}
                >
                  <Camera size={28} />
                  SCAN PRODUCTION SLIP
                </button>
              )}

              {/* Manual entry fallback */}
              <div style={{ marginTop: '16px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text3)', fontWeight: 600, marginBottom: '8px', textAlign: 'center' }}>
                  - or type manually -
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    className="fi"
                    placeholder="Crate ID / Batch ID..."
                    value={manualSlipInput}
                    onChange={(e) => setManualSlipInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleManualSlipSubmit(); }}
                    style={{ flex: 1, fontFamily: 'var(--mono)', fontSize: '14px' }}
                  />
                  <button className="btn bpri" onClick={handleManualSlipSubmit} style={{ padding: '0 16px' }}>
                    Go
                  </button>
                </div>
              </div>

              {/* Show available batches as quick-select if no scan yet */}
              {availableBatches.length > 0 && (
                <div style={{ marginTop: '16px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text3)', fontWeight: 600, marginBottom: '8px' }}>
                    Or select batch directly:
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {availableBatches.slice(0, 5).map((b) => {
                      const batchCrates = enrichedCrates.filter(c => c.batchId === b.batchId && c.remainingQty > 0);
                      const totalRemaining = batchCrates.reduce((s, c) => s + c.remainingQty, 0);
                      return (
                        <button
                          key={b.batchId}
                          onClick={() => {
                            setSelectedBatchId(b.batchId);
                            setWizardStep(2);
                          }}
                          style={{
                            background: 'var(--bg3)', border: '1.5px solid var(--border)',
                            borderRadius: '12px', padding: '12px 16px', textAlign: 'left',
                            cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          }}
                        >
                          <div>
                            <div style={{ fontSize: '13px', fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--purple)' }}>
                              {b.batchId.split('-')[0]}
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--text2)', marginTop: '2px' }}>{b.productName}</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '15px', fontWeight: 900, fontFamily: 'var(--mono)', color: 'var(--green)' }}>
                              {formatQty(totalRemaining)}
                            </div>
                            <div style={{ fontSize: '10px', color: 'var(--text3)' }}>pcs avail.</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {availableBatches.length === 0 && !isLoading && (
                <div style={{ marginTop: '20px', textAlign: 'center', padding: '24px', background: 'var(--bg3)', borderRadius: '12px' }}>
                  <Package size={32} style={{ color: 'var(--text3)', marginBottom: '8px' }} />
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text2)' }}>No crates ready</div>
                  <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '4px' }}>
                    Inspect crates first in the Inspection tab
                  </div>
                </div>
              )}
            </div>
          )}

          {/* "" STEP 2: Scan Storage Bin "" */}
          {wizardStep === 2 && (
            <div style={S.card('var(--amber-dim, var(--border2))')}>
              {/* Top Navigation Row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', gap: '10px' }}>
                <button
                  type="button"
                  onClick={resetWizard}
                  style={{
                    background: 'rgba(255,255,255,0.08)',
                    border: '1px solid var(--border)',
                    borderRadius: '10px',
                    padding: '9px 14px',
                    color: '#ffffff',
                    fontSize: '13px',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    cursor: 'pointer',
                  }}
                >
                  <ArrowLeft size={16} /> Back to Step 1
                </button>
                <button
                  type="button"
                  onClick={resetWizard}
                  style={{
                    background: 'rgba(239, 68, 68, 0.12)',
                    border: '1.5px solid rgba(239, 68, 68, 0.45)',
                    borderRadius: '10px',
                    padding: '9px 16px',
                    color: '#f87171',
                    fontSize: '13px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <RotateCcw size={15} />
                  Start Over
                </button>
              </div>

              {/* Scanned crate summary pill */}
              {spotlitCrate ? (
                <div style={{
                  background: 'var(--blue-bg)', border: '1px solid var(--blue-dim, var(--border))',
                  borderRadius: '10px', padding: '10px 14px', marginBottom: '18px',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <div>
                    <div style={{ fontSize: '10px', color: 'var(--blue)', fontWeight: 800, textTransform: 'uppercase' }}>" Scanned Slip</div>
                    <div style={{ fontSize: '14px', fontWeight: 800, fontFamily: 'var(--mono)' }}>Bin #{spotlitCrate.binNumber}  •  {spotlitCrate.productName}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text3)' }}>
                      {formatQty(spotlitCrate.remainingQty)} pcs remaining  •  Batch {spotlitCrate.batchId.split('-')[0]}
                    </div>
                  </div>
                  <button onClick={resetWizard} style={{ background: 'transparent', border: 'none', color: 'var(--text3)', cursor: 'pointer', padding: '4px' }}>
                    <X size={18} />
                  </button>
                </div>
              ) : (
                <div style={{
                  background: 'var(--bg3)', borderRadius: '10px', padding: '10px 14px', marginBottom: '18px',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <div>
                    <div style={{ fontSize: '12px', color: 'var(--text3)', fontWeight: 700 }}>Batch selected</div>
                    <div style={{ fontSize: '14px', fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--purple)' }}>
                      {selectedBatchId !== 'ALL' ? selectedBatchId.split('-')[0] : 'All batches'}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--green)' }}>
                      {formatQty(totalAvailableUnpackedQty)} pcs  •  {availableUnpackedCrates.length} crates
                    </div>
                  </div>
                  <button onClick={resetWizard} style={{ background: 'transparent', border: 'none', color: 'var(--text3)', cursor: 'pointer', padding: '4px' }}>
                    <X size={18} />
                  </button>
                </div>
              )}

              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '12px', color: 'var(--amber)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>
                  Step 2 of 3
                </div>
                <div style={{ fontSize: '22px', fontWeight: 900 }}>Scan Storage Bin</div>
                <div style={{ fontSize: '13px', color: 'var(--text3)', marginTop: '4px' }}>
                  Scan the bin barcode (APBIN-01, APBIN-02...)
                </div>
              </div>

              {onTriggerScan && (
                <button style={S.bigBtn('amber')} onClick={onTriggerScan}>
                  <Scan size={28} />
                  SCAN BIN BARCODE
                </button>
              )}

              {/* Bin success toast */}
              {scanBinSuccessMessage && (
                <div style={{
                  marginTop: '12px', background: 'var(--green-bg)', border: '1px solid var(--green-dim)',
                  borderRadius: '10px', padding: '12px 16px', color: 'var(--green)', fontWeight: 700, fontSize: '13px',
                  display: 'flex', alignItems: 'center', gap: '8px',
                }}>
                  <CheckCircle2 size={18} /> {scanBinSuccessMessage}
                </div>
              )}

              {/* Bin compatibility error */}
              {!binCompatibility.valid && (
                <div style={{
                  marginTop: '12px', background: 'rgba(239,68,68,0.1)', border: '1px solid var(--red)',
                  borderRadius: '10px', padding: '12px 16px', color: 'var(--red)', fontSize: '13px', fontWeight: 600,
                  display: 'flex', gap: '10px', alignItems: 'flex-start',
                }}>
                  <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '1px' }} />
                  <span>{binCompatibility.error}</span>
                </div>
              )}

              {/* Manual bin entry */}
              <div style={{ marginTop: '16px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text3)', fontWeight: 600, marginBottom: '8px', textAlign: 'center' }}>
                  - or select bin -
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    className="fi"
                    placeholder="APBIN-01..."
                    value={manualBinInput}
                    onChange={(e) => setManualBinInput(e.target.value.toUpperCase())}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleManualBinSubmit(); }}
                    style={{ flex: 1, fontFamily: 'var(--mono)', fontSize: '14px', fontWeight: 800, color: 'var(--amber)' }}
                  />
                  <button className="btn" style={{ padding: '0 16px', background: 'var(--amber)', color: '#000', border: 'none', fontWeight: 800, borderRadius: '8px' }} onClick={handleManualBinSubmit}>
                    Set
                  </button>
                </div>

                {/* Quick bin grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginTop: '12px' }}>
                  {enrichedStorageBins.slice(0, 9).map((bin) => (
                    <button
                      key={bin.id}
                      onClick={() => {
                        handleScanStorageBin(bin.id);
                        setManualBinInput(bin.id);
                      }}
                      style={{
                        background: activeStorageBin === bin.id ? 'var(--amber)' : bin.packetsCount === 0 ? 'var(--bg3)' : 'var(--bg2)',
                        border: `1.5px solid ${activeStorageBin === bin.id ? 'var(--amber)' : !bin.isAvailableForPacking ? 'var(--red)' : 'var(--border)'}`,
                        borderRadius: '10px', padding: '10px 6px',
                        cursor: 'pointer', textAlign: 'center',
                        opacity: !bin.isAvailableForPacking ? 0.5 : 1,
                      }}
                    >
                      <div style={{ fontSize: '12px', fontWeight: 800, fontFamily: 'var(--mono)', color: activeStorageBin === bin.id ? '#000' : 'var(--text)' }}>
                        {bin.id.replace('APBIN-', '')}
                      </div>
                      <div style={{ fontSize: '10px', color: activeStorageBin === bin.id ? '#000' : bin.packetsCount === 0 ? 'var(--green)' : 'var(--amber)', fontWeight: 700 }}>
                        {bin.packetsCount === 0 ? 'Empty' : `${bin.packetsCount} box`}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Continue manually if bin already set */}
              <button
                onClick={() => setWizardStep(3)}
                disabled={!binCompatibility.valid}
                style={{
                  ...S.bigBtn('blue', !binCompatibility.valid),
                  marginTop: '16px', height: '52px', fontSize: '15px',
                }}
              >
                <Warehouse size={20} />
                Continue with {activeStorageBin}
              </button>

              <button onClick={resetWizard} style={{ width: '100%', marginTop: '8px', background: 'transparent', border: 'none', color: 'var(--text3)', fontSize: '13px', cursor: 'pointer', padding: '8px' }}>
                 <ArrowLeft size={14} /> Back to Step 1
              </button>
            </div>
          )}

          {/* "" STEP 3: Pack Box "" */}
          {wizardStep === 3 && (
            <div style={S.card()}>
              {/* Top Navigation Row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setWizardStep(2)}
                  style={{
                    background: 'rgba(255,255,255,0.08)',
                    border: '1px solid var(--border)',
                    borderRadius: '10px',
                    padding: '9px 14px',
                    color: '#ffffff',
                    fontSize: '13px',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    cursor: 'pointer',
                  }}
                >
                  <ArrowLeft size={16} /> Back to Step 2
                </button>
                <button
                  type="button"
                  onClick={resetWizard}
                  style={{
                    background: 'rgba(239, 68, 68, 0.12)',
                    border: '1.5px solid rgba(239, 68, 68, 0.45)',
                    borderRadius: '10px',
                    padding: '9px 16px',
                    color: '#f87171',
                    fontSize: '13px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <RotateCcw size={15} />
                  Start Over
                </button>
              </div>

              {/* Last Packed Success Banner */}
              {lastPackedMessage && (
                <div style={{
                  marginBottom: '16px', background: 'var(--green-bg)', border: '1px solid var(--green-dim)',
                  borderRadius: '10px', padding: '12px 16px', color: 'var(--green)', fontWeight: 700, fontSize: '13px',
                  display: 'flex', alignItems: 'center', gap: '8px',
                }}>
                  <CheckCircle2 size={18} />
                  <span>{lastPackedMessage}</span>
                </div>
              )}

              {/* Locked Slip Banner */}
              {spotlitCrate && (
                <div style={{
                  marginBottom: '14px',
                  background: 'rgba(51, 153, 255, 0.1)',
                  border: '1.5px solid rgba(51, 153, 255, 0.4)',
                  borderRadius: '12px',
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <ShieldCheck size={20} color="#3399ff" />
                    <div>
                      <div style={{ fontSize: '10px', color: 'var(--blue)', fontWeight: 800, textTransform: 'uppercase' }}>Locked to Production Slip</div>
                      <div style={{ fontSize: '14px', fontWeight: 900, fontFamily: 'var(--mono)', color: '#ffffff' }}>{spotlitCrate.id}</div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase' }}>Pending Balance</div>
                    <div style={{ fontSize: '15px', fontWeight: 900, fontFamily: 'var(--mono)', color: 'var(--green)' }}>
                      {formatQty(spotlitCrate.remainingQty)} pcs
                    </div>
                  </div>
                </div>
              )}

              {/* Summary row */}
              <div style={{
                background: 'var(--bg3)', borderRadius: '10px', padding: '14px 16px', marginBottom: '20px',
              }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <div style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase' }}>Product</div>
                    <div style={{ fontSize: '13px', fontWeight: 800, marginTop: '2px' }}>{activeProduct?.name || '-'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase' }}>Standard Pack Qty</div>
                    <div style={{ fontSize: '13px', fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--blue)', marginTop: '2px' }}>
                      {formatQty(activeStdPackSize)} pcs
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase' }}>
                      {spotlitCrate ? 'Slip Pending Balance' : 'Available Qty'}
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: 900, fontFamily: 'var(--mono)', color: 'var(--green)', marginTop: '2px' }}>
                      {formatQty(totalAvailableUnpackedQty)} pcs
                      {spotlitCrate && (
                        <span style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: 600, marginLeft: '6px' }}>
                          / {formatQty(spotlitCrate.grossQty)} gross
                        </span>
                      )}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase' }}>Storage Bin</div>
                    <div style={{ fontSize: '13px', fontWeight: 800, fontFamily: 'var(--mono)', color: !binCompatibility.valid ? 'var(--red)' : 'var(--amber)', marginTop: '2px' }}>
                      {activeStorageBin}
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '12px', color: 'var(--green)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>
                  Step 3 of 3
                </div>
                <div style={{ fontSize: '22px', fontWeight: 900 }}>Scan Pre-Printed Label</div>
                <div style={{ fontSize: '13px', color: 'var(--text3)', marginTop: '4px' }}>
                  Point camera at the pre-printed QR sticker on the pack
                </div>
              </div>

              {/* Bin error */}
              {!binCompatibility.valid && (
                <div style={{
                  marginBottom: '16px', background: 'rgba(239,68,68,0.1)', border: '1px solid var(--red)',
                  borderRadius: '10px', padding: '12px 16px', color: 'var(--red)', fontSize: '13px', fontWeight: 600,
                  display: 'flex', gap: '10px', alignItems: 'flex-start',
                }}>
                  <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '1px' }} />
                  <span>{binCompatibility.error}</span>
                </div>
              )}

              {/* Main pack button */}
              <button
                style={S.bigBtn('green', isPacking || totalAvailableUnpackedQty === 0 || !binCompatibility.valid)}
                onClick={() => {
                  initiatePackSingleBox();
                  if (onTriggerScan) {
                    setTimeout(() => onTriggerScan(), 120);
                  }
                }}
                disabled={isPacking || totalAvailableUnpackedQty === 0 || !binCompatibility.valid}
              >
                <QrCode size={28} />
                {isPacking ? 'PACKING...' : totalAvailableUnpackedQty < activeStdPackSize
                  ? `SCAN & PACK BALANCE (${formatQty(totalAvailableUnpackedQty)} pcs)`
                  : `SCAN LABEL & PACK (${formatQty(activeStdPackSize)} pcs)`}
              </button>

              {/* Partial box option */}
              <button
                onClick={() => setShowCustomModal(true)}
                disabled={isPacking || totalAvailableUnpackedQty === 0 || !binCompatibility.valid}
                style={{
                  width: '100%', marginTop: '10px', height: '48px',
                  borderRadius: '12px', border: '1.5px solid var(--border)',
                  background: 'var(--bg2)', color: 'var(--text2)',
                  fontSize: '14px', fontWeight: 700, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  opacity: (isPacking || totalAvailableUnpackedQty === 0 || !binCompatibility.valid) ? 0.4 : 1,
                }}
              >
                <Plus size={16} /> Pack Partial / Loose Pack
              </button>

              <button
                type="button"
                onClick={resetWizard}
                style={{
                  width: '100%',
                  marginTop: '16px',
                  height: '52px',
                  borderRadius: '14px',
                  border: '1.5px solid rgba(239, 68, 68, 0.4)',
                  background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.16), rgba(239, 68, 68, 0.06))',
                  color: '#f87171',
                  fontSize: '15px',
                  fontWeight: 900,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 2px 10px rgba(239, 68, 68, 0.15)',
                }}
              >
                <RotateCcw size={18} />
                START OVER / FINISH BATCH
              </button>
            </div>
          )}
        </>
      )}

      {/* --------------------------------------------
          HISTORY TAB - Compact packet list
          -------------------------------------------- */}
      {wizardTab === 'history' && (
        <div>
          {packetsHistory.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text3)' }}>
              <Boxes size={36} style={{ marginBottom: '12px', opacity: 0.4 }} />
              <div style={{ fontWeight: 600 }}>No boxes packed yet</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {packetsHistory.map((pkt) => (
                <div
                  key={pkt.id}
                  style={{
                    background: 'var(--bg2)', borderRadius: '14px',
                    border: '1.5px solid var(--border2)', padding: '14px 16px',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                      <ShieldCheck size={14} style={{ color: 'var(--green)', flexShrink: 0 }} />
                      <span style={{ fontFamily: 'var(--mono)', fontWeight: 800, fontSize: '13px', color: 'var(--blue)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {pkt.id}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text2)', fontWeight: 600 }}>
                      {pkt.productName}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px', display: 'flex', gap: '8px' }}>
                      <span style={{ color: 'var(--amber)', fontFamily: 'var(--mono)', fontWeight: 700 }}>{pkt.storageBinId}</span>
                      <span> • </span>
                      <span>{new Date(pkt.packedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', marginLeft: '12px', flexShrink: 0 }}>
                    <div style={{ fontSize: '18px', fontWeight: 900, fontFamily: 'var(--mono)', color: 'var(--green)' }}>
                      {formatQty(pkt.quantity)}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text3)' }}>pcs</div>
                    <button
                      onClick={() => { setActiveModalPacket(pkt); setIsReprintModal(true); }}
                      style={{ marginTop: '6px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: '6px', padding: '4px 10px', fontSize: '11px', cursor: 'pointer', color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                      <Printer size={11} /> Slip
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* "" STEP 2 MODAL: Scan & Bind Pre-Printed Label QR Code "" */}
      {pendingJob && (
        <div className="ov animate-fade-in" style={{ zIndex: 10003 }}>
          <div className="modal animate-scale-in" style={{ width: '460px', maxWidth: '95vw' }}>
            <div className="mhd" style={{ background: 'var(--bg2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setPendingJob(null)}
                  style={{
                    background: 'rgba(255,255,255,0.1)',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '6px 12px',
                    color: '#ffffff',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                  }}
                >
                  <ArrowLeft size={15} /> Back
                </button>
                <div className="mtit" style={{ fontSize: '15px' }}>Scan Pack QR</div>
              </div>
              <button
                type="button"
                onClick={() => setPendingJob(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text3)', cursor: 'pointer', padding: '4px' }}
              >
                <X size={20} />
              </button>
            </div>

            <div className="mbd" style={{ padding: '20px' }}>
              {/* Job Specification Summary */}
              <div style={{
                background: 'var(--bg3)',
                padding: '14px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                marginBottom: '16px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text3)', textTransform: 'uppercase', fontWeight: 700 }}>Product</span>
                  <span style={{ fontSize: '13px', fontWeight: 800 }}>{pendingJob.targetProduct?.name}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text3)', textTransform: 'uppercase', fontWeight: 700 }}>Batch</span>
                  <span style={{ fontSize: '13px', fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--purple)' }}>{pendingJob.batchId.split('-')[0]}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', borderTop: '1px dashed var(--border)', paddingTop: '6px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text3)', textTransform: 'uppercase', fontWeight: 700 }}>Pack Qty</span>
                  <span style={{ fontSize: '16px', fontWeight: 900, fontFamily: 'var(--mono)', color: 'var(--green)' }}>{formatQty(pendingJob.quantity)} pcs</span>
                </div>

                {/* Storage Bin Indicator */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: !binCompatibility.valid ? 'var(--red-bg)' : 'var(--amber-bg)', padding: '6px 8px', borderRadius: '4px', marginBottom: '8px' }}>
                  <span style={{ fontSize: '11px', color: !binCompatibility.valid ? 'var(--red)' : 'var(--amber)', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Warehouse size={12} /> Target Storage Bin:
                  </span>
                  <strong style={{ fontFamily: 'var(--mono)', color: !binCompatibility.valid ? 'var(--red)' : 'var(--amber)', fontSize: '13px' }}>{activeStorageBin}</strong>
                </div>

                {/* Sources List */}
                <div style={{ fontSize: '11px', color: 'var(--text2)', background: 'var(--bg)', padding: '6px 8px', borderRadius: '4px' }}>
                  <div style={{ fontWeight: 700, marginBottom: '2px', color: 'var(--blue)' }}>Crate Traceability:</div>
                  {pendingJob.sources.map((s, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--mono)', fontSize: '11px' }}>
                      <span>Bin #{s.binNumber} ({s.crateId.slice(-6)}):</span>
                      <strong>{formatQty(s.qty)} pcs</strong>
                    </div>
                  ))}
                </div>
              </div>

              {/* Scanned QR Input Field */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label className="fl" style={{ fontWeight: 800, color: 'var(--blue)', margin: 0 }}>
                    Scan Pre-Printed Label QR Code / Serial
                  </label>
                  {onTriggerScan && (
                    <button
                      onClick={onTriggerScan}
                      style={{
                        background: 'var(--blue-bg)', color: 'var(--blue)', border: 'none',
                        padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 800, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: '4px',
                      }}
                    >
                      <Camera size={12} /> CAMERA
                    </button>
                  )}
                </div>

                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    className="fi"
                    autoFocus
                    placeholder="Scan sticker QR code or enter label serial..."
                    value={scannedQrInput}
                    onChange={(e) => { setScannedQrInput(e.target.value); setQrValidationError(''); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleConfirmBindQr(); }}
                    style={{
                      width: '100%', fontSize: '15px', fontFamily: 'var(--mono)', height: '44px',
                      borderColor: qrValidationError ? 'var(--red)' : 'var(--blue)',
                    }}
                  />
                </div>

                {qrValidationError && (
                  <div style={{ color: 'var(--red)', fontSize: '11px', marginTop: '6px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <AlertTriangle size={13} /> {qrValidationError}
                  </div>
                )}
              </div>

              {/* Fallback ID generation helper */}
              <div style={{ textAlign: 'right', marginBottom: '20px' }}>
                <button
                  type="button"
                  onClick={handleGenerateFallbackId}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text3)', fontSize: '11px', textDecoration: 'underline', cursor: 'pointer' }}
                >
                  Don't have pre-printed label? Generate System ID
                </button>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '10px' }}>
                <button className="btn bsec" style={{ flex: 1 }} onClick={() => setPendingJob(null)} disabled={isPacking}>
                  Cancel
                </button>
                <button
                  className="btn bpri"
                  style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontWeight: 800 }}
                  onClick={() => handleConfirmBindQr()}
                  disabled={isPacking || !scannedQrInput.trim() || !binCompatibility.valid}
                >
                  <ShieldCheck size={18} />
                  {isPacking ? 'Binding...' : `Bind & Place in ${activeStorageBin}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* "" Custom Loose Pack Modal "" */}
      {showCustomModal && (
        <div className="ov animate-fade-in" style={{ zIndex: 10002 }}>
          <div className="modal animate-scale-in" style={{ width: '380px' }}>
            <div className="mhd">
              <div className="mtit">Pack Custom / Loose Pack</div>
            </div>
            <div className="mbd" style={{ padding: '20px' }}>
              <p style={{ color: 'var(--text2)', fontSize: '13px', marginBottom: '16px' }}>
                Enter the exact quantity (Max: {formatQty(totalAvailableUnpackedQty)} pcs).
              </p>
              <div style={{ marginBottom: '16px' }}>
                <label className="fl" style={{ fontWeight: 700, marginBottom: '6px', display: 'block' }}>Pack Qty (Pieces)</label>
                <input
                  type="number"
                  className="fi"
                  autoFocus
                  placeholder={`e.g. ${Math.min(500, totalAvailableUnpackedQty)}`}
                  value={customQtyInput}
                  onChange={(e) => setCustomQtyInput(e.target.value)}
                  style={{ width: '100%', fontSize: '18px', fontFamily: 'var(--mono)', textAlign: 'center' }}
                />
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button className="btn bsec" style={{ flex: 1 }} onClick={() => setShowCustomModal(false)}>Cancel</button>
                <button className="btn bpri" style={{ flex: 1 }} onClick={handleCustomBoxSubmit}>Next: Scan QR</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* "" Label Verification Modal "" */}
      {activeModalPacket && (
        <PacketLabelPrintModal
          packet={activeModalPacket}
          onClose={() => {
            const packedPkt = activeModalPacket;
            setActiveModalPacket(null);
            if (isReprintModal) return;

            // Check if there are pieces remaining in this batch
            if (totalAvailableUnpackedQty <= 0) {
              resetWizard();
            } else {
              setWizardStep(3);
              setLastPackedMessage(
                `✓ ${packedPkt.id} placed in ${activeStorageBin}. Ready for next pack (${totalAvailableUnpackedQty.toLocaleString()} pcs remaining).`
              );
              setTimeout(() => setLastPackedMessage(''), 8000);
            }
          }}
          onPackNext={() => {
            const packedPkt = activeModalPacket;
            setActiveModalPacket(null);
            if (isReprintModal) return;

            setWizardStep(3);
            setLastPackedMessage(
              `✓ ${packedPkt.id} placed in ${activeStorageBin}. Scanning next pack...`
            );
            if (onTriggerScan) {
              setTimeout(() => {
                initiatePackSingleBox();
                setTimeout(() => onTriggerScan(), 120);
              }, 200);
            }
          }}
          remainingQty={totalAvailableUnpackedQty}
          supervisorName={supervisorName || appSettings?.activeSupervisorName}
          isReprint={isReprintModal}
        />
      )}
    </div>
  );
};

export default PackingPage;

