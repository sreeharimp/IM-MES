import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Chip,
  IconButton,
  Alert,
} from '@mui/material';
import Grid from '@mui/material/Grid2';
import {
  Add as AddIcon,
  Tune as CalibrationIcon,
  Edit as EditIcon,
  CheckCircle as ActiveIcon,
} from '@mui/icons-material';
import { LabelPaperType, FillOrder } from '../../types';
import { supabase } from '../../lib/supabase';
import { PaperScalePreview } from './PaperScalePreview';
import { CalibrationModal } from '../labels/CalibrationModal';

export const PaperManagement: React.FC = () => {
  const [paperTypes, setPaperTypes] = useState<LabelPaperType[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [selectedForCalibration, setSelectedForCalibration] = useState<LabelPaperType | null>(null);
  const [editingPaper, setEditingPaper] = useState<Partial<LabelPaperType> | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchPaperTypes = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('label_paper_types')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) throw error;
      setPaperTypes(data || []);
    } catch (err: any) {
      console.error('Failed to load paper types:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPaperTypes();
  }, []);

  const handleOpenAdd = () => {
    setEditingPaper({
      name: 'Custom Sticker Stock',
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
    });
  };

  const handleSavePaper = async () => {
    if (!editingPaper || !editingPaper.name) return;

    try {
      if (editingPaper.id) {
        const { error } = await supabase
          .from('label_paper_types')
          .update(editingPaper)
          .eq('id', editingPaper.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('label_paper_types')
          .insert([editingPaper]);
        if (error) throw error;
      }

      setNotification({ type: 'success', message: 'Paper type saved successfully.' });
      setEditingPaper(null);
      fetchPaperTypes();
    } catch (err: any) {
      console.error('Failed to save paper type:', err);
      setNotification({ type: 'error', message: err.message || 'Error saving paper type.' });
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, color: '#0f172a' }}>
            Label Stock & Paper Management
          </Typography>
          <Typography variant="body2" sx={{ color: '#64748b' }}>
            Manage Avery-style multi-label sheet stock, row/column counts, millimetric margins, and gutters.
          </Typography>
        </Box>

        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleOpenAdd}
        >
          Add Paper Type
        </Button>
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

      {/* Grid of Paper Types */}
      <Grid container spacing={3}>
        {paperTypes.map((paper) => (
          <Grid key={paper.id} size={{ xs: 12, md: 6, lg: 4 }}>
            <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <CardContent sx={{ flex: 1 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}>
                  <Box>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#0f172a' }}>
                      {paper.name}
                    </Typography>
                    <Chip
                      label={`${paper.rows * paper.columns} Labels / Sheet`}
                      size="small"
                      color="primary"
                      sx={{ mt: 0.5, fontWeight: 600, height: 20 }}
                    />
                  </Box>
                  <IconButton size="small" onClick={() => setEditingPaper(paper)}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                </Box>

                {/* Scale visual preview */}
                <Box sx={{ my: 2, display: 'flex', justifyContent: 'center' }}>
                  <PaperScalePreview paper={paper} previewScale={0.45} />
                </Box>

                {/* Dimension Details */}
                <Box sx={{ backgroundColor: '#f8fafc', p: 1.5, borderRadius: 2, fontSize: '0.8125rem', color: '#475569' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                    <span>Grid:</span>
                    <strong>{paper.columns} cols × {paper.rows} rows</strong>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                    <span>Label Size:</span>
                    <strong>{paper.label_width_mm} × {paper.label_height_mm} mm</strong>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                    <span>Margins:</span>
                    <span>T: {paper.margin_top_mm}mm | L: {paper.margin_left_mm}mm</span>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Gutters / Order:</span>
                    <span>X: {paper.gutter_x_mm}mm | {paper.fill_order}</span>
                  </Box>
                </Box>
              </CardContent>

              <Box sx={{ p: 1.5, borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end' }}>
                <Button
                  size="small"
                  startIcon={<CalibrationIcon />}
                  onClick={() => setSelectedForCalibration(paper)}
                  sx={{ textTransform: 'none' }}
                >
                  Test Calibration Sheet
                </Button>
              </Box>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Edit / Add Modal with Realtime Interactive Visual Preview */}
      {editingPaper && (
        <Dialog open={Boolean(editingPaper)} onClose={() => setEditingPaper(null)} maxWidth="md" fullWidth>
          <DialogTitle sx={{ fontWeight: 700, borderBottom: '1px solid #e2e8f0' }}>
            {editingPaper.id ? 'Edit Paper Stock' : 'Add New Paper Stock'}
          </DialogTitle>
          <DialogContent sx={{ pt: 2.5 }}>
            <Grid container spacing={3}>
              {/* Form Inputs */}
              <Grid size={{ xs: 12, md: 7 }}>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12 }}>
                    <TextField
                      label="Paper Template Name"
                      fullWidth
                      size="small"
                      value={editingPaper.name || ''}
                      onChange={(e) => setEditingPaper({ ...editingPaper, name: e.target.value })}
                    />
                  </Grid>
                  <Grid size={{ xs: 6 }}>
                    <TextField
                      label="Columns"
                      type="number"
                      fullWidth
                      size="small"
                      value={editingPaper.columns || 1}
                      onChange={(e) => setEditingPaper({ ...editingPaper, columns: parseInt(e.target.value) || 1 })}
                    />
                  </Grid>
                  <Grid size={{ xs: 6 }}>
                    <TextField
                      label="Rows"
                      type="number"
                      fullWidth
                      size="small"
                      value={editingPaper.rows || 1}
                      onChange={(e) => setEditingPaper({ ...editingPaper, rows: parseInt(e.target.value) || 1 })}
                    />
                  </Grid>
                  <Grid size={{ xs: 6 }}>
                    <TextField
                      label="Page Width (mm)"
                      type="number"
                      fullWidth
                      size="small"
                      value={editingPaper.page_width_mm || 210}
                      onChange={(e) => setEditingPaper({ ...editingPaper, page_width_mm: parseFloat(e.target.value) || 0 })}
                    />
                  </Grid>
                  <Grid size={{ xs: 6 }}>
                    <TextField
                      label="Page Height (mm)"
                      type="number"
                      fullWidth
                      size="small"
                      value={editingPaper.page_height_mm || 297}
                      onChange={(e) => setEditingPaper({ ...editingPaper, page_height_mm: parseFloat(e.target.value) || 0 })}
                    />
                  </Grid>
                  <Grid size={{ xs: 6 }}>
                    <TextField
                      label="Label Width (mm)"
                      type="number"
                      fullWidth
                      size="small"
                      value={editingPaper.label_width_mm || 70}
                      onChange={(e) => setEditingPaper({ ...editingPaper, label_width_mm: parseFloat(e.target.value) || 0 })}
                    />
                  </Grid>
                  <Grid size={{ xs: 6 }}>
                    <TextField
                      label="Label Height (mm)"
                      type="number"
                      fullWidth
                      size="small"
                      value={editingPaper.label_height_mm || 37}
                      onChange={(e) => setEditingPaper({ ...editingPaper, label_height_mm: parseFloat(e.target.value) || 0 })}
                    />
                  </Grid>
                  <Grid size={{ xs: 6 }}>
                    <TextField
                      label="Margin Top (mm)"
                      type="number"
                      fullWidth
                      size="small"
                      value={editingPaper.margin_top_mm ?? 0}
                      onChange={(e) => setEditingPaper({ ...editingPaper, margin_top_mm: parseFloat(e.target.value) || 0 })}
                    />
                  </Grid>
                  <Grid size={{ xs: 6 }}>
                    <TextField
                      label="Margin Left (mm)"
                      type="number"
                      fullWidth
                      size="small"
                      value={editingPaper.margin_left_mm ?? 0}
                      onChange={(e) => setEditingPaper({ ...editingPaper, margin_left_mm: parseFloat(e.target.value) || 0 })}
                    />
                  </Grid>
                  <Grid size={{ xs: 6 }}>
                    <TextField
                      label="Gutter X (mm)"
                      type="number"
                      fullWidth
                      size="small"
                      value={editingPaper.gutter_x_mm ?? 0}
                      onChange={(e) => setEditingPaper({ ...editingPaper, gutter_x_mm: parseFloat(e.target.value) || 0 })}
                    />
                  </Grid>
                  <Grid size={{ xs: 6 }}>
                    <TextField
                      label="Gutter Y (mm)"
                      type="number"
                      fullWidth
                      size="small"
                      value={editingPaper.gutter_y_mm ?? 0}
                      onChange={(e) => setEditingPaper({ ...editingPaper, gutter_y_mm: parseFloat(e.target.value) || 0 })}
                    />
                  </Grid>
                  <Grid size={{ xs: 12 }}>
                    <TextField
                      select
                      label="Fill Order"
                      fullWidth
                      size="small"
                      value={editingPaper.fill_order || 'row-major'}
                      onChange={(e) => setEditingPaper({ ...editingPaper, fill_order: e.target.value as FillOrder })}
                    >
                      <MenuItem value="row-major">Row-Major (Across columns then down)</MenuItem>
                      <MenuItem value="column-major">Column-Major (Down rows then across)</MenuItem>
                    </TextField>
                  </Grid>
                </Grid>
              </Grid>

              {/* Real-time Interactive Visual Scale Preview */}
              <Grid size={{ xs: 12, md: 5 }}>
                <Box sx={{ textAlign: 'center', p: 1, backgroundColor: '#f8fafc', borderRadius: 2, border: '1px solid #e2e8f0' }}>
                  <Typography variant="caption" sx={{ fontWeight: 700, color: '#64748b', display: 'block', mb: 1 }}>
                    LIVE DIE-CUT PROPORTION PREVIEW
                  </Typography>
                  <PaperScalePreview paper={editingPaper as LabelPaperType} previewScale={0.55} />
                </Box>
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions sx={{ p: 2, borderTop: '1px solid #e2e8f0' }}>
            <Button onClick={() => setEditingPaper(null)} color="inherit">
              Cancel
            </Button>
            <Button variant="contained" onClick={handleSavePaper}>
              Save Paper Type
            </Button>
          </DialogActions>
        </Dialog>
      )}

      {/* Calibration Modal */}
      <CalibrationModal
        open={Boolean(selectedForCalibration)}
        paper={selectedForCalibration}
        onClose={() => setSelectedForCalibration(null)}
      />
    </Box>
  );
};
