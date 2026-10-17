import React, { useState } from 'react';
import { Lock, Eye, EyeOff, ShieldCheck, Check, AlertCircle, LogOut, X, KeyRound } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose?: () => void;
  forced?: boolean;
  userEmail?: string;
  userName?: string;
  onSuccess?: () => void;
  onLogout?: () => void;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({
  isOpen,
  onClose,
  forced = false,
  userEmail,
  userName,
  onSuccess,
  onLogout,
}) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const isMinLength = newPassword.length >= 6;
  const isMatching = newPassword !== '' && newPassword === confirmPassword;
  const isValid = isMinLength && isMatching;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) {
      if (!isMinLength) setError('Password must be at least 6 characters long.');
      else if (!isMatching) setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 1. Update password in Supabase Auth
      const { data, error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        setError(updateError.message || 'Failed to update password.');
        setLoading(false);
        return;
      }

      // 2. Clear must_change_password flag in profiles
      const targetUserId = data.user?.id;
      if (targetUserId) {
        const { error: profileError } = await supabase
          .from('profiles')
          .update({
            must_change_password: false,
            revoked_reason: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', targetUserId);

        if (profileError) {
          console.warn('Profile flag update warning:', profileError.message);
        }
      }

      setSuccess(true);
      setTimeout(() => {
        setNewPassword('');
        setConfirmPassword('');
        setSuccess(false);
        if (onSuccess) onSuccess();
        if (onClose) onClose();
      }, 1200);
    } catch (err: any) {
      setError(err?.message || 'An unexpected error occurred while updating your password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="ov animate-fade-in"
      style={{
        zIndex: 9999,
        background: 'rgba(5, 11, 20, 0.85)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={(e) => {
        if (!forced && e.target === e.currentTarget && onClose) {
          onClose();
        }
      }}
    >
      <div
        className="modal animate-scale-in"
        style={{
          width: '100%',
          maxWidth: '440px',
          background: 'var(--card, #132238)',
          border: '1px solid var(--border, rgba(255, 255, 255, 0.12))',
          borderRadius: '16px',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5), 0 0 24px rgba(56, 189, 248, 0.15)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '24px 24px 16px',
            borderBottom: '1px solid var(--border, rgba(255, 255, 255, 0.08))',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            background: 'linear-gradient(180deg, rgba(56, 189, 248, 0.08) 0%, transparent 100%)',
          }}
        >
          <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '12px',
                background: forced ? 'rgba(234, 179, 8, 0.15)' : 'rgba(56, 189, 248, 0.15)',
                border: forced ? '1px solid rgba(234, 179, 8, 0.3)' : '1px solid rgba(56, 189, 248, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: forced ? '#eab308' : '#38bdf8',
                flexShrink: 0,
              }}
            >
              {forced ? <KeyRound size={22} /> : <Lock size={22} />}
            </div>
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: '18px',
                  fontWeight: 700,
                  color: 'var(--text, #ffffff)',
                  letterSpacing: '-0.3px',
                }}
              >
                {forced ? 'Password Reset Required' : 'Change Password'}
              </h2>
              <p
                style={{
                  margin: '4px 0 0',
                  fontSize: '12px',
                  color: 'var(--text2, #94a3b8)',
                }}
              >
                {forced
                  ? 'Your password was reset by an Administrator. Set a new password to proceed.'
                  : 'Update your account login password.'}
              </p>
            </div>
          </div>
          {!forced && onClose && (
            <button
              className="btn bsm bsec"
              onClick={onClose}
              style={{ padding: '6px', borderRadius: '8px', color: 'var(--text2)' }}
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ padding: '20px 24px 24px' }}>
          {/* User info banner */}
          <div
            style={{
              marginBottom: '18px',
              padding: '10px 14px',
              borderRadius: '8px',
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid var(--border, rgba(255, 255, 255, 0.08))',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '12px',
            }}
          >
            <span style={{ color: 'var(--text3, #64748b)' }}>Account:</span>
            <span style={{ fontWeight: 600, color: 'var(--text, #ffffff)', fontFamily: 'monospace' }}>
              {userEmail || userName || 'Current User'}
            </span>
          </div>

          {/* Error Banner */}
          {error && (
            <div
              style={{
                marginBottom: '16px',
                padding: '10px 12px',
                borderRadius: '8px',
                background: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#f87171',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          {/* Success Banner */}
          {success && (
            <div
              style={{
                marginBottom: '16px',
                padding: '10px 12px',
                borderRadius: '8px',
                background: 'rgba(34, 197, 94, 0.12)',
                border: '1px solid rgba(34, 197, 94, 0.3)',
                color: '#4ade80',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Check size={16} style={{ flexShrink: 0 }} />
              <span>Password updated successfully! Redirecting...</span>
            </div>
          )}

          {/* New Password Field */}
          <div style={{ marginBottom: '16px' }}>
            <label
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--text2, #94a3b8)',
                marginBottom: '6px',
              }}
            >
              New Password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showNewPassword ? 'text' : 'password'}
                className="fi"
                placeholder="Enter new password (min. 6 chars)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoFocus
                disabled={loading || success}
                style={{
                  width: '100%',
                  paddingRight: '40px',
                  boxSizing: 'border-box',
                }}
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text3, #64748b)',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Confirm Password Field */}
          <div style={{ marginBottom: '18px' }}>
            <label
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--text2, #94a3b8)',
                marginBottom: '6px',
              }}
            >
              Confirm New Password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                className="fi"
                placeholder="Re-enter new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading || success}
                style={{
                  width: '100%',
                  paddingRight: '40px',
                  boxSizing: 'border-box',
                }}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text3, #64748b)',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Live Validation Badges */}
          <div style={{ display: 'flex', gap: '12px', marginBottom: '22px', flexWrap: 'wrap' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '11px',
                color: isMinLength ? '#4ade80' : 'var(--text3, #64748b)',
              }}
            >
              {isMinLength ? <Check size={13} /> : <span style={{ width: 13, height: 13, borderRadius: '50%', border: '1px solid currentColor', display: 'inline-block' }} />}
              <span>At least 6 characters</span>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '11px',
                color: isMatching ? '#4ade80' : 'var(--text3, #64748b)',
              }}
            >
              {isMatching ? <Check size={13} /> : <span style={{ width: 13, height: 13, borderRadius: '50%', border: '1px solid currentColor', display: 'inline-block' }} />}
              <span>Passwords match</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '10px' }}>
            {!forced && onClose && (
              <button
                type="button"
                className="btn bsec"
                style={{ flex: 1 }}
                onClick={onClose}
                disabled={loading || success}
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              className="btn bpri"
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                fontWeight: 700,
              }}
              disabled={!isValid || loading || success}
            >
              {loading ? (
                <span>Updating Password...</span>
              ) : success ? (
                <>
                  <Check size={16} />
                  <span>Updated!</span>
                </>
              ) : (
                <>
                  <ShieldCheck size={16} />
                  <span>Save New Password</span>
                </>
              )}
            </button>
          </div>

          {/* Forced mode escape hatch (Sign Out) */}
          {forced && (
            <div style={{ textAlign: 'center', marginTop: '16px' }}>
              <button
                type="button"
                onClick={onLogout || (() => supabase.auth.signOut())}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text3, #64748b)',
                  fontSize: '11px',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 8px',
                }}
              >
                <LogOut size={12} />
                <span>Log out and exit</span>
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};

export default ChangePasswordModal;
