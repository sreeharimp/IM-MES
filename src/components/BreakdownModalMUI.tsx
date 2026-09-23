import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Box,
  Typography,
  Alert,
  useMediaQuery,
  useTheme,
  IconButton,
} from '@mui/material';
import { WarningAmber as WarningIcon, Close as CloseIcon } from '@mui/icons-material';
import type { BreakdownReason } from '../types';

interface BreakdownModalMUIProps {
  machineId: string;
  machineName: string;
  breakdownReasons: BreakdownReason[];
  onClose: () => void;
  onConfirm: (data: { event: string; remarks: string }) => void;
  open?: boolean;
}

const BreakdownModalMUI: React.FC<BreakdownModalMUIProps> = ({
  machineId,
  machineName,
  breakdownReasons,
  onClose,
  onConfirm,
  open = true,
}) => {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const [event, setEvent] = useState(breakdownReasons[0]?.name || 'Other');
  const [remarks, setRemarks] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = (e: React.FormEvent) => {
    if (e) e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!remarks.trim()) {
      newErrors.remarks = 'Remarks are required';
    }
    if (!event) {
      newErrors.event = 'Please select a breakdown reason';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    onConfirm({ event, remarks });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      fullScreen={fullScreen}
      slotProps={{ paper: { sx: { borderRadius: fullScreen ? 0 : 2 } } }}
    >
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1.5,
          pb: 1,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            sx={{
              p: 1,
              bgcolor: '#fef2f2',
              borderRadius: 1.5,
              color: '#dc2626',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <WarningIcon />
          </Box>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700, fontSize: fullScreen ? '1.1rem' : '1.25rem' }}>
              Log Breakdown
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {machineName} ({machineId})
            </Typography>
          </Box>
        </Box>
        {fullScreen && (
          <IconButton onClick={onClose} edge="end">
            <CloseIcon />
          </IconButton>
        )}
      </DialogTitle>

      <DialogContent dividers sx={{ py: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Alert severity="warning" sx={{ mb: 0 }}>
          <strong>Important:</strong> Provide detailed remarks for root cause analysis.
        </Alert>

        <Box component="form" sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mt: 1 }}>
          <FormControl fullWidth>
            <InputLabel id="breakdown-reason-label">Primary Event Category</InputLabel>
            <Select
              labelId="breakdown-reason-label"
              value={event}
              label="Primary Event Category"
              onChange={(e) => {
                setEvent(e.target.value);
                setErrors({ ...errors, event: '' });
              }}
              error={Boolean(errors.event)}
            >
              {breakdownReasons.map((r) => (
                <MenuItem key={r.id} value={r.name}>
                  {r.name}
                </MenuItem>
              ))}
              <MenuItem value="Other">Other (Specify in Remarks)</MenuItem>
            </Select>
          </FormControl>

          <TextField
            label="Supervisor Remarks / Action Plan"
            placeholder="Describe the root cause or temporary countermeasure..."
            multiline
            rows={fullScreen ? 6 : 4}
            value={remarks}
            onChange={(e) => {
              setRemarks(e.target.value);
              setErrors({ ...errors, remarks: '' });
            }}
            error={Boolean(errors.remarks)}
            helperText={errors.remarks || 'Minimum 10 characters required'}
            fullWidth
            variant="outlined"
            autoFocus
          />
        </Box>
        {/* Extra spacer for mobile keyboard / bottom bars */}
        {fullScreen && <Box sx={{ height: 40 }} />}
      </DialogContent>

      <DialogActions sx={{ gap: 1, p: 2, flexDirection: fullScreen ? 'column-reverse' : 'row' }}>
        <Button onClick={onClose} variant="outlined" fullWidth={fullScreen}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          color="error"
          startIcon={<WarningIcon />}
          disabled={!remarks.trim() || !event}
          fullWidth={fullScreen}
          sx={{ height: 48 }}
        >
          Record Breakdown
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default BreakdownModalMUI;
