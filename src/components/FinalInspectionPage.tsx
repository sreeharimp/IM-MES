import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  CheckCircle2, AlertTriangle, X, Zap, ZapOff,
  Trash2, ArrowLeft, Send, ShieldAlert,
  Volume2, VolumeX, Loader2, ShieldCheck, AlertOctagon,
  Settings, Sliders, Eye, EyeOff
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import { BarcodeScanner, BarcodeFormat, LensFacing } from '@capacitor-mlkit/barcode-scanning';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import {
  FinalInspectionService,
  type FinalInspectionSession,
  type FinalInspectionPacket,
  type FinalInspectionSubmissionResult
} from '../services/finalInspectionService';

interface FinalInspectionPageProps {
  currentUser: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  appSettings?: any;
  onBackToVisualInspection?: () => void;
}

// ── Native Scan Styles for Split-Screen Per-Pixel Transparency ────────────────
const NATIVE_SCAN_STYLE_ID = 'final-inspection-native-scan-style';

function injectNativeScanStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(NATIVE_SCAN_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = NATIVE_SCAN_STYLE_ID;
  style.textContent = `
    html, body, #root, #app-layout, .inspection-app, main {
      background: transparent !important;
      background-color: transparent !important;
    }
    * {
      backdrop-filter: none !important;
      -webkit-backdrop-filter: none !important;
    }
  `;
  document.head.appendChild(style);
}

function removeNativeScanStyles() {
  if (typeof document === 'undefined') return;
  document.getElementById(NATIVE_SCAN_STYLE_ID)?.remove();
}

// ── Precision SVG Corner Markers for Square Viewfinder ───────────────────────
const CornerMarkers: React.FC<{ strokeColor?: string }> = ({ strokeColor = '#10b981' }) => (
  <svg
    viewBox="0 0 100 100"
    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
    fill="none"
    stroke={strokeColor}
    strokeWidth="3.5"
    strokeLinecap="round"
  >
    {/* Top-Left */}
    <polyline points="6,22 6,6 22,6" />
    {/* Top-Right */}
    <polyline points="78,6 94,6 94,22" />
    {/* Bottom-Left */}
    <polyline points="6,78 6,94 22,94" />
    {/* Bottom-Right */}
    <polyline points="78,94 94,94 94,78" />
  </svg>
);

