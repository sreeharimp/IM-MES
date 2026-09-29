import React from 'react';
import { Printer, CheckCircle, X, Layers } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import type { Packet } from '../types';
import { printPacketLabel, formatDateDMY } from '../utils/printService';

interface PacketLabelPrintModalProps {
  packet: Packet;
  onClose: () => void;
  onPackNext?: () => void;
  remainingQty?: number;
  supervisorName?: string;
  isReprint?: boolean;
}

const PacketLabelPrintModal: React.FC<PacketLabelPrintModalProps> = ({
  packet,
  onClose,
  onPackNext,
  remainingQty = 0,
  supervisorName,
  isReprint = false,
}) => {
  const handlePrint = () => {
    printPacketLabel(packet, isReprint, supervisorName);
  };

  const formattedDate = formatDateDMY(packet.packedAt);
  const formattedTime = new Date(packet.packedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="ov animate-fade-in" style={{ zIndex: 10005 }}>
      <div className="modal animate-scale-in" style={{ width: '480px', maxWidth: '95vw', overflow: 'hidden' }}>
        {/* Modal Header */}
        <div style={{
          padding: '16px 20px',
          background: 'var(--bg2)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              background: 'var(--green-bg)',
              color: 'var(--green)',
              borderRadius: '8px',
              padding: '6px',
              display: 'flex'
            }}>
              <CheckCircle size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '15px' }}>
                {isReprint ? 'Reprint Packet Label' : 'Packet Successfully Created'}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text3)' }}>
                Box unit ready for warehouse & despatch
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text3)',
              cursor: 'pointer',
              padding: '4px'
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div className="mbd" style={{ padding: '20px' }}>
          {/* Visual Physical Label Preview Card */}
          <div style={{
            background: '#ffffff',
            color: '#111827',
            padding: '20px',
            borderRadius: '8px',
            border: '2px dashed #9ca3af',
            marginBottom: '20px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)',
          }}>
            {/* Label Header */}
            <div style={{ borderBottom: '2px solid #111827', paddingBottom: '8px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: '15px', fontWeight: 900, letterSpacing: '0.05em', color: '#111827' }}>
                  IM-MES PACKING SLIP
                </div>
                <div style={{ fontSize: '10px', color: '#4b5563', fontWeight: 600 }}>
                  QUALITY VERIFIED & SEALED
                </div>
              </div>
              <div style={{ background: '#111827', color: '#ffffff', padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 800 }}>
                SHIFT {packet.shiftId || 'A'}
              </div>
            </div>

            {/* Label Body */}
            <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', marginBottom: '12px' }}>
              <div style={{
                background: '#ffffff',
                padding: '6px',
                border: '1px solid #d1d5db',
                borderRadius: '4px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center'
              }}>
                <QRCodeSVG value={packet.id} size={90} level="M" />
                <div style={{ fontSize: '8px', fontWeight: 700, marginTop: '4px', color: '#4b5563' }}>
                  SCAN UNIT
                </div>
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '10px', color: '#6b7280', fontWeight: 700, textTransform: 'uppercase' }}>
                  Product
                </div>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#111827', lineHeight: 1.2, marginBottom: '2px' }}>
                  {packet.productName}
                </div>
                {packet.productCode && (
                  <div style={{ fontSize: '11px', color: '#374151', fontFamily: 'monospace', fontWeight: 600, marginBottom: '6px' }}>
                    Code: {packet.productCode}
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginTop: '6px' }}>
                  <div>
                    <div style={{ fontSize: '9px', color: '#6b7280', fontWeight: 700, textTransform: 'uppercase' }}>Batch</div>
                    <div style={{ fontSize: '12px', fontWeight: 800, fontFamily: 'monospace', color: '#4f46e5' }}>
                      {packet.batchId.split('-')[0]}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '9px', color: '#6b7280', fontWeight: 700, textTransform: 'uppercase' }}>Pack Qty</div>
                    <div style={{ fontSize: '14px', fontWeight: 900, fontFamily: 'monospace', color: '#16a34a' }}>
                      {packet.quantity.toLocaleString()} <span style={{ fontSize: '9px', fontWeight: 500 }}>pcs</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Crate Source Traceability Section */}
            <div style={{
              background: '#f3f4f6',
              borderRadius: '6px',
              padding: '8px 10px',
              border: '1px solid #e5e7eb',
              fontSize: '11px',
              marginBottom: '10px'
            }}>
              <div style={{ fontWeight: 800, fontSize: '10px', color: '#374151', textTransform: 'uppercase', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Layers size={12} /> Crate Traceability Breakdown:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {packet.crateSources && packet.crateSources.length > 0 ? (
                  packet.crateSources.map((s, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'monospace', fontSize: '11px', color: '#1f2937' }}>
                      <span>Bin #{s.binNumber} <span style={{ color: '#6b7280', fontSize: '10px' }}>({s.crateId.slice(-8)})</span></span>
                      <strong>{s.qty.toLocaleString()} pcs</strong>
                    </div>
                  ))
                ) : (
                  <div style={{ color: '#6b7280', fontSize: '10px' }}>Standard single crate fulfillment</div>
                )}
              </div>
            </div>

            {/* Label Footer */}
            <div style={{
              borderTop: '1px solid #e5e7eb',
              paddingTop: '6px',
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '10px',
              color: '#4b5563'
            }}>
              <div>
                <span style={{ fontWeight: 700 }}>ID:</span> <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#111827' }}>{packet.id}</span>
              </div>
              <div>
                {formattedDate} {formattedTime}
              </div>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '8px',
            marginBottom: '20px'
          }}>
            <div style={{ background: 'var(--bg3)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '10px', color: 'var(--text3)', textTransform: 'uppercase', fontWeight: 700 }}>Total Qty</div>
              <div style={{ fontSize: '16px', fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--green)' }}>
                {packet.quantity.toLocaleString()}
              </div>
            </div>
            <div style={{ background: 'var(--bg3)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '10px', color: 'var(--text3)', textTransform: 'uppercase', fontWeight: 700 }}>Crates Used</div>
              <div style={{ fontSize: '16px', fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--blue)' }}>
                {packet.crateSources?.length || 1}
              </div>
            </div>
            <div style={{ background: 'var(--bg3)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '10px', color: 'var(--text3)', textTransform: 'uppercase', fontWeight: 700 }}>Packed By</div>
              <div style={{ fontSize: '13px', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {packet.packedBy || supervisorName || 'Operator'}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {!isReprint && onPackNext && remainingQty > 0 ? (
              <button
                type="button"
                className="btn"
                style={{
                  background: 'linear-gradient(135deg, #16a34a, #15803d)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '12px',
                  padding: '12px 16px',
                  fontSize: '14px',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(22, 163, 74, 0.4)',
                }}
                onClick={onPackNext}
              >
                <span>📦 Pack Next Box ({remainingQty.toLocaleString()} pcs left) ➔</span>
              </button>
            ) : null}

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                className="btn bpri"
                style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', height: '42px' }}
                onClick={handlePrint}
              >
                <Printer size={16} />
                Print Label
              </button>
              <button
                className="btn bsec"
                style={{ flex: 1, height: '42px' }}
                onClick={onClose}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PacketLabelPrintModal;
