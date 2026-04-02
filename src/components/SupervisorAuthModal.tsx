import React, { useState } from 'react';
import { Lock, Delete, AlertTriangle, X } from 'lucide-react';

interface SupervisorAuthModalProps {
  operation: string;
  warning?: string;
  onClose: () => void;
  onSuccess: () => void;
}

const SupervisorAuthModal: React.FC<SupervisorAuthModalProps> = ({ operation, warning, onClose, onSuccess }) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const CORRECT_PIN = '1234';

  const handleKeyPress = (val: string) => {
    if (pin.length < 4) {
      const newPin = pin + val;
      setPin(newPin);
      if (newPin.length === 4) {
        if (newPin === CORRECT_PIN) {
          onSuccess();
        } else {
          setError(true);
          setTimeout(() => {
            setPin('');
            setError(false);
          }, 1000);
        }
      }
    }
  };

  const handleDelete = () => {
    setPin(pin.slice(0, -1));
  };

  return (
    <div className="ov">
      <div className="modal animate-scale-in" style={{ width: '380px' }}>
        <div className="mhd">
          <div className="mtit">Supervisor Verification</div>
          <button onClick={onClose} className="mcl"><X size={20} /></button>
        </div>

        <div className="mbd" style={{ textAlign: 'center' }}>
          <div style={{ marginBottom: '20px' }}>
            <div style={{ 
              width: '56px', height: '56px', borderRadius: '50%', background: 'var(--bg3)', 
              display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px',
              border: `1px solid ${error ? 'var(--red-dim)' : 'var(--green-dim)'}`,
              color: error ? 'var(--red)' : 'var(--green)'
            }}>
              <Lock size={24} />
            </div>
            <div style={{ color: 'var(--text2)', fontSize: '12px' }}>
              Authorize: <span style={{ color: 'var(--text)', fontWeight: 600 }}>{operation}</span>
            </div>
            
            {warning && (
              <div style={{ 
                marginTop: '12px', padding: '8px 12px', background: 'var(--red-bg)', 
                border: '1px solid var(--red-dim)', borderRadius: 'var(--r)',
                color: 'var(--red)', fontSize: '11px', fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center'
              }}>
                <AlertTriangle size={14} />
                {warning}
              </div>
            )}
          </div>

          <div className="msec" style={{ borderTop: 'none' }}>Enter 4-Digit PIN</div>

          <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginBottom: '24px', marginTop: '10px' }}>
            {[...Array(4)].map((_, i) => (
              <div key={i} style={{
                width: '12px', height: '12px', borderRadius: '50%',
                background: i < pin.length ? (error ? 'var(--red)' : 'var(--green)') : 'var(--bg4)',
                border: `1px solid ${i < pin.length ? (error ? 'var(--red-dim)' : 'var(--green-dim)') : 'var(--border2)'}`,
                transition: 'all 0.15s ease'
              }} />
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'delete'].map((key, i) => (
              <button
                key={i}
                disabled={!key}
                onClick={() => key === 'delete' ? handleDelete() : handleKeyPress(key)}
                className="btn bsec"
                style={{
                  height: '52px', fontSize: '18px', fontWeight: 600,
                  opacity: key ? 1 : 0,
                  background: key === 'delete' ? 'var(--red-bg)' : '',
                  color: key === 'delete' ? 'var(--red)' : '',
                  borderColor: key === 'delete' ? 'var(--red-dim)' : ''
                }}
              >
                {key === 'delete' ? <Delete size={20} /> : key}
              </button>
            ))}
          </div>

          <button 
            className="btn bsec" 
            style={{ marginTop: '20px', width: '100%', borderColor: 'transparent' }}
            onClick={onClose}
          >
            Cancel Operation
          </button>
        </div>
      </div>
    </div>
  );
};

export default SupervisorAuthModal;