export const FinalInspectionPage: React.FC<FinalInspectionPageProps> = ({
  currentUser,
  appSettings,
  onBackToVisualInspection
}) => {
  const isNative = Capacitor.getPlatform() !== 'web';

  // Authorization check
  const isAuthorized = FinalInspectionService.isUserAuthorized(
    currentUser.role,
    appSettings?.role_permissions || (appSettings as any)?.printLabels?.role_permissions
  );

  // Session state
  const [session, setSession] = useState<FinalInspectionSession>(() =>
    FinalInspectionService.createSession(currentUser.id, currentUser.name, currentUser.role)
  );

  // Industrial Metrics
  const [totalScansCount, setTotalScansCount] = useState(0);
  const [duplicateFilterCount, setDuplicateFilterCount] = useState(0);

  // Decision & Sign-off State
  const [decision, setDecision] = useState<'PASSED' | 'REJECTED' | 'HELD'>('PASSED');
  const [rejectionReason, setRejectionReason] = useState<string>('Barcode Unreadable');
  const [customRemarks, setCustomRemarks] = useState<string>('');

  // Scanner Hardware & Camera State
  const [isCameraActive, setIsCameraActive] = useState(true);
  const [cameraStatus, setCameraStatus] = useState<'starting' | 'running' | 'error' | 'permission_denied'>('starting');
  const [cameraError, setCameraError] = useState('');
  const [hasTorch, setHasTorch] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  // Industrial Settings State
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [fpsSetting, setFpsSetting] = useState<10 | 15 | 30 | 60>(15); // Default: 15 FPS for low jitter & low heat
  const [scanMode, setScanMode] = useState<'UNIQUE_ONLY' | 'ALLOW_MULTI'>('UNIQUE_ONLY');
  const [cooldownSeconds, setCooldownSeconds] = useState<number>(2.5); // 2.5s redundant read filter
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [hapticsEnabled, setHapticsEnabled] = useState(true);

  // Instant Feedback Banner
  const [lastFeedback, setLastFeedback] = useState<{
    text: string;
    type: 'success' | 'warning' | 'error';
    timestamp: number;
  } | null>(null);

  // Manual input field
  const [manualInput, setManualInput] = useState('');

  // Submission State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionResult, setSubmissionResult] = useState<FinalInspectionSubmissionResult | null>(null);

  // References for industrial duplicate suppression & throttle
  const html5QrScannerRef = useRef<Html5Qrcode | null>(null);
  const nativeBarcodeListenerRef = useRef<PluginListenerHandle | null>(null);
  const lastScanTimestampMap = useRef<Map<string, number>>(new Map());
  const lastProcessedTimeRef = useRef<number>(0);
  const scannedPacketsSet = useRef<Set<string>>(new Set());

  // Keep scanned unique IDs synchronized
  useEffect(() => {
    scannedPacketsSet.current = new Set(session.packets.map(p => p.packet_id.toUpperCase()));
  }, [session.packets]);

  // Derived Unique Packets Count
  const uniqueCount = useMemo(() => {
    return new Set(session.packets.map(p => p.packet_id.toUpperCase())).size;
  }, [session.packets]);

  // Pre-load lookup cache on mount
  useEffect(() => {
    FinalInspectionService.init().catch(() => {});
  }, []);

  // ── Square Viewfinder Filter: Scan only what is inside the square ──────────
  const isBarcodeInSquare = useCallback((b: any): boolean => {
    if (!b.cornerPoints || b.cornerPoints.length < 4) {
      return true; // Fallback if device driver didn't supply coordinates
    }
    const squareEl = document.getElementById('barcode-square-viewfinder');
    if (!squareEl) return true;

    const rect = squareEl.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    // Physical screen bounding box of the square with a 10% tolerance margin
    const marginX = (rect.width * dpr) * 0.1;
    const marginY = (rect.height * dpr) * 0.1;
    const minX = (rect.left * dpr) - marginX;
    const maxX = (rect.right * dpr) + marginX;
    const minY = (rect.top * dpr) - marginY;
    const maxY = (rect.bottom * dpr) + marginY;

    // Compute barcode centroid
    const pts = b.cornerPoints;
    const cx = (pts[0][0] + pts[1][0] + pts[2][0] + pts[3][0]) / 4;
    const cy = (pts[0][1] + pts[1][1] + pts[2][1] + pts[3][1]) / 4;

    return cx >= minX && cx <= maxX && cy >= minY && cy <= maxY;
  }, []);

  // ── Industrial Barcode Scan Handler ───────────────────────────────────────
  const handleBarcodeDetect = useCallback(
    (decodedText: string) => {
      const rawText = decodedText.trim();
      if (!rawText) return;

      const upperId = rawText.toUpperCase();
      const now = Date.now();

      // A. FPS Throttle for Native Pipeline (limits processing frequency)
      const minIntervalMs = 1000 / fpsSetting;
      if (now - lastProcessedTimeRef.current < minIntervalMs) {
        return;
      }
      lastProcessedTimeRef.current = now;

      // B. Industrial Redundant Read Suppression:
      // While barcode is held in camera, suppress repeat reads within cooldown window
      const lastScannedAt = lastScanTimestampMap.current.get(upperId) || 0;
      const cooldownMs = cooldownSeconds * 1000;
      if (now - lastScannedAt < cooldownMs) {
        return; // Suppressed while held in view
      }

      // C. Unique Packets Only Mode:
      if (scanMode === 'UNIQUE_ONLY' && scannedPacketsSet.current.has(upperId)) {
        // Barcode is already in the list -> suppress and warn once
        lastScanTimestampMap.current.set(upperId, now);
        setDuplicateFilterCount(c => c + 1);

        if (audioEnabled) {
          FinalInspectionService.feedback('warning');
        }

        setLastFeedback({
          text: `⚠️ Duplicate Ignored: ${rawText}`,
          type: 'warning',
          timestamp: now
        });
        return;
      }

      // D. Valid Scan Accepted:
      lastScanTimestampMap.current.set(upperId, now);
      setTotalScansCount(c => c + 1);

      // Metadata lookup
      const meta = FinalInspectionService.lookupPacket(rawText);
      const expectedQty = meta?.quantity || 1000;
      const prodName = meta?.product_name || (meta?.product_id ? `Product ${meta.product_id}` : 'Standard Packet');
      const batchCode = meta?.batch_code || rawText.split('-')[0];

      // Industrial Audio / Haptic feedback
      if (audioEnabled) {
        FinalInspectionService.feedback('success');
      }
      if (hapticsEnabled && typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([40]);
      }

      setLastFeedback({
        text: `✓ ${rawText} (+${expectedQty.toLocaleString()} pcs)`,
        type: 'success',
        timestamp: now
      });

      const newPacket: FinalInspectionPacket = {
        packet_id: rawText,
        quantity: expectedQty,
        product_id: meta?.product_id,
        product_name: prodName,
        batch_code: batchCode,
        scanned_at: new Date().toISOString(),
        status: 'PENDING'
      };

      setSession(prev => ({
        ...prev,
        packets: [newPacket, ...prev.packets],
        total_quantity: prev.total_quantity + expectedQty
      }));
    },
    [fpsSetting, cooldownSeconds, scanMode, audioEnabled]
  );

  // ── Camera Lifecycle (Top Half) ───────────────────────────────────────────
  const startCamera = useCallback(async () => {
    setCameraStatus('starting');
    setCameraError('');

    // A. Native Android Google ML Kit (Continuous 60/30/15 FPS)
    if (isNative) {
      try {
        const perm = await BarcodeScanner.checkPermissions();
        if (perm.camera !== 'granted') {
          const req = await BarcodeScanner.requestPermissions();
          if (req.camera !== 'granted') {
            setCameraStatus('permission_denied');
            setCameraError('Camera permission required.');
            return;
          }
        }

        injectNativeScanStyles();

        if (nativeBarcodeListenerRef.current) {
          try { await nativeBarcodeListenerRef.current.remove(); } catch {}
          nativeBarcodeListenerRef.current = null;
        }

        nativeBarcodeListenerRef.current = await BarcodeScanner.addListener('barcodesScanned', (event: any) => {
          const barcodes = event.barcodes || [];
          for (const b of barcodes) {
            const val = b.displayValue || b.rawValue;
            if (!val) continue;

            // Strictly scan ONLY what comes inside the square!
            if (!isBarcodeInSquare(b)) {
              continue;
            }

            handleBarcodeDetect(val.trim());
          }
        });

        BarcodeScanner.isTorchAvailable()
          .then(({ available }) => { setHasTorch(available); })
          .catch(() => {});

        await BarcodeScanner.startScan({
          formats: [BarcodeFormat.QrCode, BarcodeFormat.Code128, BarcodeFormat.Ean13],
          lensFacing: LensFacing.Back,
        });

        setCameraStatus('running');
      } catch (err: any) {
        console.error('Android camera start error:', err);
        setCameraStatus('error');
        setCameraError(err?.message || 'Could not start camera.');
      }
      return;
    }

    // B. Web Browser Fallback (Desktop testing in top half)
    try {
      if (html5QrScannerRef.current && html5QrScannerRef.current.isScanning) {
        await html5QrScannerRef.current.stop();
      }

      await new Promise(r => setTimeout(r, 100));
      const containerEl = document.getElementById('web-camera-viewport');
      if (!containerEl) {
        setCameraStatus('error');
        setCameraError('Camera viewport container not found.');
        return;
      }

      const qr = new Html5Qrcode('web-camera-viewport', {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.EAN_13
        ],
        verbose: false
      });
      html5QrScannerRef.current = qr;

      // Square scanning box: 190px x 190px
      await qr.start(
        { facingMode: 'environment' },
        {
          fps: fpsSetting,
          qrbox: { width: 190, height: 190 },
          aspectRatio: 1.0
        },
        (decodedText) => {
          handleBarcodeDetect(decodedText);
        },
        () => {}
      );

      setCameraStatus('running');
    } catch (err: any) {
      console.warn('Web QR scanner error:', err);
      setCameraStatus('error');
      setCameraError(err?.message || 'Web camera could not be initialized.');
    }
  }, [isNative, fpsSetting, handleBarcodeDetect]);

  const stopCamera = useCallback(async () => {
    if (isNative) {
      try {
        if (nativeBarcodeListenerRef.current) {
          await nativeBarcodeListenerRef.current.remove();
          nativeBarcodeListenerRef.current = null;
        }
        await BarcodeScanner.stopScan();
      } catch {} finally {
        removeNativeScanStyles();
        setTorchOn(false);
      }
    } else {
      if (html5QrScannerRef.current && html5QrScannerRef.current.isScanning) {
        try { await html5QrScannerRef.current.stop(); } catch {}
      }
    }
  }, [isNative]);

  // Start camera on mount, stop on unmount
  useEffect(() => {
    if (isCameraActive) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isCameraActive, startCamera, stopCamera]);

  const toggleTorch = async () => {
    if (isNative) {
      try {
        await BarcodeScanner.toggleTorch();
        setTorchOn(p => !p);
      } catch {}
    }
  };

  const handleManualAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualInput.trim()) return;
    handleBarcodeDetect(manualInput.trim());
    setManualInput('');
  };

  const handleRemovePacket = (idxToRemove: number) => {
    setSession(prev => {
      const removed = prev.packets[idxToRemove];
      const subQty = removed?.quantity || 0;
      return {
        ...prev,
        packets: prev.packets.filter((_, idx) => idx !== idxToRemove),
        total_quantity: Math.max(0, prev.total_quantity - subQty)
      };
    });
  };

  const handleClearAll = () => {
    if (window.confirm('Clear all scanned packets?')) {
      setSession(prev => ({
        ...prev,
        packets: [],
        total_quantity: 0
      }));
      setTotalScansCount(0);
      setDuplicateFilterCount(0);
      lastScanTimestampMap.current.clear();
    }
  };

  const handleSubmitSession = async () => {
    if (session.packets.length === 0) {
      alert('Please scan at least one packet before submitting.');
      return;
    }

    if ((decision === 'REJECTED' || decision === 'HELD') && !customRemarks.trim()) {
      alert(`Please enter a remark explaining why this batch was marked ${decision}.`);
      return;
    }

    const note = decision === 'PASSED'
      ? 'All packets passed final physical and barcode verification.'
      : `${rejectionReason}${customRemarks ? ` - ${customRemarks}` : ''}`;

    setIsSubmitting(true);
    try {
      const result = await FinalInspectionService.submitInspection(
        session,
        decision,
        note
      );

      setSubmissionResult(result);

      if (result.success) {
        setSession(FinalInspectionService.createSession(currentUser.id, currentUser.name, currentUser.role));
        setTotalScansCount(0);
        setDuplicateFilterCount(0);
        lastScanTimestampMap.current.clear();
      }
    } catch (err: any) {
      alert('Submission failed: ' + (err?.message || 'Unknown network error.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isAuthorized) {
    return (
      <div style={{ padding: '24px', maxWidth: '480px', margin: '40px auto', textAlign: 'center' }}>
        <div style={{
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '16px',
          padding: '28px 20px',
          color: '#f87171'
        }}>
          <ShieldAlert size={44} style={{ margin: '0 auto 12px', color: '#ef4444' }} />
          <h2 style={{ fontSize: '18px', fontWeight: 800, marginBottom: '8px', color: '#fecaca' }}>
            Final Inspection Restricted
          </h2>
          <p style={{ fontSize: '13px', color: '#cbd5e1', marginBottom: '16px' }}>
            Your role (<strong style={{ color: '#ef4444' }}>{currentUser.role}</strong>) does not have Final QC permission.
          </p>
          {onBackToVisualInspection && (
            <button
              onClick={onBackToVisualInspection}
              style={{
                padding: '10px 18px',
                background: '#334155',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '13px'
              }}
            >
              <ArrowLeft size={14} style={{ marginRight: '6px' }} /> Return to Visual Inspection
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: 'calc(100vh - 120px)',
      background: 'transparent',
      color: '#f1f5f9',
      position: 'relative',
      overflow: 'hidden'
    }}>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 1. TOP HALF: LIVE INDUSTRIAL CAMERA VIEW (38% SCREEN HEIGHT)        */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div
        id="final-inspection-camera-half"
        style={{
          height: '42vh',
          minHeight: '270px',
          maxHeight: '340px',
          position: 'relative',
          background: 'transparent',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          overflow: 'hidden'
        }}
      >
        {/* Top Control Bar Floating over Camera */}
        <div style={{
          padding: '10px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'linear-gradient(to bottom, rgba(11, 17, 32, 0.92) 0%, rgba(11, 17, 32, 0) 100%)',
          zIndex: 10
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: cameraStatus === 'running' ? '#10b981' : '#f59e0b',
              boxShadow: cameraStatus === 'running' ? '0 0 8px #10b981' : '0 0 8px #f59e0b'
            }} />
            <span style={{ fontSize: '10px', background: '#1e293b', padding: '2px 6px', borderRadius: '4px', color: '#94a3b8' }}>
              {fpsSetting} FPS
            </span>
            {cameraStatus === 'error' && (
              <span style={{ fontSize: '10px', color: '#f87171' }}>{cameraError || 'Camera error'}</span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Torch Button */}
            {hasTorch && (
              <button
                onClick={toggleTorch}
                style={{
                  width: 34, height: 34, borderRadius: '50%',
                  background: torchOn ? '#10b981' : 'rgba(15, 23, 42, 0.8)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  color: torchOn ? '#000' : '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
                }}
                title="Toggle Torch"
              >
                {torchOn ? <Zap size={16} /> : <ZapOff size={16} />}
              </button>
            )}

            {/* Audio Toggle */}
            <button
              onClick={() => setAudioEnabled(p => !p)}
              style={{
                width: 34, height: 34, borderRadius: '50%',
                background: audioEnabled ? 'rgba(15, 23, 42, 0.8)' : 'rgba(239, 68, 68, 0.4)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                color: audioEnabled ? '#10b981' : '#f87171',
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
              }}
              title="Toggle Audio Beep"
            >
              {audioEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>

            {/* Camera Pause/Resume */}
            <button
              onClick={() => setIsCameraActive(p => !p)}
              style={{
                width: 34, height: 34, borderRadius: '50%',
                background: isCameraActive ? 'rgba(15, 23, 42, 0.8)' : 'rgba(245, 158, 11, 0.3)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                color: isCameraActive ? '#38bdf8' : '#f59e0b',
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
              }}
              title={isCameraActive ? 'Pause Camera' : 'Resume Camera'}
            >
              {isCameraActive ? <Eye size={16} /> : <EyeOff size={16} />}
            </button>

            {/* Settings Gear Button */}
            <button
              onClick={() => setShowSettingsModal(true)}
              style={{
                width: 34, height: 34, borderRadius: '50%',
                background: 'rgba(15, 23, 42, 0.8)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
              }}
              title="Scanner Settings (FPS & Duplicate Filter)"
            >
              <Settings size={16} />
            </button>
          </div>
        </div>

        {/* Center: Short, Focused Scanning Slit with Letterbox Vignette */}
        <div style={{
          position: 'relative',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 5
        }}>
          {/* Target Reticle: Square Viewfinder (Scan only what is inside this square) */}
          <div
            id="barcode-square-viewfinder"
            style={{
              position: 'relative',
              width: '190px',
              height: '190px',
              maxWidth: '56vw',
              maxHeight: '56vw',
              aspectRatio: '1',
              borderRadius: '16px',
              overflow: 'hidden',
              boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.68)',
              border: '1px solid rgba(255, 255, 255, 0.15)'
            }}
          >
            {!isNative && (
              <div id="web-camera-viewport" style={{ width: '100%', height: '100%' }} />
            )}

            <CornerMarkers strokeColor={lastFeedback?.type === 'warning' ? '#f59e0b' : '#10b981'} />

            {/* Sweeping Laser Line inside Square */}
            <div style={{
              position: 'absolute',
              left: '6%',
              right: '6%',
              height: '2px',
              background: lastFeedback?.type === 'warning' ? '#f59e0b' : '#10b981',
              boxShadow: lastFeedback?.type === 'warning' ? '0 0 12px #f59e0b' : '0 0 12px #10b981',
              borderRadius: '2px',
              animation: 'scanline 1.6s ease-in-out infinite'
            }} />
          </div>

          {/* Floating Instant Feedback Toast */}
          <div style={{ height: '32px', marginTop: '6px', display: 'flex', alignItems: 'center' }}>
            {lastFeedback && (
              <div style={{
                padding: '4px 14px',
                borderRadius: '16px',
                fontSize: '12px',
                fontWeight: 800,
                background: lastFeedback.type === 'warning' ? 'rgba(245, 158, 11, 0.95)' : 'rgba(16, 185, 129, 0.95)',
                color: lastFeedback.type === 'warning' ? '#000' : '#022c22',
                boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                animation: 'scaleIn 0.15s ease-out'
              }}>
                {lastFeedback.text}
              </div>
            )}
          </div>
        </div>

        {/* Small Bottom Legend */}
        <div style={{
          textAlign: 'center',
          paddingBottom: '4px',
          fontSize: '10px',
          color: 'rgba(255,255,255,0.7)',
          textShadow: '0 1px 3px rgba(0,0,0,0.9)',
          zIndex: 10
        }}>
          Align packet QR inside square &bull; Outer codes ignored
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 2. BOTTOM HALF: INDUSTRIAL METRICS, LIST & SUBMISSION (SOLID BG)   */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div style={{
        flex: 1,
        background: '#0b1120',
        borderTop: '2px solid #334155',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        zIndex: 20
      }}>

        {/* Industrial KPI Metrics Strip */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '6px',
          padding: '10px 12px',
          background: '#0f172a',
          borderBottom: '1px solid #1e293b'
        }}>
          {/* Card 1: Total Scans */}
          <div style={{ background: '#131d32', padding: '6px 8px', borderRadius: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '9px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
              SCANS
            </div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: '#f8fafc', marginTop: '2px' }}>
              {totalScansCount}
            </div>
          </div>

          {/* Card 2: Unique Packets */}
          <div style={{ background: '#131d32', padding: '6px 8px', borderRadius: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '9px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
              UNIQUE
            </div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: '#10b981', marginTop: '2px' }}>
              {uniqueCount}
            </div>
          </div>

          {/* Card 3: Duplicates Suppressed */}
          <div style={{ background: '#131d32', padding: '6px 8px', borderRadius: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '9px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
              DUPLICATES
            </div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: duplicateFilterCount > 0 ? '#f59e0b' : '#64748b', marginTop: '2px' }}>
              {duplicateFilterCount}
            </div>
          </div>

          {/* Card 4: Total Net Pieces */}
          <div style={{ background: '#131d32', padding: '6px 8px', borderRadius: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '9px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
              TOTAL PCS
            </div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: '#38bdf8', marginTop: '2px' }}>
              {session.total_quantity.toLocaleString()}
            </div>
          </div>
        </div>

        {/* Quick Manual Entry Bar */}
        <form onSubmit={handleManualAdd} style={{ display: 'flex', gap: '6px', padding: '8px 12px', background: '#0e1626' }}>
          <input
            type="text"
            placeholder="Type/gun barcode (e.g. PKT-1001)..."
            value={manualInput}
            onChange={e => setManualInput(e.target.value)}
            style={{
              flex: 1,
              background: '#0b1120',
              border: '1px solid #334155',
              borderRadius: '8px',
              padding: '8px 12px',
              color: '#fff',
              fontSize: '12px',
              outline: 'none'
            }}
          />
          <button
            type="submit"
            disabled={!manualInput.trim()}
            style={{
              background: '#334155',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              padding: '0 14px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Add
          </button>
        </form>

        {/* Scrollable Scanned Packets List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 12px' }}>
          {session.packets.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 10px', color: '#64748b', fontSize: '12px' }}>
              Awaiting packets &bull; Center QR code in camera above
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {session.packets.map((pkt, idx) => (
                <div
                  key={`${pkt.packet_id}-${idx}`}
                  style={{
                    background: '#131d32',
                    border: '1px solid #1e293b',
                    borderRadius: '8px',
                    padding: '7px 10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '12px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: '#64748b', fontSize: '11px', width: '22px' }}>
                      #{session.packets.length - idx}
                    </span>
                    <div>
                      <div style={{ fontWeight: 800, color: '#f8fafc', fontFamily: 'monospace' }}>
                        {pkt.packet_id}
                      </div>
                      <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                        {pkt.product_name || pkt.batch_code}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ color: '#10b981', fontWeight: 800 }}>
                      {pkt.quantity.toLocaleString()} pcs
                    </span>
                    <button
                      onClick={() => handleRemovePacket(idx)}
                      style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', padding: 2 }}
                      title="Remove Item"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Decision & Submission Footer */}
        <div style={{
          padding: '10px 12px 14px',
          background: '#0f172a',
          borderTop: '1px solid #1e293b'
        }}>
          {/* Decision Buttons */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginBottom: '8px' }}>
            <button
              type="button"
              onClick={() => setDecision('PASSED')}
              style={{
                padding: '8px 4px',
                borderRadius: '8px',
                border: decision === 'PASSED' ? '2px solid #10b981' : '1px solid #1e293b',
                background: decision === 'PASSED' ? 'rgba(16, 185, 129, 0.2)' : '#0b1120',
                color: decision === 'PASSED' ? '#10b981' : '#94a3b8',
                fontWeight: 800,
                fontSize: '11px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px'
              }}
            >
              <ShieldCheck size={14} /> PASSED
            </button>

            <button
              type="button"
              onClick={() => setDecision('REJECTED')}
              style={{
                padding: '8px 4px',
                borderRadius: '8px',
                border: decision === 'REJECTED' ? '2px solid #ef4444' : '1px solid #1e293b',
                background: decision === 'REJECTED' ? 'rgba(239, 68, 68, 0.2)' : '#0b1120',
                color: decision === 'REJECTED' ? '#ef4444' : '#94a3b8',
                fontWeight: 800,
                fontSize: '11px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px'
              }}
            >
              <AlertOctagon size={14} /> REJECTED
            </button>

            <button
              type="button"
              onClick={() => setDecision('HELD')}
              style={{
                padding: '8px 4px',
                borderRadius: '8px',
                border: decision === 'HELD' ? '2px solid #f59e0b' : '1px solid #1e293b',
                background: decision === 'HELD' ? 'rgba(245, 158, 11, 0.2)' : '#0b1120',
                color: decision === 'HELD' ? '#f59e0b' : '#94a3b8',
                fontWeight: 800,
                fontSize: '11px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px'
              }}
            >
              <AlertTriangle size={14} /> HOLD
            </button>
          </div>

          {(decision === 'REJECTED' || decision === 'HELD') && (
            <div style={{ marginBottom: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <select
                value={rejectionReason}
                onChange={e => setRejectionReason(e.target.value)}
                style={{
                  width: '100%',
                  background: '#0b1120',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  padding: '6px 8px',
                  color: '#fff',
                  fontSize: '11px'
                }}
              >
                <option value="Damaged Packaging / Seal Broken">Damaged Packaging / Seal Broken</option>
                <option value="Incorrect Weight / Quantity Mismatch">Incorrect Weight / Quantity Mismatch</option>
                <option value="Barcode Unreadable / Printing Defect">Barcode Unreadable / Printing Defect</option>
                <option value="Missing Batch Label / Specification Error">Missing Batch Label / Specification Error</option>
                <option value="Contamination / Foreign Particle">Contamination / Foreign Particle</option>
                <option value="Other Quality Defect">Other Quality Defect</option>
              </select>

              <input
                type="text"
                placeholder={`Mandatory reason for ${decision}...`}
                value={customRemarks}
                onChange={e => setCustomRemarks(e.target.value)}
                style={{
                  width: '100%',
                  background: '#0b1120',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  padding: '6px 10px',
                  color: '#fff',
                  fontSize: '11px',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          )}

          {/* Submit Action Button */}
          <div style={{ display: 'flex', gap: '8px' }}>
            {session.packets.length > 0 && (
              <button
                onClick={handleClearAll}
                style={{
                  padding: '0 12px',
                  borderRadius: '10px',
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#f87171',
                  fontWeight: 700,
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                Clear
              </button>
            )}

            <button
              onClick={handleSubmitSession}
              disabled={session.packets.length === 0 || isSubmitting}
              style={{
                flex: 1,
                padding: '13px',
                borderRadius: '10px',
                background: session.packets.length === 0
                  ? '#1e293b'
                  : decision === 'PASSED' ? '#10b981' : decision === 'REJECTED' ? '#ef4444' : '#f59e0b',
                color: session.packets.length === 0 ? '#64748b' : decision === 'PASSED' ? '#022c22' : '#fff',
                fontSize: '14px',
                fontWeight: 800,
                border: 'none',
                cursor: session.packets.length === 0 || isSubmitting ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                  Persisting...
                </>
              ) : (
                <>
                  <Send size={16} />
                  Submit Final QC ({uniqueCount} Pkts &bull; {decision})
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 3. INDUSTRIAL SCANNER SETTINGS MODAL (FPS, COOLDOWN, DUP MODE)       */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {showSettingsModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 100000,
          background: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px'
        }}>
          <div style={{
            background: '#0f172a',
            border: '1px solid #334155',
            borderRadius: '16px',
            padding: '20px',
            maxWidth: '360px',
            width: '100%',
            boxShadow: '0 10px 30px rgba(0,0,0,0.6)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sliders size={18} color="#10b981" />
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#f8fafc', margin: 0 }}>
                  Scanner Engine Settings
                </h3>
              </div>
              <button
                onClick={() => setShowSettingsModal(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* FPS Setting */}
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#94a3b8', marginBottom: '6px' }}>
                CAMERA SCANNER FPS RATE:
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                {[10, 15, 30, 60].map(fps => (
                  <button
                    key={fps}
                    onClick={() => setFpsSetting(fps as any)}
                    style={{
                      padding: '8px 4px',
                      borderRadius: '8px',
                      border: fpsSetting === fps ? '2px solid #10b981' : '1px solid #1e293b',
                      background: fpsSetting === fps ? 'rgba(16, 185, 129, 0.2)' : '#0b1120',
                      color: fpsSetting === fps ? '#10b981' : '#94a3b8',
                      fontWeight: 800,
                      fontSize: '11px',
                      cursor: 'pointer'
                    }}
                  >
                    {fps} FPS
                  </button>
                ))}
              </div>
              <div style={{ fontSize: '10px', color: '#64748b', marginTop: '4px' }}>
                Lower FPS (10/15) reduces CPU heating &amp; prevents scan jitter.
              </div>
            </div>

            {/* Redundant Read Filter / Cooldown */}
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#94a3b8', marginBottom: '6px' }}>
                REDUNDANT READ COOLDOWN:
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                {[1.5, 2.5, 4.0].map(sec => (
                  <button
                    key={sec}
                    onClick={() => setCooldownSeconds(sec)}
                    style={{
                      padding: '8px 4px',
                      borderRadius: '8px',
                      border: cooldownSeconds === sec ? '2px solid #38bdf8' : '1px solid #1e293b',
                      background: cooldownSeconds === sec ? 'rgba(56, 189, 248, 0.2)' : '#0b1120',
                      color: cooldownSeconds === sec ? '#38bdf8' : '#94a3b8',
                      fontWeight: 800,
                      fontSize: '11px',
                      cursor: 'pointer'
                    }}
                  >
                    {sec}s Delay
                  </button>
                ))}
              </div>
              <div style={{ fontSize: '10px', color: '#64748b', marginTop: '4px' }}>
                Prevents repeat scans while packet stays in camera view.
              </div>
            </div>

            {/* Scan Mode: Unique Only vs Multi */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#94a3b8', marginBottom: '6px' }}>
                DUPLICATE BEHAVIOR:
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
                <button
                  onClick={() => setScanMode('UNIQUE_ONLY')}
                  style={{
                    padding: '8px 6px',
                    borderRadius: '8px',
                    border: scanMode === 'UNIQUE_ONLY' ? '2px solid #10b981' : '1px solid #1e293b',
                    background: scanMode === 'UNIQUE_ONLY' ? 'rgba(16, 185, 129, 0.2)' : '#0b1120',
                    color: scanMode === 'UNIQUE_ONLY' ? '#10b981' : '#94a3b8',
                    fontWeight: 700,
                    fontSize: '11px',
                    cursor: 'pointer'
                  }}
                >
                  Unique Only (Reject Dup)
                </button>

                <button
                  onClick={() => setScanMode('ALLOW_MULTI')}
                  style={{
                    padding: '8px 6px',
                    borderRadius: '8px',
                    border: scanMode === 'ALLOW_MULTI' ? '2px solid #38bdf8' : '1px solid #1e293b',
                    background: scanMode === 'ALLOW_MULTI' ? 'rgba(56, 189, 248, 0.2)' : '#0b1120',
                    color: scanMode === 'ALLOW_MULTI' ? '#38bdf8' : '#94a3b8',
                    fontWeight: 700,
                    fontSize: '11px',
                    cursor: 'pointer'
                  }}
                >
                  Allow Repeat Scans
                </button>
              </div>
            </div>

            {/* Haptics Setting */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#94a3b8', marginBottom: '6px' }}>
                HAPTIC FEEDBACK (VIBRATION):
              </label>
              <button
                type="button"
                onClick={() => setHapticsEnabled(p => !p)}
                style={{
                  width: '100%',
                  padding: '8px',
                  borderRadius: '8px',
                  border: hapticsEnabled ? '2px solid #10b981' : '1px solid #1e293b',
                  background: hapticsEnabled ? 'rgba(16, 185, 129, 0.2)' : '#0b1120',
                  color: hapticsEnabled ? '#10b981' : '#94a3b8',
                  fontWeight: 700,
                  fontSize: '11px',
                  cursor: 'pointer'
                }}
              >
                {hapticsEnabled ? '✓ Vibration Active on Scan' : '✕ Vibration Disabled'}
              </button>
            </div>

            <button
              onClick={() => setShowSettingsModal(false)}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '8px',
                background: '#10b981',
                color: '#022c22',
                fontWeight: 800,
                fontSize: '13px',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              Done &bull; Save Settings
            </button>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 4. SUBMISSION RESULT POPUP                                          */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {submissionResult && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 100000,
          background: 'rgba(0, 0, 0, 0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px'
        }}>
          <div style={{
            background: '#0f172a',
            border: submissionResult.success ? '2px solid #10b981' : '2px solid #ef4444',
            borderRadius: '16px',
            padding: '24px',
            maxWidth: '340px',
            width: '100%',
            textAlign: 'center'
          }}>
            {submissionResult.success ? (
              <>
                <CheckCircle2 size={44} color="#10b981" style={{ margin: '0 auto 10px' }} />
                <h3 style={{ fontSize: '17px', fontWeight: 800, color: '#f8fafc', marginBottom: '6px' }}>
                  Inspection Recorded
                </h3>
                <p style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '16px' }}>
                  Recorded <strong style={{ color: '#10b981' }}>{submissionResult.count} packets</strong> ({submissionResult.total_quantity?.toLocaleString()} pcs).
                </p>
                <button
                  onClick={() => setSubmissionResult(null)}
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '8px',
                    background: '#10b981',
                    color: '#022c22',
                    fontSize: '14px',
                    fontWeight: 800,
                    border: 'none',
                    cursor: 'pointer'
                  }}
                >
                  Start Next Batch
                </button>
              </>
            ) : (
              <>
                <AlertTriangle size={44} color="#ef4444" style={{ margin: '0 auto 10px' }} />
                <h3 style={{ fontSize: '17px', fontWeight: 800, color: '#f8fafc', marginBottom: '6px' }}>
                  Submission Error
                </h3>
                <p style={{ fontSize: '12px', color: '#fca5a5', marginBottom: '16px' }}>
                  {submissionResult.error || 'Failed to persist records.'}
                </p>
                <button
                  onClick={() => setSubmissionResult(null)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '8px',
                    background: '#334155',
                    color: '#fff',
                    fontSize: '13px',
                    fontWeight: 700,
                    border: 'none',
                    cursor: 'pointer'
                  }}
                >
                  Dismiss
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes scanline {
          0%, 100% { top: 12%; opacity: 0.3; }
          50% { top: 82%; opacity: 1; }
        }
        @keyframes scaleIn {
          from { transform: scale(0.9); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
};
