import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Warehouse, CheckCircle2, RefreshCw, 
  QrCode, Camera, Box as BoxIcon,
  X, Truck, ArrowDownToLine, Archive
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Packet, StorageBin, AppSettings } from '../types';

interface StoreInwardingPageProps {
  appSettings?: AppSettings | null;
  supervisorName?: string;
  onTriggerScan?: () => void;
  scannerSearchTerm?: string;
  onClearScannerSearchTerm?: () => void;
}

interface EnrichedStoreBin extends StorageBin {
  packetsCount: number;
  totalQty: number;
  assignedBatchId?: string;
  assignedProductName?: string;
  assignedProductCode?: string;
  isStoreReceived: boolean;
}

const formatQty = (n: number) => n.toLocaleString('en-IN');

const StoreInwardingPage: React.FC<StoreInwardingPageProps> = ({
  appSettings,
  supervisorName,
  onTriggerScan,
  scannerSearchTerm = '',
  onClearScannerSearchTerm
}) => {
  const [packets, setPackets] = useState<Packet[]>([]);
  const [storageBins, setStorageBins] = useState<StorageBin[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [scanInput, setScanInput] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'inward' | 'bins' | 'store_ledger'>('inward');
  const [filterLocation, setFilterLocation] = useState<'ALL' | 'WIP Storage' | 'Main Store'>('ALL');
  const [_lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [selectedBinForCarton, setSelectedBinForCarton] = useState<string | null>(null);
  const [cartonIdInput, setCartonIdInput] = useState<string>('');
  const [recentActionMessage, setRecentActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Fetch packets and storage bins
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [{ data: packetsData, error: packetsErr }, { data: binsData, error: binsErr }] = await Promise.all([
        supabase
          .from('packets')
          .select('*')
          .order('packed_at', { ascending: false }),
        supabase
          .from('storage_bins')
          .select('*')
          .order('id', { ascending: true })
      ]);

      if (packetsErr) console.error('Error fetching packets:', packetsErr);
      if (binsErr) console.error('Error fetching storage bins:', binsErr);

      if (packetsData) {
        setPackets(packetsData.map((p: any) => ({
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
          qrCode: p.qr_code || p.id,
          storageBinId: p.storage_bin_id,
          locationStatus: p.location_status || (p.store_received_at ? 'Main Store' : 'WIP Storage'),
          storageBinBoundAt: p.storage_bin_bound_at,
          storeReceivedAt: p.store_received_at,
          storeReceivedBy: p.store_received_by,
          cartonId: p.carton_id
        })));
      }

      if (binsData && binsData.length > 0) {
        setStorageBins(binsData.map((b: any) => ({
          id: b.id,
          currentLocation: b.current_location || 'WIP Warehouse',
          lastTransferredAt: b.last_transferred_at,
          lastReceivedAt: b.last_received_at
        })));
      } else {
        // Fallback default 10 bins
        const defaultBins: StorageBin[] = Array.from({ length: 10 }, (_, i) => ({
          id: `APBIN-${(i + 1).toString().padStart(2, '0')}`,
          currentLocation: 'WIP Warehouse'
        }));
        setStorageBins(defaultBins);
      }

      setLastRefresh(new Date());
    } catch (err) {
      console.error('Store inwarding fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 20000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Aggregate bin stats (packets count, quantity, batch, and product inside each bin)
  const enrichedBins = useMemo<EnrichedStoreBin[]>(() => {
    const binPacketsMap = new Map<string, Packet[]>();
    packets.forEach((p) => {
      if (p.storageBinId && p.locationStatus !== 'Carton Packed') {
        const list = binPacketsMap.get(p.storageBinId) || [];
        list.push(p);
        binPacketsMap.set(p.storageBinId, list);
      }
    });

    return storageBins.map((bin) => {
      const contained = binPacketsMap.get(bin.id) || [];
      const packetsCount = contained.length;
      const totalQty = contained.reduce((sum, p) => sum + p.quantity, 0);
      
      let currentLocation = bin.currentLocation;
      let isStoreReceived = false;

      if (packetsCount === 0) {
        currentLocation = 'Empty';
      } else {
        isStoreReceived = contained.some((p) => p.locationStatus === 'Main Store');
        currentLocation = isStoreReceived ? 'Main Store' : 'WIP Warehouse';
      }

      const assignedBatchId = contained[0]?.batchId;
      const assignedProductName = contained[0]?.productName;
      const assignedProductCode = contained[0]?.productCode;

      return {
        ...bin,
        currentLocation,
        packetsCount,
        totalQty,
        assignedBatchId,
        assignedProductName,
        assignedProductCode,
        isStoreReceived
      };
    });
  }, [storageBins, packets]);

  // Handle external camera scan
  useEffect(() => {
    if (scannerSearchTerm) {
      const trimmed = scannerSearchTerm.trim();
      setScanInput(trimmed);
      handleProcessScan(trimmed);
      if (onClearScannerSearchTerm) onClearScannerSearchTerm();
    }
  }, [scannerSearchTerm]);

  // Process scanned input (checks if scanned code is a Storage Bin or individual Packet)
  const handleProcessScan = async (scannedCode: string) => {
    const query = scannedCode.trim().toUpperCase();
    if (!query) return;

    // Check if it matches a Storage Bin (e.g. APBIN-01)
    const matchingBin = enrichedBins.find((b) => b.id.toUpperCase() === query || query.includes(b.id.toUpperCase()));
    
    if (matchingBin) {
      const binPackets = packets.filter((p) => p.storageBinId === matchingBin.id && p.locationStatus !== 'Carton Packed');
      if (binPackets.length === 0) {
        setRecentActionMessage({
          type: 'error',
          text: `Storage Bin "${matchingBin.id}" is currently empty. No packets found inside.`
        });
        return;
      }

      // Bulk inward all packets in this bin
      await handleReceiveEntireBin(matchingBin.id, binPackets);
      return;
    }

    // Otherwise check if it matches an individual Packet QR
    const matchingPacket = packets.find((p) => p.id.toUpperCase() === query || p.qrCode?.toUpperCase() === query);
    if (matchingPacket) {
      await handleReceiveSinglePacket(matchingPacket);
      return;
    }

    setRecentActionMessage({
      type: 'error',
      text: `Scanned code "${scannedCode}" was not recognized as a Storage Bin or Packet ID.`
    });
  };

  // Handler: Receive entire storage bin into Store in 1 scan
  const handleReceiveEntireBin = async (binId: string, binPackets: Packet[]) => {
    const receiver = supervisorName || appSettings?.activeSupervisorName || 'Store Inwarder';
    const nowIso = new Date().toISOString();
    const packetIds = binPackets.map((p) => p.id);

    try {
      // 1. Update all packets in DB
      const { error: pErr } = await supabase
        .from('packets')
        .update({
          location_status: 'Main Store',
          store_received_at: nowIso,
          store_received_by: receiver
        })
        .in('id', packetIds);

      if (pErr) console.error('Error updating packets location:', pErr);

      // 2. Update storage bin location in DB
      await supabase
        .from('storage_bins')
        .upsert({
          id: binId,
          current_location: 'Main Store',
          last_received_at: nowIso
        });

      // 3. Update local state
      setPackets((prev) =>
        prev.map((p) =>
          packetIds.includes(p.id)
            ? { ...p, locationStatus: 'Main Store', storeReceivedAt: nowIso, storeReceivedBy: receiver }
            : p
        )
      );

      setStorageBins((prev) =>
        prev.map((b) => (b.id === binId ? { ...b, currentLocation: 'Main Store', lastReceivedAt: nowIso } : b))
      );

      const totalPcs = binPackets.reduce((sum, p) => sum + p.quantity, 0);
      setRecentActionMessage({
        type: 'success',
        text: `✅ Storage Bin ${binId} successfully received into Store! ${binPackets.length} boxes (${formatQty(totalPcs)} pcs) now in Store Inwarding Queue.`
      });
      setScanInput('');
    } catch (err: any) {
      console.error('Bin receiving exception:', err);
      setRecentActionMessage({ type: 'error', text: `Failed to inward bin: ${err.message || err}` });
    }
  };

  // Handler: Receive single packet into Store
  const handleReceiveSinglePacket = async (packet: Packet) => {
    const receiver = supervisorName || appSettings?.activeSupervisorName || 'Store Inwarder';
    const nowIso = new Date().toISOString();

    try {
      await supabase
        .from('packets')
        .update({
          location_status: 'Main Store',
          store_received_at: nowIso,
          store_received_by: receiver
        })
        .eq('id', packet.id);

      setPackets((prev) =>
        prev.map((p) => (p.id === packet.id ? { ...p, locationStatus: 'Main Store', storeReceivedAt: nowIso, storeReceivedBy: receiver } : p))
      );

      setRecentActionMessage({
        type: 'success',
        text: `✅ Packet ${packet.id} (${formatQty(packet.quantity)} pcs of ${packet.productName}) received into Store!`
      });
      setScanInput('');
    } catch (err: any) {
      console.error('Single packet receiving error:', err);
      setRecentActionMessage({ type: 'error', text: `Failed to receive packet: ${err.message || err}` });
    }
  };

  // Handler: Final Carton Box Packing (Emptying storage bin into final carton)
  const handlePackBinIntoCarton = async () => {
    if (!selectedBinForCarton) return;
    const cartonId = cartonIdInput.trim() || `CTN-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${selectedBinForCarton}`;

    const binPackets = packets.filter((p) => p.storageBinId === selectedBinForCarton && p.locationStatus !== 'Carton Packed');
    if (binPackets.length === 0) {
      alert('No packets found in this bin to pack into carton.');
      return;
    }

    try {
      const packetIds = binPackets.map((p) => p.id);

      // Update packets: set carton_id and location_status = 'Carton Packed'
      await supabase
        .from('packets')
        .update({
          carton_id: cartonId,
          location_status: 'Carton Packed'
        })
        .in('id', packetIds);

      // Release storage bin: mark as Empty & available
      await supabase
        .from('storage_bins')
        .upsert({
          id: selectedBinForCarton,
          current_location: 'WIP Warehouse'
        });

      setPackets((prev) =>
        prev.map((p) =>
          packetIds.includes(p.id) ? { ...p, cartonId, locationStatus: 'Carton Packed' } : p
        )
      );

      setStorageBins((prev) =>
        prev.map((b) => (b.id === selectedBinForCarton ? { ...b, currentLocation: 'WIP Warehouse' } : b))
      );

      const totalPcs = binPackets.reduce((sum, p) => sum + p.quantity, 0);
      setRecentActionMessage({
        type: 'success',
        text: `📦 Packets successfully packed into Master Carton "${cartonId}" (${formatQty(totalPcs)} pcs). Storage Bin ${selectedBinForCarton} is now released & empty for WIP floor!`
      });

      setSelectedBinForCarton(null);
      setCartonIdInput('');
    } catch (err: any) {
      console.error('Carton packing error:', err);
      alert(`Carton packing failed: ${err.message || err}`);
    }
  };

  // KPIs
  const totalWipPackets = packets.filter((p) => p.locationStatus === 'WIP Storage');
  const totalWipPcs = totalWipPackets.reduce((sum, p) => sum + p.quantity, 0);

  const totalStorePackets = packets.filter((p) => p.locationStatus === 'Main Store');
  const totalStorePcs = totalStorePackets.reduce((sum, p) => sum + p.quantity, 0);

  const totalCartonPackets = packets.filter((p) => p.locationStatus === 'Carton Packed');
  const totalCartonPcs = totalCartonPackets.reduce((sum, p) => sum + p.quantity, 0);

  // Filtered inwarding queue bins
  const queueBins = useMemo(() => {
    return enrichedBins.filter((b) => {
      if (b.packetsCount === 0) return false;
      if (filterLocation === 'WIP Storage' && b.isStoreReceived) return false;
      if (filterLocation === 'Main Store' && !b.isStoreReceived) return false;
      return true;
    });
  }, [enrichedBins, filterLocation]);

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '40px' }}>
      {/* ── Top Header ── */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Warehouse size={24} style={{ color: 'var(--blue)' }} />
              Store Inwarding & Storage Bin Management
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '2px' }}>
              Single-batch Storage Bins (`APBIN-XX`) • Scan bin to inward into Store • Pack into Master Cartons
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              className="btn bsec bsm"
              onClick={fetchData}
              disabled={isLoading}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '36px' }}
            >
              <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
              Sync Store
            </button>
          </div>
        </div>
      </div>

      {/* ── Summary KPI Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        <div className="card" style={{ padding: '16px', borderLeft: '4px solid var(--amber)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <div style={{ background: 'var(--amber-bg)', borderRadius: '8px', padding: '6px', display: 'flex' }}>
              <Truck size={16} style={{ color: 'var(--amber)' }} />
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase' }}>
              In WIP Storage (Pending Transfer)
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--amber)', lineHeight: 1 }}>
            {formatQty(totalWipPcs)} <span style={{ fontSize: '12px', fontWeight: 500 }}>pcs</span>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px' }}>
            {totalWipPackets.length} boxes across WIP bins
          </div>
        </div>

        <div className="card" style={{ padding: '16px', borderLeft: '4px solid var(--green)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <div style={{ background: 'var(--green-bg)', borderRadius: '8px', padding: '6px', display: 'flex' }}>
              <ArrowDownToLine size={16} style={{ color: 'var(--green)' }} />
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase' }}>
              Received in Main Store (Inwarded)
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--green)', lineHeight: 1 }}>
            {formatQty(totalStorePcs)} <span style={{ fontSize: '12px', fontWeight: 500 }}>pcs</span>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px' }}>
            {totalStorePackets.length} boxes in Store Inwarding Queue
          </div>
        </div>

        <div className="card" style={{ padding: '16px', borderLeft: '4px solid var(--purple)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <div style={{ background: 'var(--purple-bg)', borderRadius: '8px', padding: '6px', display: 'flex' }}>
              <Archive size={16} style={{ color: 'var(--purple)' }} />
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase' }}>
              Master Carton Packed
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--purple)', lineHeight: 1 }}>
            {formatQty(totalCartonPcs)} <span style={{ fontSize: '12px', fontWeight: 500 }}>pcs</span>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px' }}>
            {totalCartonPackets.length} boxes packed & bins released
          </div>
        </div>
      </div>

      {/* ── Action Toast Message ── */}
      {recentActionMessage && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '8px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: recentActionMessage.type === 'success' ? 'var(--green-bg)' : 'var(--red-bg)',
          color: recentActionMessage.type === 'success' ? 'var(--green)' : 'var(--red)',
          border: `1px solid ${recentActionMessage.type === 'success' ? 'var(--green-dim)' : 'var(--red-dim)'}`,
          fontWeight: 700,
          fontSize: '13px'
        }}>
          <div>{recentActionMessage.text}</div>
          <button
            onClick={() => setRecentActionMessage(null)}
            style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer' }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* ── Main Scan Bar ── */}
      <div className="card" style={{ padding: '16px 20px', marginBottom: '20px', background: 'var(--bg2)', border: '1px solid var(--border2)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div style={{ flex: '1 1 340px' }}>
            <label className="fl" style={{ color: 'var(--blue)', fontWeight: 800, display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span>📷 Scan Storage Bin (`APBIN-XX`) or Packet QR Code</span>
              {onTriggerScan && (
                <button 
                  onClick={onTriggerScan}
                  style={{ border: 'none', background: 'var(--blue-bg)', color: 'var(--blue)', fontSize: '10px', padding: '3px 10px', borderRadius: '4px', cursor: 'pointer', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  <Camera size={13} /> CAMERA SCAN
                </button>
              )}
            </label>
            <div style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--blue)' }}>
                <QrCode size={16} />
              </div>
              <input
                type="text"
                className="fi"
                autoFocus
                placeholder="Scan Storage Bin (e.g. APBIN-01) or Packet ID..."
                value={scanInput}
                onChange={(e) => setScanInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleProcessScan(scanInput);
                }}
                style={{ width: '100%', paddingLeft: '38px', fontSize: '14px', fontFamily: 'var(--mono)', height: '42px' }}
              />
            </div>
          </div>

          <div>
            <button
              className="btn bpri"
              onClick={() => handleProcessScan(scanInput)}
              disabled={!scanInput.trim()}
              style={{ height: '42px', padding: '0 20px', fontWeight: 800 }}
            >
              Inward / Receive
            </button>
          </div>
        </div>
      </div>

      {/* ── Sub Navigation Tabs ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setActiveTab('inward')}
            style={{
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'inward' ? '3px solid var(--blue)' : '3px solid transparent',
              padding: '10px 16px',
              color: activeTab === 'inward' ? 'var(--text)' : 'var(--text3)',
              fontWeight: 700,
              cursor: 'pointer',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <ArrowDownToLine size={16} />
            Inwarding Queue ({queueBins.length} active bins)
          </button>

          <button
            onClick={() => setActiveTab('bins')}
            style={{
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'bins' ? '3px solid var(--blue)' : '3px solid transparent',
              padding: '10px 16px',
              color: activeTab === 'bins' ? 'var(--text)' : 'var(--text3)',
              fontWeight: 700,
              cursor: 'pointer',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <BoxIcon size={16} />
            Storage Bins Fleet ({enrichedBins.length} bins)
          </button>

          <button
            onClick={() => setActiveTab('store_ledger')}
            style={{
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'store_ledger' ? '3px solid var(--blue)' : '3px solid transparent',
              padding: '10px 16px',
              color: activeTab === 'store_ledger' ? 'var(--text)' : 'var(--text3)',
              fontWeight: 700,
              cursor: 'pointer',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <Warehouse size={16} />
            Store Inventory & Final Cartons
          </button>
        </div>

        {activeTab === 'inward' && (
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', color: 'var(--text3)', fontWeight: 600 }}>Filter:</span>
            <button
              className="btn bsm"
              onClick={() => setFilterLocation('ALL')}
              style={{ padding: '4px 10px', fontSize: '11px', fontWeight: filterLocation === 'ALL' ? 800 : 500, background: filterLocation === 'ALL' ? 'var(--blue-bg)' : 'transparent', color: filterLocation === 'ALL' ? 'var(--blue)' : 'var(--text3)' }}
            >
              All
            </button>
            <button
              className="btn bsm"
              onClick={() => setFilterLocation('WIP Storage')}
              style={{ padding: '4px 10px', fontSize: '11px', fontWeight: filterLocation === 'WIP Storage' ? 800 : 500, background: filterLocation === 'WIP Storage' ? 'var(--amber-bg)' : 'transparent', color: filterLocation === 'WIP Storage' ? 'var(--amber)' : 'var(--text3)' }}
            >
              In WIP Storage
            </button>
            <button
              className="btn bsm"
              onClick={() => setFilterLocation('Main Store')}
              style={{ padding: '4px 10px', fontSize: '11px', fontWeight: filterLocation === 'Main Store' ? 800 : 500, background: filterLocation === 'Main Store' ? 'var(--green-bg)' : 'transparent', color: filterLocation === 'Main Store' ? 'var(--green)' : 'var(--text3)' }}
            >
              Received in Store
            </button>
          </div>
        )}
      </div>

      {/* ── Tab 1: Inwarding Queue by Storage Bin ── */}
      {activeTab === 'inward' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {queueBins.length === 0 ? (
            <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text3)' }}>
              <CheckCircle2 size={36} style={{ color: 'var(--green)', marginBottom: '8px' }} />
              <div style={{ fontWeight: 600, fontSize: '14px' }}>All Storage Bins Inwarded & Up to Date</div>
              <div style={{ fontSize: '12px', marginTop: '4px' }}>
                When packets are packed on the shop floor into storage bins, they will appear here ready for store receiving.
              </div>
            </div>
          ) : (
            queueBins.map((bin) => {
              const binPackets = packets.filter((p) => p.storageBinId === bin.id && p.locationStatus !== 'Carton Packed');
              const isStoreReceived = bin.isStoreReceived;

              return (
                <div key={bin.id} className="card" style={{ padding: '16px 20px', borderLeft: `4px solid ${isStoreReceived ? 'var(--green)' : 'var(--amber)'}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{
                        background: 'var(--blue)',
                        color: '#fff',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontWeight: 900,
                        fontFamily: 'var(--mono)',
                        fontSize: '15px'
                      }}>
                        {bin.id}
                      </span>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 800, fontSize: '15px' }}>{bin.assignedProductName || 'Product'}</span>
                          {bin.assignedProductCode && <span style={{ color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: '12px' }}>({bin.assignedProductCode})</span>}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: '10px', marginTop: '2px' }}>
                          <span>Batch: <strong style={{ color: 'var(--purple)', fontFamily: 'var(--mono)' }}>{bin.assignedBatchId?.split('-')[0]}</strong></span>
                          <span>•</span>
                          <span>{bin.packetsCount} Boxes (<strong style={{ color: 'var(--green)', fontFamily: 'var(--mono)' }}>{formatQty(bin.totalQty)} pcs</strong>)</span>
                          <span>•</span>
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: '10px',
                            fontSize: '10px',
                            fontWeight: 800,
                            background: isStoreReceived ? 'var(--green-bg)' : 'var(--amber-bg)',
                            color: isStoreReceived ? 'var(--green)' : 'var(--amber)'
                          }}>
                            {isStoreReceived ? 'Received in Store' : 'In WIP Storage'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      {!isStoreReceived ? (
                        <button
                          className="btn bpri bsm"
                          onClick={() => handleReceiveEntireBin(bin.id, binPackets)}
                          style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 800 }}
                        >
                          <ArrowDownToLine size={14} />
                          Receive Bin into Store (1-Scan)
                        </button>
                      ) : (
                        <button
                          className="btn bsec bsm"
                          onClick={() => setSelectedBinForCarton(bin.id)}
                          style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--purple)', borderColor: 'var(--purple)', fontWeight: 800 }}
                        >
                          <Archive size={14} />
                          Pack into Master Carton Box & Release Bin
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Packets Breakdown List inside this single-batch bin */}
                  <div style={{ overflowX: 'auto', background: 'var(--bg)', borderRadius: '6px', border: '1px solid var(--border)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text3)' }}>
                          <th style={{ padding: '8px 12px', textAlign: 'left' }}>Packet QR / ID</th>
                          <th style={{ padding: '8px 12px', textAlign: 'left' }}>Single Batch</th>
                          <th style={{ padding: '8px 12px', textAlign: 'right' }}>Box Qty</th>
                          <th style={{ padding: '8px 12px', textAlign: 'left' }}>Crate Traceability</th>
                          <th style={{ padding: '8px 12px', textAlign: 'center' }}>Location Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {binPackets.map((p) => (
                          <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '8px 12px', fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--blue)' }}>{p.id}</td>
                            <td style={{ padding: '8px 12px', fontFamily: 'var(--mono)', color: 'var(--purple)' }}>{p.batchId.split('-')[0]}</td>
                            <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 800, color: 'var(--green)' }}>{formatQty(p.quantity)} pcs</td>
                            <td style={{ padding: '8px 12px', fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text3)' }}>
                              {p.crateSources && p.crateSources.length > 0 ? (
                                p.crateSources.map((_s, _i) => `Bin #${_s.binNumber}: ${_s.qty} pcs`).join(', ')
                              ) : (
                                'Single crate'
                              )}
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                              <span style={{
                                padding: '2px 8px',
                                borderRadius: '10px',
                                fontSize: '10px',
                                fontWeight: 800,
                                background: p.locationStatus === 'Main Store' ? 'var(--green-bg)' : 'var(--amber-bg)',
                                color: p.locationStatus === 'Main Store' ? 'var(--green)' : 'var(--amber)'
                              }}>
                                {p.locationStatus}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── Tab 2: Storage Bins Fleet Overview ── */}
      {activeTab === 'bins' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '12px' }}>
          {enrichedBins.map((bin) => (
            <div
              key={bin.id}
              className="card"
              style={{
                padding: '16px',
                borderLeft: `4px solid ${bin.currentLocation === 'Main Store' ? 'var(--green)' : bin.currentLocation === 'WIP Warehouse' ? 'var(--amber)' : 'var(--border)'}`
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontFamily: 'var(--mono)', fontWeight: 900, fontSize: '16px', color: 'var(--blue)' }}>
                  {bin.id}
                </span>
                <span style={{
                  padding: '2px 8px',
                  borderRadius: '10px',
                  fontSize: '10px',
                  fontWeight: 800,
                  background: bin.currentLocation === 'Main Store' ? 'var(--green-bg)' : bin.currentLocation === 'WIP Warehouse' ? 'var(--amber-bg)' : 'rgba(255,255,255,0.05)',
                  color: bin.currentLocation === 'Main Store' ? 'var(--green)' : bin.currentLocation === 'WIP Warehouse' ? 'var(--amber)' : 'var(--text3)'
                }}>
                  {bin.currentLocation}
                </span>
              </div>

              <div style={{ fontSize: '20px', fontWeight: 800, fontFamily: 'var(--mono)', color: bin.totalQty ? 'var(--green)' : 'var(--text3)' }}>
                {formatQty(bin.totalQty || 0)} <span style={{ fontSize: '11px', fontWeight: 500 }}>pcs</span>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>
                {bin.packetsCount || 0} boxes assigned
              </div>

              {bin.assignedBatchId && (
                <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px dashed var(--border)', fontSize: '11px' }}>
                  <div style={{ color: 'var(--purple)', fontWeight: 700, fontFamily: 'var(--mono)' }}>
                    Batch: {bin.assignedBatchId.split('-')[0]}
                  </div>
                  <div style={{ color: 'var(--text2)', fontWeight: 600 }}>
                    {bin.assignedProductName}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Tab 3: Store Inventory & Final Cartons ── */}
      {activeTab === 'store_ledger' && (
        <div className="card" style={{ overflowX: 'auto', padding: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
            <thead>
              <tr style={{ background: 'var(--bg2)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text3)' }}>Packet ID</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text3)' }}>Product</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--purple)' }}>Batch</th>
                <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--green)' }}>Quantity</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--blue)' }}>Storage Bin</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--purple)' }}>Master Carton</th>
                <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text3)' }}>Location</th>
              </tr>
            </thead>
            <tbody>
              {packets.map((pkt, idx) => (
                <tr key={pkt.id} style={{ borderBottom: '1px solid var(--border)', background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                  <td style={{ padding: '12px 16px', fontFamily: 'var(--mono)', fontWeight: 800, color: 'var(--blue)' }}>{pkt.id}</td>
                  <td style={{ padding: '12px 16px', fontWeight: 600 }}>{pkt.productName}</td>
                  <td style={{ padding: '12px 16px', fontFamily: 'var(--mono)', color: 'var(--purple)' }}>{pkt.batchId.split('-')[0]}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 800, color: 'var(--green)' }}>{formatQty(pkt.quantity)} pcs</td>
                  <td style={{ padding: '12px 16px', fontFamily: 'var(--mono)' }}>{pkt.storageBinId || '—'}</td>
                  <td style={{ padding: '12px 16px', fontFamily: 'var(--mono)', color: 'var(--purple)', fontWeight: 700 }}>{pkt.cartonId || '—'}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: '10px',
                      fontSize: '10px',
                      fontWeight: 800,
                      background: pkt.locationStatus === 'Carton Packed' ? 'var(--purple-bg)' : pkt.locationStatus === 'Main Store' ? 'var(--green-bg)' : 'var(--amber-bg)',
                      color: pkt.locationStatus === 'Carton Packed' ? 'var(--purple)' : pkt.locationStatus === 'Main Store' ? 'var(--green)' : 'var(--amber)'
                    }}>
                      {pkt.locationStatus}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Modal: Pack Storage Bin into Master Carton Box ── */}
      {selectedBinForCarton && (
        <div className="ov animate-fade-in" style={{ zIndex: 10005 }}>
          <div className="modal animate-scale-in" style={{ width: '400px' }}>
            <div className="mhd" style={{ background: 'var(--bg2)', display: 'flex', justifyContent: 'space-between' }}>
              <div className="mtit">Pack Bin into Final Master Carton</div>
              <button onClick={() => setSelectedBinForCarton(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text3)', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>
            <div className="mbd" style={{ padding: '20px' }}>
              <p style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '16px' }}>
                Packing all boxes from <strong>{selectedBinForCarton}</strong> into a master export/domestic carton box. Storage Bin {selectedBinForCarton} will be emptied and released back to WIP.
              </p>

              <div style={{ marginBottom: '16px' }}>
                <label className="fl" style={{ fontWeight: 700, marginBottom: '6px', display: 'block' }}>
                  Master Carton Box Number / Code
                </label>
                <input
                  type="text"
                  className="fi"
                  placeholder={`e.g. CTN-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-01`}
                  value={cartonIdInput}
                  onChange={(e) => setCartonIdInput(e.target.value)}
                  style={{ width: '100%', fontSize: '15px', fontFamily: 'var(--mono)' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button className="btn bsec" style={{ flex: 1 }} onClick={() => setSelectedBinForCarton(null)}>
                  Cancel
                </button>
                <button className="btn bpri" style={{ flex: 2, fontWeight: 800 }} onClick={handlePackBinIntoCarton}>
                  Confirm & Seal Carton
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StoreInwardingPage;
