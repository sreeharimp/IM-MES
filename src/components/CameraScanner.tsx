import React, { useState, useEffect, useRef } from 'react';
import { Camera, X, Loader2, ZapOff, Zap } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import { BarcodeScanner, BarcodeFormat, LensFacing } from '@capacitor-mlkit/barcode-scanning';

interface CameraScannerProps {
  onSuccess: (text: string) => void;
  onClose: () => void;
}

// ─── IMPORTANT: CSS injected when native scan is active ──────────────────────
// We must hide the entire app (opacity:0) while keeping the scanner overlay
// visible. backdrop-filter must be ZERO on all elements – any blur() call
// composites over the camera stream and makes it appear white.
const NATIVE_SCAN_STYLE_ID = 'native-scan-style';

function injectNativeScanStyles() {
  if (document.getElementById(NATIVE_SCAN_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = NATIVE_SCAN_STYLE_ID;
  style.textContent = `
    /* Make HTML, body, and root transparent so camera underneath is visible */
    html, body, #root, #app-layout {
      background: transparent !important;
      background-color: transparent !important;
    }
    /* Hide everything in the main layout without affecting overlay children */
    #app-layout {
      visibility: hidden !important;
      pointer-events: none !important;
    }
    /* Scanner overlay and its children stay fully visible */
    #native-scanner-overlay {
      visibility: visible !important;
      opacity: 1 !important;
      pointer-events: auto !important;
    }
    #native-scanner-overlay * {
      visibility: visible !important;
    }
    /* Kill every backdrop-filter in the document to prevent white-wash */
    * {
      backdrop-filter: none !important;
      -webkit-backdrop-filter: none !important;
    }
  `;
  document.head.appendChild(style);
}

function removeNativeScanStyles() {
  document.getElementById(NATIVE_SCAN_STYLE_ID)?.remove();
}

// ─── Component ────────────────────────────────────────────────────────────────
export const CameraScanner: React.FC<CameraScannerProps> = ({ onSuccess, onClose }) => {
  const isNative = Capacitor.getPlatform() !== 'web';

  // Stable refs so the effect never re-runs due to prop changes
  const onSuccessRef = useRef(onSuccess);
  const onCloseRef   = useRef(onClose);
  useEffect(() => { onSuccessRef.current = onSuccess; }, [onSuccess]);
  useEffect(() => { onCloseRef.current  = onClose;   }, [onClose]);

  const [torchOn, setTorchOn]       = useState(false);
  const [hasTorch, setHasTorch]     = useState(false);
  const [scanStatus, setScanStatus] = useState<'init' | 'scanning' | 'denied' | 'error'>('init');

  useEffect(() => {
    if (!isNative) return;

    let cancelled   = false;
    let barcodeListener: PluginListenerHandle | null = null;
    let errorListener:   PluginListenerHandle | null  = null;
    let resolved    = false;

    const finish = async (value?: string) => {
      if (resolved || cancelled) return;
      resolved = true;
      // Clean up listeners and scanning
      try { await BarcodeScanner.removeAllListeners(); } catch {}
      try { await BarcodeScanner.stopScan();           } catch {}
      removeNativeScanStyles();
      if (value) {
        if (navigator.vibrate) navigator.vibrate([50, 30, 50]);
        onSuccessRef.current(value.trim());
      } else {
        onCloseRef.current();
      }
    };

    const start = async () => {
      try {
        // 1. Permission check
        const perm = await BarcodeScanner.checkPermissions();
        if (perm.camera !== 'granted') {
          const req = await BarcodeScanner.requestPermissions();
          if (req.camera !== 'granted') {
            if (!cancelled) setScanStatus('denied');
            return;
          }
        }
        if (cancelled) return;

        // 2. Inject CSS to make WebView transparent over native camera
        injectNativeScanStyles();
        setScanStatus('scanning');

        // 3. Set up barcode result listener
        barcodeListener = await BarcodeScanner.addListener('barcodesScanned', async (event: any) => {
          const barcode = event.barcodes?.[0];
          const value   = barcode?.displayValue || barcode?.rawValue;
          if (value) await finish(value);
        });

        errorListener = await BarcodeScanner.addListener('scanError', async () => {
          await finish();
        });

        // 4. Check torch availability (non-blocking)
        BarcodeScanner.isTorchAvailable()
          .then(({ available }) => { if (!cancelled) setHasTorch(available); })
          .catch(() => {});

        // 5. Start native camera scan behind WebView
        await BarcodeScanner.startScan({
          formats: [BarcodeFormat.QrCode, BarcodeFormat.Code128, BarcodeFormat.Ean13],
          lensFacing: LensFacing.Back,
        });

      } catch (err: any) {
        if (!cancelled) {
          console.error('Scanner start error:', err);
          removeNativeScanStyles();
          setScanStatus('error');
        }
      }
    };

    start();

    return () => {
      cancelled = true;
      if (!resolved) {
        BarcodeScanner.removeAllListeners().catch(() => {});
        BarcodeScanner.stopScan().catch(() => {});
        removeNativeScanStyles();
      }
      barcodeListener?.remove();
      errorListener?.remove();
    };
  }, [isNative]); // ← Only [isNative] — callbacks accessed via refs

  const toggleTorch = async () => {
    try {
      await BarcodeScanner.toggleTorch();
      setTorchOn(p => !p);
    } catch {}
  };

  // ── Status screens ──────────────────────────────────────────────────────
  if (isNative && scanStatus === 'denied') {
    return (
      <div className="ov" style={{ zIndex: 99999 }}>
        <div className="modal animate-scale-in" style={{ padding: '30px', textAlign: 'center', maxWidth: '320px' }}>
          <div style={{ fontSize: '40px', marginBottom: '16px' }}>📷</div>
          <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--amber)', marginBottom: '10px' }}>Camera Permission Required</div>
          <p style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '24px', lineHeight: 1.6 }}>
            Please grant camera access in Settings to use the barcode scanner.
          </p>
          <button className="btn bsec bfull" onClick={() => onCloseRef.current()}>Close</button>
        </div>
      </div>
    );
  }

  if (isNative && scanStatus === 'error') {
    return (
      <div className="ov" style={{ zIndex: 99999 }}>
        <div className="modal animate-scale-in" style={{ padding: '30px', textAlign: 'center', maxWidth: '320px' }}>
          <div style={{ fontSize: '40px', marginBottom: '16px' }}>⚠️</div>
          <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--red)', marginBottom: '10px' }}>Scanner Error</div>
          <p style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '24px', lineHeight: 1.6 }}>
            Could not start the camera. Make sure Google Play Services is up to date.
          </p>
          <button className="btn bsec bfull" onClick={() => onCloseRef.current()}>Close</button>
        </div>
      </div>
    );
  }

  // ── Native overlay (shown on top while camera renders behind WebView) ───
  if (isNative) {
    return (
      <div
        id="native-scanner-overlay"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 99999,
          // MUST be fully transparent – any background here blocks the camera
          background: 'transparent',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {scanStatus === 'init' ? (
          // Initialising…
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
            <div style={{
              background: 'rgba(0,0,0,0.75)',
              borderRadius: '20px',
              padding: '28px 36px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px',
            }}>
              <Loader2 size={36} color="white" style={{ animation: 'spin 1s linear infinite' }} />
              <span style={{ color: '#fff', fontSize: '13px', fontWeight: 600, letterSpacing: '0.08em' }}>
                STARTING CAMERA…
              </span>
            </div>
            <button
              onClick={() => onCloseRef.current()}
              style={{
                marginTop: '8px',
                background: 'rgba(0,0,0,0.65)',
                border: '1px solid rgba(255,255,255,0.25)',
                borderRadius: '50px',
                color: '#fff',
                fontSize: '13px',
                padding: '10px 28px',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        ) : (
          // Scanning active — show viewfinder + controls
          <>
            {/* Top bar */}
            <div style={{
              position: 'absolute',
              top: 0, left: 0, right: 0,
              padding: '14px 18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'linear-gradient(to bottom, rgba(0,0,0,0.75), transparent)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--amber)' }}>
                <Camera size={18} />
                <span style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '0.07em' }}>BARCODE SCANNER</span>
              </div>
              <button
                onClick={() => onCloseRef.current()}
                style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: 'rgba(0,0,0,0.55)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Viewfinder frame — no box-shadow, no backdrop-filter */}
            <div style={{ position: 'relative', width: '68vw', maxWidth: 300, aspectRatio: '1' }}>
              {/* Corner markers only — avoid box-shadow that composites over camera */}
              <CornerMarkers />
              <div style={{
                position: 'absolute',
                top: '10%', left: '5%', right: '5%',
                height: '3px',
                background: 'var(--amber)',
                boxShadow: '0 0 12px var(--amber)',
                borderRadius: '4px',
                animation: 'scanline 2.5s ease-in-out infinite',
              }} />
            </div>

            <p style={{
              marginTop: '28px',
              color: 'rgba(255,255,255,0.75)',
              fontSize: '13px',
              fontWeight: 500,
              letterSpacing: '0.04em',
              textShadow: '0 1px 4px rgba(0,0,0,0.8)',
            }}>
              Align barcode within the frame
            </p>

            {/* Bottom controls */}
            <div style={{
              position: 'absolute',
              bottom: 0, left: 0, right: 0,
              padding: '24px 20px 36px',
              background: 'linear-gradient(to top, rgba(0,0,0,0.75), transparent)',
              display: 'flex',
              justifyContent: 'center',
              gap: '20px',
            }}>
              {hasTorch && (
                <button
                  onClick={toggleTorch}
                  style={{
                    width: 52, height: 52, borderRadius: '50%',
                    background: torchOn ? 'var(--amber)' : 'rgba(0,0,0,0.55)',
                    border: '1px solid rgba(255,255,255,0.25)',
                    color: torchOn ? '#000' : '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer',
                    // NO backdrop-filter here
                  }}
                >
                  {torchOn ? <Zap size={22} /> : <ZapOff size={22} />}
                </button>
              )}
              <button
                onClick={() => onCloseRef.current()}
                style={{
                  borderRadius: '50px',
                  padding: '0 32px',
                  height: 52,
                  background: 'rgba(0,0,0,0.55)',
                  border: '1px solid rgba(255,255,255,0.25)',
                  color: '#fff',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </>
        )}

        <style>{`
          @keyframes spin     { to { transform: rotate(360deg); } }
          @keyframes scanline { 0%,100% { top: 10%; opacity: 0.3; } 50% { top: 82%; opacity: 1; } }
        `}</style>
      </div>
    );
  }

  // ── Web platform ─────────────────────────────────────────────────────────
  return <WebScannerUI onSuccess={onSuccess} onClose={onClose} />;
};

// ─── Corner markers (SVG — no box-shadow, no backdrop-filter) ─────────────────
const CornerMarkers = () => (
  <svg
    viewBox="0 0 100 100"
    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
    fill="none"
    stroke="var(--amber)"
    strokeWidth="3"
    strokeLinecap="round"
  >
    {/* TL */}<polyline points="5,20 5,5 20,5" />
    {/* TR */}<polyline points="80,5 95,5 95,20" />
    {/* BL */}<polyline points="5,80 5,95 20,95" />
    {/* BR */}<polyline points="80,95 95,95 95,80" />
  </svg>
);

// ─── Web Scanner ──────────────────────────────────────────────────────────────
const WebScannerUI: React.FC<{ onSuccess: (text: string) => void; onClose: () => void }> = ({ onSuccess, onClose }) => {
  const [started, setStarted] = useState(false);
  const [error, setError]     = useState('');
  const successRef             = useRef(onSuccess);
  const resolvedRef            = useRef(false);
  useEffect(() => { successRef.current = onSuccess; }, [onSuccess]);

  useEffect(() => {
    let scanner: any = null;
    let mounted = true;

    const start = async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        const cameras = await Html5Qrcode.getCameras();
        if (!cameras?.length) { if (mounted) setError('No camera found.'); return; }
        const back = cameras.find(c =>
          c.label.toLowerCase().includes('back') ||
          c.label.toLowerCase().includes('rear') ||
          c.label.toLowerCase().includes('environment')
        );
        scanner = new Html5Qrcode('web-reader');
        await scanner.start(
          back ? back.id : cameras[cameras.length - 1].id,
          { fps: 24, qrbox: { width: 260, height: 260 }, aspectRatio: 1 },
          (decoded: string) => {
            if (resolvedRef.current || !mounted) return;
            resolvedRef.current = true;
            successRef.current(decoded.trim());
          },
          () => {}
        );
        if (mounted) setStarted(true);
      } catch (err) {
        if (mounted) setError('Could not access camera.');
      }
    };

    start();
    return () => {
      mounted = false;
      scanner?.stop().catch(() => {});
    };
  }, []);

  return (
    <div className="ov animate-fade-in" style={{ zIndex: 1000, background: 'rgba(0,0,0,0.95)' }}>
      <div className="modal animate-scale-in" style={{ maxWidth: 420, width: '95%', background: '#111', color: '#fff', border: '1px solid #333' }}>
        <div className="mhd" style={{ background: '#111', borderBottom: '1px solid #222', padding: '14px 18px' }}>
          <div className="mtit" style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--amber)', fontSize: '14px' }}>
            <Camera size={18} /><span>BARCODE SCANNER</span>
          </div>
          <button onClick={onClose} className="mcl" style={{ background: '#222', color: '#fff', borderRadius: '50%', width: 30, height: 30 }}>
            <X size={18} />
          </button>
        </div>
        <div style={{ padding: 16, background: '#111' }}>
          {error ? (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--red)' }}>{error}</div>
          ) : (
            <>
              <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', background: '#000' }}>
                <div id="web-reader" style={{ width: '100%' }} />
                {!started && (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000', color: 'var(--text2)', fontSize: 13 }}>
                    <Loader2 size={22} style={{ animation: 'spin 1s linear infinite', marginRight: 8 }} />Starting camera…
                  </div>
                )}
              </div>
              <p style={{ fontSize: 12, color: 'var(--text3)', textAlign: 'center', marginTop: 10 }}>
                Point camera at a QR or barcode
              </p>
            </>
          )}
          <button className="btn bsec bfull" style={{ marginTop: 12, background: '#222', color: '#fff', borderColor: '#333' }} onClick={onClose}>
            Close Scanner
          </button>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};
