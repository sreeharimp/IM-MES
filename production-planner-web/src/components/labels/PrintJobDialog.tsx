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
} from '@mui/material';
import Grid from '@mui/material/Grid2';
import {
  Print as PrintIcon,
  Download as DownloadIcon,
  Tune as CalibrationIcon,
  WarningAmber as WarningIcon,
  AutoAwesome as AutoIcon,
} from '@mui/icons-material';
import { ProductionPlan, ProductionPlanLabel, LabelPaperType } from '../../types';
import { supabase } from '../../lib/supabase';
import { saveLabelsPDF, previewLabelsPDF } from '../../services/pdfGenerator';
import { ReprintAuthModal } from './ReprintAuthModal';
import { CalibrationModal } from './CalibrationModal';

interface PrintJobDialogProps {
  open: boolean;
  plan: ProductionPlan;
  labels: ProductionPlanLabel[];
  onClose: () => void;
  onPrintCompleted: () => void;
}

// Built-in standard Avery & die-cut paper stocks fallback
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
  onClose,
  onPrintCompleted,
}) => {
  const [paperTypes, setPaperTypes] = useState<LabelPaperType[]>(DEFAULT_PAPER_TYPES);
  const [selectedPaperId, setSelectedPaperId] = useState<string>('avery-24');
  const [seqStart, setSeqStart] = useState<number>(1);
  const [seqEnd, setSeqEnd] = useState<number>(plan?.crates_planned || 1);
  const [isReprintModalOpen, setIsReprintModalOpen] = useState<boolean>(false);
  const [isCalibrationOpen, setIsCalibrationOpen] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch approved paper types for this product
  useEffect(() => {
    if (open && plan) {
      setSeqStart(1);
      setSeqEnd(plan.crates_planned || 1);
      setErrorMessage(null);

      const fetchPaperTypes = async () => {
        try {
          const { data: approvedLinks } = await supabase
            .from('product_label_types')
            .select('*, paper_type:label_paper_types(*)')
            .eq('product_id', plan.product_id);

          const { data: allActivePapers } = await supabase
            .from('label_paper_types')
            .select('*')
            .eq('active', true);

          let combinedPapers: LabelPaperType[] = [];

          if (approvedLinks && approvedLinks.length > 0) {
            combinedPapers = approvedLinks
              .map((l: any) => l.paper_type)
              .filter(Boolean);

            const defaultLink = approvedLinks.find((l: any) => l.is_default);
            if (defaultLink && defaultLink.paper_type) {
              setSelectedPaperId(defaultLink.label_paper_type_id);
            } else if (combinedPapers.length > 0) {
              setSelectedPaperId(combinedPapers[0].id);
            }
          } else if (allActivePapers && allActivePapers.length > 0) {
            combinedPapers = allActivePapers;
            setSelectedPaperId(allActivePapers[0].id);
          }

          if (combinedPapers.length > 0) {
            setPaperTypes(combinedPapers);
          } else {
            setPaperTypes(DEFAULT_PAPER_TYPES);
            setSelectedPaperId(DEFAULT_PAPER_TYPES[0].id);
          }
        } catch (err: any) {
          console.warn('Paper types fetch fallback to standard stocks:', err);
          setPaperTypes(DEFAULT_PAPER_TYPES);
          setSelectedPaperId(DEFAULT_PAPER_TYPES[0].id);
        }
      };

      fetchPaperTypes();
    }
  }, [open, plan]);

  const selectedPaper = useMemo(() => {
    return paperTypes.find((p) => p.id === selectedPaperId) || paperTypes[0] || DEFAULT_PAPER_TYPES[0];
  }, [paperTypes, selectedPaperId]);

  // Labels inside chosen sequence range, or synthesized if not yet generated
  const effectiveLabels = useMemo(() => {
    const stdPack = plan?.standard_packing_qty || 1000;
    const crates = plan?.crates_planned || 1;
    const remainder = plan?.remainder_quantity || 0;

    // If labels already exist in DB
    if (labels && labels.length > 0) {
      return labels;
    }

    // Synthesize label records so printing is never blocked
    const synthetic: ProductionPlanLabel[] = [];
    for (let i = 1; i <= crates; i++) {
      const isPartial = i === crates && remainder > 0;
      const expectedQty = isPartial ? remainder : stdPack;
      synthetic.push({
        id: `synth-${plan?.id}-${i}`,
        plan_id: plan?.id || '',
        sequence_number: i,
        expected_quantity: expectedQty,
        is_partial: isPartial,
        qr_payload: `${plan?.batch_code}-${i}`,
        status: 'unprinted',
        print_job_id: null,
        created_at: new Date().toISOString(),
      });
    }
    return synthetic;
  }, [labels, plan]);

  const targetLabels = useMemo(() => {
    return effectiveLabels.filter(
      (l) => l.sequence_number >= seqStart && l.sequence_number <= seqEnd
    );
  }, [effectiveLabels, seqStart, seqEnd]);

  // Check if any labels in this range are already printed
  const alreadyPrintedCount = useMemo(() => {
    return targetLabels.filter((l) => l.print_job_id != null || l.status === 'printed').length;
  }, [targetLabels]);

  const isReprintNeeded = alreadyPrintedCount > 0;
  const isAutoGenerating = labels.length === 0;

  // Sheet calculation
  const capacityPerSheet = selectedPaper ? selectedPaper.rows * selectedPaper.columns : 1;
  const sheetCount = Math.ceil(targetLabels.length / capacityPerSheet) || 1;

  // Execute print job
  const handleExecutePrint = async (
    mode: 'download' | 'preview' = 'download',
    reprintAuth?: {
      supervisorPin: string;
      reviewedBy: string;
      reprintReason: string;
    }
  ) => {
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
      // 1. Ensure labels exist in database
      const { data: existingLabels } = await supabase
        .from('production_plan_labels')
        .select('id')
        .eq('plan_id', plan.id);

      if (!existingLabels || existingLabels.length === 0) {
        let rpcCreated = false;
        try {
          const { error: rpcErr } = await supabase.rpc('generate_production_plan_labels', {
            p_plan_id: plan.id,
            p_user_id: 'Production Planner',
          });
          if (!rpcErr) rpcCreated = true;
        } catch (_) {}

        if (!rpcCreated) {
          const stdPack = plan.standard_packing_qty || 1000;
          const crates = plan.crates_planned || 1;
          const remainder = plan.remainder_quantity || 0;
          const rowsToInsert = [];
          for (let i = 1; i <= crates; i++) {
            const isPartial = i === crates && remainder > 0;
            rowsToInsert.push({
              plan_id: plan.id,
              sequence_number: i,
              expected_quantity: isPartial ? remainder : stdPack,
              is_partial: isPartial,
              qr_payload: `${plan.batch_code}-${i}`,
              status: i >= seqStart && i <= seqEnd ? 'printed' : 'unprinted',
            });
          }
          await supabase.from('production_plan_labels').insert(rowsToInsert);
        }
      }

      // 2. Mark sequence labels as 'printed' in database
      await supabase
        .from('production_plan_labels')
        .update({ status: 'printed' })
        .eq('plan_id', plan.id)
        .gte('sequence_number', seqStart)
        .lte('sequence_number', seqEnd);

      // 3. Mark plan status as 'printed' in database
      await supabase
        .from('production_plans')
        .update({ status: 'printed', updated_at: new Date().toISOString() })
        .eq('id', plan.id);

      // 4. Try invoking the atomic print job RPC if valid UUID paper id
      const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        selectedPaper.id
      );

      if (isValidUUID) {
        try {
          await supabase.rpc('execute_label_print_job', {
            p_plan_id: plan.id,
            p_label_paper_type_id: selectedPaper.id,
            p_sequence_start: seqStart,
            p_sequence_end: seqEnd,
            p_printed_by: 'Production Planning Staff',
            p_is_reprint: isReprintNeeded,
            p_reprint_reason: reprintAuth?.reprintReason || null,
            p_supervisor_pin: reprintAuth?.supervisorPin || null,
            p_reviewed_by: reprintAuth?.reviewedBy || null,
          });
        } catch (rpcErr: any) {
          console.warn('RPC execute_label_print_job notice:', rpcErr?.message);
        }
      }

      if (mode === 'preview') {
        // Open PDF directly in browser PDF viewer
        await previewLabelsPDF({
          plan: plan,
          labels: targetLabels,
          paper: selectedPaper,
          productName: plan.product_name || plan.product_id,
        });
      } else {
        // Download PDF directly
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
    } catch (err: any) {
      console.error('Print execution failed:', err);
      setErrorMessage(err.message || 'Failed to generate labels PDF.');
    } finally {
      setIsGenerating(false);
    }
  };

  const onReprintAuthorized = (data: { supervisorPin: string; reviewedBy: string; reprintReason: string }) => {
    setIsReprintModalOpen(false);
    handleExecutePrint('download', data);
  };

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, pb: 1, borderBottom: '1px solid #e2e8f0' }}>
          Print Pre-Printed Case Labels
        </DialogTitle>
        <DialogContent sx={{ pt: 2.5 }}>
          {isGenerating && <LinearProgress sx={{ mb: 2 }} />}

          {errorMessage && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {errorMessage}
            </Alert>
          )}

          {isAutoGenerating && (
            <Alert
              severity="info"
              icon={<AutoIcon />}
              sx={{ mb: 2, fontSize: '0.8125rem' }}
            >
              Labels have not been pre-generated for this plan yet. Printing will auto-generate and encode the {plan.crates_planned} case QR codes.
            </Alert>
          )}

          <Grid container spacing={2}>
            {/* Plan Info summary */}
            <Grid size={{ xs: 12 }}>
              <Box
                sx={{
                  p: 1.5,
                  borderRadius: 2,
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Box>
                  <Typography variant="caption" sx={{ color: '#64748b', display: 'block' }}>
                    BATCH / PRODUCT
                  </Typography>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#0f172a' }}>
                    {plan.batch_code} • {plan.product_name || plan.product_id}
                  </Typography>
                </Box>
                <Chip
                  label={`${plan.crates_planned} Total Cases`}
                  size="small"
                  color="primary"
                  variant="outlined"
                  sx={{ fontWeight: 600 }}
                />
              </Box>
            </Grid>

            {/* Paper Type Selector */}
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

            {/* Sequence Range */}
            <Grid size={{ xs: 6 }}>
              <TextField
                label="Case Sequence From"
                type="number"
                fullWidth
                size="small"
                value={seqStart}
                onChange={(e) => setSeqStart(Math.max(1, parseInt(e.target.value) || 1))}
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                label="Case Sequence To"
                type="number"
                fullWidth
                size="small"
                value={seqEnd}
                onChange={(e) =>
                  setSeqEnd(Math.min(plan.crates_planned, Math.max(seqStart, parseInt(e.target.value) || seqStart)))
                }
              />
            </Grid>

            {/* Print Summary */}
            <Grid size={{ xs: 12 }}>
              <Box
                sx={{
                  p: 1.5,
                  borderRadius: 2,
                  backgroundColor: '#f1f5f9',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600, color: '#334155' }}>
                    Selected Range: Case #{seqStart} to #{seqEnd} ({targetLabels.length} labels)
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#64748b' }}>
                    Requires {sheetCount} sheet(s) ({capacityPerSheet} labels/sheet)
                  </Typography>
                </Box>
                <Button
                  size="small"
                  startIcon={<CalibrationIcon />}
                  onClick={() => setIsCalibrationOpen(true)}
                  sx={{ textTransform: 'none', fontSize: '0.75rem' }}
                >
                  Test Calibration
                </Button>
              </Box>
            </Grid>

            {/* Reprint Warning Alert */}
            {isReprintNeeded && (
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
                    Reprint Sign-off Required
                  </Typography>
                  <Typography variant="body2" sx={{ fontSize: '0.8125rem' }}>
                    {alreadyPrintedCount} of {targetLabels.length} selected labels have already been printed. Direct printing is blocked per ISO 13485 procedure. Supervisor PIN and reprint justification are required.
                  </Typography>
                </Alert>
              </Grid>
            )}
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 2, borderTop: '1px solid #e2e8f0', justifyContent: 'space-between' }}>
          <Button onClick={onClose} color="inherit" disabled={isGenerating}>
            Cancel
          </Button>

          <Box sx={{ display: 'flex', gap: 1.5 }}>
            {isReprintNeeded ? (
              <Button
                variant="contained"
                color="warning"
                onClick={() => setIsReprintModalOpen(true)}
                disabled={isGenerating || targetLabels.length === 0}
              >
                Authorize Reprint (Supervisor PIN)
              </Button>
            ) : (
              <>
                <Button
                  variant="outlined"
                  startIcon={<PrintIcon />}
                  onClick={() => handleExecutePrint('preview')}
                  disabled={isGenerating || targetLabels.length === 0}
                >
                  {isGenerating ? 'Rendering...' : 'Open & Print (Browser)'}
                </Button>
                <Button
                  variant="contained"
                  startIcon={<DownloadIcon />}
                  onClick={() => handleExecutePrint('download')}
                  disabled={isGenerating || targetLabels.length === 0}
                >
                  {isGenerating ? 'Rendering...' : 'Download PDF'}
                </Button>
              </>
            )}
          </Box>
        </DialogActions>
      </Dialog>

      {/* Supervisor Reprint Authorization Modal */}
      <ReprintAuthModal
        open={isReprintModalOpen}
        onClose={() => setIsReprintModalOpen(false)}
        onAuthorize={onReprintAuthorized}
      />

      {/* Calibration Test Sheet Modal */}
      <CalibrationModal
        open={isCalibrationOpen}
        paper={selectedPaper}
        onClose={() => setIsCalibrationOpen(false)}
      />
    </>
  );
};
