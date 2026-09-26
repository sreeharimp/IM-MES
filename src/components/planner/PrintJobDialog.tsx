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
  LinearProgress,
  Grid,
} from '@mui/material';
import {
  Print as PrintIcon,
  Download as DownloadIcon,
  Tune as CalibrationIcon,
  WarningAmber as WarningIcon,
  ListAlt as QueueIcon,
} from '@mui/icons-material';
import type { ProductionPlan, ProductionPlanLabel, LabelPaperType } from '../../types';
import { supabase } from '../../lib/supabase';
import { saveLabelsPDF, previewLabelsPDF } from './services/pdfGenerator';
import { CalibrationModal } from './CalibrationModal';

interface PrintJobDialogProps {
  open: boolean;
  plan: ProductionPlan;
  labels: ProductionPlanLabel[];
  currentUserName?: string;
  onClose: () => void;
  onPrintCompleted: () => void;
  onNavigateToQueue?: () => void;
}

const DEFAULT_PAPER_TYPES: LabelPaperType[] = [
  {
    id: 'avery-24',
    name: 'Avery 24-Up (70 x 37mm)',
    rows: 8,
    columns: 3,
    page_width_mm: 210,
    page_height_mm: 297,
    label_width_mm: 70,
    label_height_mm: 37,
    margin_top_mm: 0.5,
    margin_left_mm: 0,
    gutter_x_mm: 0,
    gutter_y_mm: 0,
    fill_order: 'row-major',
    active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'avery-18',
    name: 'Avery 18-Up (63.5 x 46.6mm)',
    rows: 6,
    columns: 3,
    page_width_mm: 210,
    page_height_mm: 297,
    label_width_mm: 63.5,
    label_height_mm: 46.6,
    margin_top_mm: 8.7,
    margin_left_mm: 7.2,
    gutter_x_mm: 2.5,
    gutter_y_mm: 0,
    fill_order: 'row-major',
    active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'avery-21',
    name: 'Avery 21-Up (63.5 x 38.1mm)',
    rows: 7,
    columns: 3,
    page_width_mm: 210,
    page_height_mm: 297,
    label_width_mm: 63.5,
    label_height_mm: 38.1,
    margin_top_mm: 15.15,
    margin_left_mm: 7.25,
    gutter_x_mm: 2.5,
    gutter_y_mm: 0,
    fill_order: 'row-major',
    active: true,
    created_at: new Date().toISOString(),
  },
];

