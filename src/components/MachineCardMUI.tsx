import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardActions,
  Typography,
  Box,
  Button,
  LinearProgress,
  Chip,
  Grid,
} from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  WarningAmber as WarningIcon,
  PersonAdd as PersonAddIcon,
} from '@mui/icons-material';
import type { Machine, Operator, Product, Mould, BatchRecord } from '../types';

interface MachineCardProps {
  machine: Machine;
  products: Product[];
  operators: Operator[];
  moulds: Mould[];
  batchRecords: BatchRecord[];
  onAction: (machineId: string, action: string) => void;
  onComplete: (machineId: string) => void;
  onResolve: () => void;
}

const MachineCardMUI: React.FC<MachineCardProps> = ({
  machine,
  products,
  operators,
  moulds,
  batchRecords,
  onAction,
  onComplete,
  onResolve,
}) => {
  const product = products.find((p) => p.id === machine.activeProductId);
  const operator = operators.find((o) => o.id === machine.currentOperatorId);
  const mould = moulds.find((m) => m.id === machine.currentMouldId);
  const batch = batchRecords?.find((b) => b.id === machine.activeBatchId);
  const batchOutput = batch?.totalOutput || 0;
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let timer: any;
    if (machine.status === 'Running' && machine.binStartTime && mould?.cycleTime) {
      const updateProgress = () => {
        const cycleTime = mould.cycleTime || 60;
        const target = machine.binTarget || 1000;
        const elapsed = (Date.now() - machine.binStartTime!) / 1000;
        setProgress(Math.min(100, (elapsed / (target * cycleTime)) * 100));
      };
      updateProgress();
      timer = setInterval(updateProgress, 5000);
    } else {
      setProgress(0);
    }
    return () => clearInterval(timer);
  }, [machine.status, machine.binStartTime, mould, machine.binTarget]);

  const getStatusColor = () => {
    switch (machine.status) {
      case 'Running':
        return 'success';
      case 'Maintenance':
        return 'warning';
      case 'Idle':
        return 'info';
      default:
        return 'default';
    }
  };

  const getStatusIcon = () => {
    switch (machine.status) {
      case 'Running':
        return <CheckCircleIcon fontSize="small" />;
      case 'Maintenance':
        return <WarningIcon fontSize="small" />;
      default:
        return null;
    }
  };
  // @ts-ignore - Reserved for future UI expansion
  console.log(getStatusIcon);

  const currentQty =
    machine.status === 'Running' && machine.binStartTime && mould?.cycleTime
      ? Math.min(
          machine.binTarget || 1000,
          Math.floor(
            (Date.now() - machine.binStartTime) / (mould.cycleTime * 1000)
          ) * (mould.cavities || 1)
        )
      : 0;

  return (
    <Card
      elevation={1}
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        border: `1px solid`,
        borderColor: getStatusColor() === 'success' ? '#16a34a' : getStatusColor() === 'warning' ? '#f59e0b' : 'divider',
        borderRadius: 1,
        bgcolor: 'background.paper',
      }}
    >
      <CardContent sx={{ p: 1, '&:last-child': { pb: 1 }, flex: 1 }}>
        {/* Header - Very Compact */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                bgcolor: getStatusColor() === 'success' ? '#16a34a' : getStatusColor() === 'warning' ? '#f59e0b' : '#94a3b8',
              }}
            />
            <Typography variant="subtitle2" sx={{ fontWeight: 800, lineHeight: 1, fontSize: '0.85rem' }}>
              {machine.id}
            </Typography>
          </Box>
          <Chip
            label={machine.status}
            size="small"
            color={getStatusColor() as any}
            sx={{ height: 16, fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase' }}
          />
        </Box>

        {machine.status === 'Running' ? (
          <>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 0.5, height: 26 }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.primary', lineHeight: 1.1, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                {product?.name || 'Unknown'}
              </Typography>
              {machine.activeBatchId && (
                <Typography variant="caption" sx={{ fontSize: '0.55rem', fontWeight: 800, color: '#fff', bgcolor: 'primary.main', px: 0.5, borderRadius: 0.5, ml: 0.5, whiteSpace: 'nowrap' }}>
                  {machine.activeBatchId.split('-')[0]}
                </Typography>
              )}
            </Box>

            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography 
                variant="caption" 
                sx={{ fontSize: '0.65rem', fontWeight: 600, color: 'text.secondary', cursor: 'pointer', '&:hover': { color: 'primary.main', textDecoration: 'underline' } }}
                onClick={() => onAction(machine.id, 'EditBin')}
                title="Click to set current bin number"
              >
                BIN #{machine.currentBinNumber} ✎
              </Typography>
              <Typography variant="caption" sx={{ fontSize: '0.65rem', fontWeight: 800, fontFamily: 'monospace' }}>
                {currentQty}/{machine.binTarget || 1000}
              </Typography>
            </Box>
            
            <LinearProgress variant="determinate" value={progress} sx={{ height: 4, borderRadius: 2, mb: 1 }} />

            <Grid container spacing={0.5}>
              <Grid size={6}>
                <Box sx={{ p: 0.5, bgcolor: 'action.hover', borderRadius: 0.5 }}>
                  <Typography variant="caption" sx={{ display: 'block', fontSize: '0.55rem', color: 'text.secondary', fontWeight: 600 }}>OUT</Typography>
                  <Typography variant="caption" sx={{ fontWeight: 800, fontSize: '0.7rem' }}>{batchOutput}</Typography>
                </Box>
              </Grid>
              <Grid size={6}>
                <Box
                  sx={{ p: 0.5, bgcolor: 'action.hover', borderRadius: 0.5, cursor: 'pointer', '&:hover': { bgcolor: 'action.selected' } }}
                  onClick={() => onAction(machine.id, 'AssignOperator')}
                  title="Tap to reassign operator"
                >
                  <Typography variant="caption" sx={{ display: 'block', fontSize: '0.55rem', color: 'text.secondary', fontWeight: 600 }}>OP <PersonAddIcon sx={{ fontSize: '0.55rem', mb: '-1px' }} /></Typography>
                  <Typography variant="caption" sx={{ fontWeight: 800, fontSize: '0.7rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', color: operator ? 'text.primary' : 'warning.main' }}>
                    {operator?.name?.split(' ')[0] || '⚠ Unassigned'}
                  </Typography>
                </Box>
              </Grid>
            </Grid>
          </>
        ) : (
          <Box sx={{ py: 1, textAlign: 'center', bgcolor: 'action.hover', borderRadius: 0.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic', fontSize: '0.65rem' }}>
              {machine.status === 'Maintenance' ? 'Under Repair' : 'System Idle'}
            </Typography>
          </Box>
        )}
      </CardContent>

      <CardActions sx={{ p: 0.5, gap: 0.5, flexDirection: 'column' }}>
        {machine.status === 'Running' ? (
          <>
            <Button
              fullWidth
              variant="contained"
              color="success"
              size="small"
              onClick={() => onComplete(machine.id)}
              sx={{ py: 0.25, fontSize: '0.65rem', fontWeight: 700, minHeight: '24px' }}
            >
              FINISH BIN
            </Button>
            <Box sx={{ display: 'flex', gap: 0.5, width: '100%' }}>
              <Button variant="outlined" color="warning" size="small" onClick={() => onAction(machine.id, 'Maintenance')} sx={{ flex: 1, py: 0, fontSize: '0.6rem', minHeight: '20px' }}>
                DOWN
              </Button>
              <Button variant="outlined" color="error" size="small" onClick={() => onAction(machine.id, 'Stop')} sx={{ flex: 1, py: 0, fontSize: '0.6rem', minHeight: '20px' }}>
                STOP
              </Button>
            </Box>
          </>
        ) : machine.status === 'Maintenance' ? (
          <Button fullWidth variant="contained" color="warning" size="small" onClick={onResolve} sx={{ py: 0.5, fontWeight: 700, fontSize: '0.65rem' }}>
            RESOLVE
          </Button>
        ) : (
          <Button fullWidth variant="contained" color="primary" size="small" onClick={() => onAction(machine.id, 'Start')} sx={{ py: 0.5, fontWeight: 700, fontSize: '0.65rem' }}>
            START
          </Button>
        )}
      </CardActions>
    </Card>
  );
};

export default MachineCardMUI;
