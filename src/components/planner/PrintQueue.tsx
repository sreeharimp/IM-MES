import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Tabs,
  Tab,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Checkbox,
  Chip,
  Alert,
  TextField,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Grid,
  Tooltip,
} from '@mui/material';
import {
  Print as PrintIcon,
  OpenInNew as OpenIcon,
  AutoAwesome as AutoPackIcon,
  CheckCircle as SuccessIcon,
  Layers as SheetIcon,
  Security as SupervisorIcon,
  FilterList as FilterIcon,
  Refresh as RefreshIcon,
  WarningAmber as WarningIcon,
  Delete as RemoveIcon,
  RemoveFromQueue as RemoveQueueIcon,
} from '@mui/icons-material';
import type { LabelPaperType, ProductionPlanLabel, ProductLabelType } from '../../types';
import { supabase } from '../../lib/supabase';
import { isWithinPrintWindow } from './services/dateWindow';
import { previewQueuePDF, saveQueuePDF, getSlotOffset } from './services/pdfGenerator';
import type { PrintableLabelItem } from './services/pdfGenerator';

interface QueueItem extends ProductionPlanLabel {
  product_name: string;
  item_code?: string;
  batch_code: string;
  production_date: string;
}

interface PrintQueueProps {
  currentUserName?: string;
}

