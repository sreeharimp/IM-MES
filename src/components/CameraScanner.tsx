import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Camera, X, Loader2, AlertTriangle, RefreshCw, Zap, ZapOff, FlipHorizontal, Sparkles } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { BarcodeScanner, BarcodeFormat } from '@capacitor-mlkit/barcode-scanning';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

interface CameraScannerProps {
  onSuccess: (text: string) => void;
  onClose: () => void;
}

export const CameraScanner: React.FC<CameraScannerProps> = ({ onSuccess, onClose }) => {
  const isNative = Capacitor.isNativePlatform();

  const [status, setStatus] = useState<'starting' | 'scanning' | 'error' | 'permission_denied'>('starting');
  const [errorMessage, setErrorMessage] = useState('');
  const [hasTorch, setHasTorch] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [mlKitAvailable, setMlKitAvailable] = useState<boolean | null>(null);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const successRef = useRef(onSuccess);
  const closeRef = useRef(onClose);
  const isResolvedRef = useRef(false);
  const hasTriedMlKitRef = useRef(false);
  const containerId = 'interactive-barcode-reader';

  useEffect(() => {
    successRef.current = onSuccess;
    closeRef.current = onClose;
  }, [onSuccess, onClose]);

  // High-Speed Google ML Kit Code Scanner
  const tryMlKitScan = useCallback(async () => {
    if (!isNative) return false;

    try {
      // 1. Check if Google Barcode Scanner module is available
      const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
      setMlKitAvailable(available);

      if (!available) {
        console.log('Google Barcode Scanner module not available yet, initiating background install...');
        await BarcodeScanner.installGoogleBarcodeScannerModule().catch(() => {});
        return false;
      }

      // 2. Launch Google ML Kit Code Scanner
      const result = await BarcodeScanner.scan({
        formats: [
          BarcodeFormat.QrCode,
          BarcodeFormat.Code128,
          BarcodeFormat.Code39,
          BarcodeFormat.Ean13,
          BarcodeFormat.Ean8,
          BarcodeFormat.UpcA,
          BarcodeFormat.UpcE,
        ],
      });

      if (result.barcodes && result.barcodes.length > 0) {
        const val = result.barcodes[0].displayValue || result.barcodes[0].rawValue;
        if (val) {
          if (navigator.vibrate) navigator.vibrate([50, 30, 50]);
          successRef.current(val.trim());
          return true;
        }
      }

      // User closed/cancelled Google scanner UI
      closeRef.current();
      return true;
    } catch (err: any) {
      const msg = String(err?.message || err);
      if (msg.toLowerCase().includes('cancel')) {
        closeRef.current();
        return true;
      }
      console.warn('Google ML Kit Code Scanner error, falling back to camera stream:', err);
      return false;
    }
  }, [isNative]);

  // In-App Camera Scanner via Html5Qrcode
  const startInAppScanner = useCallback(async (facing: 'environment' | 'user') => {
    setStatus('starting');
    setErrorMessage('');
    isResolvedRef.current = false;

    // Stop any previous running scanner
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
      } catch (e) {
        console.warn('Error stopping previous in-app scanner:', e);
      }
    }

    try {
      const scanner = new Html5Qrcode(containerId, {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.DATA_MATRIX,
        ],
        verbose: false,
      });

      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: facing },
        {
          fps: 24,
          qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
            const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
            const size = Math.max(220, Math.floor(minEdge * 0.72));
            return { width: size, height: size };
          },
          aspectRatio: 1.0,
        },
        (decodedText: string) => {
          if (isResolvedRef.current) return;
          isResolvedRef.current = true;

          if (navigator.vibrate) navigator.vibrate([50, 30, 50]);

          scanner.stop().then(() => {
            successRef.current(decodedText.trim());
          }).catch(() => {
            successRef.current(decodedText.trim());
          });
        },
        () => {}
      );

      setStatus('scanning');

      // Check torch capability
      try {
        const videoElem = document.querySelector(`#${containerId} video`) as HTMLVideoElement | null;
        if (videoElem && videoElem.srcObject) {
          const stream = videoElem.srcObject as MediaStream;
          const track = stream.getVideoTracks()[0];
          const capabilities: any = track?.getCapabilities?.() || {};
          if (capabilities.torch) {
            setHasTorch(true);
          }
        }
      } catch (e) {}
    } catch (err: any) {
      console.error('In-app scanner start error:', err);
      const strErr = String(err?.message || err);

      if (
        strErr.toLowerCase().includes('permission') ||
        strErr.toLowerCase().includes('notallowed') ||
        strErr.toLowerCase().includes('denied')
      ) {
        setStatus('permission_denied');
        setErrorMessage('Camera access was blocked. Please grant camera permission in Android Settings.');
      } else {
        setStatus('error');
        setErrorMessage(strErr || 'Could not start camera feed.');
      }
    }
  }, []);

  // Initial scan launch
  useEffect(() => {
    let active = true;

    const init = async () => {
      if (isNative && !hasTriedMlKitRef.current) {
        hasTriedMlKitRef.current = true;
        const handledByMlKit = await tryMlKitScan();
        if (handledByMlKit) {
          return;
        }
      }

      // If ML Kit not available or on web, start in-app camera
      if (active) {
        setTimeout(() => {
          if (active) startInAppScanner(facingMode);
        }, 100);
      }
    };

    init();

    return () => {
      active = false;
      if (scannerRef.current) {
        try {
          if (scannerRef.current.isScanning) {
            scannerRef.current.stop().catch(() => {});
          }
        } catch (e) {}
      }
    };
  }, [isNative, facingMode, tryMlKitScan, startInAppScanner]);

  const toggleTorch = async () => {
    try {
      const videoElem = document.querySelector(`#${containerId} video`) as HTMLVideoElement | null;
      if (videoElem && videoElem.srcObject) {
        const stream = videoElem.srcObject as MediaStream;
        const track = stream.getVideoTracks()[0];
        const nextState = !torchOn;
        await track.applyConstraints({
          advanced: [{ torch: nextState } as any],
        });
        setTorchOn(nextState);
      }
    } catch (err) {
      console.warn('Torch toggle failed:', err);
    }
  };

  const toggleFacing = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  const handleLaunchMlKit = async () => {
    if (scannerRef.current && scannerRef.current.isScanning) {
      await scannerRef.current.stop().catch(() => {});
    }
    const handled = await tryMlKitScan();
    if (!handled) {
      startInAppScanner(facingMode);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 999999,
        background: '#000000',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        color: '#ffffff',
        fontFamily: 'var(--sans, system-ui)',
      }}
    >
      {/* Top Bar */}
      <div
        style={{
          width: '100%',
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.85), transparent)',
          zIndex: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#3399ff' }}>
          <Camera size={20} />
          <span style={{ fontSize: '14px', fontWeight: 800, letterSpacing: '0.06em' }}>
            BARCODE SCANNER
          </span>
        </div>

        <button
          onClick={onClose}
          style={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.15)',
            border: 'none',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <X size={20} />
        </button>
      </div>

      {/* Main Viewport Container */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: '440px',
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          padding: '0 16px',
        }}
      >
        {/* Html5Qrcode video container */}
        <div
          id={containerId}
          style={{
            width: '100%',
            borderRadius: '24px',
            overflow: 'hidden',
            background: '#0a1929',
            position: 'relative',
          }}
        />

        {/* Loading overlay */}
        {status === 'starting' && (
          <div
            style={{
              position: 'absolute',
              inset: '16px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(10, 25, 41, 0.95)',
              borderRadius: '24px',
              gap: '14px',
              zIndex: 5,
            }}
          >
            <Loader2 size={42} color="#3399ff" className="animate-spin" />
            <div style={{ fontSize: '15px', fontWeight: 800, color: '#ffffff' }}>
              Starting Camera...
            </div>
            <div style={{ fontSize: '12px', color: '#6f7e8c', textAlign: 'center', maxWidth: '240px' }}>
              {isNative ? 'Starting high-speed scanner' : 'Opening camera feed'}
            </div>
          </div>
        )}

        {/* Permission Denied screen */}
        {status === 'permission_denied' && (
          <div
            style={{
              position: 'absolute',
              inset: '16px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#132f4c',
              borderRadius: '24px',
              padding: '24px',
              textAlign: 'center',
              zIndex: 5,
            }}
          >
            <AlertTriangle size={48} color="#ffa726" style={{ marginBottom: '14px' }} />
            <div style={{ fontSize: '17px', fontWeight: 800, marginBottom: '8px', color: '#ffffff' }}>
              Camera Permission Required
            </div>
            <div style={{ fontSize: '13px', color: '#b2bac2', lineHeight: 1.5, marginBottom: '24px' }}>
              {errorMessage}
            </div>
            <button
              onClick={() => startInAppScanner(facingMode)}
              style={{
                background: '#3399ff',
                color: '#ffffff',
                border: 'none',
                borderRadius: '12px',
                padding: '12px 24px',
                fontSize: '14px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <RefreshCw size={16} /> Try Again
            </button>
          </div>
        )}

        {/* Error Screen */}
        {status === 'error' && (
          <div
            style={{
              position: 'absolute',
              inset: '16px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#132f4c',
              borderRadius: '24px',
              padding: '24px',
              textAlign: 'center',
              zIndex: 5,
            }}
          >
            <AlertTriangle size={48} color="#f44336" style={{ marginBottom: '14px' }} />
            <div style={{ fontSize: '17px', fontWeight: 800, marginBottom: '8px', color: '#ffffff' }}>
              Could Not Open Camera
            </div>
            <div style={{ fontSize: '13px', color: '#b2bac2', lineHeight: 1.5, marginBottom: '24px' }}>
              {errorMessage}
            </div>
            <button
              onClick={() => startInAppScanner(facingMode)}
              style={{
                background: '#3399ff',
                color: '#ffffff',
                border: 'none',
                borderRadius: '12px',
                padding: '12px 24px',
                fontSize: '14px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <RefreshCw size={16} /> Retry Camera
            </button>
          </div>
        )}
      </div>

      {/* Bottom Controls */}
      <div
        style={{
          width: '100%',
          padding: '18px 24px 34px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '14px',
          background: 'linear-gradient(to top, rgba(0,0,0,0.85), transparent)',
          zIndex: 10,
        }}
      >
        {/* ML Kit Quick Launch Button (on native) */}
        {isNative && (
          <button
            onClick={handleLaunchMlKit}
            style={{
              background: 'linear-gradient(135deg, #1976d2, #0d47a1)',
              border: '1px solid #3399ff',
              borderRadius: '24px',
              padding: '8px 18px',
              color: '#ffffff',
              fontSize: '13px',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 4px 14px rgba(25, 118, 210, 0.4)',
              cursor: 'pointer',
            }}
          >
            <Sparkles size={16} color="#ffd700" />
            <span>{mlKitAvailable ? '⚡ Google ML Kit Active' : '⚡ Launch Google ML Kit'}</span>
          </button>
        )}

        <div style={{ fontSize: '12px', color: '#b2bac2', fontWeight: 500 }}>
          Align barcode or QR code inside the box
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          {/* Torch toggle */}
          {hasTorch && (
            <button
              onClick={toggleTorch}
              style={{
                width: 48,
                height: 48,
                borderRadius: '50%',
                background: torchOn ? '#ffa726' : 'rgba(255,255,255,0.15)',
                color: torchOn ? '#000000' : '#ffffff',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              {torchOn ? <Zap size={22} /> : <ZapOff size={22} />}
            </button>
          )}

          {/* Flip camera */}
          <button
            onClick={toggleFacing}
            style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.15)',
              color: '#ffffff',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <FlipHorizontal size={22} />
          </button>

          {/* Cancel */}
          <button
            onClick={onClose}
            style={{
              height: 48,
              padding: '0 28px',
              borderRadius: '24px',
              background: 'rgba(255,255,255,0.2)',
              color: '#ffffff',
              border: 'none',
              fontSize: '14px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
export default CameraScanner;
