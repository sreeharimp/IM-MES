import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography,
  Box,
  Grid,
  Card,
  CardContent,
  LinearProgress,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  IconButton,
  Stack,
  Paper,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  Close as CloseIcon,
  AssignmentLate as AssignmentIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Add as AddIcon,
  Remove as RemoveIcon,
} from '@mui/icons-material';
import type { DefectType, Operator } from '../types';

interface InspectionModalProps {
  binId: string;
  netQty: number;
  defectTypes: DefectType[];
  operators: Operator[];
  onClose: () => void;
  onConfirm: (data: any) => void;
  open?: boolean;
}

const InspectionModalMUI: React.FC<InspectionModalProps> = ({
  binId,
  netQty,
  defectTypes,
  operators,
  onClose,
  onConfirm,
  open = true,
}) => {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const [rejections, setRejections] = useState(
    defectTypes.length > 0
      ? defectTypes.map((d) => ({ category: d.name, count: 0 }))
      : [
          { category: 'Flash / Burrs', count: 0 },
          { category: 'Short Shot', count: 0 },
          { category: 'Burn Marks', count: 0 },
          { category: 'Silver Streaks', count: 0 },
          { category: 'Dimensional Out', count: 0 },
        ]
  );
  const [inspectorId, setInspectorId] = useState('');

  const totalRejected = rejections.reduce((sum, r) => sum + r.count, 0);
  const goodQty = netQty - totalRejected;
  const qualityRate = netQty > 0 ? (goodQty / netQty) * 100 : 100;

  const updateRejection = (index: number, val: number) => {
    const next = [...rejections];
    next[index].count = Math.max(0, val);
    setRejections(next);
  };

  const handleConfirm = () => {
    if (goodQty < 0 || !inspectorId) return;
    onConfirm({ rejections, goodQty, inspectorId });
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
          gap: 1,
          pb: 1,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            sx={{
              p: 1,
              bgcolor: '#dbeafe',
              borderRadius: 1.5,
              color: '#0284c7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <AssignmentIcon />
          </Box>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Visual Inspection Protocol
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              <span style={{ fontFamily: 'monospace' }}>{binId}</span> • Incoming:{' '}
              <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{netQty.toLocaleString()}</span> pcs
            </Typography>
          </Box>
        </Box>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ py: 2 }}>
        {/* Inspector Selection */}
        <FormControl fullWidth sx={{ mb: 3 }}>
          <InputLabel>Inspected By (Employee)</InputLabel>
          <Select
            value={inspectorId}
            label="Inspected By (Employee)"
            onChange={(e) => setInspectorId(e.target.value)}
          >
            <MenuItem value="">
              <em>Select Inspector...</em>
            </MenuItem>
            {operators.map((o) => (
              <MenuItem key={o.id} value={o.id}>
                {o.name} ({o.employeeId})
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {!inspectorId && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            Inspector selection is required to complete inspection
          </Alert>
        )}

        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
          Defect Categorization
        </Typography>

        {/* Rejection List */}
        <Stack spacing={1} sx={{ mb: 3 }}>
          {rejections.map((rej, idx) => (
            <Paper
              key={rej.category}
              sx={{
                p: 1.5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                bgcolor: '#f8fafc',
                border: '1px solid #e2e8f0',
              }}
            >
              <Typography variant="body2" sx={{ fontWeight: 500, flex: 1 }}>
                {rej.category}
              </Typography>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.5,
                  bgcolor: 'white',
                  p: 0.5,
                  borderRadius: 1,
                  border: '1px solid #e2e8f0',
                }}
              >
                <IconButton
                  size="small"
                  onClick={() => updateRejection(idx, Math.max(0, rej.count - 1))}
                  sx={{ p: 0.25 }}
                >
                  <RemoveIcon fontSize="small" />
                </IconButton>
                <TextField
                  type="number"
                  value={rej.count === 0 ? '' : rej.count}
                  placeholder="0"
                  onChange={(e) => updateRejection(idx, Math.max(0, Number(e.target.value)))}
                  slotProps={{
                    htmlInput: { 
                      style: { textAlign: 'center', width: '40px' }, 
                      min: 0 
                    }
                  }}
                  variant="standard"
                  size="small"
                  sx={{ '& input': { fontFamily: 'monospace', fontWeight: 700 } }}
                />
                <IconButton
                  size="small"
                  onClick={() => updateRejection(idx, rej.count + 1)}
                  sx={{ p: 0.25 }}
                >
                  <AddIcon fontSize="small" />
                </IconButton>
              </Box>
            </Paper>
          ))}
        </Stack>

        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
          Quality Summary
        </Typography>

        <Grid container spacing={1} sx={{ mb: 2 }}>
          <Grid size={6}>
            <Card
              sx={{
                bgcolor: '#fee2e2',
                border: '2px solid #fecaca',
              }}
            >
              <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Typography variant="caption" sx={{ color: '#991b1b', fontWeight: 700, display: 'block', mb: 0.5 }}>
                  NET REJECTED
                </Typography>
                <Typography variant="h5" sx={{ color: '#dc2626', fontWeight: 700, fontFamily: 'monospace' }}>
                  {totalRejected.toLocaleString()}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={6}>
            <Card
              sx={{
                bgcolor: '#dcfce7',
                border: '2px solid #bbf7d0',
              }}
            >
              <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Typography variant="caption" sx={{ color: '#15803d', fontWeight: 700, display: 'block', mb: 0.5 }}>
                  ACCEPTABLE OUTPUT
                </Typography>
                <Typography variant="h5" sx={{ color: '#16a34a', fontWeight: 700, fontFamily: 'monospace' }}>
                  {goodQty.toLocaleString()}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Quality Rate Progress */}
        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 600 }}>
              Quality Rate
            </Typography>
            <Typography
              variant="body2"
              sx={{
                color: qualityRate > 95 ? '#16a34a' : qualityRate > 85 ? '#f59e0b' : '#dc2626',
                fontWeight: 700,
              }}
            >
              {Math.round(qualityRate)}%
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={Math.min(100, qualityRate)}
            sx={{
              height: 8,
              borderRadius: 4,
              backgroundColor: '#e2e8f0',
              '& .MuiLinearProgress-bar': {
                backgroundColor: qualityRate > 95 ? '#16a34a' : qualityRate > 85 ? '#f59e0b' : '#dc2626',
                borderRadius: 4,
              },
            }}
          />
        </Box>

        {/* Error Message */}
        {goodQty < 0 && (
          <Alert
            severity="error"
            icon={<ErrorIcon />}
            sx={{ mb: 2 }}
          >
            ERROR: Rejections exceed incoming quantity
          </Alert>
        )}
        {/* Extra spacer for mobile keyboard / bottom bars */}
        {fullScreen && <Box sx={{ height: 40 }} />}
      </DialogContent>

      <DialogActions sx={{ gap: 1, p: 2, flexDirection: fullScreen ? 'column-reverse' : 'row' }}>
        <Button onClick={onClose} variant="outlined" fullWidth={fullScreen}>
          Discard
        </Button>
        <Button
          onClick={handleConfirm}
          variant="contained"
          color="success"
          startIcon={<CheckCircleIcon />}
          disabled={goodQty < 0 || !inspectorId}
          fullWidth={fullScreen}
          sx={{ height: 48 }}
        >
          Confirm & Seal
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default InspectionModalMUI;
