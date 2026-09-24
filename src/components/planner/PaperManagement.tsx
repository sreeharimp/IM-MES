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
  const [formData, setFormData] = useState<Partial<LabelPaperType>>(DEFAULT_FORM_DATA);

  const canEdit = currentUserRole === 'Admin' || currentUserRole === 'PowerUser';

  const fetchPapers = async () => {
    try {
      const { data, error } = await supabase
        .from('label_paper_types')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;
      const loaded = data || [];
      setPapers(loaded);
      if (loaded.length > 0 && !previewPaper) {
        setPreviewPaper(loaded[0]);
      } else if (previewPaper) {
        // Keep preview in sync if it was updated
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
    setFormData(DEFAULT_FORM_DATA);
    setErrorMessage(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (paper: LabelPaperType, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingPaper(paper);
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
    });
    setErrorMessage(null);
    setIsModalOpen(true);
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

      if (previewPaper?.id === paper.id) {
        setPreviewPaper(null);
      }
      await fetchPapers();
    } catch (err: any) {
      alert(err.message || 'Failed to delete paper format. It may be linked to existing printed labels.');
    }
  };

  const handleSavePaper = async () => {
    if (!formData.name?.trim()) {
      setErrorMessage('Paper format name is required.');
      return;
    }

    setSaving(true);
    setErrorMessage(null);

    const payload = {
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

    try {
      if (editingPaper?.id) {
        // Update existing paper type
        const { data, error } = await supabase
          .from('label_paper_types')
          .update(payload)
          .eq('id', editingPaper.id)
          .select()
          .single();

        if (error) throw error;
        await fetchPapers();
        setIsModalOpen(false);
        setEditingPaper(null);
        if (data) setPreviewPaper(data);
      } else {
        // Create new paper type
        const { data, error } = await supabase
          .from('label_paper_types')
          .insert([{ ...payload, created_by: currentUserName }])
          .select()
          .single();

        if (error) throw error;
        await fetchPapers();
        setIsModalOpen(false);
        if (data) setPreviewPaper(data);
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

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2.5, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, color: 'var(--text, #e2e6f0)' }}>
            Label Paper & Die-Cut Formats
          </Typography>
          <Typography variant="body2" sx={{ color: 'var(--text2, #8a92a8)' }}>
            Define, calibrate, and edit sheet geometries with live layout preview for batch label printing
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
                  <TableCell sx={{ fontWeight: 700, color: 'var(--text2, #8a92a8)' }}>Status</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 700, color: 'var(--text2, #8a92a8)' }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {papers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 4, color: 'var(--text2, #8a92a8)' }}>
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
                      <TableCell>
                        <Chip
                          size="small"
                          label={p.active ? 'Active' : 'Inactive'}
                          color={p.active ? 'success' : 'default'}
                          variant="outlined"
                          sx={{ height: 22, fontSize: '0.75rem' }}
                        />
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
                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'var(--text, #e2e6f0)' }}>
                  Scaled Layout: {previewPaper?.name || 'Select Stock'}
                </Typography>
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
