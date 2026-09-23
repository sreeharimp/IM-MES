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
  IconButton,
  Tooltip,
} from '@mui/material';
import Grid from '@mui/material/Grid2';
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
import { Product, Machine, ProductionPlan, PlanningMode } from '../../types';
import { getCurrentProductionDayStr, isWithinPrintWindow, getRelativeDayLabel } from '../../lib/dateWindow';
import { generateBatchCode } from '../../services/batchCodeService';
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
  machines: Machine[];
  onClose: () => void;
  onPlanCreated: (plan: ProductionPlan) => void;
}

export const PlanCreateModal: React.FC<PlanCreateModalProps> = ({
  open,
  products,
  onClose,
  onPlanCreated,
}) => {
  const defaultDate = getCurrentProductionDayStr();
  const [mode, setMode] = useState<PlanningMode>('single_day');
  const [startDate, setStartDate] = useState<string>(defaultDate);
  const [endDate, setEndDate] = useState<string>(defaultDate);
  const [productId, setProductId] = useState<string>('');
  const [shift, setShift] = useState<string>('A');
  const [targetQuantity, setTargetQuantity] = useState<number>(5000);
  const [notes, setNotes] = useState<string>('');
  const [dayBreakdown, setDayBreakdown] = useState<DayBreakdownItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      const today = getCurrentProductionDayStr();
      setStartDate(today);
      setEndDate(today);
      setMode('single_day');
      setTargetQuantity(5000);
      setShift('A');
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

  // Prioritize std_pack_size set in Product Management / Admin Console
  const stdPackQty = selectedProduct?.std_pack_size || selectedProduct?.standard_packing_qty || 1000;
  const pCode = selectedProduct?.batch_identifier || selectedProduct?.item_code || 'AP';

  // Helper to get dates between start and end inclusive
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

  // Recompute day breakdown whenever mode, dates, product, or target qty changes
  const resetBreakdownToEvenSplit = () => {
    if (mode === 'date_range') {
      const dates = getDateRangeArray(startDate, endDate);
      const dayCount = Math.max(1, dates.length);
      const basePerDay = Math.floor(targetQuantity / dayCount);
      const remOverall = targetQuantity % dayCount;

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
          quantity: targetQuantity,
          crates: Math.ceil(targetQuantity / stdPackQty) || 0,
          remainder: targetQuantity % stdPackQty,
        },
      ]);
    }
  };

  useEffect(() => {
    resetBreakdownToEvenSplit();
  }, [mode, startDate, endDate, productId, stdPackQty, targetQuantity]);

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
    if (!productId || targetQuantity <= 0) {
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
      const parentPayload = {
        product_id: productId,
        planning_mode: mode,
        start_date: startDate,
        end_date: mode === 'date_range' ? endDate : null,
        shift: mode === 'shift' || mode === 'single_day' ? shift : null,
        target_quantity: mode === 'date_range' ? totalBreakdownQty : targetQuantity,
        status: 'confirmed',
        notes: notes.trim() || null,
        created_by: 'Production Planner',
      };

      const { data: parentPlan, error: parentError } = await supabase
        .from('production_plans')
        .insert([parentPayload])
        .select()
        .single();

      if (parentError) throw parentError;

      // 2. Insert child day execution rows
      const daysToInsert = dayBreakdown
        .filter((d) => d.quantity > 0)
        .map((d) => ({
          plan_id: parentPlan.id,
          production_date: d.dateStr,
          shift: mode === 'shift' ? shift : null,
          batch_code: d.batchCode,
          quantity_for_day: d.quantity,
          crates_for_day: d.crates,
          remainder_quantity: d.remainder,
          status: 'confirmed',
        }));

      const { data: insertedDays, error: daysError } = await supabase
        .from('production_plan_days')
        .insert(daysToInsert)
        .select();

      if (daysError) throw daysError;

      // 3. Auto-generate sequential crate labels for each day via RPC
      if (insertedDays && insertedDays.length > 0) {
        for (const day of insertedDays) {
          try {
            await supabase.rpc('generate_production_plan_day_labels', {
              p_plan_day_id: day.id,
              p_user_id: 'Production Planner',
            });
          } catch (rpcErr) {
            console.warn('Auto label generation failed for day', day.id, rpcErr);
          }
        }
      }

      onPlanCreated({
        ...parentPlan,
        product_name: selectedProduct?.name,
        standard_packing_qty: stdPackQty,
        days: insertedDays || [],
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
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontWeight: 700, pb: 1, borderBottom: '1px solid #e2e8f0' }}>
        Create Production Plan & Generate Batch Labels
      </DialogTitle>
      <DialogContent sx={{ pt: 2.5 }}>
        {errorMessage && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {errorMessage}
          </Alert>
        )}

        {/* Planning Mode Selector */}
        <Box sx={{ mb: 2.5, p: 1.5, borderRadius: 2, bgcolor: '#f8fafc', border: '1px solid #e2e8f0' }}>
          <FormControl component="fieldset">
            <FormLabel component="legend" sx={{ fontSize: '0.8125rem', fontWeight: 700, color: '#475569', mb: 0.5 }}>
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
          {/* Product Selector */}
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
              {products.map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  {p.name} ({p.item_code || p.batch_identifier || p.id})
                </MenuItem>
              ))}
            </TextField>
          </Grid>

          {/* Standard Packing Qty (From product master) */}
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

          {/* Mode-specific Date and Shift pickers */}
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
                  onChange={(e) => setTargetQuantity(Math.max(1, parseInt(e.target.value) || 0))}
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
                  onChange={(e) => setTargetQuantity(Math.max(1, parseInt(e.target.value) || 0))}
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
                  onChange={(e) => setTargetQuantity(Math.max(1, parseInt(e.target.value) || 0))}
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
                  onChange={(e) => setTargetQuantity(Math.max(1, parseInt(e.target.value) || 0))}
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

          {/* Date Range Editable Day-by-Day Breakdown Table */}
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
                            value={item.quantity}
                            onChange={(e) => handleDayQtyChange(idx, parseInt(e.target.value) || 0)}
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

          {/* Single Day / Shift Batch Code Preview */}
          {mode !== 'date_range' && dayBreakdown.length > 0 && (
            <Grid size={{ xs: 12 }}>
              <Box
                sx={{
                  p: 1.5,
                  borderRadius: 2,
                  backgroundColor: '#f1f5f9',
                  border: '1px solid #e2e8f0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <BatchIcon sx={{ fontSize: 20, color: 'primary.main' }} />
                  <Box>
                    <Typography variant="caption" sx={{ color: '#64748b', display: 'block', lineHeight: 1 }}>
                      AUTO GENERATED BATCH CODE (PER PRODUCTION DAY)
                    </Typography>
                    <Typography variant="body1" sx={{ fontWeight: 700, color: '#0f172a', letterSpacing: '0.05em' }}>
                      {dayBreakdown[0].batchCode}
                    </Typography>
                  </Box>
                </Box>
                <Chip
                  label={`${dayBreakdown[0].crates} Cases Planned`}
                  color="primary"
                  size="small"
                  sx={{ fontWeight: 700 }}
                />
              </Box>
            </Grid>
          )}

          {/* Remainder Warning Notification for non-date-range */}
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

          {/* Notes */}
          <Grid size={{ xs: 12 }}>
            <TextField
              label="Production Notes / Instructions"
              multiline
              rows={2}
              fullWidth
              size="small"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Clean room medical grade batch, verify cavity 4"
            />
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions sx={{ p: 2, borderTop: '1px solid #e2e8f0' }}>
        <Button onClick={onClose} color="inherit">
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={isSubmitting || targetQuantity <= 0}
        >
          {isSubmitting ? 'Creating Plan...' : 'Create & Generate Labels'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
