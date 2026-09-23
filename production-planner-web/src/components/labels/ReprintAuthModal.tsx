import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  Alert,
  IconButton,
} from '@mui/material';
import {
  Lock as LockIcon,
  Backspace as BackspaceIcon,
  WarningAmber as WarningIcon,
} from '@mui/icons-material';

interface ReprintAuthModalProps {
  open: boolean;
  onClose: () => void;
  onAuthorize: (data: { supervisorPin: string; reviewedBy: string; reprintReason: string }) => void;
}

export const ReprintAuthModal: React.FC<ReprintAuthModalProps> = ({
  open,
  onClose,
  onAuthorize,
}) => {
  const [pin, setPin] = useState<string>('');
  const [reviewerName, setReviewerName] = useState<string>('Suresh Nair (Shift Supervisor)');
  const [reprintReason, setReprintReason] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const CORRECT_PIN = '1234';

  const handleKeyPress = (val: string) => {
    if (pin.length < 4) {
      const nextPin = pin + val;
      setPin(nextPin);
      setError(null);
    }
  };

  const handleDelete = () => {
    setPin(pin.slice(0, -1));
    setError(null);
  };

  const handleConfirm = () => {
    if (reprintReason.trim().length < 5) {
      setError('Reprint reason must be at least 5 characters long.');
      return;
    }
    if (!reviewerName.trim()) {
      setError('Supervisor / Reviewer name is required.');
      return;
    }
    if (pin !== CORRECT_PIN) {
      setError('Invalid Supervisor PIN. Access denied.');
      setPin('');
      return;
    }

    onAuthorize({
      supervisorPin: pin,
      reviewedBy: reviewerName.trim(),
      reprintReason: reprintReason.trim(),
    });
    setPin('');
    setError(null);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 700, textAlign: 'center', pb: 1 }}>
        Supervisor Reprint Authorization
      </DialogTitle>
      <DialogContent>
        <Alert
          severity="warning"
          icon={<WarningIcon />}
          sx={{ mb: 2, fontSize: '0.8125rem' }}
        >
          Selected sequence contains previously printed labels. ISO 13485 requires supervisor sign-off and audit trail recording for reprints.
        </Alert>

        {error && (
          <Alert severity="error" sx={{ mb: 2, fontSize: '0.8125rem' }}>
            {error}
          </Alert>
        )}

        {/* Supervisor Reviewer Name */}
        <TextField
          label="Supervisor / Reviewer Name"
          fullWidth
          size="small"
          value={reviewerName}
          onChange={(e) => setReviewerName(e.target.value)}
          sx={{ mb: 2 }}
        />

        {/* Mandatory Reprint Reason */}
        <TextField
          label="Mandatory Reprint Reason"
          multiline
          rows={2}
          fullWidth
          size="small"
          placeholder="e.g. Feed jam damaged sticker sheet, replacement required"
          value={reprintReason}
          onChange={(e) => setReprintReason(e.target.value)}
          sx={{ mb: 2 }}
        />

        {/* PIN Entry Area */}
        <Box sx={{ textAlign: 'center', my: 1 }}>
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 44,
              height: 44,
              borderRadius: '50%',
              backgroundColor: '#f1f5f9',
              color: '#0284c7',
              mb: 1,
            }}
          >
            <LockIcon />
          </Box>
          <Typography variant="body2" sx={{ fontWeight: 600, color: '#475569' }}>
            Enter 4-Digit Supervisor PIN
          </Typography>

          {/* Dots representation */}
          <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1.5, my: 1.5 }}>
            {[0, 1, 2, 3].map((i) => (
              <Box
                key={i}
                sx={{
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  border: '2px solid',
                  borderColor: i < pin.length ? 'primary.main' : '#cbd5e1',
                  backgroundColor: i < pin.length ? 'primary.main' : 'transparent',
                  transition: 'all 0.15s ease',
                }}
              />
            ))}
          </Box>

          {/* Numeric Keypad */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 1,
              maxWidth: 240,
              mx: 'auto',
            }}
          >
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0'].map((key, idx) => (
              <Button
                key={idx}
                disabled={!key}
                variant="outlined"
                onClick={() => handleKeyPress(key)}
                sx={{
                  height: 44,
                  fontSize: '1.125rem',
                  fontWeight: 600,
                  visibility: key ? 'visible' : 'hidden',
                  borderColor: '#e2e8f0',
                  color: '#0f172a',
                }}
              >
                {key}
              </Button>
            ))}
            <IconButton
              onClick={handleDelete}
              sx={{
                border: '1px solid #e2e8f0',
                borderRadius: 2,
                height: 44,
              }}
            >
              <BackspaceIcon sx={{ fontSize: 20 }} />
            </IconButton>
          </Box>
        </Box>
      </DialogContent>
      <DialogActions sx={{ p: 2, borderTop: '1px solid #e2e8f0' }}>
        <Button onClick={onClose} color="inherit">
          Cancel
        </Button>
        <Button
          variant="contained"
          color="warning"
          onClick={handleConfirm}
          disabled={pin.length !== 4 || reprintReason.trim().length < 5}
        >
          Authorize & Execute Reprint
        </Button>
      </DialogActions>
    </Dialog>
  );
};
