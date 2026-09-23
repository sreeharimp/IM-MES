import React, { useState } from 'react';
import { Boxes, Lock, Mail, Eye, EyeOff, ShieldCheck, LogIn, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface LoginScreenProps {
  onLogin: (name: string, email: string) => void;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password) {
      setError('Please enter both email and password.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password: password,
      });

      if (authError) {
        setError(authError.message || 'Authentication failed. Please check your credentials.');
        setLoading(false);
        return;
      }

      if (!data.user) {
        setError('No user account returned.');
        setLoading(false);
        return;
      }

      // Fetch verified user profile to get full name
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, role, employee_code')
        .eq('id', data.user.id)
        .maybeSingle();

      const packerName =
        profile?.full_name ||
        data.user.user_metadata?.full_name ||
        normalizedEmail.split('@')[0];

      localStorage.setItem('packing_operator_name', packerName);
      localStorage.setItem('packing_operator_email', normalizedEmail);

      onLogin(packerName, normalizedEmail);
    } catch (err: any) {
      setError(err?.message || 'An unexpected error occurred during sign-in.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 20px',
        background: 'var(--bg, #0a1929)',
        color: 'var(--text, #ffffff)',
      }}
    >
      {/* Brand Header */}
      <div style={{ textAlign: 'center', marginBottom: '32px' }}>
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: '20px',
            background: 'linear-gradient(135deg, #3399ff, #0059b2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
            boxShadow: '0 8px 32px rgba(51, 153, 255, 0.35)',
          }}
        >
          <Boxes size={38} color="#ffffff" />
        </div>
        <div
          style={{
            fontSize: '26px',
            fontWeight: 900,
            letterSpacing: '-0.5px',
            color: 'var(--text, #ffffff)',
          }}
        >
          IM-Packing
        </div>
        <div
          style={{
            fontSize: '13px',
            color: 'var(--text3, #6f7e8c)',
            marginTop: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
          }}
        >
          <ShieldCheck size={14} color="#3399ff" />
          Secure Packing Station Access
        </div>
      </div>

      {/* Login Card */}
      <form
        onSubmit={handleSubmit}
        style={{
          width: '100%',
          maxWidth: '380px',
          background: 'var(--bg2, #132f4c)',
          borderRadius: '24px',
          border: '1.5px solid var(--border2, #3399ff)',
          padding: '30px 24px',
          boxShadow: '0 16px 48px rgba(0, 0, 0, 0.45)',
        }}
      >
        <div style={{ marginBottom: '22px' }}>
          <div style={{ fontSize: '18px', fontWeight: 800 }}>Sign In</div>
          <div style={{ fontSize: '12px', color: 'var(--text3, #6f7e8c)', marginTop: '2px' }}>
            Enter your credentials to record packed boxes under your name
          </div>
        </div>

        {error && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: 'rgba(244, 67, 54, 0.15)',
              border: '1px solid rgba(244, 67, 54, 0.4)',
              borderRadius: '12px',
              padding: '10px 14px',
              marginBottom: '18px',
              fontSize: '13px',
              color: '#ff6b6b',
              lineHeight: 1.35,
            }}
          >
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {/* Email Field */}
        <div style={{ marginBottom: '16px' }}>
          <label
            style={{
              fontSize: '11px',
              fontWeight: 800,
              color: 'var(--text2, #b2bac2)',
              display: 'block',
              marginBottom: '6px',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            Email Address
          </label>
          <div style={{ position: 'relative' }}>
            <div
              style={{
                position: 'absolute',
                left: '14px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text3, #6f7e8c)',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <Mail size={18} />
            </div>
            <input
              type="email"
              autoComplete="email"
              autoCapitalize="none"
              placeholder="e.g. user@agneypolysoft.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError(null);
              }}
              style={{
                width: '100%',
                height: '50px',
                paddingLeft: '44px',
                paddingRight: '14px',
                fontSize: '15px',
                borderRadius: '12px',
                background: 'var(--bg, #0a1929)',
                border: '1.5px solid var(--border, #1e4976)',
                color: '#ffffff',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>

        {/* Password Field */}
        <div style={{ marginBottom: '24px' }}>
          <label
            style={{
              fontSize: '11px',
              fontWeight: 800,
              color: 'var(--text2, #b2bac2)',
              display: 'block',
              marginBottom: '6px',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            Password
          </label>
          <div style={{ position: 'relative' }}>
            <div
              style={{
                position: 'absolute',
                left: '14px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text3, #6f7e8c)',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <Lock size={18} />
            </div>
            <input
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
              }}
              style={{
                width: '100%',
                height: '50px',
                paddingLeft: '44px',
                paddingRight: '44px',
                fontSize: '15px',
                borderRadius: '12px',
                background: 'var(--bg, #0a1929)',
                border: '1.5px solid var(--border, #1e4976)',
                color: '#ffffff',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={{
                position: 'absolute',
                right: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'transparent',
                border: 'none',
                color: 'var(--text3, #6f7e8c)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                padding: '4px',
              }}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading}
          style={{
            width: '100%',
            height: '52px',
            borderRadius: '14px',
            border: 'none',
            background: loading ? '#1e4976' : 'var(--blue, #3399ff)',
            color: '#ffffff',
            fontSize: '16px',
            fontWeight: 800,
            cursor: loading ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            boxShadow: '0 4px 16px rgba(51, 153, 255, 0.4)',
            transition: 'background 0.15s ease',
          }}
        >
          {loading ? (
            <span>Signing in...</span>
          ) : (
            <>
              <LogIn size={20} />
              <span>Secure Sign In</span>
            </>
          )}
        </button>
      </form>

      <div
        style={{
          marginTop: '28px',
          fontSize: '11px',
          color: 'var(--text3, #6f7e8c)',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
        }}
      >
        <div>IM Industrial MES - Standalone Packing App</div>
        <div style={{ color: 'var(--text3, #6f7e8c)', opacity: 0.7 }}>
          Box packing records are permanently attributed to your account
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;
