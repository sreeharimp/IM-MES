import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { ShiftSetting } from '../types';
import { 
  Box, 
  Button, 
  Card, 
  Typography, 
  Select, 
  MenuItem, 
  FormControl, 
  InputLabel,
  Alert,
  Stack,
  IconButton
} from '@mui/material';
import { 
  ArrowForward as ArrowRight, 
  Warning as AlertTriangle, 
  Logout as LogOut 
} from '@mui/icons-material';

interface ShiftHandoverPageProps {
  summary: any;
  shiftSettings: ShiftSetting[];
  onAcknowledge: (selectedShiftId: string) => void;
  supervisorName: string;
  outgoingSupervisorEmail?: string;
}

const ShiftHandoverPage: React.FC<ShiftHandoverPageProps> = ({ summary, shiftSettings, onAcknowledge, supervisorName, outgoingSupervisorEmail }) => {
  const [selectedShiftId, setSelectedShiftId] = useState<string>('');

  useEffect(() => {
    if (!shiftSettings || shiftSettings.length === 0) return;
    const now = new Date();
    const currentHours = now.getHours();
    const currentMinutes = now.getMinutes();
    const currentTimeVal = currentHours + currentMinutes / 60;
    let detectedShift = shiftSettings[0].id;

    for (const shift of shiftSettings) {
      const [startH, startM] = shift.startTime.split(':').map(Number);
      const [endH, endM] = shift.endTime.split(':').map(Number);
      const startVal = startH + startM / 60;
      const endVal = endH + endM / 60;
      if (startVal < endVal) {
        if (currentTimeVal >= startVal && currentTimeVal < endVal) { detectedShift = shift.id; break; }
      } else {
        if (currentTimeVal >= startVal || currentTimeVal < endVal) { detectedShift = shift.id; break; }
      }
    }
    setSelectedShiftId(detectedShift);
  }, [shiftSettings]);

  return (
    <Box sx={{ 
      display: 'flex', 
      flexDirection: 'column', 
      height: '100dvh', 
      bgcolor: 'background.default', 
      color: 'text.primary',
      overflow: 'hidden',
      position: 'fixed',
      inset: 0,
      zIndex: 9999
    }}>
      {/* Header */}
      <Box sx={{ 
        p: 2, 
        borderBottom: 1, 
        borderColor: 'divider', 
        bgcolor: 'background.paper',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1.1rem' }}>
            Welcome, {supervisorName.split(' ')[0]}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 1 }}>
            Shift Handover Pending
          </Typography>
        </Box>
        <IconButton size="small" onClick={() => supabase.auth.signOut()} color="inherit">
          <LogOut fontSize="small" />
        </IconButton>
        {outgoingSupervisorEmail && <Box sx={{ display: 'none' }}>{outgoingSupervisorEmail}</Box>}
      </Box>

      {/* Content */}
      <Box sx={{ flex: 1, overflowY: 'auto', p: 2, WebkitOverflowScrolling: 'touch' }}>
        <Stack spacing={2} sx={{ maxWidth: 500, mx: 'auto' }}>
          
          <Card variant="outlined" sx={{ borderRadius: 2 }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', bgcolor: 'divider', gap: '1px' }}>
              {[
                { label: 'Output', value: summary?.totalOutput?.toLocaleString() || 0, color: 'success.main' },
                { label: 'Running', value: summary?.runningMachines || 0, color: 'primary.main' },
                { label: 'Bins', value: summary?.pendingCrates || 0, color: 'warning.main' }
              ].map((item, i) => (
                <Box key={i} sx={{ p: 2, textAlign: 'center', bgcolor: 'background.paper' }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.65rem', fontWeight: 600 }}>
                    {item.label}
                  </Typography>
                  <Typography variant="h5" sx={{ fontWeight: 700, color: item.color }}>
                    {item.value}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Card>

          <Alert severity="warning" icon={<AlertTriangle fontSize="small" />} sx={{ borderRadius: 2 }}>
            <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
              All operators are currently unassigned. You must perform re-assignments upon entering the floor.
            </Typography>
          </Alert>

          <Card variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
            <FormControl fullWidth size="small">
              <InputLabel id="shift-select-label">SELECT YOUR SHIFT</InputLabel>
              <Select
                labelId="shift-select-label"
                value={selectedShiftId}
                label="SELECT YOUR SHIFT"
                onChange={(e) => setSelectedShiftId(e.target.value)}
                sx={{ height: 48 }}
              >
                {shiftSettings.map(s => (
                  <MenuItem key={s.id} value={s.id}>
                    {s.name} ({s.startTime} - {s.endTime})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Card>

          <Typography variant="caption" align="center" sx={{ opacity: 0.6, mt: 2 }}>
            Confirm to initialize session and tracking.
          </Typography>
        </Stack>
      </Box>

      {/* Footer */}
      <Box sx={{ 
        p: 2, 
        pb: 'calc(16px + env(safe-area-inset-bottom, 0px))',
        borderTop: 1, 
        borderColor: 'divider', 
        bgcolor: 'background.paper',
        display: 'flex',
        gap: 1.5
      }}>
        <Button 
          variant="outlined" 
          color="inherit" 
          sx={{ flex: 1, height: 52 }}
          onClick={() => supabase.auth.signOut()}
        >
          Logout
        </Button>
        <Button 
          variant="contained" 
          color="primary" 
          endIcon={<ArrowRight />}
          sx={{ flex: 2, height: 52, fontWeight: 700 }}
          onClick={() => onAcknowledge(selectedShiftId)}
        >
          Start Shift
        </Button>
      </Box>
    </Box>
  );
};

export default ShiftHandoverPage;
