import React, { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  Box,
  Typography,
  Alert,
  Chip,
  InputAdornment,
  RadioGroup,
  FormControlLabel,
  Radio,
  FormControl,
  FormLabel,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Tooltip,
  Grid,
} from '@mui/material';
import {
  Inventory as ProductIcon,
  AccessTime as ShiftIcon,
  WarningAmber as WarningIcon,
  Tag as BatchIcon,
  DateRange as RangeIcon,
  Today as DayIcon,
  Numbers as QtyIcon,
  Schedule as ShiftModeIcon,
  Refresh as ResetIcon,
} from '@mui/icons-material';
import type { Product, ProductionPlan, PlanningMode, Machine } from '../../types';
import { getCurrentProductionDayStr, isWithinPrintWindow, getRelativeDayLabel } from './services/dateWindow';
import { generateBatchCode } from './services/batchCodeService';
import { supabase } from '../../lib/supabase';

interface DayBreakdownItem {
  dateStr: string;
  batchCode: string;
  quantity: number;
  crates: number;
  remainder: number;
}

interface PlanCreateModalProps {
  open: boolean;
  products: Product[];
  machines?: Machine[];
  currentUserName?: string;
  onClose: () => void;
  onPlanCreated: (plan: ProductionPlan) => void;
}

export const PlanCreateModal: React.FC<PlanCreateModalProps> = ({
  open,
  products,
  machines = [],
  currentUserName = 'Production Planner',
  onClose,
  onPlanCreated,
}) => {
  const defaultDate = getCurrentProductionDayStr();
  const [mode, setMode] = useState<PlanningMode>('single_day');
  const [startDate, setStartDate] = useState<string>(defaultDate);
  const [endDate, setEndDate] = useState<string>(defaultDate);
  const [productId, setProductId] = useState<string>('');
  const [machineId, setMachineId] = useState<string>('IMM-A');
  const [shift, setShift] = useState<string>('A');
  const [targetQuantity, setTargetQuantity] = useState<number | ''>(5000);
  const [notes, setNotes] = useState<string>('');
  const [dayBreakdown, setDayBreakdown] = useState<DayBreakdownItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Existing case sequence offset: how many case labels already exist for this batch
  const [existingCaseOffset, setExistingCaseOffset] = useState<number>(0);
  const [isCheckingSeq, setIsCheckingSeq] = useState<boolean>(false);

  useEffect(() => {
    if (open) {
      const today = getCurrentProductionDayStr();
      setStartDate(today);
      setEndDate(today);
      setMode('single_day');
      setTargetQuantity(5000);
      setShift('A');
      setMachineId(machines.length > 0 ? machines[0].id : 'IMM-A');
      setNotes('');
      if (products.length > 0 && !productId) {
        setProductId(products[0].id);
      }
      setErrorMessage(null);
    }
  }, [open, products]);

  const selectedProduct = useMemo(() => {
    return products.find((p) => p.id === productId);
  }, [products, productId]);

  const stdPackQty = (selectedProduct as any)?.stdPackSize || (selectedProduct as any)?.std_pack_size || (selectedProduct as any)?.standard_packing_qty || 1000;
  const pCode = (selectedProduct as any)?.batchIdentifier || (selectedProduct as any)?.batch_identifier || (selectedProduct as any)?.itemCode || (selectedProduct as any)?.item_code || 'AP';

  const getDateRangeArray = (startStr: string, endStr: string): string[] => {
    const dates: string[] = [];
    const curr = new Date(startStr + 'T12:00:00');
    const last = new Date(endStr + 'T12:00:00');
    if (isNaN(curr.getTime()) || isNaN(last.getTime())) return [startStr];
    if (curr > last) return [startStr];

    while (curr <= last && dates.length < 31) {
      const y = curr.getFullYear();
      const m = String(curr.getMonth() + 1).padStart(2, '0');
      const d = String(curr.getDate()).padStart(2, '0');
      dates.push(`${y}-${m}-${d}`);
      curr.setDate(curr.getDate() + 1);
    }
    return dates;
  };

  const handleTargetQuantityChange = (val: string) => {
    if (val === '') {
      setTargetQuantity('');
    } else {
      const parsed = parseInt(val, 10);
      setTargetQuantity(isNaN(parsed) ? '' : Math.max(0, parsed));
    }
  };

  const handleTargetQuantityBlur = () => {
    if (targetQuantity === '' || targetQuantity < 1) {
      setTargetQuantity(1);
    }
  };

  const resetBreakdownToEvenSplit = () => {
    const numericTargetQty = typeof targetQuantity === 'number' ? targetQuantity : (parseInt(String(targetQuantity), 10) || 0);
    if (mode === 'date_range') {
      const dates = getDateRangeArray(startDate, endDate);
      const dayCount = Math.max(1, dates.length);
      const basePerDay = Math.floor(numericTargetQty / dayCount);
      const remOverall = numericTargetQty % dayCount;

      const items: DayBreakdownItem[] = dates.map((dStr, idx) => {
        const qty = basePerDay + (idx === dayCount - 1 ? remOverall : 0);
        const bCode = generateBatchCode(pCode, new Date(dStr + 'T12:00:00'));
        return {
          dateStr: dStr,
          batchCode: bCode,
          quantity: qty,
          crates: Math.ceil(qty / stdPackQty) || 0,
          remainder: qty % stdPackQty,
        };
      });
      setDayBreakdown(items);
    } else {
      const bCode = generateBatchCode(pCode, new Date(startDate + 'T12:00:00'));
      setDayBreakdown([
        {
          dateStr: startDate,
          batchCode: bCode,
          quantity: numericTargetQty,
          crates: Math.ceil(numericTargetQty / stdPackQty) || 0,
          remainder: numericTargetQty % stdPackQty,
        },
      ]);
    }
  };

  useEffect(() => {
    resetBreakdownToEvenSplit();
  }, [mode, startDate, endDate, productId, stdPackQty, targetQuantity]);

  // Check existing case count whenever product or start date changes (for single_day/shift/quantity_only)
  useEffect(() => {
    if (!productId || !startDate || !pCode) {
      setExistingCaseOffset(0);
      return;
    }
    const checkExisting = async () => {
      setIsCheckingSeq(true);
      try {
        const batchForDate = generateBatchCode(pCode, new Date(startDate + 'T12:00:00'));
        const { data: plans } = await supabase
          .from('production_plans')
          .select('id')
          .eq('batch_code', batchForDate);
        const planIds = (plans || []).map((p: any) => p.id);
        if (planIds.length === 0) {
          setExistingCaseOffset(0);
          return;
        }
        const { data: maxRow } = await supabase
          .from('production_plan_labels')
          .select('sequence_number')
          .in('plan_id', planIds)
          .order('sequence_number', { ascending: false })
          .limit(1);
        setExistingCaseOffset(maxRow?.[0]?.sequence_number || 0);
      } catch (_) {
        setExistingCaseOffset(0);
      } finally {
        setIsCheckingSeq(false);
      }
    };
    checkExisting();
  }, [productId, startDate, pCode]);

  const handleDayQtyChange = (idx: number, newQty: number) => {
    const safeQty = Math.max(0, newQty);
    setDayBreakdown((prev) => {
      const next = [...prev];
      next[idx] = {
        ...next[idx],
        quantity: safeQty,
        crates: Math.ceil(safeQty / stdPackQty) || 0,
        remainder: safeQty % stdPackQty,
      };
      return next;
    });
  };

  const totalBreakdownQty = useMemo(() => {
    return dayBreakdown.reduce((sum, item) => sum + item.quantity, 0);
  }, [dayBreakdown]);

  const totalBreakdownCrates = useMemo(() => {
    return dayBreakdown.reduce((sum, item) => sum + item.crates, 0);
  }, [dayBreakdown]);

  const handleSubmit = async () => {
    const finalQty = typeof targetQuantity === 'number' ? targetQuantity : (parseInt(String(targetQuantity), 10) || 0);
    if (!productId || (mode !== 'date_range' && finalQty <= 0)) {
      setErrorMessage('Please select a product and enter a valid target quantity.');
      return;
    }

    if (mode === 'date_range' && totalBreakdownQty <= 0) {
      setErrorMessage('Total planned quantity across days must be greater than 0.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      // 1. Insert parent plan
      const firstBatch = dayBreakdown[0];
      const plannedQty = mode === 'date_range' ? totalBreakdownQty : finalQty;
      const cratesPlanned = mode === 'date_range' ? totalBreakdownCrates : (Math.ceil(finalQty / stdPackQty) || 1);
      const remainderPlanned = mode === 'date_range' 
        ? (dayBreakdown[dayBreakdown.length - 1]?.remainder || 0) 
        : (finalQty % stdPackQty);

      const generatedBatch = firstBatch?.batchCode || generateBatchCode(pCode, new Date(startDate + 'T12:00:00'));

      const parentPayload = {
        product_id: productId,
        plan_date: startDate,
        batch_code: generatedBatch,
        planned_quantity: plannedQty,
        crates_planned: cratesPlanned,
        remainder_quantity: remainderPlanned,
        machine_id: machineId || 'IMM-A',
        shift: shift || 'A',
        status: 'confirmed',
        notes: notes.trim() || null,
        created_by: currentUserName,
      };

      const { data: parentPlan, error: parentError } = await supabase
        .from('production_plans')
        .insert([parentPayload])
        .select()
        .single();

      if (parentError) throw parentError;

      // 2. Insert crate labels — sequence continues from existing labels for same batch_code
      const labelsToInsert: any[] = [];
      const activeBatches = dayBreakdown.filter((d) => d.quantity > 0);

      for (const d of activeBatches) {
        // Find the max existing sequence_number for this batchCode (across all other plans)
        let seqOffset = 0;
        try {
          const { data: batchPlans } = await supabase
            .from('production_plans')
            .select('id')
            .eq('batch_code', d.batchCode)
            .neq('id', parentPlan.id);
          const batchPlanIds = (batchPlans || []).map((p: any) => p.id);
          if (batchPlanIds.length > 0) {
            const { data: maxRow } = await supabase
              .from('production_plan_labels')
              .select('sequence_number')
              .in('plan_id', batchPlanIds)
              .order('sequence_number', { ascending: false })
              .limit(1);
            seqOffset = maxRow?.[0]?.sequence_number || 0;
          }
        } catch (_) {
          seqOffset = 0;
        }

        for (let i = 1; i <= d.crates; i++) {
          const globalSeq = seqOffset + i;
          const isLast = i === d.crates;
          const isPartial = isLast && d.remainder > 0;
          const qty = isPartial ? d.remainder : stdPackQty;
          labelsToInsert.push({
            plan_id: parentPlan.id,
            sequence_number: globalSeq,
            expected_quantity: qty,
            is_partial: isPartial,
            qr_payload: `${d.batchCode}-${globalSeq}`,
            status: 'unprinted',
          });
        }
      }

      if (labelsToInsert.length > 0) {
        const { error: labelsError } = await supabase
          .from('production_plan_labels')
          .insert(labelsToInsert);
        if (labelsError) console.warn('Label insertion notice:', labelsError);
      }

      onPlanCreated({
        ...parentPlan,
        product_name: selectedProduct?.name,
        standard_packing_qty: stdPackQty,
      });
      onClose();
    } catch (err: any) {
      console.error('Plan creation error:', err);
      setErrorMessage(err.message || 'Failed to create production plan.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="md" 
      fullWidth
      PaperProps={{
        sx: {
          bgcolor: 'var(--bg2, #141720)',
          border: '1px solid var(--border, #2e3340)',
          backgroundImage: 'none',
        }
      }}
    >
      <DialogTitle sx={{ fontWeight: 700, pb: 1, borderBottom: '1px solid var(--border, #2e3340)', color: 'var(--text, #e2e6f0)' }}>
        Create Production Plan & Generate Batch Labels
      </DialogTitle>
      <DialogContent sx={{ pt: 2.5 }}>
        {errorMessage && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {errorMessage}
          </Alert>
        )}

        <Box sx={{ mb: 2.5, p: 1.5, borderRadius: 2, bgcolor: 'var(--bg3, #1c2028)', border: '1px solid var(--border, #2e3340)' }}>
          <FormControl component="fieldset">
            <FormLabel component="legend" sx={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text2, #8a92a8)', mb: 0.5 }}>
              PLANNING MODE
            </FormLabel>
            <RadioGroup
              row
              value={mode}
              onChange={(e) => setMode(e.target.value as PlanningMode)}
            >
              <FormControlLabel
                value="single_day"
                control={<Radio size="small" />}
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <DayIcon sx={{ fontSize: 16, color: '#3b82f6' }} />
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>Single Day</Typography>
                  </Box>
                }
              />
              <FormControlLabel
                value="date_range"
                control={<Radio size="small" />}
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <RangeIcon sx={{ fontSize: 16, color: '#8b5cf6' }} />
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>Date Range (Multi-Day)</Typography>
                  </Box>
                }
              />
              <FormControlLabel
                value="shift"
                control={<Radio size="small" />}
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <ShiftModeIcon sx={{ fontSize: 16, color: '#10b981' }} />
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>Shift Specific</Typography>
                  </Box>
                }
              />
              <FormControlLabel
                value="quantity_only"
                control={<Radio size="small" />}
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <QtyIcon sx={{ fontSize: 16, color: '#f59e0b' }} />
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>Quantity Only</Typography>
                  </Box>
                }
              />
            </RadioGroup>
          </FormControl>
        </Box>

        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 8 }}>
            <TextField
              select
              label="Product"
              fullWidth
              size="small"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <ProductIcon sx={{ fontSize: 18, color: '#64748b' }} />
                    </InputAdornment>
                  ),
                },
              }}
            >
              {products.map((p: any) => (
                <MenuItem key={p.id} value={p.id}>
                  {p.name} ({p.itemCode || p.item_code || p.batchIdentifier || p.id})
                </MenuItem>
              ))}
            </TextField>
          </Grid>

          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField
              label="Std Case Qty"
              fullWidth
              size="small"
              disabled
              value={`${stdPackQty} pcs`}
              helperText="From Product Master"
            />
          </Grid>

          {/* Machine selector */}
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField
              select
              label="Machine"
              fullWidth
              size="small"
              value={machineId}
              onChange={(e) => setMachineId(e.target.value)}
            >
              {machines.length > 0 ? (
                machines.map((m: Machine) => (
                  <MenuItem key={m.id} value={m.id}>
                    {m.name || m.id}
                  </MenuItem>
                ))
              ) : (
                ['IMM-A', 'IMM-B', 'IMM-C', 'IMM-D'].map((id) => (
                  <MenuItem key={id} value={id}>{id}</MenuItem>
                ))
              )}
            </TextField>
          </Grid>

          {mode === 'single_day' && (
            <>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label="Production Date"
                  type="date"
                  fullWidth
                  size="small"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  slotProps={{ inputLabel: { shrink: true } }}
                  helperText={
                    <Typography component="span" variant="caption" sx={{ color: isWithinPrintWindow(startDate) ? 'success.main' : 'warning.main', fontWeight: 600 }}>
                      {getRelativeDayLabel(startDate)} {isWithinPrintWindow(startDate) ? '• Printable' : '• Outside Window'}
                    </Typography>
                  }
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label="Target Quantity (pcs)"
                  type="number"
                  fullWidth
                  size="small"
                  value={targetQuantity}
                  onChange={(e) => handleTargetQuantityChange(e.target.value)}
                  onBlur={handleTargetQuantityBlur}
                />
              </Grid>
            </>
          )}

          {mode === 'date_range' && (
            <>
              <Grid size={{ xs: 12, sm: 4 }}>
                <TextField
                  label="Start Date"
                  type="date"
                  fullWidth
                  size="small"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  slotProps={{ inputLabel: { shrink: true } }}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <TextField
                  label="End Date"
                  type="date"
                  fullWidth
                  size="small"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  slotProps={{ inputLabel: { shrink: true } }}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <TextField
                  label="Total Target Qty"
                  type="number"
                  fullWidth
                  size="small"
                  value={targetQuantity}
                  onChange={(e) => handleTargetQuantityChange(e.target.value)}
                  onBlur={handleTargetQuantityBlur}
                />
              </Grid>
            </>
          )}

          {mode === 'shift' && (
            <>
              <Grid size={{ xs: 12, sm: 4 }}>
                <TextField
                  label="Production Date"
                  type="date"
                  fullWidth
                  size="small"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  slotProps={{ inputLabel: { shrink: true } }}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <TextField
                  select
                  label="Shift"
                  fullWidth
                  size="small"
                  value={shift}
                  onChange={(e) => setShift(e.target.value)}
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position="start">
                          <ShiftIcon sx={{ fontSize: 18, color: '#64748b' }} />
                        </InputAdornment>
                      ),
                    },
                  }}
                >
                  <MenuItem value="A">Shift A (06:00 - 14:00)</MenuItem>
                  <MenuItem value="B">Shift B (14:00 - 22:00)</MenuItem>
                  <MenuItem value="C">Shift C (22:00 - 06:00)</MenuItem>
                </TextField>
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <TextField
                  label="Target Quantity (pcs)"
                  type="number"
                  fullWidth
                  size="small"
                  value={targetQuantity}
                  onChange={(e) => handleTargetQuantityChange(e.target.value)}
                  onBlur={handleTargetQuantityBlur}
                />
              </Grid>
            </>
          )}

          {mode === 'quantity_only' && (
            <>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label="Total Target Quantity (pcs)"
                  type="number"
                  fullWidth
                  size="small"
                  value={targetQuantity}
                  onChange={(e) => handleTargetQuantityChange(e.target.value)}
                  onBlur={handleTargetQuantityBlur}
                  helperText="Anchored to current production day"
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label="Anchored Production Day"
                  fullWidth
                  size="small"
                  disabled
                  value={startDate}
                  helperText="Evaluated via 06:00 production day boundary"
                />
              </Grid>
            </>
          )}

          {mode === 'date_range' && (
            <Grid size={{ xs: 12 }}>
              <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: '#ffffff', border: '1px solid #cbd5e1' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#1e293b' }}>
                    Day-by-Day Quantity & Batch Allocation ({dayBreakdown.length} Days)
                  </Typography>
                  <Tooltip title="Reset to equal distribution">
                    <Button
                      size="small"
                      startIcon={<ResetIcon />}
                      onClick={resetBreakdownToEvenSplit}
                      sx={{ fontSize: '0.75rem' }}
                    >
                      Equal Split
                    </Button>
                  </Tooltip>
                </Box>
                <Table size="small">
                  <TableHead sx={{ bgcolor: '#f1f5f9' }}>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700, py: 0.75 }}>Date</TableCell>
                      <TableCell sx={{ fontWeight: 700, py: 0.75 }}>Daily Batch Code</TableCell>
                      <TableCell sx={{ fontWeight: 700, py: 0.75 }}>Quantity (pcs)</TableCell>
                      <TableCell sx={{ fontWeight: 700, py: 0.75 }}>Crates</TableCell>
                      <TableCell sx={{ fontWeight: 700, py: 0.75 }}>Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {dayBreakdown.map((item, idx) => (
                      <TableRow key={item.dateStr}>
                        <TableCell sx={{ py: 0.5, fontWeight: 600 }}>{item.dateStr}</TableCell>
                        <TableCell sx={{ py: 0.5, fontFamily: 'monospace', fontWeight: 700, color: 'primary.main' }}>
                          {item.batchCode}
                        </TableCell>
                        <TableCell sx={{ py: 0.5, width: 140 }}>
                          <TextField
                            type="number"
                            size="small"
                            value={item.quantity === 0 ? '' : item.quantity}
                            placeholder="0"
                            onChange={(e) => {
                              const val = e.target.value;
                              handleDayQtyChange(idx, val === '' ? 0 : Math.max(0, parseInt(val, 10) || 0));
                            }}
                            sx={{ '& .MuiInputBase-input': { py: 0.5, fontSize: '0.85rem' } }}
                          />
                        </TableCell>
                        <TableCell sx={{ py: 0.5 }}>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {item.crates} cases
                          </Typography>
                          {item.remainder > 0 && (
                            <Typography variant="caption" sx={{ color: 'warning.main', display: 'block' }}>
                              Last case: {item.remainder} pcs
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell sx={{ py: 0.5 }}>
                          <Chip
                            size="small"
                            label={isWithinPrintWindow(item.dateStr) ? 'Printable' : 'Queued'}
                            color={isWithinPrintWindow(item.dateStr) ? 'success' : 'default'}
                            sx={{ fontSize: '0.7rem' }}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow sx={{ bgcolor: '#f8fafc' }}>
                      <TableCell colSpan={2} sx={{ fontWeight: 700, textAlign: 'right' }}>
                        Total Allocated:
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>
                        {totalBreakdownQty.toLocaleString()} pcs
                      </TableCell>
                      <TableCell colSpan={2} sx={{ fontWeight: 700 }}>
                        {totalBreakdownCrates} total cases
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </Box>
            </Grid>
          )}

          {mode !== 'date_range' && dayBreakdown.length > 0 && (
            <Grid size={{ xs: 12 }}>
              {/* Warning banner when cases already exist for this batch */}
              {existingCaseOffset > 0 && (
                <Alert
                  severity="info"
                  sx={{
                    mb: 1,
                    bgcolor: 'rgba(59, 130, 246, 0.12)',
                    color: 'var(--blue, #4d9fff)',
                    border: '1px solid rgba(59, 130, 246, 0.3)',
                    '& .MuiAlert-icon': { color: '#4d9fff' },
                  }}
                >
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    Batch continuation detected
                  </Typography>
                  <Typography variant="body2" sx={{ fontSize: '0.8125rem' }}>
                    Cases 1–{existingCaseOffset} already printed for batch <strong>{dayBreakdown[0]?.batchCode}</strong>.
                    This plan will start from <strong>Case #{existingCaseOffset + 1}</strong> through{' '}
                    <strong>Case #{existingCaseOffset + (dayBreakdown[0]?.crates || 0)}</strong>.
                  </Typography>
                </Alert>
              )}
              <Box
                sx={{
                  p: 1.5,
                  borderRadius: 2,
                  backgroundColor: 'var(--bg3, #1c2028)',
                  border: '1px solid var(--border, #2e3340)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <BatchIcon sx={{ fontSize: 20, color: 'var(--blue, #4d9fff)' }} />
                  <Box>
                    <Typography variant="caption" sx={{ color: 'var(--text2, #8a92a8)', display: 'block', lineHeight: 1 }}>
                      AUTO GENERATED BATCH CODE (PER PRODUCTION DAY)
                    </Typography>
                    <Typography variant="body1" sx={{ fontWeight: 700, color: 'var(--text, #e2e6f0)', letterSpacing: '0.05em' }}>
                      {dayBreakdown[0].batchCode}
                    </Typography>
                    {isCheckingSeq && (
                      <Typography variant="caption" sx={{ color: 'var(--text2, #8a92a8)' }}>Checking existing cases…</Typography>
                    )}
                  </Box>
                </Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.5 }}>
                  {existingCaseOffset > 0 ? (
                    <>
                      <Chip
                        label={`Cases #${existingCaseOffset + 1} – #${existingCaseOffset + (dayBreakdown[0]?.crates || 0)}`}
                        color="primary"
                        size="small"
                        sx={{ fontWeight: 700 }}
                      />
                      <Typography variant="caption" sx={{ color: 'var(--text2, #8a92a8)' }}>
                        {dayBreakdown[0].crates} new cases (continuing from #{existingCaseOffset})
                      </Typography>
                    </>
                  ) : (
                    <Chip
                      label={`${dayBreakdown[0].crates} Cases Planned (Start #1)`}
                      color="primary"
                      size="small"
                      sx={{ fontWeight: 700 }}
                    />
                  )}
                </Box>
              </Box>
            </Grid>
          )}

          {mode !== 'date_range' && dayBreakdown.length > 0 && dayBreakdown[0].remainder > 0 && (
            <Grid size={{ xs: 12 }}>
              <Alert
                severity="warning"
                icon={<WarningIcon />}
                sx={{
                  backgroundColor: '#fffbeb',
                  border: '1px solid #fef3c7',
                  color: '#92400e',
                  '& .MuiAlert-icon': { color: '#f59e0b' },
                }}
              >
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  Partial Case Detected ({dayBreakdown[0].remainder} pcs remainder)
                </Typography>
                <Typography variant="body2" sx={{ fontSize: '0.8125rem' }}>
                  Target quantity ({targetQuantity.toLocaleString()} pcs) is not evenly divisible by standard case pack ({stdPackQty.toLocaleString()} pcs).
                  Final case (Case #{dayBreakdown[0].crates}) will be printed as a <strong>partial case with {dayBreakdown[0].remainder} pcs</strong>.
                </Typography>
              </Alert>
            </Grid>
          )}

          <Grid size={{ xs: 12 }}>
            <TextField
              label="Production Notes / Instructions"
              multiline
              rows={2}
              fullWidth
              size="small"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Special instructions, verify cavity 4"
            />
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions sx={{ p: 2, borderTop: '1px solid var(--border, #2e3340)' }}>
        <Button onClick={onClose} color="inherit">
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={isSubmitting || targetQuantity <= 0}
          sx={{ bgcolor: 'var(--blue, #4d9fff)', color: '#ffffff' }}
        >
          {isSubmitting ? 'Creating Plan...' : 'Create & Generate Labels'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
