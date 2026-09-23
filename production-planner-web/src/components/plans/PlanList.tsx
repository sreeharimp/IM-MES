import React, { useState, useEffect } from 'react';
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
  Paper,
  Chip,
  IconButton,
  Collapse,
  Alert,
  Tooltip,
  CircularProgress,
  TextField,
  MenuItem,
  Card,
  CardContent,
} from '@mui/material';
import {
  Add as AddIcon,
  Print as PrintIcon,
  QrCode2 as QrCodeIcon,
  KeyboardArrowDown as ArrowDownIcon,
  KeyboardArrowUp as ArrowUpIcon,
  Refresh as RefreshIcon,
  CalendarMonth as CalendarIcon,
  PrecisionManufacturing as MachineIcon,
  AccessTime as ShiftIcon,
  Layers as CrateIcon,
  Queue as QueueIcon,
} from '@mui/icons-material';
import { ProductionPlan, ProductionPlanDay, ProductionPlanLabel, Product, Machine, PlanningMode } from '../../types';
import { supabase } from '../../lib/supabase';
import { isWithinPrintWindow, getRelativeDayLabel } from '../../lib/dateWindow';
import { PlanCreateModal } from './PlanCreateModal';
import { PrintJobDialog } from '../labels/PrintJobDialog';

interface PlanListProps {
  products: Product[];
  machines: Machine[];
  onNavigateToQueue?: () => void;
}

