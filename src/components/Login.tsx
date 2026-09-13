import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Box, 
  Button, 
  TextField, 
  Typography, 
  Paper, 
  Container, 
  InputAdornment,
  Alert,
  CircularProgress
} from '@mui/material';
import { 
  AdminPanelSettings as ShieldCheck, 
  LockOutlined as Lock, 
  MailOutlined as Mail 
} from '@mui/icons-material';

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
    <Box sx={{ 
      minHeight: '100dvh', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      bgcolor: 'background.default',
      p: 2
    }}>
      <Container maxWidth="xs">
        <Paper elevation={3} sx={{ p: 4, borderRadius: 2, textAlign: 'center' }}>
          <Box sx={{ mb: 3 }}>
            <Box sx={{ 
              width: 64, 
              height: 64, 
              bgcolor: 'primary.main', 
              color: 'white', 
              borderRadius: '50%', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              mx: 'auto',
              mb: 2,
              boxShadow: 2
            }}>
              <ShieldCheck fontSize="large" />
            </Box>
            <Typography variant="h4" sx={{ fontWeight: 800, color: 'primary.main', letterSpacing: -1 }}>
              IM-MES
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Industrial Execution Portal
            </Typography>
          </Box>

          <Typography variant="h6" sx={{ mb: 1, fontWeight: 700 }}>
            System Authentication
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 3 }}>
            {isSignUp ? 'New User Registration' : 'Secure Login Required'}
          </Typography>

          <Box component="form" onSubmit={handleSubmit} sx={{ mt: 1 }}>
            <TextField
              margin="normal"
              required
              fullWidth
              label="System Email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <Mail fontSize="small" />
                    </InputAdornment>
                  ),
                }
              }}
            />
            <TextField
              margin="normal"
              required
              fullWidth
              label="Password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <Lock fontSize="small" />
                    </InputAdornment>
                  ),
                }
              }}
            />

            {isSignUp && (
              <TextField
                margin="normal"
                required
                fullWidth
                label="Confirm Password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <Lock fontSize="small" />
                      </InputAdornment>
                    ),
                  }
                }}
              />
            )}

            {error && <Alert severity="error" sx={{ mt: 2, mb: 1 }}>{error}</Alert>}

            <Button
              type="submit"
              fullWidth
              variant="contained"
              disabled={loading}
              sx={{ mt: 3, mb: 2, height: 48, fontWeight: 700 }}
            >
              {loading ? <CircularProgress size={24} color="inherit" /> : (isSignUp ? 'Create Account' : 'Sign In')}
            </Button>

            <Button
              fullWidth
              variant="text"
              size="small"
              onClick={() => setIsSignUp(!isSignUp)}
              sx={{ textTransform: 'none', color: 'text.secondary' }}
            >
              {isSignUp ? 'Already have an account? Sign In' : 'Need authorization? Register here'}
            </Button>
          </Box>

          <Box sx={{ mt: 4, pt: 2, borderTop: 1, borderColor: 'divider' }}>
            <Typography variant="caption" color="text.secondary">
              © 2026 IM-MES Industrial Systems
            </Typography>
          </Box>
        </Paper>
      </Container>
    </Box>
  );
};

export default Login;
