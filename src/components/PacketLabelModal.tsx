import React from 'react';
import { Printer, QrCode, CheckCircle } from 'lucide-react';

interface PacketLabelModalProps {
  packetId: string;
  batchId: string;
  crateId: string;
  qty: number;
  onClose: () => void;
}

const PacketLabelModal: React.FC<PacketLabelModalProps> = ({ packetId, batchId, crateId, qty, onClose }) => {
  return (
    <div className="modal-overlay">
      <div className="modal-container animate-scale-in" style={{ width: '420px', overflow: 'hidden' }}>
        <div style={{ padding: '24px', textAlign: 'center', background: 'var(--green-bg)', borderBottom: '1px solid var(--green-dim)', color: 'var(--green)' }}>
          <CheckCircle size={40} style={{ marginBottom: '12px', margin: '0 auto' }} />
          <div className="modal-title" style={{ color: 'var(--green)', fontSize: '20px' }}>Packing Success</div>
          <div style={{ fontSize: '12px', opacity: 0.8, marginTop: '4px' }}>Standard Unit: 1,000 Pcs</div>
        </div>

        <div className="modal-body">
          {/* Label Preview */}
          <div style={{ 
            background: 'white', color: '#000', padding: '20px', borderRadius: '4px', 
            marginBottom: '24px', display: 'flex', gap: '20px', alignItems: 'center',
            boxShadow: '0 8px 30px rgba(0,0,0,0.4)', position: 'relative'
          }}>
            <div style={{ padding: '4px', border: '1px solid #ccc' }}>
              <QrCode size={80} color="#000" />
            </div>
            <div style={{ textAlign: 'left', flex: 1 }}>
              <div style={{ fontSize: '9px', color: '#888', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>Packet ID</div>
              <div style={{ fontWeight: 800, fontSize: '14px', marginBottom: '6px', fontFamily: 'var(--mono)' }}>{packetId}</div>
              
              <div style={{ fontSize: '9px', color: '#888', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>Traceability</div>
              <div style={{ fontSize: '11px', marginBottom: '2px' }}>Batch: {batchId}</div>
              <div style={{ fontSize: '11px' }}>Crate: {crateId}</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '24px' }}>
            <div style={{ background: 'var(--bg3)', padding: '12px', borderRadius: 'var(--r)', border: '1px solid var(--border)' }}>
              <div className="fl" style={{ marginBottom: '4px' }}>Net Qty</div>
              <div style={{ fontWeight: 700, fontFamily: 'var(--mono)', fontSize: '16px' }}>{qty.toLocaleString()}</div>
            </div>
            <div style={{ background: 'var(--bg3)', padding: '12px', borderRadius: 'var(--r)', border: '1px solid var(--border)' }}>
              <div className="fl" style={{ marginBottom: '4px' }}>Shift</div>
              <div style={{ fontWeight: 700, fontFamily: 'var(--mono)', fontSize: '16px' }}>SHIFT B</div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-primary" style={{ flex: 2 }} onClick={onClose}>
              Done
            </button>
            <button className="btn btn-outline" style={{ flex: 1 }}>
              <Printer size={16} /> Print
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PacketLabelModal;