export const PlanList: React.FC<PlanListProps> = ({ products, machines, onNavigateToQueue }) => {
  const [plans, setPlans] = useState<ProductionPlan[]>([]);
  const [expandedPlanIds, setExpandedPlanIds] = useState<Set<string>>(new Set());
  const [expandedDayIds, setExpandedDayIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [activePrintPlan, setActivePrintPlan] = useState<ProductionPlan | null>(null);
  const [activePrintLabels, setActivePrintLabels] = useState<ProductionPlanLabel[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [generatingDayId, setGeneratingDayId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Fetch production plans with nested days and labels
  const fetchPlans = async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from('production_plans')
        .select(`
          *,
          days:production_plan_days (
            *,
            labels:production_plan_labels (*)
          )
        `)
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data: plansData, error: plansError } = await query;
      if (plansError) throw plansError;

      // Enhance with product and machine names
      const enhanced: ProductionPlan[] = (plansData || []).map((p: any) => {
        const prod = products.find((x) => x.id === p.product_id);
        const mac = machines.find((x) => x.id === p.machine_id);
        const sortedDays = (p.days || []).sort((a: any, b: any) =>
          a.production_date.localeCompare(b.production_date)
        );

        return {
          ...p,
          product_name: prod ? prod.name : p.product_id,
          machine_name: mac ? mac.name : p.machine_id,
          standard_packing_qty: prod?.std_pack_size || prod?.standard_packing_qty || 1000,
          days: sortedDays,
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

  // Generate labels for a specific day execution record
  const handleGenerateDayLabels = async (day: ProductionPlanDay, plan: ProductionPlan) => {
    setGeneratingDayId(day.id);
    setNotification(null);

    try {
      const { data, error } = await supabase.rpc('generate_production_plan_day_labels', {
        p_plan_day_id: day.id,
        p_user_id: 'Production Planner',
      });

      if (error) throw error;

      setNotification({
        type: 'success',
        message: `Generated labels for Day ${day.production_date} (Batch ${day.batch_code}).`,
      });

      await fetchPlans();
      // Auto expand this plan and day
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

  const getModeChip = (mode: PlanningMode) => {
    switch (mode) {
      case 'date_range':
        return <Chip label="Date Range" size="small" sx={{ bgcolor: '#ede9fe', color: '#6d28d9', fontWeight: 600 }} />;
      case 'shift':
        return <Chip label="Shift" size="small" sx={{ bgcolor: '#d1fae5', color: '#065f46', fontWeight: 600 }} />;
      case 'quantity_only':
        return <Chip label="Qty Only" size="small" sx={{ bgcolor: '#fef3c7', color: '#92400e', fontWeight: 600 }} />;
      default:
        return <Chip label="Single Day" size="small" sx={{ bgcolor: '#e0f2fe', color: '#0369a1', fontWeight: 600 }} />;
    }
  };

  const getStatusChip = (status: string) => {
    switch (status) {
      case 'confirmed':
        return <Chip label="Confirmed" size="small" sx={{ bgcolor: '#e0f2fe', color: '#0369a1', fontWeight: 600 }} />;
      case 'printed':
        return <Chip label="Printed" size="small" sx={{ bgcolor: '#dcfce7', color: '#15803d', fontWeight: 600 }} />;
      case 'in_progress':
        return <Chip label="In Progress" size="small" sx={{ bgcolor: '#fef3c7', color: '#b45309', fontWeight: 600 }} />;
      case 'completed':
        return <Chip label="Completed" size="small" sx={{ bgcolor: '#f1f5f9', color: '#475569', fontWeight: 600 }} />;
      default:
        return <Chip label="Draft" size="small" sx={{ bgcolor: '#f1f5f9', color: '#64748b' }} />;
    }
  };

  return (
    <Box>
      {/* Action and Filter Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800, color: '#0f172a' }}>
            Production Planning & Daily Batch Execution
          </Typography>
          <Typography variant="body2" sx={{ color: '#64748b' }}>
            3-tier manufacturing hierarchy: Plan Intent → Day-Scoped Batch Execution → Sequential Case Labels
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
          {onNavigateToQueue && (
            <Button
              variant="outlined"
              color="secondary"
              startIcon={<QueueIcon />}
              onClick={onNavigateToQueue}
              sx={{ height: 40, fontWeight: 700 }}
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
            sx={{ height: 40 }}
          >
            Refresh
          </Button>

          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setIsCreateModalOpen(true)}
            sx={{ height: 40 }}
          >
            Create Plan
          </Button>
        </Box>
      </Box>

      {/* Notifications */}
      {notification && (
        <Alert
          severity={notification.type}
          onClose={() => setNotification(null)}
          sx={{ mb: 2.5 }}
        >
          {notification.message}
        </Alert>
      )}

      {/* Plans Table */}
      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: 3 }}>
        <Table>
          <TableHead sx={{ bgcolor: '#f8fafc' }}>
            <TableRow>
              <TableCell width={50}></TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Mode & Schedule</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Product & Target</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Execution Days</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>Total Target Qty</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>Total Cases</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 6 }}>
                  <CircularProgress size={32} />
                  <Typography variant="body2" sx={{ mt: 1.5, color: '#64748b' }}>
                    Loading production plans...
                  </Typography>
                </TableCell>
              </TableRow>
            ) : plans.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 6 }}>
                  <Typography variant="body1" sx={{ color: '#64748b', fontWeight: 500 }}>
                    No production plans found.
                  </Typography>
                  <Button
                    variant="outlined"
                    startIcon={<AddIcon />}
                    onClick={() => setIsCreateModalOpen(true)}
                    sx={{ mt: 2 }}
                  >
                    Create First Plan
                  </Button>
                </TableCell>
              </TableRow>
            ) : (
              plans.map((plan) => {
                const isExpanded = expandedPlanIds.has(plan.id);
                const days = plan.days || [];
                const totalCases = days.reduce((sum, d) => sum + d.crates_for_day, 0) || (plan as any).crates_planned || 0;

                return (
                  <React.Fragment key={plan.id}>
                    <TableRow hover sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                      <TableCell>
                        <IconButton size="small" onClick={() => handleToggleExpandPlan(plan.id)}>
                          {isExpanded ? <ArrowUpIcon /> : <ArrowDownIcon />}
                        </IconButton>
                      </TableCell>

                      {/* Mode & Schedule */}
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                          {getModeChip(plan.planning_mode)}
                          <Typography variant="body2" sx={{ fontWeight: 700, color: '#0f172a' }}>
                            {plan.start_date}
                            {plan.end_date && plan.end_date !== plan.start_date && ` → ${plan.end_date}`}
                          </Typography>
                        </Box>
                        {plan.shift && (
                          <Typography variant="caption" sx={{ color: '#64748b', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <ShiftIcon sx={{ fontSize: 14 }} /> Shift {plan.shift}
                          </Typography>
                        )}
                      </TableCell>

                      {/* Product */}
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 700, color: '#0f172a' }}>
                          {plan.product_name}
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#64748b' }}>
                          Std Pack: {plan.standard_packing_qty} pcs/case
                        </Typography>
                      </TableCell>

                      {/* Execution Days count */}
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: '#1e293b' }}>
                          {days.length} Day(s) Scheduled
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#0284c7' }}>
                          Click arrow to expand daily batches
                        </Typography>
                      </TableCell>

                      {/* Target Quantity */}
                      <TableCell align="right">
                        <Typography variant="body2" sx={{ fontWeight: 700, color: '#0f172a' }}>
                          {(plan.target_quantity || (plan as any).planned_quantity || 0).toLocaleString()} pcs
                        </Typography>
                      </TableCell>

                      {/* Total Cases */}
                      <TableCell align="right">
                        <Typography variant="body2" sx={{ fontWeight: 700, color: '#0f172a' }}>
                          {totalCases} Cases
                        </Typography>
                      </TableCell>

                      {/* Status */}
                      <TableCell>{getStatusChip(plan.status)}</TableCell>
                    </TableRow>

                    {/* Tier 2: Collapsible Child Days for Plan */}
                    <TableRow>
                      <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={7}>
                        <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                          <Box sx={{ margin: 2, p: 2, borderRadius: 2, bgcolor: '#f8fafc', border: '1px solid #e2e8f0' }}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#1e293b', mb: 1.5 }}>
                              Daily Batch Execution Schedule ({days.length} Days)
                            </Typography>

                            {days.length === 0 ? (
                              <Alert severity="info" sx={{ fontSize: '0.8125rem' }}>
                                No day execution breakdown records found for this plan.
                              </Alert>
                            ) : (
                              <Table size="small" sx={{ bgcolor: '#ffffff', borderRadius: 1.5, border: '1px solid #e2e8f0' }}>
                                <TableHead sx={{ bgcolor: '#f1f5f9' }}>
                                  <TableRow>
                                    <TableCell width={40}></TableCell>
                                    <TableCell sx={{ fontWeight: 700 }}>Production Date</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }}>Daily Batch Code</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }}>Quantity</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }}>Cases</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }}>Window Status</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }}>Labels Status</TableCell>
                                    <TableCell align="center" sx={{ fontWeight: 700 }}>Actions</TableCell>
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
                                            <IconButton size="small" onClick={() => handleToggleExpandDay(day.id)}>
                                              {isDayExpanded ? <ArrowUpIcon /> : <ArrowDownIcon />}
                                            </IconButton>
                                          </TableCell>
                                          <TableCell sx={{ fontWeight: 700 }}>
                                            {day.production_date}
                                            {day.shift && ` (Shift ${day.shift})`}
                                          </TableCell>
                                          <TableCell sx={{ fontFamily: 'monospace', fontWeight: 800, color: 'primary.main' }}>
                                            {day.batch_code}
                                          </TableCell>
                                          <TableCell>{day.quantity_for_day.toLocaleString()} pcs</TableCell>
                                          <TableCell>
                                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                              {day.crates_for_day} cases
                                            </Typography>
                                            {day.remainder_quantity > 0 && (
                                              <Typography variant="caption" sx={{ color: 'warning.main', display: 'block' }}>
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
                                                bgcolor: withinWindow ? '#f0fdf4' : '#fef2f2',
                                                color: withinWindow ? '#15803d' : '#b91c1c',
                                              }}
                                            />
                                          </TableCell>
                                          <TableCell>
                                            {labels.length === 0 ? (
                                              <Chip label="Not Generated" size="small" sx={{ height: 20, fontSize: '0.6875rem' }} />
                                            ) : (
                                              <Chip
                                                label={`${labels.filter((l) => l.status === 'printed').length} / ${labels.length} Printed`}
                                                color="primary"
                                                size="small"
                                                sx={{ height: 20, fontSize: '0.6875rem', fontWeight: 600 }}
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
                                                <Button
                                                  size="small"
                                                  variant="contained"
                                                  startIcon={<PrintIcon />}
                                                  onClick={() => handleOpenPrintDay(day, plan)}
                                                  sx={{ fontSize: '0.75rem', py: 0.25 }}
                                                >
                                                  Print Day
                                                </Button>
                                              )}
                                            </Box>
                                          </TableCell>
                                        </TableRow>

                                        {/* Tier 3: Collapsible Case Labels for Day */}
                                        <TableRow>
                                          <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={8}>
                                            <Collapse in={isDayExpanded} timeout="auto" unmountOnExit>
                                              <Box sx={{ p: 2, bgcolor: '#f1f5f9', borderTop: '1px dashed #cbd5e1' }}>
                                                <Typography variant="caption" sx={{ fontWeight: 700, color: '#475569', display: 'block', mb: 1 }}>
                                                  CASE LABELS FOR BATCH {day.batch_code} ({labels.length} Total Cases)
                                                </Typography>

                                                {labels.length === 0 ? (
                                                  <Typography variant="body2" sx={{ color: '#64748b' }}>
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
                                                          bgcolor: '#ffffff',
                                                          border: '1px solid #cbd5e1',
                                                          display: 'flex',
                                                          flexDirection: 'column',
                                                          gap: 0.5,
                                                        }}
                                                      >
                                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                          <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                                            CASE #{lbl.sequence_number}
                                                          </Typography>
                                                          <Chip
                                                            label={lbl.status.toUpperCase()}
                                                            size="small"
                                                            sx={{
                                                              height: 18,
                                                              fontSize: '0.625rem',
                                                              fontWeight: 700,
                                                              bgcolor: lbl.status === 'printed' ? '#dcfce7' : '#f1f5f9',
                                                              color: lbl.status === 'printed' ? '#15803d' : '#64748b',
                                                            }}
                                                          />
                                                        </Box>
                                                        <Typography variant="caption" sx={{ color: '#475569' }}>
                                                          Qty: {lbl.expected_quantity} pcs {lbl.is_partial && '(Partial)'}
                                                        </Typography>
                                                        <Typography
                                                          variant="caption"
                                                          sx={{
                                                            color: '#0284c7',
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
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Plan Create Modal */}
      <PlanCreateModal
        open={isCreateModalOpen}
        products={products}
        machines={machines}
        onClose={() => setIsCreateModalOpen(false)}
        onPlanCreated={() => {
          fetchPlans();
          setNotification({ type: 'success', message: 'New production plan created.' });
        }}
      />

      {/* Print Job Dialog */}
      {activePrintPlan && (
        <PrintJobDialog
          open={Boolean(activePrintPlan)}
          plan={activePrintPlan}
          labels={activePrintLabels}
          onClose={() => setActivePrintPlan(null)}
          onPrintCompleted={() => {
            fetchPlans();
            setNotification({ type: 'success', message: 'Print job PDF generated and recorded.' });
          }}
        />
      )}
    </Box>
  );
};
