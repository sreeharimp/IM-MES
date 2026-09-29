import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Alert,
  Typography,
} from '@mui/material';
import { Security as SecurityIcon } from '@mui/icons-material';

interface ReprintAuthModalProps {
  open: boolean;
  onClose: () => void;
  onAuthorize: (data: {
    supervisorPin: string;
    reviewedBy: string;
    reprintReason: string;
  }) => void;
}

export const ReprintAuthModal: React.FC<ReprintAuthModalProps> = ({
  open,
  onClose,
  onAuthorize,
}) => {
  const [pin, setPin] = useState<string>('');
  const [reviewer, setReviewer] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const handleAuthorize = () => {
    if (pin !== '1234') {
      setError('Invalid supervisor PIN. Enter 1234 for demo.');
      return;
    }

    if (!reviewer.trim()) {
      setError('Reviewer name is required.');
      return;
    }

    if (!reason.trim() || reason.trim().length < 5) {
      setError('Reprint justification must be at least 5 characters.');
      return;
    }

    setError(null);
    onAuthorize({
      supervisorPin: pin,
      reviewedBy: reviewer.trim(),
      reprintReason: reason.trim(),
    });

    setPin('');
    setReviewer('');
    setReason('');
  };

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="xs" 
      fullWidth
      PaperProps={{
        sx: {
          bgcolor: 'var(--bg2, #141720)',
          border: '1px solid var(--border, #2e3340)',
          backgroundImage: 'none',
        }
      }}
    >
      <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1, color: 'var(--text, #e2e6f0)' }}>
        <SecurityIcon color="warning" />
        Supervisor Reprint Sign-Off
      </DialogTitle>
      <DialogContent sx={{ pt: 2 }}>
        <Typography variant="body2" sx={{ color: 'var(--text2, #8a92a8)', mb: 2 }}>
          Reprinting previously generated crate labels requires supervisor sign-off and an audit log.
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <TextField
          label="Supervisor PIN"
          type="password"
          fullWidth
          size="small"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          helperText="Default Demo PIN: 1234"
          sx={{ mb: 2 }}
        />

        <TextField
          label="Supervisor Name"
          fullWidth
          size="small"
          value={reviewer}
          onChange={(e) => setReviewer(e.target.value)}
          placeholder="e.g. Quality Manager"
          sx={{ mb: 2 }}
        />

        <TextField
          label="Reprint Reason (Mandatory)"
          multiline
          rows={2}
          fullWidth
          size="small"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Printer paper jam, damaged barcode"
        />
      </DialogContent>
      <DialogActions sx={{ p: 2, borderTop: '1px solid var(--border, #2e3340)' }}>
        <Button onClick={onClose} color="inherit">
          Cancel
        </Button>
        <Button
          variant="contained"
          color="warning"
          onClick={handleAuthorize}
          disabled={!pin || !reviewer || reason.trim().length < 5}
        >
          Sign-Off & Reprint
        </Button>
      </DialogActions>
    </Dialog>
  );
};
