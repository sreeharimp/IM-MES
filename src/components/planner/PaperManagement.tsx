import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Alert,
  IconButton,
  Tooltip,
  Grid,
  Chip,
  FormControlLabel,
  Switch,
} from '@mui/material';
import {
  Add as AddIcon,
  Tune as CalibrationIcon,
  Visibility as PreviewIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import type { LabelPaperType } from '../../types';
import { supabase } from '../../lib/supabase';
import { PaperScalePreview } from './PaperScalePreview';
import { CalibrationModal } from './CalibrationModal';

interface PaperManagementProps {
  currentUserRole?: string;
  currentUserName?: string;
}

const DEFAULT_FORM_DATA: Partial<LabelPaperType> = {
  name: '',
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
  internal_padding_mm: 1.8,
  padding_top_mm: 1.8,
  padding_left_mm: 1.8,
  padding_right_mm: 1.8,
  padding_bottom_mm: 1.8,
};

export const PaperManagement: React.FC<PaperManagementProps> = ({
  currentUserRole = 'Admin',
  currentUserName = 'System User',
}) => {
  const [papers, setPapers] = useState<LabelPaperType[]>([]);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingPaper, setEditingPaper] = useState<LabelPaperType | null>(null);
  const [previewPaper, setPreviewPaper] = useState<LabelPaperType | null>(null);
  const [calibrationPaper, setCalibrationPaper] = useState<LabelPaperType | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const [showAdvancedPadding, setShowAdvancedPadding] = useState<boolean>(false);
  const [formData, setFormData] = useState<Partial<LabelPaperType>>(DEFAULT_FORM_DATA);

  const canEdit = currentUserRole === 'Admin' || currentUserRole === 'PowerUser';

  const fetchPapers = async () => {
    try {
      const { data, error } = await supabase
        .from('label_paper_types')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;
      const loaded: LabelPaperType[] = (data || []).map((p: any) => {
        let localPad: any = null;
        try {
          const saved = localStorage.getItem(`paper_pad_${p.id}`);
          if (saved) localPad = JSON.parse(saved);
        } catch (_) {}

        const intPad = p.internal_padding_mm ?? localPad?.internal_padding_mm ?? 1.8;
        return {
          ...p,
          internal_padding_mm: intPad,
          padding_top_mm: p.padding_top_mm ?? localPad?.padding_top_mm ?? intPad,
          padding_left_mm: p.padding_left_mm ?? localPad?.padding_left_mm ?? intPad,
          padding_right_mm: p.padding_right_mm ?? localPad?.padding_right_mm ?? intPad,
          padding_bottom_mm: p.padding_bottom_mm ?? localPad?.padding_bottom_mm ?? intPad,
        };
      });

      setPapers(loaded);
      if (loaded.length > 0 && !previewPaper) {
        setPreviewPaper(loaded[0]);
      } else if (previewPaper) {
        const updated = loaded.find((p) => p.id === previewPaper.id);
        if (updated) setPreviewPaper(updated);
      }
    } catch (err: any) {
      console.error('Error loading papers:', err);
    }
  };

  useEffect(() => {
    fetchPapers();
  }, []);

  const handleOpenAdd = () => {
    setEditingPaper(null);
    setShowAdvancedPadding(false);
    setFormData(DEFAULT_FORM_DATA);
    setErrorMessage(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (paper: LabelPaperType, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingPaper(paper);

    const intPad = paper.internal_padding_mm ?? 1.8;
    const topPad = paper.padding_top_mm ?? intPad;
    const leftPad = paper.padding_left_mm ?? intPad;
    const rightPad = paper.padding_right_mm ?? intPad;
    const bottomPad = paper.padding_bottom_mm ?? intPad;

    const hasUneven =
      topPad !== intPad || leftPad !== intPad || rightPad !== intPad || bottomPad !== intPad;
    setShowAdvancedPadding(hasUneven);

    setFormData({
      name: paper.name,
      rows: paper.rows,
      columns: paper.columns,
      page_width_mm: paper.page_width_mm || 210,
      page_height_mm: paper.page_height_mm || 297,
      label_width_mm: paper.label_width_mm,
      label_height_mm: paper.label_height_mm,
      margin_top_mm: paper.margin_top_mm,
      margin_left_mm: paper.margin_left_mm,
      gutter_x_mm: paper.gutter_x_mm || 0,
      gutter_y_mm: paper.gutter_y_mm || 0,
      fill_order: paper.fill_order || 'row-major',
      active: paper.active ?? true,
      internal_padding_mm: intPad,
      padding_top_mm: topPad,
      padding_left_mm: leftPad,
      padding_right_mm: rightPad,
      padding_bottom_mm: bottomPad,
    });
    setErrorMessage(null);
    setIsModalOpen(true);
  };

  const handleToggleStatus = async (paper: LabelPaperType, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      const nextActive = !paper.active;
      const { error } = await supabase
        .from('label_paper_types')
        .update({ active: nextActive })
        .eq('id', paper.id);
      if (error) throw error;
      await fetchPapers();
    } catch (err: any) {
      alert(err.message || 'Failed to update status.');
    }
  };

  const handleDeletePaper = async (paper: LabelPaperType, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!window.confirm(`Are you sure you want to delete paper format "${paper.name}"?`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('label_paper_types')
        .delete()
        .eq('id', paper.id);

      if (error) throw error;

      try {
        localStorage.removeItem(`paper_pad_${paper.id}`);
      } catch (_) {}

      if (previewPaper?.id === paper.id) {
        setPreviewPaper(null);
      }
      await fetchPapers();
    } catch (err: any) {
      const isFkError =
        err?.code === '23503' ||
        err?.message?.includes('foreign key constraint') ||
        err?.message?.includes('label_print_jobs');

      if (isFkError) {
        const shouldDeactivate = window.confirm(
          `Paper format "${paper.name}" is linked to existing print job history or product configurations, so it cannot be permanently deleted without breaking historical records.\n\nWould you like to deactivate it instead? (It will be hidden from new print jobs while preserving all logs).`
        );
        if (shouldDeactivate) {
          try {
            await supabase.from('label_paper_types').update({ active: false }).eq('id', paper.id);
            await fetchPapers();
          } catch (deactErr: any) {
            alert('Failed to deactivate format: ' + deactErr.message);
          }
        }
      } else {
        alert(err.message || 'Failed to delete paper format. It may be linked to existing printed labels.');
      }
    }
  };

  const handleSavePaper = async () => {
    if (!formData.name?.trim()) {
      setErrorMessage('Paper format name is required.');
      return;
    }

    setSaving(true);
    setErrorMessage(null);

    const intPad = Number(formData.internal_padding_mm ?? 1.8);
    const padTop = Number(formData.padding_top_mm ?? intPad);
    const padLeft = Number(formData.padding_left_mm ?? intPad);
    const padRight = Number(formData.padding_right_mm ?? intPad);
    const padBottom = Number(formData.padding_bottom_mm ?? intPad);

    const basePayload = {
      name: formData.name.trim(),
      rows: Number(formData.rows) || 1,
      columns: Number(formData.columns) || 1,
      page_width_mm: Number(formData.page_width_mm) || 210,
      page_height_mm: Number(formData.page_height_mm) || 297,
      label_width_mm: Number(formData.label_width_mm) || 0,
      label_height_mm: Number(formData.label_height_mm) || 0,
      margin_top_mm: Number(formData.margin_top_mm) || 0,
      margin_left_mm: Number(formData.margin_left_mm) || 0,
      gutter_x_mm: Number(formData.gutter_x_mm) || 0,
      gutter_y_mm: Number(formData.gutter_y_mm) || 0,
      fill_order: formData.fill_order || 'row-major',
      active: formData.active ?? true,
    };

    const fullPayload = {
      ...basePayload,
      internal_padding_mm: intPad,
      padding_top_mm: padTop,
      padding_left_mm: padLeft,
      padding_right_mm: padRight,
      padding_bottom_mm: padBottom,
    };

    const saveLocalPadding = (paperId: string) => {
      try {
        localStorage.setItem(
          `paper_pad_${paperId}`,
          JSON.stringify({
            internal_padding_mm: intPad,
            padding_top_mm: padTop,
            padding_left_mm: padLeft,
            padding_right_mm: padRight,
            padding_bottom_mm: padBottom,
          })
        );
      } catch (_) {}
    };

    try {
      if (editingPaper?.id) {
        // Try full payload with padding columns
        let res = await supabase
          .from('label_paper_types')
          .update(fullPayload)
          .eq('id', editingPaper.id)
          .select()
          .single();

        // If DB doesn't have the column yet, fallback to base payload
        if (res.error && (res.error.code === 'PGRST204' || res.error.message?.includes('column'))) {
          res = await supabase
            .from('label_paper_types')
            .update(basePayload)
            .eq('id', editingPaper.id)
            .select()
            .single();
        }

        if (res.error) throw res.error;
        saveLocalPadding(editingPaper.id);
        await fetchPapers();
        setIsModalOpen(false);
        setEditingPaper(null);
        if (res.data) {
          setPreviewPaper({
            ...res.data,
            internal_padding_mm: intPad,
            padding_top_mm: padTop,
            padding_left_mm: padLeft,
            padding_right_mm: padRight,
            padding_bottom_mm: padBottom,
          });
        }
      } else {
        let res = await supabase
          .from('label_paper_types')
          .insert([{ ...fullPayload, created_by: currentUserName }])
          .select()
          .single();

        if (res.error && (res.error.code === 'PGRST204' || res.error.message?.includes('column'))) {
          res = await supabase
            .from('label_paper_types')
            .insert([{ ...basePayload, created_by: currentUserName }])
            .select()
            .single();
        }

        if (res.error) throw res.error;
        if (res.data?.id) {
          saveLocalPadding(res.data.id);
        }
        await fetchPapers();
        setIsModalOpen(false);
        if (res.data) {
          setPreviewPaper({
            ...res.data,
            internal_padding_mm: intPad,
            padding_top_mm: padTop,
            padding_left_mm: padLeft,
            padding_right_mm: padRight,
            padding_bottom_mm: padBottom,
          });
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save paper format.');
    } finally {
      setSaving(false);
    }
  };

  // Calculations for live validation in modal
  const calcTotalW =
    (Number(formData.margin_left_mm) || 0) +
    (Number(formData.columns) || 1) * (Number(formData.label_width_mm) || 0) +
    ((Number(formData.columns) || 1) - 1) * (Number(formData.gutter_x_mm) || 0);

  const calcTotalH =
    (Number(formData.margin_top_mm) || 0) +
    (Number(formData.rows) || 1) * (Number(formData.label_height_mm) || 0) +
    ((Number(formData.rows) || 1) - 1) * (Number(formData.gutter_y_mm) || 0);

  const pageW = Number(formData.page_width_mm) || 210;
  const pageH = Number(formData.page_height_mm) || 297;
  const hasDimensionWarning = calcTotalW > pageW || calcTotalH > pageH;

  const currentLabelW = Number(formData.label_width_mm) || 70;
  const currentLabelH = Number(formData.label_height_mm) || 37;
  const curPadTop = Number(formData.padding_top_mm ?? formData.internal_padding_mm ?? 1.8);
  const curPadBottom = Number(formData.padding_bottom_mm ?? formData.internal_padding_mm ?? 1.8);
  const curPadLeft = Number(formData.padding_left_mm ?? formData.internal_padding_mm ?? 1.8);
  const curPadRight = Number(formData.padding_right_mm ?? formData.internal_padding_mm ?? 1.8);

  const safeW = currentLabelW - (curPadLeft + curPadRight);
  const safeH = currentLabelH - (curPadTop + curPadBottom);
  const hasPaddingWarning = safeW <= 10 || safeH <= 10;

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2.5, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, color: 'var(--text, #e2e6f0)' }}>
            Label Paper & Die-Cut Formats
          </Typography>
          <Typography variant="body2" sx={{ color: 'var(--text2, #8a92a8)' }}>
            Configure sheet grids, die-cut label sizes, and internal print safe padding
          </Typography>
        </Box>
        {canEdit && (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleOpenAdd}
            sx={{ bgcolor: 'var(--blue, #4d9fff)', color: '#ffffff' }}
          >
            Add Custom Stock
          </Button>
        )}
      </Box>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid var(--border, #2e3340)', borderRadius: 2, bgcolor: 'var(--bg2, #141720)' }}>
            <Table>
              <TableHead sx={{ bgcolor: 'var(--bg4, #252a35)' }}>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700, color: 'var(--text2, #8a92a8)' }}>Stock Name</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: 'var(--text2, #8a92a8)' }}>Grid (R×C)</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: 'var(--text2, #8a92a8)' }}>Label Size (W×H)</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: 'var(--text2, #8a92a8)' }}>Margins (T/L)</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: 'var(--text2, #8a92a8)' }}>Internal Pad</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: 'var(--text2, #8a92a8)' }}>Status</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 700, color: 'var(--text2, #8a92a8)' }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {papers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 4, color: 'var(--text2, #8a92a8)' }}>
                      No paper formats configured yet. Click "Add Custom Stock" to create one.
                    </TableCell>
                  </TableRow>
                ) : (
                  papers.map((p) => (
                    <TableRow
                      key={p.id}
                      hover
                      selected={previewPaper?.id === p.id}
                      onClick={() => setPreviewPaper(p)}
                      sx={{ cursor: 'pointer' }}
                    >
                      <TableCell sx={{ fontWeight: 700, color: 'var(--text, #e2e6f0)' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          {p.name}
                        </Box>
                      </TableCell>
                      <TableCell sx={{ color: 'var(--text, #e2e6f0)' }}>
                        {p.rows} × {p.columns} ({p.rows * p.columns} labels)
                      </TableCell>
                      <TableCell sx={{ color: 'var(--text, #e2e6f0)' }}>
                        {p.label_width_mm} × {p.label_height_mm} mm
                      </TableCell>
                      <TableCell sx={{ color: 'var(--text2, #8a92a8)' }}>
                        T: {p.margin_top_mm}mm, L: {p.margin_left_mm}mm
                      </TableCell>
                      <TableCell sx={{ color: '#38bdf8', fontWeight: 600 }}>
                        {p.padding_top_mm !== p.padding_left_mm
                          ? `T:${p.padding_top_mm} L:${p.padding_left_mm}mm`
                          : `${p.internal_padding_mm ?? 1.8} mm`}
                      </TableCell>
                      <TableCell>
                        <Tooltip title={canEdit ? `Click to ${p.active ? 'deactivate' : 'activate'}` : ''}>
                          <Chip
                            size="small"
                            label={p.active ? 'Active' : 'Inactive'}
                            color={p.active ? 'success' : 'default'}
                            variant="outlined"
                            onClick={canEdit ? (e) => handleToggleStatus(p, e) : undefined}
                            sx={{ height: 22, fontSize: '0.75rem', cursor: canEdit ? 'pointer' : 'default' }}
                          />
                        </Tooltip>
                      </TableCell>
                      <TableCell align="center">
                        <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                          <Tooltip title="View Scaled Layout">
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreviewPaper(p);
                              }}
                              sx={{ color: 'var(--text2, #8a92a8)' }}
                            >
                              <PreviewIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>

                          {canEdit && (
                            <Tooltip title="Edit Paper Format">
                              <IconButton
                                size="small"
                                color="info"
                                onClick={(e) => handleOpenEdit(p, e)}
                              >
                                <EditIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}

                          <Tooltip title="Print Calibration Sheet">
                            <IconButton
                              size="small"
                              color="primary"
                              onClick={(e) => {
                                e.stopPropagation();
                                setCalibrationPaper(p);
                              }}
                            >
                              <CalibrationIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>

                          {canEdit && (
                            <Tooltip title="Delete Paper Stock">
                              <IconButton
                                size="small"
                                color="error"
                                onClick={(e) => handleDeletePaper(p, e)}
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }}>
          <Card elevation={0} sx={{ border: '1px solid var(--border, #2e3340)', borderRadius: 2, bgcolor: 'var(--bg2, #141720)' }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'var(--text, #e2e6f0)' }}>
                    Scaled Layout: {previewPaper?.name || 'Select Stock'}
                  </Typography>
                  {previewPaper && (
                    <Typography variant="caption" sx={{ color: 'var(--text2, #8a92a8)' }}>
                      Pad: {previewPaper.internal_padding_mm ?? 1.8}mm | Printable: {(previewPaper.label_width_mm - 2 * (previewPaper.internal_padding_mm ?? 1.8)).toFixed(1)}×{(previewPaper.label_height_mm - 2 * (previewPaper.internal_padding_mm ?? 1.8)).toFixed(1)}mm
                    </Typography>
                  )}
                </Box>
                {previewPaper && canEdit && (
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<EditIcon fontSize="small" />}
                    onClick={(e) => handleOpenEdit(previewPaper, e)}
                    sx={{ borderColor: 'var(--border, #2e3340)', color: 'var(--text, #e2e6f0)', textTransform: 'none' }}
                  >
                    Edit Format
                  </Button>
                )}
              </Box>
              {previewPaper && <PaperScalePreview paper={previewPaper} />}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Add / Edit Paper Stock Modal */}
      <Dialog 
        open={isModalOpen} 
        onClose={() => !saving && setIsModalOpen(false)} 
        maxWidth="sm" 
        fullWidth
        slotProps={{
          paper: {
            sx: {
              bgcolor: 'var(--bg2, #141720)',
              border: '1px solid var(--border, #2e3340)',
              backgroundImage: 'none',
              borderRadius: 2,
            }
          }
        }}
      >
        <DialogTitle sx={{ fontWeight: 700, color: 'var(--text, #e2e6f0)', borderBottom: '1px solid var(--border, #2e3340)', pb: 1.5 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{editingPaper ? `Edit Paper Format: ${editingPaper.name}` : 'Add Custom Label Stock'}</span>
            {editingPaper && (
              <Chip size="small" label="Editing" color="info" variant="outlined" />
            )}
          </Box>
        </DialogTitle>
        <DialogContent sx={{ pt: 2.5 }}>
          {errorMessage && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {errorMessage}
            </Alert>
          )}

          {hasDimensionWarning && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              Warning: Grid boundaries ({calcTotalW.toFixed(1)}mm × {calcTotalH.toFixed(1)}mm) exceed sheet dimensions ({pageW}mm × {pageH}mm). Please verify margins or label size.
            </Alert>
          )}

          {hasPaddingWarning && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              Warning: Internal padding reduces safe printable area below 10mm ({safeW.toFixed(1)}×{safeH.toFixed(1)}mm). Content may overflow label boundaries.
            </Alert>
          )}

          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid size={{ xs: 12 }}>
              <TextField
                label="Stock Name / Part Number *"
                fullWidth
                size="small"
                value={formData.name || ''}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Avery 24-Up Custom / 70x37 A4"
              />
            </Grid>

            <Grid size={{ xs: 6 }}>
              <TextField
                label="Page Width (mm)"
                type="number"
                fullWidth
                size="small"
                value={formData.page_width_mm ?? 210}
                onChange={(e) => setFormData({ ...formData, page_width_mm: parseFloat(e.target.value) || 0 })}
                helperText="Standard A4 is 210mm"
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                label="Page Height (mm)"
                type="number"
                fullWidth
                size="small"
                value={formData.page_height_mm ?? 297}
                onChange={(e) => setFormData({ ...formData, page_height_mm: parseFloat(e.target.value) || 0 })}
                helperText="Standard A4 is 297mm"
              />
            </Grid>

            <Grid size={{ xs: 6 }}>
              <TextField
                label="Rows"
                type="number"
                fullWidth
                size="small"
                value={formData.rows ?? 8}
                onChange={(e) => setFormData({ ...formData, rows: parseInt(e.target.value) || 1 })}
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                label="Columns"
                type="number"
                fullWidth
                size="small"
                value={formData.columns ?? 3}
                onChange={(e) => setFormData({ ...formData, columns: parseInt(e.target.value) || 1 })}
                helperText={`Yield: ${(Number(formData.rows) || 1) * (Number(formData.columns) || 1)} labels/sheet`}
              />
            </Grid>

            <Grid size={{ xs: 6 }}>
              <TextField
                label="Label Width (mm)"
                type="number"
                fullWidth
                size="small"
                value={formData.label_width_mm ?? 70}
                onChange={(e) => setFormData({ ...formData, label_width_mm: parseFloat(e.target.value) || 0 })}
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                label="Label Height (mm)"
                type="number"
                fullWidth
                size="small"
                value={formData.label_height_mm ?? 37}
                onChange={(e) => setFormData({ ...formData, label_height_mm: parseFloat(e.target.value) || 0 })}
              />
            </Grid>

            <Grid size={{ xs: 6 }}>
              <TextField
                label="Top Margin (mm)"
                type="number"
                fullWidth
                size="small"
                value={formData.margin_top_mm ?? 0}
                onChange={(e) => setFormData({ ...formData, margin_top_mm: parseFloat(e.target.value) || 0 })}
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                label="Left Margin (mm)"
                type="number"
                fullWidth
                size="small"
                value={formData.margin_left_mm ?? 0}
                onChange={(e) => setFormData({ ...formData, margin_left_mm: parseFloat(e.target.value) || 0 })}
              />
            </Grid>

            <Grid size={{ xs: 6 }}>
              <TextField
                label="Gutter X / Horizontal Gap (mm)"
                type="number"
                fullWidth
                size="small"
                value={formData.gutter_x_mm ?? 0}
                onChange={(e) => setFormData({ ...formData, gutter_x_mm: parseFloat(e.target.value) || 0 })}
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                label="Gutter Y / Vertical Gap (mm)"
                type="number"
                fullWidth
                size="small"
                value={formData.gutter_y_mm ?? 0}
                onChange={(e) => setFormData({ ...formData, gutter_y_mm: parseFloat(e.target.value) || 0 })}
              />
            </Grid>

            {/* ── Internal Label Padding (Print Safe Margins) ── */}
            <Grid size={{ xs: 12 }}>
              <Box sx={{ p: 2, bgcolor: 'var(--bg3, #1c2028)', borderRadius: 2, border: '1px solid var(--border, #2e3340)' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
                  <Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'var(--text, #e2e6f0)' }}>
                      Internal Label Padding (Inner Safe Margin)
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'var(--text2, #8a92a8)' }}>
                      Distance in millimeters between label die-cut edge and printed text / barcode / QR code
                    </Typography>
                  </Box>
                  <FormControlLabel
                    control={
                      <Switch
                        size="small"
                        checked={showAdvancedPadding}
                        onChange={(e) => setShowAdvancedPadding(e.target.checked)}
                      />
                    }
                    label={<Typography variant="caption" sx={{ color: 'var(--text2, #8a92a8)' }}>Separate Edge Controls</Typography>}
                  />
                </Box>

                {!showAdvancedPadding ? (
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 12 }}>
                      <TextField
                        label="Uniform Internal Padding (mm)"
                        type="number"
                        fullWidth
                        size="small"
                        value={formData.internal_padding_mm ?? 1.8}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          setFormData({
                            ...formData,
                            internal_padding_mm: val,
                            padding_top_mm: val,
                            padding_left_mm: val,
                            padding_right_mm: val,
                            padding_bottom_mm: val,
                          });
                        }}
                        helperText={`Applied equally to Top, Bottom, Left, and Right. Safe printable zone: ${safeW.toFixed(1)} × ${safeH.toFixed(1)} mm`}
                      />
                    </Grid>
                  </Grid>
                ) : (
                  <Grid container spacing={1.5}>
                    <Grid size={{ xs: 3 }}>
                      <TextField
                        label="Top Pad (mm)"
                        type="number"
                        size="small"
                        fullWidth
                        value={formData.padding_top_mm ?? formData.internal_padding_mm ?? 1.8}
                        onChange={(e) => setFormData({ ...formData, padding_top_mm: parseFloat(e.target.value) || 0 })}
                      />
                    </Grid>
                    <Grid size={{ xs: 3 }}>
                      <TextField
                        label="Bottom Pad (mm)"
                        type="number"
                        size="small"
                        fullWidth
                        value={formData.padding_bottom_mm ?? formData.internal_padding_mm ?? 1.8}
                        onChange={(e) => setFormData({ ...formData, padding_bottom_mm: parseFloat(e.target.value) || 0 })}
                      />
                    </Grid>
                    <Grid size={{ xs: 3 }}>
                      <TextField
                        label="Left Pad (mm)"
                        type="number"
                        size="small"
                        fullWidth
                        value={formData.padding_left_mm ?? formData.internal_padding_mm ?? 1.8}
                        onChange={(e) => setFormData({ ...formData, padding_left_mm: parseFloat(e.target.value) || 0 })}
                      />
                    </Grid>
                    <Grid size={{ xs: 3 }}>
                      <TextField
                        label="Right Pad (mm)"
                        type="number"
                        size="small"
                        fullWidth
                        value={formData.padding_right_mm ?? formData.internal_padding_mm ?? 1.8}
                        onChange={(e) => setFormData({ ...formData, padding_right_mm: parseFloat(e.target.value) || 0 })}
                      />
                    </Grid>
                    <Grid size={{ xs: 12 }}>
                      <Typography variant="caption" sx={{ color: 'var(--text2, #8a92a8)' }}>
                        Safe printable zone: {safeW.toFixed(1)} × {safeH.toFixed(1)} mm
                      </Typography>
                    </Grid>
                  </Grid>
                )}
              </Box>
            </Grid>

            <Grid size={{ xs: 8 }}>
              <TextField
                select
                label="Print Sequence Fill Order"
                fullWidth
                size="small"
                value={formData.fill_order || 'row-major'}
                onChange={(e) => setFormData({ ...formData, fill_order: e.target.value as any })}
              >
                <MenuItem value="row-major">Row-Major (Left → Right, Top → Bottom)</MenuItem>
                <MenuItem value="column-major">Column-Major (Top → Bottom, Left → Right)</MenuItem>
              </TextField>
            </Grid>

            <Grid size={{ xs: 4 }} sx={{ display: 'flex', alignItems: 'center' }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={formData.active ?? true}
                    onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                    color="primary"
                  />
                }
                label="Active"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 2, borderTop: '1px solid var(--border, #2e3340)' }}>
          <Button onClick={() => setIsModalOpen(false)} color="inherit" disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSavePaper}
            disabled={saving}
            sx={{ bgcolor: 'var(--blue, #4d9fff)', color: '#ffffff' }}
          >
            {saving ? 'Saving...' : editingPaper ? 'Update Paper Stock' : 'Create Paper Stock'}
          </Button>
        </DialogActions>
      </Dialog>

      {calibrationPaper && (
        <CalibrationModal
          open={Boolean(calibrationPaper)}
          paper={calibrationPaper}
          onClose={() => setCalibrationPaper(null)}
        />
      )}
    </Box>
  );
};
