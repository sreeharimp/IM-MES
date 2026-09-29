import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Paper,
  Chip,
  IconButton,
  Collapse,
  Alert,
  CircularProgress,
  TextField,
  MenuItem,
  InputAdornment,
} from '@mui/material';
import {
  Add as AddIcon,
  Print as PrintIcon,
  QrCode2 as QrCodeIcon,
  KeyboardArrowDown as ArrowDownIcon,
  KeyboardArrowUp as ArrowUpIcon,
  Refresh as RefreshIcon,
  AccessTime as ShiftIcon,
  Queue as QueueIcon,
  Search as SearchIcon,
  FilterList as FilterIcon,
} from '@mui/icons-material';
import type { ProductionPlan, ProductionPlanDay, ProductionPlanLabel, Product, Machine, PlanningMode } from '../../types';
import { supabase } from '../../lib/supabase';
import { isWithinPrintWindow, getRelativeDayLabel } from './services/dateWindow';
import { PlanCreateModal } from './PlanCreateModal';
import { PrintJobDialog } from './PrintJobDialog';

interface PlanListProps {
  products: Product[];
  machines: Machine[];
  currentUserName?: string;
  currentUserRole?: string;
  onNavigateToQueue?: () => void;
}

export const PlanList: React.FC<PlanListProps> = ({
  products,
  machines,
  currentUserName = 'Production Planner',
  currentUserRole = 'Admin',
  onNavigateToQueue,
}) => {
  const [plans, setPlans] = useState<ProductionPlan[]>([]);
  const [expandedPlanIds, setExpandedPlanIds] = useState<Set<string>>(new Set());
  const [expandedDayIds, setExpandedDayIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [activePrintPlan, setActivePrintPlan] = useState<ProductionPlan | null>(null);
  const [activePrintLabels, setActivePrintLabels] = useState<ProductionPlanLabel[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [productFilter, setProductFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [generatingDayId, setGeneratingDayId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  // Pagination
  const [page, setPage] = useState<number>(0);
  const [rowsPerPage, setRowsPerPage] = useState<number>(10);

  const canCreate =
    currentUserRole === 'Admin' ||
    currentUserRole === 'PowerUser' ||
    currentUserRole === 'Planner' ||
    currentUserRole === 'Supervisor';

  const fetchPlans = async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from('production_plans')
        .select(`
          *,
          labels:production_plan_labels (*)
        `)
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data: plansData, error: plansError } = await query;
      if (plansError) throw plansError;

      const enhanced: ProductionPlan[] = (plansData || []).map((p: any) => {
        const prod = products.find((x) => x.id === p.product_id);
        const mac = machines.find((x) => x.id === p.machine_id);
        const rawLabels: any[] = (p.labels || []).sort((a: any, b: any) => a.sequence_number - b.sequence_number);
        const stdPack = (prod as any)?.stdPackSize || (prod as any)?.std_pack_size || (prod as any)?.standard_packing_qty || 1000;
        const targetQty = p.planned_quantity || p.target_quantity || 0;
        const cratesPlanned = p.crates_planned || Math.ceil(targetQty / stdPack) || 1;

        const printedCount = rawLabels.filter((l) => l.status === 'printed').length;
        let derivedStatus = p.status || 'confirmed';
        if (rawLabels.length > 0) {
          if (printedCount === rawLabels.length) {
            derivedStatus = 'printed';
          } else if (printedCount > 0) {
            derivedStatus = 'in_progress';
          }
        }
        if (p.status !== derivedStatus && ['printed', 'in_progress'].includes(derivedStatus)) {
          supabase.from('production_plans').update({ status: derivedStatus }).eq('id', p.id).then();
        }

        // If p.days is present use it, otherwise synthesize a day matching p
        const days: ProductionPlanDay[] = (p.days && p.days.length > 0)
          ? p.days.map((d: any) => ({
              ...d,
              status: derivedStatus,
              labels: (d.labels || rawLabels).sort((a: any, b: any) => a.sequence_number - b.sequence_number),
            }))
          : [
              {
                id: p.id,
                plan_id: p.id,
                production_date: p.plan_date || (p.start_date ? p.start_date.split('T')[0] : new Date().toISOString().split('T')[0]),
                shift: p.shift || null,
                batch_code: p.batch_code || 'BATCH',
                quantity_for_day: targetQty,
                crates_for_day: cratesPlanned,
                remainder_quantity: p.remainder_quantity || 0,
                status: derivedStatus,
                created_at: p.created_at,
                labels: rawLabels,
              },
            ];

        return {
          ...p,
          status: derivedStatus,
          start_date: p.plan_date || p.start_date || new Date().toISOString().split('T')[0],
          target_quantity: targetQty,
          crates_planned: cratesPlanned,
          product_name: prod ? prod.name : p.product_id,
          machine_name: mac ? mac.name : p.machine_id,
          standard_packing_qty: stdPack,
          days,
        };
      });

      setPlans(enhanced);
    } catch (err: any) {
      console.error('Failed to fetch plans:', err);
      setNotification({ type: 'error', message: err.message || 'Error fetching plans.' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, [products, machines, statusFilter]);

  // Reset to page 0 when filters change
  useEffect(() => {
    setPage(0);
  }, [statusFilter, productFilter, searchQuery]);

  // Unique product list for filter dropdown
  const productOptions = useMemo(() => {
    const seen = new Map<string, string>();
    plans.forEach((p) => {
      if (p.product_id && p.product_name) seen.set(p.product_id, p.product_name as string);
    });
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [plans]);

  // Client-side filtered plans
  const filteredPlans = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return plans.filter((p) => {
      if (productFilter !== 'all' && p.product_id !== productFilter) return false;
      if (!q) return true;
      const name = (p.product_name as string || '').toLowerCase();
      const batch = (p.batch_code || '').toLowerCase();
      const date = (p.start_date || p.plan_date || '').toLowerCase();
      const notes = (p.notes || '').toLowerCase();
      return name.includes(q) || batch.includes(q) || date.includes(q) || notes.includes(q);
    });
  }, [plans, productFilter, searchQuery]);

  // Paginated slice
  const paginatedPlans = useMemo(() => {
    const start = page * rowsPerPage;
    return filteredPlans.slice(start, start + rowsPerPage);
  }, [filteredPlans, page, rowsPerPage]);

  const handleToggleExpandPlan = (planId: string) => {
    setExpandedPlanIds((prev) => {
      const next = new Set(prev);
      if (next.has(planId)) next.delete(planId);
      else next.add(planId);
      return next;
    });
  };

  const handleToggleExpandDay = (dayId: string) => {
    setExpandedDayIds((prev) => {
      const next = new Set(prev);
      if (next.has(dayId)) next.delete(dayId);
      else next.add(dayId);
      return next;
    });
  };

  const handleGenerateDayLabels = async (day: ProductionPlanDay, plan: ProductionPlan) => {
    setGeneratingDayId(day.id);
    setNotification(null);

    try {
      // First attempt the RPC
      let rpcSuccess = false;
      try {
        const { error: rpcError } = await supabase.rpc('generate_production_plan_day_labels', {
          p_plan_day_id: day.id,
          p_user_id: currentUserName,
        });
        if (!rpcError) rpcSuccess = true;
      } catch (_) {
        rpcSuccess = false;
      }

      // If RPC failed or table not found, directly insert into production_plan_labels
      if (!rpcSuccess) {
        const totalCrates = day.crates_for_day || 1;
        const stdPack = plan.standard_packing_qty || 1000;
        const labelsToInsert = [];
        for (let i = 1; i <= totalCrates; i++) {
          const isLast = i === totalCrates;
          const isPartial = isLast && (day.remainder_quantity || 0) > 0;
          const qty = isPartial ? day.remainder_quantity : stdPack;
          labelsToInsert.push({
            plan_id: plan.id,
            sequence_number: i,
            expected_quantity: qty,
            is_partial: isPartial,
            qr_payload: `${day.batch_code}-${i}`,
            status: 'unprinted',
          });
        }
        const { error: insertErr } = await supabase.from('production_plan_labels').insert(labelsToInsert);
        if (insertErr) throw insertErr;
      }

      setNotification({
        type: 'success',
        message: `Generated labels for Day ${day.production_date} (Batch ${day.batch_code}).`,
      });

      await fetchPlans();
      setExpandedPlanIds((prev) => new Set(prev).add(plan.id));
      setExpandedDayIds((prev) => new Set(prev).add(day.id));
    } catch (err: any) {
      console.error('Day label generation error:', err);
      setNotification({ type: 'error', message: err.message || 'Failed to generate labels.' });
    } finally {
      setGeneratingDayId(null);
    }
  };

  const handleOpenPrintDay = (day: ProductionPlanDay, plan: ProductionPlan) => {
    const syntheticPlan: ProductionPlan = {
      ...plan,
      id: plan.id,
      batch_code: day.batch_code,
      crates_planned: day.crates_for_day,
      planned_quantity: day.quantity_for_day,
      remainder_quantity: day.remainder_quantity,
    } as any;

    setActivePrintPlan(syntheticPlan);
    setActivePrintLabels(day.labels || []);
  };

  const handleSendBatchToQueue = async (day: ProductionPlanDay, plan: ProductionPlan) => {
    try {
      const labelsToQueue = (day.labels || []).filter((l) => l.status !== 'unprinted');
      if (labelsToQueue.length > 0) {
        await supabase
          .from('production_plan_labels')
          .update({ status: 'unprinted' })
          .in('id', labelsToQueue.map((l) => l.id));
        await fetchPlans();
      }
      setNotification({
        type: 'success',
        message: `Added to queue successfully. Batch ${day.batch_code} (${(day.labels || []).length} labels) ready in queue.`,
      });
    } catch (err: any) {
      console.error('Error queuing batch labels:', err);
      setNotification({ type: 'error', message: err.message || 'Failed to send batch to queue.' });
    }
  };

  const getModeChip = (mode: PlanningMode) => {
    switch (mode) {
      case 'date_range':
        return <Chip label="Date Range" size="small" sx={{ bgcolor: 'rgba(167, 139, 250, 0.15)', color: 'var(--purple, #a78bfa)', fontWeight: 600 }} />;
      case 'shift':
        return <Chip label="Shift" size="small" sx={{ bgcolor: 'rgba(0, 214, 143, 0.15)', color: 'var(--green, #00d68f)', fontWeight: 600 }} />;
      case 'quantity_only':
        return <Chip label="Qty Only" size="small" sx={{ bgcolor: 'rgba(245, 166, 35, 0.15)', color: 'var(--amber, #f5a623)', fontWeight: 600 }} />;
      default:
        return <Chip label="Single Day" size="small" sx={{ bgcolor: 'rgba(77, 159, 255, 0.15)', color: 'var(--blue, #4d9fff)', fontWeight: 600 }} />;
    }
  };

  const getStatusChip = (status: string) => {
    switch (status) {
      case 'confirmed':
        return <Chip label="Confirmed" size="small" sx={{ bgcolor: 'rgba(77, 159, 255, 0.15)', color: 'var(--blue, #4d9fff)', fontWeight: 600 }} />;
      case 'printed':
        return <Chip label="Printed" size="small" sx={{ bgcolor: 'rgba(0, 214, 143, 0.15)', color: 'var(--green, #00d68f)', fontWeight: 600 }} />;
      case 'in_progress':
        return <Chip label="In Progress" size="small" sx={{ bgcolor: 'rgba(245, 166, 35, 0.15)', color: 'var(--amber, #f5a623)', fontWeight: 600 }} />;
      case 'completed':
        return <Chip label="Completed" size="small" sx={{ bgcolor: 'rgba(255, 255, 255, 0.08)', color: 'var(--text2, #8a92a8)', fontWeight: 600 }} />;
      default:
        return <Chip label="Draft" size="small" sx={{ bgcolor: 'rgba(255, 255, 255, 0.05)', color: 'var(--text3, #555e72)' }} />;
    }
  };
  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2.5, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, color: 'var(--text, #e2e6f0)' }}>
            Production Batch Plans
          </Typography>
          <Typography variant="body2" sx={{ color: 'var(--text2, #8a92a8)' }}>
            Manage production batch plans and sequential crate labels
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
          {onNavigateToQueue && (
            <Button
              variant="outlined"
              color="secondary"
              startIcon={<QueueIcon />}
              onClick={onNavigateToQueue}
              sx={{ height: 38, fontWeight: 600 }}
            >
              Open Print Queue
            </Button>
          )}

          <TextField
            select
            size="small"
            label="Status Filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            sx={{ minWidth: 140 }}
          >
            <MenuItem value="all">All Statuses</MenuItem>
            <MenuItem value="confirmed">Confirmed</MenuItem>
            <MenuItem value="printed">Printed</MenuItem>
            <MenuItem value="in_progress">In Progress</MenuItem>
            <MenuItem value="completed">Completed</MenuItem>
          </TextField>

          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={() => fetchPlans()}
            sx={{ height: 38 }}
          >
            Refresh
          </Button>

          {canCreate && (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setIsCreateModalOpen(true)}
              sx={{ height: 38, bgcolor: 'var(--blue, #4d9fff)', color: '#ffffff' }}
            >
              Create Plan
            </Button>
          )}
        </Box>
      </Box>

      {/* Search + Filter bar */}
      <Box
        sx={{
          display: 'flex',
          gap: 1.5,
          flexWrap: 'wrap',
          alignItems: 'center',
          mb: 2,
          p: 1.5,
          borderRadius: 2,
          bgcolor: 'var(--bg2, #141720)',
          border: '1px solid var(--border, #2e3340)',
        }}
      >
        <FilterIcon sx={{ color: 'var(--text2, #8a92a8)', fontSize: 20 }} />
        <TextField
          size="small"
          placeholder="Search batch code, product, date, notes…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          sx={{ flex: '1 1 220px', minWidth: 200 }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ fontSize: 18, color: 'var(--text2, #8a92a8)' }} />
                </InputAdornment>
              ),
            },
          }}
        />
        <TextField
          select
          size="small"
          label="Product"
          value={productFilter}
          onChange={(e) => setProductFilter(e.target.value)}
          sx={{ minWidth: 180 }}
        >
          <MenuItem value="all">All Products</MenuItem>
          {productOptions.map((p) => (
            <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label="Status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          sx={{ minWidth: 140 }}
        >
          <MenuItem value="all">All Statuses</MenuItem>
          <MenuItem value="confirmed">Confirmed</MenuItem>
          <MenuItem value="printed">Printed</MenuItem>
          <MenuItem value="in_progress">In Progress</MenuItem>
          <MenuItem value="completed">Completed</MenuItem>
        </TextField>
        <Typography variant="caption" sx={{ color: 'var(--text2, #8a92a8)', ml: 'auto', whiteSpace: 'nowrap' }}>
          {filteredPlans.length} plan{filteredPlans.length !== 1 ? 's' : ''} found
        </Typography>
      </Box>

      {notification && (
        <Alert
          severity={notification.type}
          onClose={() => setNotification(null)}
          sx={{ mb: 2.5 }}
        >
          {notification.message}
        </Alert>
      )}

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid var(--border, #2e3340)', borderRadius: 2, bgcolor: 'var(--bg2, #141720)' }}>
        <Table>
          <TableHead sx={{ bgcolor: 'var(--bg3, #1c2028)' }}>
            <TableRow>
              <TableCell width={50}></TableCell>
              <TableCell sx={{ fontWeight: 700, color: 'var(--text2, #8a92a8)' }}>Mode & Schedule</TableCell>
              <TableCell sx={{ fontWeight: 700, color: 'var(--text2, #8a92a8)' }}>Product & Target</TableCell>
              <TableCell sx={{ fontWeight: 700, color: 'var(--text2, #8a92a8)' }}>Execution Batches</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700, color: 'var(--text2, #8a92a8)' }}>Total Target Qty</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700, color: 'var(--text2, #8a92a8)' }}>Total Cases</TableCell>
              <TableCell sx={{ fontWeight: 700, color: 'var(--text2, #8a92a8)' }}>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 6 }}>
                  <CircularProgress size={32} />
                  <Typography variant="body2" sx={{ mt: 1.5, color: 'var(--text2, #8a92a8)' }}>
                    Loading production plans...
                  </Typography>
                </TableCell>
              </TableRow>
            ) : filteredPlans.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 6 }}>
                  <Typography variant="body1" sx={{ color: 'var(--text2, #8a92a8)', fontWeight: 500 }}>
                    {searchQuery || productFilter !== 'all' ? 'No plans match your search / filters.' : 'No production plans found.'}
                  </Typography>
                  {canCreate && !searchQuery && productFilter === 'all' && (
                    <Button
                      variant="outlined"
                      startIcon={<AddIcon />}
                      onClick={() => setIsCreateModalOpen(true)}
                      sx={{ mt: 2 }}
                    >
                      Create First Plan
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ) : (
              (() => {
                const todayStr = new Date().toISOString().split('T')[0];
                let shownTodayDivider = false;
                let shownPreviousDivider = false;

                return paginatedPlans.map((plan) => {
                  const isExpanded = expandedPlanIds.has(plan.id);
                  const days = plan.days || [];
                  const totalCases = days.reduce((sum, d) => sum + d.crates_for_day, 0) || (plan as any).crates_planned || 0;
                  const planDate = (plan as any).start_date || (plan as any).plan_date || '';
                  const isToday = planDate === todayStr;

                  // Insert section dividers
                  const dividers: React.ReactNode[] = [];
                  if (isToday && !shownTodayDivider) {
                    shownTodayDivider = true;
                    dividers.push(
                      <TableRow key="divider-today">
                        <TableCell colSpan={7} sx={{ py: 0.5, px: 2, bgcolor: 'rgba(0, 214, 143, 0.08)', borderTop: '2px solid rgba(0, 214, 143, 0.35)', borderBottom: '1px solid rgba(0, 214, 143, 0.2)' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#00d68f', boxShadow: '0 0 6px #00d68f' }} />
                            <Typography variant="caption" sx={{ fontWeight: 700, color: '#00d68f', letterSpacing: '0.08em' }}>
                              TODAY — {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}
                            </Typography>
                          </Box>
                        </TableCell>
                      </TableRow>
                    );
                  } else if (!isToday && shownTodayDivider && !shownPreviousDivider) {
                    shownPreviousDivider = true;
                    dividers.push(
                      <TableRow key="divider-prev">
                        <TableCell colSpan={7} sx={{ py: 0.5, px: 2, bgcolor: 'rgba(255,255,255,0.03)', borderTop: '1px solid var(--border, #2e3340)', borderBottom: '1px solid var(--border, #2e3340)' }}>
                          <Typography variant="caption" sx={{ fontWeight: 700, color: 'var(--text3, #555e72)', letterSpacing: '0.08em' }}>
                            PREVIOUS &amp; UPCOMING PLANS
                          </Typography>
                        </TableCell>
                      </TableRow>
                    );
                  }

                  const batchCode = (plan as any).batch_code || days[0]?.batch_code || '—';

                  return (
                    <React.Fragment key={plan.id}>
                      {dividers}
                      <TableRow
                        hover
                        sx={{
                          '&:last-child td, &:last-child th': { border: 0 },
                          ...(isToday ? { borderLeft: '3px solid rgba(0, 214, 143, 0.5)' } : {}),
                        }}
                      >
                        <TableCell>
                          <IconButton size="small" onClick={() => handleToggleExpandPlan(plan.id)} sx={{ color: 'var(--text2, #8a92a8)' }}>
                            {isExpanded ? <ArrowUpIcon /> : <ArrowDownIcon />}
                          </IconButton>
                        </TableCell>

                        {/* Prominent Batch Code column */}
                        <TableCell>
                          <Typography
                            variant="body2"
                            sx={{
                              fontFamily: 'monospace',
                              fontWeight: 800,
                              fontSize: '0.9rem',
                              color: isToday ? '#00d68f' : 'var(--blue, #4d9fff)',
                              letterSpacing: '0.04em',
                            }}
                          >
                            {batchCode}
                          </Typography>
                          {isToday && (
                            <Chip
                              label="TODAY"
                              size="small"
                              sx={{
                                height: 16,
                                fontSize: '0.6rem',
                                fontWeight: 700,
                                bgcolor: 'rgba(0, 214, 143, 0.15)',
                                color: '#00d68f',
                                letterSpacing: '0.06em',
                                mt: 0.5,
                              }}
                            />
                          )}
                        </TableCell>

                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                            {getModeChip(plan.planning_mode)}
                            <Typography variant="body2" sx={{ fontWeight: 700, color: 'var(--text, #e2e6f0)' }}>
                              {plan.start_date}
                              {plan.end_date && plan.end_date !== plan.start_date && ` → ${plan.end_date}`}
                            </Typography>
                          </Box>
                          {plan.shift && (
                            <Typography variant="caption" sx={{ color: 'var(--text2, #8a92a8)' }}>
                              Shift {plan.shift}
                            </Typography>
                          )}
                        </TableCell>

                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 700, color: 'var(--text, #e2e6f0)' }}>
                            {plan.product_name}
                          </Typography>
                          <Typography variant="caption" sx={{ color: 'var(--text2, #8a92a8)' }}>
                            Std Pack: {plan.standard_packing_qty} pcs/case
                          </Typography>
                        </TableCell>

                        <TableCell align="right">
                          <Typography variant="body2" sx={{ fontWeight: 700, color: 'var(--text, #e2e6f0)' }}>
                            {(plan.target_quantity || (plan as any).planned_quantity || 0).toLocaleString()} pcs
                          </Typography>
                        </TableCell>

                        <TableCell align="right">
                          <Typography variant="body2" sx={{ fontWeight: 700, color: 'var(--text, #e2e6f0)' }}>
                            {totalCases} Cases
                          </Typography>
                        </TableCell>

                        <TableCell>{getStatusChip(plan.status)}</TableCell>
                      </TableRow>

                      <TableRow>
                        <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={7}>
                        <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                          <Box sx={{ margin: 2, p: 2, borderRadius: 2, bgcolor: 'var(--bg3, #1c2028)', border: '1px solid var(--border, #2e3340)' }}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'var(--text, #e2e6f0)', mb: 1.5 }}>
                              Batch Execution Breakdown ({days.length} Batches)
                            </Typography>

                            {days.length === 0 ? (
                              <Alert severity="info" sx={{ fontSize: '0.8125rem' }}>
                                No batch breakdown records found for this plan.
                              </Alert>
                            ) : (
                              <Table size="small" sx={{ bgcolor: 'var(--bg2, #141720)', borderRadius: 1.5, border: '1px solid var(--border, #2e3340)' }}>
                                <TableHead sx={{ bgcolor: 'var(--bg4, #252a35)' }}>
                                  <TableRow>
                                    <TableCell width={40}></TableCell>
                                    <TableCell sx={{ fontWeight: 700, color: 'var(--text2, #8a92a8)' }}>Production Date</TableCell>
                                    <TableCell sx={{ fontWeight: 700, color: 'var(--text2, #8a92a8)' }}>Batch Code</TableCell>
                                    <TableCell sx={{ fontWeight: 700, color: 'var(--text2, #8a92a8)' }}>Quantity</TableCell>
                                    <TableCell sx={{ fontWeight: 700, color: 'var(--text2, #8a92a8)' }}>Cases</TableCell>
                                    <TableCell sx={{ fontWeight: 700, color: 'var(--text2, #8a92a8)' }}>Window Status</TableCell>
                                    <TableCell sx={{ fontWeight: 700, color: 'var(--text2, #8a92a8)' }}>Labels Status</TableCell>
                                    <TableCell align="center" sx={{ fontWeight: 700, color: 'var(--text2, #8a92a8)' }}>Actions</TableCell>
                                  </TableRow>
                                </TableHead>
                                <TableBody>
                                  {days.map((day) => {
                                    const isDayExpanded = expandedDayIds.has(day.id);
                                    const withinWindow = isWithinPrintWindow(day.production_date);
                                    const relativeLabel = getRelativeDayLabel(day.production_date);
                                    const labels = day.labels || [];
                                    const isGenerating = generatingDayId === day.id;

                                    return (
                                      <React.Fragment key={day.id}>
                                        <TableRow hover>
                                          <TableCell>
                                            <IconButton size="small" onClick={() => handleToggleExpandDay(day.id)} sx={{ color: 'var(--text2, #8a92a8)' }}>
                                              {isDayExpanded ? <ArrowUpIcon /> : <ArrowDownIcon />}
                                            </IconButton>
                                          </TableCell>
                                          <TableCell sx={{ fontWeight: 700, color: 'var(--text, #e2e6f0)' }}>
                                            {day.production_date}
                                            {day.shift && ` (Shift ${day.shift})`}
                                          </TableCell>
                                          <TableCell sx={{ fontFamily: 'monospace', fontWeight: 800, color: 'var(--blue, #4d9fff)' }}>
                                            {day.batch_code}
                                          </TableCell>
                                          <TableCell sx={{ color: 'var(--text, #e2e6f0)' }}>{day.quantity_for_day.toLocaleString()} pcs</TableCell>
                                          <TableCell>
                                            <Typography variant="body2" sx={{ fontWeight: 600, color: 'var(--text, #e2e6f0)' }}>
                                              {day.crates_for_day} cases
                                            </Typography>
                                            {day.remainder_quantity > 0 && (
                                              <Typography variant="caption" sx={{ color: 'var(--amber, #f5a623)', display: 'block' }}>
                                                Last case: {day.remainder_quantity} pcs (Partial)
                                              </Typography>
                                            )}
                                          </TableCell>
                                          <TableCell>
                                            <Chip
                                              label={`${relativeLabel} ${withinWindow ? '• Printable' : '• Outside Window'}`}
                                              size="small"
                                              sx={{
                                                height: 20,
                                                fontSize: '0.6875rem',
                                                fontWeight: 600,
                                                bgcolor: withinWindow ? 'rgba(0, 214, 143, 0.15)' : 'rgba(255, 77, 77, 0.15)',
                                                color: withinWindow ? 'var(--green, #00d68f)' : 'var(--red, #ff4d4d)',
                                              }}
                                            />
                                          </TableCell>
                                          <TableCell>
                                            {labels.length === 0 ? (
                                              <Chip label="Not Generated" size="small" sx={{ height: 20, fontSize: '0.6875rem', bgcolor: 'rgba(255, 255, 255, 0.05)', color: 'var(--text3, #555e72)' }} />
                                            ) : (
                                              <Chip
                                                label={`${labels.filter((l) => l.status === 'printed').length} / ${labels.length} Printed`}
                                                color="primary"
                                                size="small"
                                                sx={{ height: 20, fontSize: '0.6875rem', fontWeight: 600, bgcolor: 'rgba(77, 159, 255, 0.15)', color: 'var(--blue, #4d9fff)' }}
                                              />
                                            )}
                                          </TableCell>
                                          <TableCell align="center">
                                            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center' }}>
                                              {labels.length === 0 ? (
                                                <Button
                                                  size="small"
                                                  variant="outlined"
                                                  startIcon={isGenerating ? <CircularProgress size={14} /> : <QrCodeIcon />}
                                                  disabled={isGenerating}
                                                  onClick={() => handleGenerateDayLabels(day, plan)}
                                                  sx={{ fontSize: '0.75rem', py: 0.25 }}
                                                >
                                                  {isGenerating ? 'Generating...' : 'Gen Labels'}
                                                </Button>
                                              ) : (
                                                <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center' }}>
                                                  <Button
                                                    size="small"
                                                    variant="contained"
                                                    startIcon={<QueueIcon />}
                                                    onClick={() => handleSendBatchToQueue(day, plan)}
                                                    sx={{
                                                      fontSize: '0.75rem',
                                                      py: 0.25,
                                                      px: 1,
                                                      bgcolor: 'var(--green, #00d68f)',
                                                      color: '#0d0f12',
                                                      fontWeight: 700,
                                                      '&:hover': { bgcolor: '#00bd7e' },
                                                    }}
                                                  >
                                                    Queue
                                                  </Button>
                                                  <Button
                                                    size="small"
                                                    variant="outlined"
                                                    startIcon={<PrintIcon />}
                                                    onClick={() => handleOpenPrintDay(day, plan)}
                                                    sx={{
                                                      fontSize: '0.75rem',
                                                      py: 0.25,
                                                      px: 1,
                                                      borderColor: 'var(--border, #2e3340)',
                                                      color: 'var(--text2, #8a92a8)',
                                                    }}
                                                  >
                                                    Print
                                                  </Button>
                                                </Box>
                                              )}
                                            </Box>
                                          </TableCell>
                                        </TableRow>

                                        <TableRow>
                                          <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={8}>
                                            <Collapse in={isDayExpanded} timeout="auto" unmountOnExit>
                                              <Box sx={{ p: 2, bgcolor: 'var(--bg3, #1c2028)', borderTop: '1px dashed var(--border, #2e3340)' }}>
                                                <Typography variant="caption" sx={{ fontWeight: 700, color: 'var(--text2, #8a92a8)', display: 'block', mb: 1 }}>
                                                  CASE LABELS FOR BATCH {day.batch_code} ({labels.length} Total Cases)
                                                </Typography>

                                                {labels.length === 0 ? (
                                                  <Typography variant="body2" sx={{ color: 'var(--text2, #8a92a8)' }}>
                                                    Labels not generated yet. Click "Gen Labels" above.
                                                  </Typography>
                                                ) : (
                                                  <Box
                                                    sx={{
                                                      display: 'grid',
                                                      gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                                                      gap: 1.5,
                                                      maxHeight: 220,
                                                      overflowY: 'auto',
                                                    }}
                                                  >
                                                    {labels.map((lbl) => (
                                                      <Box
                                                        key={lbl.id}
                                                        sx={{
                                                          p: 1.5,
                                                          borderRadius: 1.5,
                                                          bgcolor: 'var(--bg2, #141720)',
                                                          border: '1px solid var(--border, #2e3340)',
                                                          display: 'flex',
                                                          flexDirection: 'column',
                                                          gap: 0.5,
                                                        }}
                                                      >
                                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                          <Typography variant="body2" sx={{ fontWeight: 700, color: 'var(--text, #e2e6f0)' }}>
                                                            CASE #{lbl.sequence_number}
                                                          </Typography>
                                                          <Chip
                                                            label={lbl.status.toUpperCase()}
                                                            size="small"
                                                            sx={{
                                                              height: 18,
                                                              fontSize: '0.625rem',
                                                              fontWeight: 700,
                                                              bgcolor: lbl.status === 'printed' ? 'rgba(0, 214, 143, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                                                              color: lbl.status === 'printed' ? 'var(--green, #00d68f)' : 'var(--text2, #8a92a8)',
                                                            }}
                                                          />
                                                        </Box>
                                                        <Typography variant="caption" sx={{ color: 'var(--text2, #8a92a8)' }}>
                                                          Qty: {lbl.expected_quantity} pcs {lbl.is_partial && '(Partial)'}
                                                        </Typography>
                                                        <Typography
                                                          variant="caption"
                                                          sx={{
                                                            color: 'var(--blue, #4d9fff)',
                                                            fontFamily: 'monospace',
                                                            fontWeight: 600,
                                                            fontSize: '0.7rem',
                                                          }}
                                                        >
                                                          QR: {lbl.qr_payload}
                                                        </Typography>
                                                      </Box>
                                                    ))}
                                                  </Box>
                                                )}
                                              </Box>
                                            </Collapse>
                                          </TableCell>
                                        </TableRow>
                                      </React.Fragment>
                                    );
                                  })}
                                </TableBody>
                              </Table>
                            )}
                          </Box>
                        </Collapse>
                      </TableCell>
                    </TableRow>
                    </React.Fragment>
                  );
                });
              })()
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <TablePagination
        component="div"
        count={filteredPlans.length}
        page={page}
        onPageChange={(_, newPage) => setPage(newPage)}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
        rowsPerPageOptions={[5, 10, 25, 50]}
        sx={{
          color: 'var(--text2, #8a92a8)',
          borderTop: '1px solid var(--border, #2e3340)',
          '.MuiTablePagination-select, .MuiTablePagination-selectIcon': { color: 'var(--text2, #8a92a8)' },
          '.MuiTablePagination-actions button': { color: 'var(--text2, #8a92a8)' },
          '.MuiTablePagination-actions button:disabled': { opacity: 0.3 },
        }}
      />

      <PlanCreateModal
        open={isCreateModalOpen}
        products={products}
        machines={machines}
        currentUserName={currentUserName}
        onClose={() => setIsCreateModalOpen(false)}
        onPlanCreated={() => {
          fetchPlans();
          setNotification({ type: 'success', message: 'New production plan created.' });
        }}
      />

      {activePrintPlan && (
        <PrintJobDialog
          open={Boolean(activePrintPlan)}
          plan={activePrintPlan}
          labels={activePrintLabels}
          currentUserName={currentUserName}
          onClose={() => setActivePrintPlan(null)}
          onNavigateToQueue={onNavigateToQueue}
          onPrintCompleted={() => {
            fetchPlans();
            setNotification({ type: 'success', message: 'Print job PDF generated and recorded.' });
          }}
        />
      )}
    </Box>
  );
};
