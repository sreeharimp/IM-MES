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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Tooltip,
} from '@mui/material';
import Grid from '@mui/material/Grid2';
import {
  Print as PrintIcon,
  OpenInNew as OpenIcon,
  AutoAwesome as AutoPackIcon,
  CheckCircle as SuccessIcon,
  Layers as SheetIcon,
  Security as SupervisorIcon,
  FilterList as FilterIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { LabelPaperType, ProductionPlanLabel, ProductLabelType } from '../../types';
import { supabase } from '../../lib/supabase';
import { isWithinPrintWindow } from '../../lib/dateWindow';
import { previewQueuePDF, saveQueuePDF, getSlotOffset, PrintableLabelItem } from '../../services/pdfGenerator';

interface QueueItem extends ProductionPlanLabel {
  product_name: string;
  item_code?: string;
  batch_code: string;
  production_date: string;
  default_paper_id?: string;
}

export const PrintQueue: React.FC = () => {
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
  const [supervisorPin, setSupervisorPin] = useState<string>('');
  const [reviewedBy, setReviewedBy] = useState<string>('');
  const [reprintReason, setReprintReason] = useState<string>('');
  const [reprintError, setReprintError] = useState<string | null>(null);

  // 1. Fetch Papers and Product Mappings
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

  // 2. Fetch Queue Labels across all active plan days within print window
  const fetchQueueLabels = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      // Query unprinted labels joined with production_plan_days and plans
      const { data, error } = await supabase
        .from('production_plan_labels')
        .select(`
          *,
          plan_day:production_plan_days (
            id,
            production_date,
            batch_code,
            shift,
            plan:production_plans (
              id,
              product_id,
              product:products (
                id,
                name,
                item_code
              )
            )
          )
        `)
        .eq('status', 'unprinted')
        .order('created_at', { ascending: true });

      if (error) throw error;

      const items: QueueItem[] = (data || [])
        .map((row: any) => {
          const planDay = row.plan_day;
          const plan = planDay?.plan;
          const prod = plan?.product;
          return {
            id: row.id,
            plan_day_id: row.plan_day_id,
            sequence_number: row.sequence_number,
            expected_quantity: row.expected_quantity,
            is_partial: row.is_partial,
            qr_payload: row.qr_payload,
            print_job_id: row.print_job_id,
            status: row.status,
            created_at: row.created_at,
            batch_code: planDay?.batch_code || 'AP26C20',
            production_date: planDay?.production_date || '',
            product_name: prod?.name || 'Moulded Part',
            item_code: prod?.item_code,
            product_id: prod?.id,
          };
        })
        // Filter strictly to current 3-day production window [T-1, T+1]
        .filter((item) => isWithinPrintWindow(item.production_date));

      setQueueLabels(items);
    } catch (err: any) {
      console.error('Error fetching queue labels:', err);
      setErrorMessage(err.message || 'Failed to fetch unprinted labels.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPaperData();
  }, []);

  useEffect(() => {
    fetchQueueLabels();
  }, [selectedPaperId]);

  const activePaper = useMemo(() => {
    return papers.find((p) => p.id === selectedPaperId) || papers[0];
  }, [papers, selectedPaperId]);

  // Filter labels compatible with selected paper stock
  const filteredLabels = useMemo(() => {
    if (!activePaper) return queueLabels;

    return queueLabels.filter((label) => {
      // Check if product is mapped to this paper stock
      const mapping = productPaperMappings.find((m) => m.product_id === label.product_id);
      if (mapping) {
        return mapping.label_paper_type_id === activePaper.id;
      }
      // If no mapping, allow assignment
      return true;
    });
  }, [queueLabels, activePaper, productPaperMappings]);

  // Live Sheet Capacity Calculations with Partial Sheet Reuse
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

  // Greedy Auto-Packer: selects exactly enough labels to fill the current sheet or multiple
  const handleAutoPack = () => {
    if (filteredLabels.length === 0) return;

    let targetCount = sheet1Capacity;
    if (filteredLabels.length > sheet1Capacity) {
      // Find how many full sheets can be formed
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

  // Convert selected labels to PrintableLabelItem list in selection order
  const getSelectedPrintItems = (): PrintableLabelItem[] => {
    return filteredLabels
      .filter((l) => selectedLabelIds.has(l.id))
      .map((l) => ({
        id: l.id,
        productName: l.product_name,
        batchCode: l.batch_code,
        sequenceNumber: l.sequence_number,
        expectedQuantity: l.expected_quantity,
        isPartial: l.is_partial,
        qrPayload: l.qr_payload,
      }));
  };

  // Execute print job via Supabase RPC and open/download PDF
  const executePrint = async (action: 'browser' | 'download', isReprint = false) => {
    const items = getSelectedPrintItems();
    if (items.length === 0 || !activePaper) return;

    setIsPrinting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      // Call RPC execute_queue_print_job
      const labelIds = items.map((i) => i.id);
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('execute_queue_print_job', {
        p_label_paper_type_id: activePaper.id,
        p_label_ids: labelIds,
        p_printed_by: 'Stores Staff',
        p_is_reprint: isReprint,
        p_reprint_reason: isReprint ? reprintReason.trim() : null,
        p_supervisor_pin: isReprint ? supervisorPin : null,
        p_reviewed_by: isReprint ? reviewedBy.trim() : null,
      });

      if (rpcErr) {
        if (rpcErr.message?.includes('already been printed')) {
          // Open reprint supervisor dialog
          setReprintDialog(true);
          setIsPrinting(false);
          return;
        }
        throw rpcErr;
      }

      // Generate and trigger PDF
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

      setSuccessMessage(`Successfully printed ${items.length} labels across ${totalSheetsNeeded} sheet(s).`);
      setSelectedLabelIds(new Set());
      setReprintDialog(false);
      setSupervisorPin('');
      setReviewedBy('');
      setReprintReason('');

      // Refresh queue
      await fetchQueueLabels();
    } catch (err: any) {
      console.error('Print queue error:', err);
      setErrorMessage(err.message || 'Failed to execute print job.');
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <Box>
      {/* Header & Status */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800, color: '#0f172a' }}>
            Production Label Print Queue
          </Typography>
          <Typography variant="body2" sx={{ color: '#64748b' }}>
            Multi-plan waste elimination queue. Consolidate unprinted labels and reuse partial sticker sheets.
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

      {/* Paper Type Filter Tabs */}
      <Card sx={{ mb: 3, border: '1px solid #e2e8f0', boxShadow: 'none' }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 2, pt: 1, bgcolor: '#f8fafc' }}>
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

        {/* Live Sheet Capacity Bar & Partial Sheet Offset Controls */}
        <CardContent sx={{ pb: '16px !important' }}>
          <Grid container spacing={3} alignItems="center">
            {/* Live Sheet Counter */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Box sx={{ p: 2, bgcolor: '#f1f5f9', borderRadius: 2, border: '1px solid #e2e8f0' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography variant="caption" sx={{ fontWeight: 700, color: '#475569', letterSpacing: '0.05em' }}>
                    CAPACITY & SHEET PACKING EFFICIENCY
                  </Typography>
                  <Chip
                    size="small"
                    color={selectedCount > 0 ? 'primary' : 'default'}
                    label={`${selectedCount} Selected (${totalSheetsNeeded} Sheets)`}
                    sx={{ fontWeight: 700 }}
                  />
                </Box>
                <Typography variant="body2" sx={{ fontWeight: 600, color: '#1e293b' }}>
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
                    sx={{ fontWeight: 700 }}
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
              <Box sx={{ p: 2, bgcolor: '#fefce8', borderRadius: 2, border: '1px solid #fef08a' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography variant="caption" sx={{ fontWeight: 700, color: '#854d0e', letterSpacing: '0.05em' }}>
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
                    sx={{ width: 110, bgcolor: '#ffffff' }}
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
                    sx={{ width: 110, bgcolor: '#ffffff' }}
                  />
                  <Button
                    size="small"
                    variant="text"
                    onClick={() => {
                      setStartRow(1);
                      setStartCol(1);
                    }}
                    sx={{ color: '#854d0e', fontSize: '0.75rem' }}
                  >
                    Reset (1,1)
                  </Button>
                </Box>

                {/* Interactive Mini Die-Cut Sticker Grid Preview */}
                {activePaper && (
                  <Box>
                    <Typography variant="caption" sx={{ color: '#713f12', display: 'block', mb: 0.5 }}>
                      Click any sticker slot below to set where printing starts on Sheet #1:
                    </Typography>
                    <Box
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: `repeat(${activePaper.columns}, 1fr)`,
                        gap: '3px',
                        maxWidth: 220,
                        p: 0.5,
                        bgcolor: '#ffffff',
                        border: '1px solid #e2e8f0',
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
                                  ? '#2563eb'
                                  : isSkipped
                                  ? '#e2e8f0'
                                  : '#bbf7d0',
                                border: isStart
                                  ? '1.5px solid #1d4ed8'
                                  : isSkipped
                                  ? '1px dashed #94a3b8'
                                  : '1px solid #86efac',
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

      {/* Queue Table */}
      <Card sx={{ border: '1px solid #e2e8f0', boxShadow: 'none' }}>
        <Box
          sx={{
            p: 2,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: '1px solid #e2e8f0',
            bgcolor: '#ffffff',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <FilterIcon sx={{ color: '#64748b', fontSize: 20 }} />
            <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#0f172a' }}>
              Pending Labels for {activePaper?.name} ({filteredLabels.length} Available)
            </Typography>
          </Box>

          {/* Print Trigger Buttons */}
          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <Button
              variant="outlined"
              color="primary"
              startIcon={<OpenIcon />}
              onClick={() => executePrint('browser')}
              disabled={selectedCount === 0 || isPrinting}
              sx={{ fontWeight: 700 }}
            >
              Open & Print (Browser)
            </Button>
            <Button
              variant="contained"
              color="primary"
              startIcon={<PrintIcon />}
              onClick={() => executePrint('download')}
              disabled={selectedCount === 0 || isPrinting}
              sx={{ fontWeight: 700 }}
            >
              {isPrinting ? 'Processing...' : `Download PDF (${selectedCount})`}
            </Button>
          </Box>
        </Box>

        {isLoading ? (
          <Box sx={{ p: 6, display: 'flex', justifyContent: 'center' }}>
            <CircularProgress />
          </Box>
        ) : filteredLabels.length === 0 ? (
          <Box sx={{ p: 6, textAlign: 'center' }}>
            <Typography variant="body1" sx={{ color: '#64748b', fontWeight: 600 }}>
              No unprinted labels in queue for {activePaper?.name} within the 3-day production window.
            </Typography>
            <Typography variant="caption" sx={{ color: '#94a3b8', display: 'block', mt: 0.5 }}>
              Create a new production plan or switch paper type tabs above.
            </Typography>
          </Box>
        ) : (
          <Table size="small">
            <TableHead sx={{ bgcolor: '#f8fafc' }}>
              <TableRow>
                <TableCell padding="checkbox">
                  <Checkbox
                    checked={selectedCount === filteredLabels.length && filteredLabels.length > 0}
                    indeterminate={selectedCount > 0 && selectedCount < filteredLabels.length}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                  />
                </TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Case No</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Product Name</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Daily Batch Code</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Production Date</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Case Quantity</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>QR Payload</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
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
                    <TableCell sx={{ fontWeight: 700 }}>
                      CASE #{l.sequence_number}
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600, color: '#1e293b' }}>
                      {l.product_name}
                      {l.item_code && (
                        <Typography variant="caption" sx={{ color: '#64748b', display: 'block' }}>
                          Code: {l.item_code}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontWeight: 700, color: 'primary.main' }}>
                      {l.batch_code}
                    </TableCell>
                    <TableCell>{l.production_date}</TableCell>
                    <TableCell>
                      {l.is_partial ? (
                        <Chip
                          label={`${l.expected_quantity} PCS (PARTIAL)`}
                          color="warning"
                          size="small"
                          sx={{ fontWeight: 700, height: 22 }}
                        />
                      ) : (
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {l.expected_quantity} PCS
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#475569' }}>
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

      {/* Supervisor Reprint Authorization Modal */}
      <Dialog open={reprintDialog} onClose={() => setReprintDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
          <SupervisorIcon color="error" />
          Supervisor Reprint Authorization
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Alert severity="warning" sx={{ mb: 2 }}>
            One or more of the selected labels have already been printed. Per ISO 13485 compliance, reprint authorization is required.
          </Alert>
          {reprintError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {reprintError}
            </Alert>
          )}

          <TextField
            label="Supervisor PIN"
            type="password"
            fullWidth
            size="small"
            value={supervisorPin}
            onChange={(e) => setSupervisorPin(e.target.value)}
            helperText="Default Demo PIN: 1234"
            sx={{ mb: 2 }}
          />

          <TextField
            label="Reviewer / Supervisor Name"
            fullWidth
            size="small"
            value={reviewedBy}
            onChange={(e) => setReviewedBy(e.target.value)}
            placeholder="e.g. Quality Manager"
            sx={{ mb: 2 }}
          />

          <TextField
            label="Mandatory Reason for Reprint"
            multiline
            rows={2}
            fullWidth
            size="small"
            value={reprintReason}
            onChange={(e) => setReprintReason(e.target.value)}
            placeholder="e.g. Printer paper jam, damaged physical label"
          />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setReprintDialog(false)} color="inherit">
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            disabled={!supervisorPin || !reviewedBy || reprintReason.trim().length < 5}
            onClick={() => executePrint('browser', true)}
          >
            Authorize & Reprint
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
