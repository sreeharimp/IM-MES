import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { ShieldCheck, Lock, Mail } from 'lucide-react';

interface LoginProps {
  onSuccess: () => void;
}

const Login: React.FC<LoginProps> = ({ onSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const normalizedEmail = email.toLowerCase().trim();

    if (isSignUp) {
      if (password !== confirmPassword) {
        setError('Passwords do not match');
        setLoading(false);
        return;
      }

      // Pre-check whitelist to enforce "Admin Permission Required"
      const { data: whitelistData, error: whitelistError } = await supabase
        .from('authorized_supervisors')
        .select('*')
        .eq('email', normalizedEmail)
        .maybeSingle();

      if (whitelistError || !whitelistData) {
        setError('Authorization Denied: This email has not been whitelisted by an Admin.');
        setLoading(false);
        return;
      }
    }

    const { error } = isSignUp 
      ? await supabase.auth.signUp({ email: normalizedEmail, password })
      : await supabase.auth.signInWithPassword({ email: normalizedEmail, password });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      onSuccess();
    }
  };

  return (
    <div className="login-overlay">
      <div className="login-card animate-fade-in">
        <div className="login-header">
          <div className="login-logo">
            <ShieldCheck size={32} color="var(--brand)" />
          </div>
          <h1>Production Console</h1>
          <p>{isSignUp ? 'New Supervisor Registration' : 'Supervisor Authentication Required'}</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="input-group">
            <Mail size={18} className="input-icon" />
            <input 
              type="email" 
              placeholder="Supervisor Email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          
          <div className="input-group">
            <Lock size={18} className="input-icon" />
            <input 
              type="password" 
              placeholder="Password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {isSignUp && (
            <div className="input-group">
              <Lock size={18} className="input-icon" />
              <input 
                type="password" 
                placeholder="Confirm Password" 
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
          )}

          {error && <div className="login-error">{error}</div>}

          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? 'Processing...' : isSignUp ? 'Create Account' : 'Sign In'}
          </button>

        <div style={{ textAlign: 'center', marginTop: '16px' }}>
          {!isSignUp ? (
            <button 
              type="button" 
              className="btn bsm" 
              style={{ background: 'transparent', border: 'none', color: 'var(--text3)', fontSize: '11px' }}
              onClick={() => setIsSignUp(true)}
            >
              Have authorization? Register here
            </button>
          ) : (
            <button 
              type="button" 
              className="btn bsm" 
              style={{ background: 'transparent', border: 'none', color: 'var(--brand)', textDecoration: 'underline' }}
              onClick={() => setIsSignUp(false)}
            >
              Wait, I have an account. Sign In
            </button>
          )}
        </div>
        </form>

        <div className="login-footer">
          <p>© 2026 Cyberpunk Industrial MES</p>
          <p style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '4px' }}>
            System ID: {window.location.hostname}
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