export const PrintQueue: React.FC<PrintQueueProps> = ({ currentUserName = 'Stores Staff' }) => {
  const [papers, setPapers] = useState<LabelPaperType[]>([]);
  const [productPaperMappings, setProductPaperMappings] = useState<ProductLabelType[]>([]);
  const [selectedPaperId, setSelectedPaperId] = useState<string>('');
  const [queueLabels, setQueueLabels] = useState<QueueItem[]>([]);
  const [selectedLabelIds, setSelectedLabelIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isPrinting, setIsPrinting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Partial Sheet Reuse Controls (1-based)
  const [startRow, setStartRow] = useState<number>(1);
  const [startCol, setStartCol] = useState<number>(1);

  // Supervisor reprint dialog state
  const [reprintDialog, setReprintDialog] = useState<boolean>(false);
  const [reprintPendingAction, setReprintPendingAction] = useState<'browser' | 'download'>('browser');
  const [reprintReason, setRepprintReason] = useState<string>('');

  // Remove from queue dialog state
  const [removeDialog, setRemoveDialog] = useState<boolean>(false);
  const [isRemoving, setIsRemoving] = useState<boolean>(false);

  // Queue view filters
  const [statusFilter, setStatusFilter] = useState<'unprinted' | 'all'>('unprinted');
  const [dateFilter, setDateFilter] = useState<'all' | 'window'>('all');

  const fetchPaperData = async () => {
    try {
      const { data: pData } = await supabase
        .from('label_paper_types')
        .select('*')
        .eq('active', true)
        .order('name');
      if (pData && pData.length > 0) {
        setPapers(pData);
        if (!selectedPaperId) {
          setSelectedPaperId(pData[0].id);
        }
      }

      const { data: mapData } = await supabase
        .from('product_label_types')
        .select('*');
      if (mapData) {
        setProductPaperMappings(mapData);
      }
    } catch (err: any) {
      console.error('Failed to load paper configurations:', err);
    }
  };

  const fetchQueueLabels = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      let query = supabase
        .from('production_plan_labels')
        .select(`
          *,
          plan:production_plans (
            id,
            plan_date,
            batch_code,
            shift,
            product_id,
            product:products (
              id,
              name,
              item_code
            )
          )
        `)
        .order('created_at', { ascending: true });

      if (statusFilter === 'unprinted') {
        query = query.eq('status', 'unprinted');
      }

      const { data, error } = await query;
      if (error) throw error;

      let items: QueueItem[] = (data || []).map((row: any) => {
        const plan = row.plan || row.plan_day?.plan;
        const prod = plan?.product;
        const batchCode = plan?.batch_code || row.plan_day?.batch_code || 'BATCH';
        const prodDate = plan?.plan_date || row.plan_day?.production_date || new Date().toISOString().split('T')[0];
        return {
          id: row.id,
          plan_id: row.plan_id,
          plan_day_id: row.plan_day_id || row.plan_id,
          sequence_number: row.sequence_number,
          expected_quantity: row.expected_quantity,
          is_partial: row.is_partial,
          qr_payload: row.qr_payload,
          print_job_id: row.print_job_id,
          status: row.status,
          created_at: row.created_at,
          batch_code: batchCode,
          production_date: prodDate,
          product_name: prod?.name || 'Moulded Part',
          item_code: prod?.item_code,
          product_id: prod?.id || plan?.product_id,
        };
      });

      if (dateFilter === 'window') {
        items = items.filter((item) => isWithinPrintWindow(item.production_date));
      }

      setQueueLabels(items);
    } catch (err: any) {
      console.error('Error fetching queue labels:', err);
      setErrorMessage(err.message || 'Failed to fetch queue labels.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPaperData();
  }, []);

  useEffect(() => {
    fetchQueueLabels();
  }, [selectedPaperId, statusFilter, dateFilter]);

  const activePaper = useMemo(() => {
    return papers.find((p) => p.id === selectedPaperId) || papers[0];
  }, [papers, selectedPaperId]);

  const filteredLabels = useMemo(() => {
    if (!activePaper) return queueLabels;

    return queueLabels.filter((label) => {
      const mapping = productPaperMappings.find((m) => m.product_id === label.product_id);
      if (mapping) {
        return mapping.label_paper_type_id === activePaper.id;
      }
      return true;
    });
  }, [queueLabels, activePaper, productPaperMappings]);

  const sheetCapacity = (activePaper?.rows || 8) * (activePaper?.columns || 3);
  const skipSlotsSheet1 = useMemo(() => {
    if (!activePaper) return 0;
    return getSlotOffset(
      startRow,
      startCol,
      activePaper.rows,
      activePaper.columns,
      activePaper.fill_order || 'row-major'
    );
  }, [startRow, startCol, activePaper]);

  const sheet1Capacity = Math.max(0, sheetCapacity - skipSlotsSheet1);
  const selectedCount = selectedLabelIds.size;

  const totalSheetsNeeded = useMemo(() => {
    if (selectedCount === 0) return 0;
    if (selectedCount <= sheet1Capacity) return 1;
    return 1 + Math.ceil((selectedCount - sheet1Capacity) / sheetCapacity);
  }, [selectedCount, sheet1Capacity, sheetCapacity]);

  const sheetFillStatus = useMemo(() => {
    if (selectedCount === 0) return 'No labels selected.';
    if (selectedCount <= sheet1Capacity) {
      const remaining = sheet1Capacity - selectedCount;
      return remaining === 0
        ? `Sheet #1 is perfectly full (${selectedCount} labels)`
        : `${selectedCount} / ${sheet1Capacity} slots on Sheet #1 (${remaining} more fills sheet)`;
    } else {
      const over = selectedCount - sheet1Capacity;
      const lastSheetFilled = over % sheetCapacity;
      const remainingOnLast = lastSheetFilled === 0 ? 0 : sheetCapacity - lastSheetFilled;
      return remainingOnLast === 0
        ? `All ${totalSheetsNeeded} sheets are completely filled (${selectedCount} labels)`
        : `Sheet #${totalSheetsNeeded} has ${lastSheetFilled} / ${sheetCapacity} labels (${remainingOnLast} more fills sheet)`;
    }
  }, [selectedCount, sheet1Capacity, sheetCapacity, totalSheetsNeeded]);

  const handleAutoPack = () => {
    if (filteredLabels.length === 0) return;

    let targetCount = sheet1Capacity;
    if (filteredLabels.length > sheet1Capacity) {
      const additionalSheets = Math.floor((filteredLabels.length - sheet1Capacity) / sheetCapacity);
      targetCount = sheet1Capacity + additionalSheets * sheetCapacity;
    }

    const newSet = new Set<string>();
    for (let i = 0; i < Math.min(targetCount, filteredLabels.length); i++) {
      newSet.add(filteredLabels[i].id);
    }
    setSelectedLabelIds(newSet);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedLabelIds(new Set(filteredLabels.map((l) => l.id)));
    } else {
      setSelectedLabelIds(new Set());
    }
  };

  const handleToggleLabel = (id: string) => {
    setSelectedLabelIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const getSelectedPrintItems = (): PrintableLabelItem[] => {
    return filteredLabels
      .filter((l) => selectedLabelIds.has(l.id))
      .map((l) => ({
        id: l.id,
        plan_id: l.plan_id,
        productName: l.product_name,
        batchCode: l.batch_code,
        sequenceNumber: l.sequence_number,
        expectedQuantity: l.expected_quantity,
        isPartial: l.is_partial,
        qrPayload: l.qr_payload,
      }));
  };

  const executePrint = async (action: 'browser' | 'download', isReprint = false) => {
    const items = getSelectedPrintItems();
    if (items.length === 0 || !activePaper) return;

    const hasPrintedLabels = items.some((i) => i.status === 'printed' || i.print_job_id != null);
    if (hasPrintedLabels && !isReprint) {
      setReprintPendingAction(action);
      setReprintDialog(true);
      return;
    }

    setIsPrinting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const labelIds = items.map((i) => i.id);
      
      // Try RPC first
      let rpcHandled = false;
      try {
        const { error: rpcErr } = await supabase.rpc('execute_queue_print_job', {
          p_label_paper_type_id: activePaper.id,
          p_label_ids: labelIds,
          p_printed_by: currentUserName,
          p_is_reprint: isReprint,
          p_reprint_reason: isReprint ? reprintReason.trim() || 'Label reprint' : null,
          p_supervisor_pin: null,
          p_reviewed_by: currentUserName,
        });
        if (!rpcErr) {
          rpcHandled = true;
        }
      } catch (_) {
        rpcHandled = false;
      }

      // If RPC is not available or failed, perform direct database operations
      if (!rpcHandled) {
        const { error: updateErr } = await supabase
          .from('production_plan_labels')
          .update({ status: 'printed' })
          .in('id', labelIds);
        if (updateErr) throw updateErr;

        // Group selected items by plan to record per-plan print jobs
        const byPlan = new Map<string, typeof items>();
        for (const item of items) {
          const pid = item.plan_id || 'unknown';
          if (!byPlan.has(pid)) byPlan.set(pid, []);
          byPlan.get(pid)!.push(item);
        }

        const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(activePaper.id);

        for (const [planId, planItems] of byPlan) {
          const seqs = planItems.map((i) => i.sequenceNumber).filter(Boolean);
          const seqMin = seqs.length > 0 ? Math.min(...seqs) : 1;
          const seqMax = seqs.length > 0 ? Math.max(...seqs) : planItems.length;
          const batchCode = planItems[0]?.batchCode || planId;
          const perPlanSheets = Math.ceil(planItems.length / (sheetCapacity || 1)) || 1;

          // Try recording in label_print_jobs
          try {
            await supabase.from('label_print_jobs').insert([{
              plan_id: isValidUUID ? planId : null,
              label_paper_type_id: isValidUUID ? activePaper.id : null,
              sequence_start: seqMin,
              sequence_end: seqMax,
              sheet_count: perPlanSheets,
              job_type: isReprint ? 'reprint' : 'initial',
              reprint_reason: isReprint ? reprintReason.trim() || 'Label reprint' : null,
              printed_by: currentUserName,
            }]);
          } catch (_) {}

          // Try logging to system_changes audit trail
          try {
            await supabase.from('system_changes').insert([{
              changed_by_name: currentUserName,
              module: 'production_planner',
              table_name: 'production_plan_labels',
              action: isReprint ? 'reprint_labels' : 'print_labels',
              reason: isReprint
                ? `Reprint: Batch ${batchCode} Cases #${seqMin}-#${seqMax} (${planItems.length} labels) — ${reprintReason.trim() || 'No reason given'}`
                : `Printed: Batch ${batchCode} Cases #${seqMin}-#${seqMax} (${planItems.length} labels)`,
              new_value: JSON.stringify({
                batch: batchCode,
                plan_id: planId,
                sequence_start: seqMin,
                sequence_end: seqMax,
                count: planItems.length,
                paper: activePaper.name,
              }),
            }]);
          } catch (_) {}
        }
      }

      const pdfOptions = {
        labels: items,
        paper: activePaper,
        startRow,
        startCol,
      };

      if (action === 'browser') {
        await previewQueuePDF(pdfOptions);
      } else {
        const timestamp = new Date().toISOString().slice(0, 10);
        await saveQueuePDF(pdfOptions, `Queue_Labels_${activePaper.name.replace(/\s+/g, '_')}_${timestamp}.pdf`);
      }

      setSuccessMessage(`Successfully processed ${items.length} label(s) across ${totalSheetsNeeded} sheet(s).`);
      setSelectedLabelIds(new Set());
      setReprintDialog(false);
      setRepprintReason('');

      await fetchQueueLabels();
    } catch (err: any) {
      console.error('Print queue error:', err);
      setErrorMessage(err.message || 'Failed to execute print job.');
    } finally {
      setIsPrinting(false);
    }
  };

  const handleRemoveFromQueue = async () => {
    if (selectedLabelIds.size === 0) return;
    setIsRemoving(true);
    setErrorMessage(null);
    try {
      const labelIds = [...selectedLabelIds];
      const { error: updateErr } = await supabase
        .from('production_plan_labels')
        .update({
          status: 'void',
          void_reason: `Removed from print queue by ${currentUserName}`,
        })
        .in('id', labelIds);
      if (updateErr) throw updateErr;

      // Log removal to audit trail
      try {
        await supabase.from('system_changes').insert([{
          changed_by_name: currentUserName,
          module: 'production_planner',
          table_name: 'production_plan_labels',
          action: 'remove_from_queue',
          reason: `Removed ${labelIds.length} label(s) from print queue`,
          new_value: JSON.stringify({ removed_ids: labelIds, count: labelIds.length }),
        }]);
      } catch (_) {}

      setSuccessMessage(`Removed ${labelIds.length} label(s) from the queue successfully.`);
      setSelectedLabelIds(new Set());
      setRemoveDialog(false);
      await fetchQueueLabels();
    } catch (err: any) {
      console.error('Remove from queue error:', err);
      setErrorMessage(err.message || 'Failed to remove labels from queue.');
      setRemoveDialog(false);
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <>
      <Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2.5, flexWrap: 'wrap', gap: 2 }}>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700, color: 'var(--text, #e2e6f0)' }}>
              Production Label Print Queue
            </Typography>
            <Typography variant="body2" sx={{ color: 'var(--text2, #8a92a8)' }}>
              Consolidate unprinted labels and reuse partial sticker sheets to eliminate paper waste.
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="outlined"
              size="small"
              startIcon={<RefreshIcon />}
              onClick={() => {
                fetchPaperData();
                fetchQueueLabels();
              }}
              sx={{ height: 36 }}
            >
              Refresh Queue
            </Button>
          </Box>
        </Box>

      {errorMessage && (
        <Alert severity="error" sx={{ mb: 2.5 }} onClose={() => setErrorMessage(null)}>
          {errorMessage}
        </Alert>
      )}

      {successMessage && (
        <Alert severity="success" icon={<SuccessIcon />} sx={{ mb: 2.5 }} onClose={() => setSuccessMessage(null)}>
          {successMessage}
        </Alert>
      )}

      <Card sx={{ mb: 3, border: '1px solid var(--border, #2e3340)', bgcolor: 'var(--bg2, #141720)', boxShadow: 'none' }}>
        <Box sx={{ borderBottom: 1, borderColor: 'var(--border, #2e3340)', px: 2, pt: 1, bgcolor: 'var(--bg3, #1c2028)' }}>
          <Tabs
            value={selectedPaperId}
            onChange={(_, val) => setSelectedPaperId(val)}
            variant="scrollable"
            scrollButtons="auto"
          >
            {papers.map((p) => (
              <Tab
                key={p.id}
                value={p.id}
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <SheetIcon sx={{ fontSize: 18 }} />
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {p.name}
                    </Typography>
                    <Chip
                      size="small"
                      label={`${p.rows * p.columns}-up`}
                      sx={{ height: 20, fontSize: '0.65rem' }}
                    />
                  </Box>
                }
              />
            ))}
          </Tabs>
        </Box>

        <CardContent sx={{ pb: '16px !important' }}>
          <Grid container spacing={3} alignItems="center">
            {/* Live Sheet Counter */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Box sx={{ p: 2, bgcolor: 'var(--bg3, #1c2028)', borderRadius: 2, border: '1px solid var(--border, #2e3340)' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography variant="caption" sx={{ fontWeight: 700, color: 'var(--text2, #8a92a8)', letterSpacing: '0.05em' }}>
                    CAPACITY & SHEET PACKING EFFICIENCY
                  </Typography>
                  <Chip
                    size="small"
                    color={selectedCount > 0 ? 'primary' : 'default'}
                    label={`${selectedCount} Selected (${totalSheetsNeeded} Sheets)`}
                    sx={{ fontWeight: 700 }}
                  />
                </Box>
                <Typography variant="body2" sx={{ fontWeight: 600, color: 'var(--text, #e2e6f0)' }}>
                  {sheetFillStatus}
                </Typography>
                <Box sx={{ mt: 1.5, display: 'flex', gap: 1 }}>
                  <Button
                    size="small"
                    variant="contained"
                    color="secondary"
                    startIcon={<AutoPackIcon />}
                    onClick={handleAutoPack}
                    disabled={filteredLabels.length === 0}
                    sx={{ fontWeight: 700, bgcolor: 'var(--blue, #4d9fff)', color: '#ffffff' }}
                  >
                    Auto-Pack Full Sheet(s)
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => handleSelectAll(selectedLabelIds.size !== filteredLabels.length)}
                    disabled={filteredLabels.length === 0}
                  >
                    {selectedLabelIds.size === filteredLabels.length ? 'Deselect All' : 'Select All'}
                  </Button>
                </Box>
              </Box>
            </Grid>

            {/* Partial Sheet Reuse Offset Controls */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Box sx={{ p: 2, bgcolor: 'rgba(245, 166, 35, 0.08)', borderRadius: 2, border: '1px solid rgba(245, 166, 35, 0.25)' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography variant="caption" sx={{ fontWeight: 700, color: 'var(--amber, #f5a623)', letterSpacing: '0.05em' }}>
                    PARTIAL SHEET REUSE (FEED USED PAPER)
                  </Typography>
                  {skipSlotsSheet1 > 0 && (
                    <Chip
                      size="small"
                      label={`Skipping first ${skipSlotsSheet1} peeled slot(s)`}
                      color="warning"
                      sx={{ height: 20, fontSize: '0.7rem', fontWeight: 600 }}
                    />
                  )}
                </Box>

                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 1.5 }}>
                  <TextField
                    label="Start Row"
                    type="number"
                    size="small"
                    value={startRow}
                    onChange={(e) =>
                      setStartRow(
                        Math.max(1, Math.min(activePaper?.rows || 8, parseInt(e.target.value) || 1))
                      )
                    }
                    slotProps={{ htmlInput: { min: 1, max: activePaper?.rows || 8 } }}
                    sx={{ width: 110 }}
                  />
                  <TextField
                    label="Start Column"
                    type="number"
                    size="small"
                    value={startCol}
                    onChange={(e) =>
                      setStartCol(
                        Math.max(1, Math.min(activePaper?.columns || 3, parseInt(e.target.value) || 1))
                      )
                    }
                    slotProps={{ htmlInput: { min: 1, max: activePaper?.columns || 3 } }}
                    sx={{ width: 110 }}
                  />
                  <Button
                    size="small"
                    variant="text"
                    onClick={() => {
                      setStartRow(1);
                      setStartCol(1);
                    }}
                    sx={{ color: 'var(--amber, #f5a623)', fontSize: '0.75rem' }}
                  >
                    Reset (1,1)
                  </Button>
                </Box>

                {activePaper && (
                  <Box>
                    <Typography variant="caption" sx={{ color: 'var(--amber, #f5a623)', display: 'block', mb: 0.5 }}>
                      Click any slot below to set where printing starts on Sheet #1:
                    </Typography>
                    <Box
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: `repeat(${activePaper.columns}, 1fr)`,
                        gap: '3px',
                        maxWidth: 220,
                        p: 0.5,
                        bgcolor: 'var(--bg3, #1c2028)',
                        border: '1px solid var(--border, #2e3340)',
                        borderRadius: 1,
                      }}
                    >
                      {Array.from({ length: activePaper.rows }).map((_, rIdx) => {
                        const r = rIdx + 1;
                        return Array.from({ length: activePaper.columns }).map((__, cIdx) => {
                          const c = cIdx + 1;
                          const slotIdx = getSlotOffset(
                            r,
                            c,
                            activePaper.rows,
                            activePaper.columns,
                            activePaper.fill_order || 'row-major'
                          );
                          const isSkipped = slotIdx < skipSlotsSheet1;
                          const isStart = r === startRow && c === startCol;

                          return (
                            <Box
                              key={`${r}-${c}`}
                              onClick={() => {
                                setStartRow(r);
                                setStartCol(c);
                              }}
                              sx={{
                                height: 16,
                                borderRadius: '2px',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                                bgcolor: isStart
                                  ? 'var(--blue, #4d9fff)'
                                  : isSkipped
                                  ? 'var(--bg4, #252a35)'
                                  : 'rgba(0, 214, 143, 0.25)',
                                border: isStart
                                  ? '1.5px solid var(--blue, #4d9fff)'
                                  : isSkipped
                                  ? '1px dashed var(--border, #2e3340)'
                                  : '1px solid rgba(0, 214, 143, 0.5)',
                                '&:hover': {
                                  transform: 'scale(1.15)',
                                  zIndex: 10,
                                  boxShadow: 1,
                                },
                              }}
                              title={`Row ${r}, Col ${c} ${isSkipped ? '(Peeled / Skipped)' : '(Available)'}`}
                            />
                          );
                        });
                      })}
                    </Box>
                  </Box>
                )}
              </Box>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Card sx={{ border: '1px solid var(--border, #2e3340)', bgcolor: 'var(--bg2, #141720)', boxShadow: 'none' }}>
        <Box
          sx={{
            p: 2,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: '1px solid var(--border, #2e3340)',
            bgcolor: 'var(--bg3, #1c2028)',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <FilterIcon sx={{ color: 'var(--text2, #8a92a8)', fontSize: 20 }} />
              <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'var(--text, #e2e6f0)' }}>
                Labels for {activePaper?.name} ({filteredLabels.length})
              </Typography>
            </Box>

            <TextField
              select
              size="small"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              sx={{ minWidth: 160 }}
            >
              <MenuItem value="unprinted">Queue (Unprinted)</MenuItem>
              <MenuItem value="all">All / Reprints</MenuItem>
            </TextField>

            <TextField
              select
              size="small"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value as any)}
              sx={{ minWidth: 140 }}
            >
              <MenuItem value="all">All Dates</MenuItem>
              <MenuItem value="window">3-Day Window</MenuItem>
            </TextField>
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.5 }}>
            <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
              {/* Remove from Queue button — always visible, enabled when labels are selected */}
              <Tooltip
                title={selectedCount === 0 ? 'Tick checkboxes in the table below to select labels, then click to remove them from the queue' : ''}
                placement="top"
                arrow
              >
                <span>
                  <Button
                    variant="outlined"
                    startIcon={<RemoveQueueIcon />}
                    onClick={() => setRemoveDialog(true)}
                    disabled={selectedCount === 0 || isPrinting}
                    sx={{
                      fontWeight: 600,
                      borderColor: selectedCount > 0 ? 'rgba(239, 68, 68, 0.6)' : 'rgba(239, 68, 68, 0.25)',
                      color: selectedCount > 0 ? '#ef4444' : 'rgba(239, 68, 68, 0.4)',
                      '&:hover': {
                        borderColor: '#ef4444',
                        bgcolor: 'rgba(239, 68, 68, 0.08)',
                      },
                      '&.Mui-disabled': {
                        borderColor: 'rgba(239, 68, 68, 0.2)',
                        color: 'rgba(239, 68, 68, 0.3)',
                      },
                    }}
                  >
                    Remove from Queue{selectedCount > 0 ? ` (${selectedCount})` : ''}
                  </Button>
                </span>
              </Tooltip>
              <Button
                variant="outlined"
                color="primary"
                startIcon={<OpenIcon />}
                onClick={() => executePrint('browser')}
                disabled={selectedCount === 0 || isPrinting}
                sx={{ fontWeight: 600 }}
              >
                Open &amp; Print (Browser)
              </Button>
              <Button
                variant="contained"
                color="primary"
                startIcon={<PrintIcon />}
                onClick={() => executePrint('download')}
                disabled={selectedCount === 0 || isPrinting}
                sx={{ fontWeight: 600, bgcolor: 'var(--blue, #4d9fff)' }}
              >
                {isPrinting ? 'Processing...' : `Download PDF (${selectedCount})`}
              </Button>
            </Box>
            {selectedCount === 0 && (
              <Typography variant="caption" sx={{ color: 'var(--text3, #555e72)', fontSize: '0.72rem' }}>
                ☝ Tick rows in the table below to enable Print &amp; Remove actions
              </Typography>
            )}
          </Box>
        </Box>

        {isLoading ? (
          <Box sx={{ p: 6, display: 'flex', justifyContent: 'center' }}>
            <CircularProgress />
          </Box>
        ) : filteredLabels.length === 0 ? (
          <Box sx={{ p: 6, textAlign: 'center' }}>
            <Typography variant="body1" sx={{ color: 'var(--text2, #8a92a8)', fontWeight: 600 }}>
              No labels found matching the current filters for {activePaper?.name}.
            </Typography>
          </Box>
        ) : (
          <Table size="small">
            <TableHead sx={{ bgcolor: 'var(--bg4, #252a35)' }}>
              <TableRow>
                <TableCell padding="checkbox">
                  <Checkbox
                    checked={selectedCount === filteredLabels.length && filteredLabels.length > 0}
                    indeterminate={selectedCount > 0 && selectedCount < filteredLabels.length}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                  />
                </TableCell>
                <TableCell sx={{ fontWeight: 700, color: 'var(--text2, #8a92a8)' }}>Case No</TableCell>
                <TableCell sx={{ fontWeight: 700, color: 'var(--text2, #8a92a8)' }}>Product Name</TableCell>
                <TableCell sx={{ fontWeight: 700, color: 'var(--text2, #8a92a8)' }}>Batch Code</TableCell>
                <TableCell sx={{ fontWeight: 700, color: 'var(--text2, #8a92a8)' }}>Production Date</TableCell>
                <TableCell sx={{ fontWeight: 700, color: 'var(--text2, #8a92a8)' }}>Case Quantity</TableCell>
                <TableCell sx={{ fontWeight: 700, color: 'var(--text2, #8a92a8)' }}>QR Payload</TableCell>
                <TableCell sx={{ fontWeight: 700, color: 'var(--text2, #8a92a8)' }}>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredLabels.map((l) => {
                const isSelected = selectedLabelIds.has(l.id);
                return (
                  <TableRow
                    key={l.id}
                    hover
                    selected={isSelected}
                    onClick={() => handleToggleLabel(l.id)}
                    sx={{ cursor: 'pointer' }}
                  >
                    <TableCell padding="checkbox">
                      <Checkbox checked={isSelected} />
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700, color: 'var(--text, #e2e6f0)' }}>
                      CASE #{l.sequence_number}
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600, color: 'var(--text, #e2e6f0)' }}>
                      {l.product_name}
                      {l.item_code && (
                        <Typography variant="caption" sx={{ color: 'var(--text2, #8a92a8)', display: 'block' }}>
                          Code: {l.item_code}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--blue, #4d9fff)' }}>
                      {l.batch_code}
                    </TableCell>
                    <TableCell sx={{ color: 'var(--text, #e2e6f0)' }}>{l.production_date}</TableCell>
                    <TableCell>
                      {l.is_partial ? (
                        <Chip
                          label={`${l.expected_quantity} PCS (PARTIAL)`}
                          color="warning"
                          size="small"
                          sx={{ fontWeight: 700, height: 22 }}
                        />
                      ) : (
                        <Typography variant="body2" sx={{ fontWeight: 600, color: 'var(--text, #e2e6f0)' }}>
                          {l.expected_quantity} PCS
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text2, #8a92a8)' }}>
                      {l.qr_payload}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label="Ready"
                        color="info"
                        size="small"
                        sx={{ fontSize: '0.7rem', height: 20 }}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      <Dialog 
        open={reprintDialog} 
        onClose={() => setReprintDialog(false)} 
        maxWidth="xs" 
        fullWidth
        PaperProps={{
          sx: {
            bgcolor: 'var(--bg2, #141720)',
            border: '1px solid var(--border, #2e3340)',
            color: 'var(--text, #e2e6f0)',
            backgroundImage: 'none',
          }
        }}
      >
        <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1, color: 'var(--amber, #f5a623)', borderBottom: '1px solid var(--border, #2e3340)' }}>
          <WarningIcon />
          Confirm Label Reprint
        </DialogTitle>
        <DialogContent sx={{ pt: 2.5 }}>
          <Alert 
            severity="warning" 
            sx={{ 
              mb: 2, 
              bgcolor: 'rgba(245, 166, 35, 0.12)', 
              color: 'var(--amber, #f5a623)',
              border: '1px solid rgba(245, 166, 35, 0.3)' 
            }}
          >
            One or more of the selected labels have already been printed. Proceeding will regenerate the PDF and log a reprint event in the audit trail.
          </Alert>

          <TextField
            label="Reprint Reason (Optional)"
            multiline
            rows={2}
            fullWidth
            size="small"
            value={reprintReason}
            onChange={(e) => setRepprintReason(e.target.value)}
            placeholder="e.g. Printer paper jam, damaged physical sticker"
          />
        </DialogContent>
        <DialogActions sx={{ p: 2, borderTop: '1px solid var(--border, #2e3340)' }}>
          <Button onClick={() => setReprintDialog(false)} color="inherit">
            Cancel
          </Button>
          <Button
            variant="contained"
            sx={{ bgcolor: 'var(--amber, #f5a623)', color: '#ffffff', fontWeight: 600, '&:hover': { bgcolor: '#e0951b' } }}
            onClick={() => executePrint(reprintPendingAction, true)}
          >
            Confirm & Reprint
          </Button>
        </DialogActions>
      </Dialog>

      {/* Remove from Queue Confirmation Dialog */}
      <Dialog
        open={removeDialog}
        onClose={() => setRemoveDialog(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            bgcolor: 'var(--bg2, #141720)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            color: 'var(--text, #e2e6f0)',
            backgroundImage: 'none',
          }
        }}
      >
        <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1, color: '#ef4444', borderBottom: '1px solid var(--border, #2e3340)' }}>
          <RemoveIcon />
          Remove from Queue
        </DialogTitle>
        <DialogContent sx={{ pt: 2.5 }}>
          <Alert
            severity="warning"
            sx={{
              bgcolor: 'rgba(239, 68, 68, 0.1)',
              color: '#ef4444',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              '& .MuiAlert-icon': { color: '#ef4444' },
            }}
          >
            You are about to remove <strong>{selectedCount} label(s)</strong> from the print queue.
            Their status will be set to <strong>void</strong> and they will no longer appear in the unprinted queue.
            This action is logged in the audit trail.
          </Alert>
          <Typography variant="body2" sx={{ mt: 2, color: 'var(--text2, #8a92a8)' }}>
            You can re-add them to the queue from the Production Plans tab by clicking &quot;Queue&quot; on the plan.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2, borderTop: '1px solid var(--border, #2e3340)' }}>
          <Button onClick={() => setRemoveDialog(false)} color="inherit" disabled={isRemoving}>
            Cancel
          </Button>
          <Button
            variant="contained"
            startIcon={<RemoveQueueIcon />}
            disabled={isRemoving}
            sx={{ bgcolor: '#ef4444', color: '#ffffff', fontWeight: 600, '&:hover': { bgcolor: '#dc2626' } }}
            onClick={handleRemoveFromQueue}
          >
            {isRemoving ? 'Removing...' : `Remove ${selectedCount} Label(s)`}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
    </>
  );
};