export const PrintJobDialog: React.FC<PrintJobDialogProps> = ({
  open,
  plan,
  labels,
  currentUserName = 'Production Staff',
  onClose,
  onPrintCompleted,
  onNavigateToQueue,
}) => {
  const [paperTypes, setPaperTypes] = useState<LabelPaperType[]>(DEFAULT_PAPER_TYPES);
  const [selectedPaperId, setSelectedPaperId] = useState<string>('avery-24');
  const [seqStart, setSeqStart] = useState<number | ''>(1);
  const [seqEnd, setSeqEnd] = useState<number | ''>(plan?.crates_planned || 1);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCalibrationOpen, setIsCalibrationOpen] = useState<boolean>(false);

  useEffect(() => {
    const fetchPaperTypes = async () => {
      try {
        const { data, error } = await supabase
          .from('label_paper_types')
          .select('*')
          .eq('active', true)
          .order('name');

        if (!error && data && data.length > 0) {
          setPaperTypes(data);
          setSelectedPaperId(data[0].id);
        }
      } catch (err) {
        console.warn('Could not load database paper types, using defaults', err);
      }
    };

    if (open) {
      fetchPaperTypes();
    }
  }, [open]);

  useEffect(() => {
    const maxCrates = plan?.crates_planned || (labels && labels.length) || 1;
    setSeqStart(1);
    setSeqEnd(maxCrates);
  }, [plan, labels]);

  const selectedPaper = useMemo(
    () => paperTypes.find((p) => p.id === selectedPaperId) || paperTypes[0] || DEFAULT_PAPER_TYPES[0],
    [paperTypes, selectedPaperId]
  );

  const targetLabels = useMemo(() => {
    const sStart = typeof seqStart === 'number' ? seqStart : 1;
    const sEnd = typeof seqEnd === 'number' ? seqEnd : (plan?.crates_planned || 1);

    if (labels && labels.length > 0) {
      return labels
        .filter((l) => l.sequence_number >= sStart && l.sequence_number <= sEnd)
        .sort((a, b) => a.sequence_number - b.sequence_number);
    }

    const synthetic: ProductionPlanLabel[] = [];
    const total = plan?.crates_planned || 1;
    const stdPack = plan?.standard_packing_qty || 1000;
    const rem = plan?.remainder_quantity || 0;

    for (let i = sStart; i <= Math.min(sEnd, total); i++) {
      const isPartial = i === total && rem > 0;
      synthetic.push({
        id: `synth-${plan?.id || 'plan'}-${i}`,
        plan_id: plan?.id || '',
        sequence_number: i,
        expected_quantity: isPartial ? rem : stdPack,
        is_partial: isPartial,
        qr_payload: `${plan?.batch_code || 'AP26C20'}-${i}`,
        status: 'unprinted',
        print_job_id: null,
        created_at: new Date().toISOString(),
      });
    }
    return synthetic;
  }, [labels, plan, seqStart, seqEnd]);

  const alreadyPrintedCount = useMemo(
    () => targetLabels.filter((l) => l.print_job_id != null || l.status === 'printed').length,
    [targetLabels]
  );

  const isReprintNeeded = alreadyPrintedCount > 0;

  const capacityPerSheet = selectedPaper ? selectedPaper.rows * selectedPaper.columns : 24;
  const sheetCount = Math.ceil(targetLabels.length / capacityPerSheet) || 1;

  const handleQueueForPrint = async () => {
    setIsGenerating(true);
    setErrorMessage(null);
    try {
      const synthLabels = targetLabels.filter((l) => l.id.startsWith('synth-'));
      const realLabelIds = targetLabels.map((l) => l.id).filter((id) => !id.startsWith('synth-'));

      if (synthLabels.length > 0 && plan) {
        const toInsert = synthLabels.map((l) => ({
          plan_id: plan.id,
          sequence_number: l.sequence_number,
          expected_quantity: l.expected_quantity,
          is_partial: l.is_partial,
          qr_payload: l.qr_payload,
          status: 'unprinted',
        }));
        const { error: insertErr } = await supabase.from('production_plan_labels').insert(toInsert);
        if (insertErr) throw insertErr;
      }

      if (realLabelIds.length > 0) {
        await supabase
          .from('production_plan_labels')
          .update({ status: 'unprinted' })
          .in('id', realLabelIds);
      }
      onPrintCompleted();
      onClose();
      if (onNavigateToQueue) {
        onNavigateToQueue();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Queue execution failed:', err);
      setErrorMessage(msg || 'Failed to queue labels.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExecutePrint = async (mode: 'download' | 'preview' = 'download') => {
    if (!selectedPaper) {
      setErrorMessage('Please select a paper type.');
      return;
    }

    if (targetLabels.length === 0) {
      setErrorMessage('Invalid label range selected.');
      return;
    }

    setIsGenerating(true);
    setErrorMessage(null);

    try {
      const synthLabels = targetLabels.filter((l) => l.id.startsWith('synth-'));
      let insertedIds: string[] = [];

      if (synthLabels.length > 0 && plan) {
        const toInsert = synthLabels.map((l) => ({
          plan_id: plan.id,
          sequence_number: l.sequence_number,
          expected_quantity: l.expected_quantity,
          is_partial: l.is_partial,
          qr_payload: l.qr_payload,
          status: 'printed',
        }));
        const { data: insertedData, error: insErr } = await supabase
          .from('production_plan_labels')
          .insert(toInsert)
          .select('id');
        if (insErr) throw insErr;
        if (insertedData) {
          insertedIds = insertedData.map((d: { id: string }) => d.id);
        }
      }

      // Mark labels as printed
      const realLabelIds = targetLabels.map((l) => l.id).filter((id) => !id.startsWith('synth-'));
      if (realLabelIds.length > 0) {
        await supabase
          .from('production_plan_labels')
          .update({ status: 'printed' })
          .in('id', realLabelIds);
      }

      const labelIds = [...realLabelIds, ...insertedIds];

      let rpcHandled = false;
      const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        selectedPaper.id
      );

      if (isValidUUID && labelIds.length > 0) {
        try {
          const { error: rpcErr } = await supabase.rpc('execute_queue_print_job', {
            p_label_paper_type_id: selectedPaper.id,
            p_label_ids: labelIds,
            p_printed_by: currentUserName,
            p_is_reprint: isReprintNeeded,
            p_reprint_reason: isReprintNeeded ? 'Batch reprint' : null,
            p_supervisor_pin: null,
            p_reviewed_by: currentUserName || 'Supervisor',
          });
          if (!rpcErr) rpcHandled = true;
        } catch (rpcErr) {
          console.debug('execute_queue_print_job RPC skipped:', rpcErr);
          rpcHandled = false;
        }
      }

      if (!rpcHandled) {
        // Fallback: direct insert to label_print_jobs with full detail
        try {
          await supabase.from('label_print_jobs').insert([{
            plan_id: plan.id || null,
            label_paper_type_id: isValidUUID ? selectedPaper.id : null,
            sequence_start: seqStart,
            sequence_end: seqEnd,
            sheet_count: sheetCount,
            job_type: isReprintNeeded ? 'reprint' : 'initial',
            reprint_reason: isReprintNeeded ? 'Direct batch reprint' : null,
            printed_by: currentUserName,
          }]);
        } catch (insErr) {
          console.debug('label_print_jobs insert skipped:', insErr);
        }

        // Fallback: direct insert to system_changes audit trail
        try {
          await supabase.from('system_changes').insert([{
            changed_by_name: currentUserName,
            module: 'production_planner',
            table_name: 'production_plan_labels',
            action: isReprintNeeded ? 'reprint_labels' : 'print_labels',
            reason: isReprintNeeded
              ? `Reprint: Batch ${plan.batch_code || 'BATCH'} Cases #${seqStart}-#${seqEnd} (${targetLabels.length} labels)`
              : `Printed: Batch ${plan.batch_code || 'BATCH'} Cases #${seqStart}-#${seqEnd} (${targetLabels.length} labels)`,
            new_value: JSON.stringify({
              batch: plan.batch_code,
              plan_id: plan.id,
              sequence_start: seqStart,
              sequence_end: seqEnd,
              count: targetLabels.length,
              paper: selectedPaper.name,
            }),
          }]);
        } catch (auditErr) {
          console.debug('system_changes insert skipped:', auditErr);
        }
      }

      if (mode === 'preview') {
        await previewLabelsPDF({
          plan: plan,
          labels: targetLabels,
          paper: selectedPaper,
          productName: plan.product_name || plan.product_id,
        });
      } else {
        const cleanBatch = (plan.batch_code || 'BATCH').replace(/[^a-zA-Z0-9_-]/g, '_');
        const filename = `Labels_${cleanBatch}_Cases_${seqStart}-${seqEnd}.pdf`;
        await saveLabelsPDF(
          {
            plan: plan,
            labels: targetLabels,
            paper: selectedPaper,
            productName: plan.product_name || plan.product_id,
          },
          filename
        );
      }

      onPrintCompleted();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Print execution failed:', err);
      setErrorMessage(msg || 'Failed to generate labels PDF.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <>
      <Dialog 
        open={open} 
        onClose={onClose} 
        maxWidth="sm" 
        fullWidth
        PaperProps={{
          sx: {
            bgcolor: 'var(--bg2, #141720)',
            border: '1px solid var(--border, #2e3340)',
            backgroundImage: 'none',
          }
        }}
      >
        <DialogTitle sx={{ fontWeight: 700, borderBottom: '1px solid var(--border, #2e3340)', color: 'var(--text, #e2e6f0)' }}>
          Print Pre-Printed Case Labels
        </DialogTitle>
        <DialogContent sx={{ pt: 2.5 }}>
          <Box sx={{ my: 1 }}>
            {isGenerating && <LinearProgress sx={{ mb: 2 }} />}

            {errorMessage && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {errorMessage}
              </Alert>
            )}

            <Grid container spacing={2}>
              <Grid size={{ xs: 12 }}>
                <Box
                  sx={{
                    p: 1.5,
                    borderRadius: 2,
                    backgroundColor: 'var(--bg3, #1c2028)',
                    border: '1px solid var(--border, #2e3340)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Box>
                    <Typography variant="caption" sx={{ color: 'var(--text2, #8a92a8)', display: 'block' }}>
                      BATCH / PRODUCT
                    </Typography>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'var(--text, #e2e6f0)' }}>
                      {plan?.batch_code || 'AP26C20'} • {plan?.product_name || plan?.product_id}
                    </Typography>
                  </Box>
                  <Chip
                    label={`${plan?.crates_planned || targetLabels.length} Total Cases`}
                    size="small"
                    color="primary"
                    variant="outlined"
                    sx={{ fontWeight: 600 }}
                  />
                </Box>
              </Grid>

              <Grid size={{ xs: 12 }}>
                <TextField
                  select
                  label="Label Stock / Paper Type"
                  fullWidth
                  size="small"
                  value={selectedPaperId}
                  onChange={(e) => setSelectedPaperId(e.target.value)}
                >
                  {paperTypes.map((p) => (
                    <MenuItem key={p.id} value={p.id}>
                      {p.name} ({p.rows * p.columns} per sheet • {p.label_width_mm}x{p.label_height_mm}mm)
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>

              <Grid size={{ xs: 6 }}>
                <TextField
                  label="Case Sequence From"
                  type="number"
                  fullWidth
                  size="small"
                  value={seqStart}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '') {
                      setSeqStart('');
                    } else {
                      setSeqStart(Math.max(1, parseInt(val, 10) || 1));
                    }
                  }}
                  onBlur={() => {
                    if (seqStart === '' || seqStart < 1) {
                      setSeqStart(1);
                    }
                  }}
                />
              </Grid>
              <Grid size={{ xs: 6 }}>
                <TextField
                  label="Case Sequence To"
                  type="number"
                  fullWidth
                  size="small"
                  value={seqEnd}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '') {
                      setSeqEnd('');
                    } else {
                      setSeqEnd(Math.max(1, parseInt(val, 10) || 1));
                    }
                  }}
                  onBlur={() => {
                    const start = typeof seqStart === 'number' ? seqStart : 1;
                    const maxCrates = plan?.crates_planned || 999;
                    if (seqEnd === '' || seqEnd < start) {
                      setSeqEnd(start);
                    } else if (seqEnd > maxCrates) {
                      setSeqEnd(maxCrates);
                    }
                  }}
                />
              </Grid>

              <Grid size={{ xs: 12 }}>
                <Box
                  sx={{
                    p: 1.5,
                    borderRadius: 2,
                    backgroundColor: 'var(--bg3, #1c2028)',
                    border: '1px solid var(--border, #2e3340)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: 'var(--text, #e2e6f0)' }}>
                      Selected: Case #{seqStart} to #{seqEnd} ({targetLabels.length} labels)
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'var(--text2, #8a92a8)' }}>
                      Requires {sheetCount} sheet(s) ({capacityPerSheet} labels/sheet)
                    </Typography>
                  </Box>
                  <Button
                    size="small"
                    startIcon={<CalibrationIcon />}
                    onClick={() => setIsCalibrationOpen(true)}
                    sx={{ textTransform: 'none', fontSize: '0.75rem', color: 'var(--blue, #4d9fff)' }}
                  >
                    Test Calibration
                  </Button>
                </Box>
              </Grid>

              {isReprintNeeded && (
                <Grid size={{ xs: 12 }}>
                  <Alert
                    severity="warning"
                    icon={<WarningIcon />}
                    sx={{
                      bgcolor: 'rgba(245, 166, 35, 0.12)',
                      color: 'var(--amber, #f5a623)',
                      border: '1px solid rgba(245, 166, 35, 0.3)',
                    }}
                  >
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                      Warning: Reprinting {alreadyPrintedCount} Existing Label(s)
                    </Typography>
                    <Typography variant="body2" sx={{ fontSize: '0.8125rem' }}>
                      {alreadyPrintedCount} of {targetLabels.length} selected labels were previously printed. Proceeding will record this reprint in the audit log.
                    </Typography>
                  </Alert>
                </Grid>
              )}
            </Grid>
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2, borderTop: '1px solid var(--border, #2e3340)', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
          <Button onClick={onClose} color="inherit" disabled={isGenerating}>
            Cancel
          </Button>

          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
            <Button
              variant="outlined"
              color="secondary"
              startIcon={<QueueIcon />}
              onClick={handleQueueForPrint}
              disabled={isGenerating || targetLabels.length === 0}
              sx={{ fontWeight: 600 }}
            >
              Send to Print Queue
            </Button>
            <Button
              variant="outlined"
              startIcon={<PrintIcon />}
              onClick={() => handleExecutePrint('preview')}
              disabled={isGenerating || targetLabels.length === 0}
              sx={{ fontWeight: 600 }}
            >
              {isReprintNeeded ? 'Reprint & Open' : 'Open & Print'}
            </Button>
            <Button
              variant="contained"
              startIcon={<DownloadIcon />}
              onClick={() => handleExecutePrint('download')}
              disabled={isGenerating || targetLabels.length === 0}
              sx={{ fontWeight: 600, bgcolor: isReprintNeeded ? 'var(--amber, #f5a623)' : 'var(--blue, #4d9fff)', color: '#ffffff' }}
            >
              {isReprintNeeded ? 'Reprint & Download PDF' : 'Download PDF'}
            </Button>
          </Box>
        </DialogActions>
      </Dialog>

      <CalibrationModal
        open={isCalibrationOpen}
        paper={selectedPaper}
        onClose={() => setIsCalibrationOpen(false)}
      />
    </>
  );
};
