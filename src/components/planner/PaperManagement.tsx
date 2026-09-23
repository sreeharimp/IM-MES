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
} from '@mui/material';
import {
  Add as AddIcon,
  Tune as CalibrationIcon,
  Visibility as PreviewIcon,
} from '@mui/icons-material';
import type { LabelPaperType } from '../../types';
import { supabase } from '../../lib/supabase';
import { PaperScalePreview } from './PaperScalePreview';
import { CalibrationModal } from './CalibrationModal';

interface PaperManagementProps {
  currentUserRole?: string;
  currentUserName?: string;
}

export const PaperManagement: React.FC<PaperManagementProps> = ({
  currentUserRole = 'Admin',
  currentUserName = 'System User',
}) => {
  const [papers, setPapers] = useState<LabelPaperType[]>([]);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [previewPaper, setPreviewPaper] = useState<LabelPaperType | null>(null);
  const [calibrationPaper, setCalibrationPaper] = useState<LabelPaperType | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<LabelPaperType>>({
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
  });

  const canEdit = currentUserRole === 'Admin' || currentUserRole === 'PowerUser';

  const fetchPapers = async () => {
    try {
      const { data, error } = await supabase
        .from('label_paper_types')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;
      setPapers(data || []);
      if (data && data.length > 0 && !previewPaper) {
        setPreviewPaper(data[0]);
      }
    } catch (err: any) {
      console.error('Error loading papers:', err);
    }
  };

  useEffect(() => {
    fetchPapers();
  }, []);

  const handleSavePaper = async () => {
    if (!formData.name?.trim()) {
      setErrorMessage('Paper name is required.');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('label_paper_types')
        .insert([{ ...formData, created_by: currentUserName }])
        .select()
        .single();

      if (error) throw error;

      await fetchPapers();
      setIsModalOpen(false);
      setPreviewPaper(data);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save paper format.');
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2.5, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, color: 'var(--text, #e2e6f0)' }}>
            Label Paper & Die-Cut Formats
          </Typography>
          <Typography variant="body2" sx={{ color: 'var(--text2, #8a92a8)' }}>
            Define sheet geometries with alignment verification for batch label printing
          </Typography>
        </Box>
        {canEdit && (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => {
              setErrorMessage(null);
              setIsModalOpen(true);
            }}
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
                  <TableCell sx={{ fontWeight: 700, color: 'var(--text2, #8a92a8)' }}>Fill Order</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 700, color: 'var(--text2, #8a92a8)' }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {papers.map((p) => (
                  <TableRow
                    key={p.id}
                    hover
                    selected={previewPaper?.id === p.id}
                    onClick={() => setPreviewPaper(p)}
                    sx={{ cursor: 'pointer' }}
                  >
                    <TableCell sx={{ fontWeight: 700, color: 'var(--text, #e2e6f0)' }}>{p.name}</TableCell>
                    <TableCell sx={{ color: 'var(--text, #e2e6f0)' }}>
                      {p.rows} × {p.columns} ({p.rows * p.columns} labels)
                    </TableCell>
                    <TableCell sx={{ color: 'var(--text, #e2e6f0)' }}>
                      {p.label_width_mm} × {p.label_height_mm} mm
                    </TableCell>
                    <TableCell sx={{ color: 'var(--text2, #8a92a8)' }}>
                      T: {p.margin_top_mm}mm, L: {p.margin_left_mm}mm
                    </TableCell>
                    <TableCell sx={{ color: 'var(--text2, #8a92a8)' }}>{p.fill_order}</TableCell>
                    <TableCell align="center">
                      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center' }}>
                        <Tooltip title="View Scaled Layout">
                          <IconButton size="small" onClick={() => setPreviewPaper(p)} sx={{ color: 'var(--text2, #8a92a8)' }}>
                            <PreviewIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
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
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }}>
          <Card elevation={0} sx={{ border: '1px solid var(--border, #2e3340)', borderRadius: 2, bgcolor: 'var(--bg2, #141720)' }}>
            <CardContent>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 2, color: 'var(--text, #e2e6f0)' }}>
                Scaled Die-Cut Preview: {previewPaper?.name || 'Select Stock'}
              </Typography>
              {previewPaper && <PaperScalePreview paper={previewPaper} />}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Add Custom Paper Stock Modal */}
      <Dialog 
        open={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
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
        <DialogTitle sx={{ fontWeight: 700, color: 'var(--text, #e2e6f0)' }}>Add Custom Label Stock</DialogTitle>
        <DialogContent sx={{ pt: 2.5 }}>
          {errorMessage && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {errorMessage}
            </Alert>
          )}
          <Grid container spacing={2}>
            <Grid size={{ xs: 12 }}>
              <TextField
                label="Stock Name / Part Number"
                fullWidth
                size="small"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Avery 24-Up Custom"
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                label="Rows"
                type="number"
                fullWidth
                size="small"
                value={formData.rows}
                onChange={(e) => setFormData({ ...formData, rows: parseInt(e.target.value) || 1 })}
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                label="Columns"
                type="number"
                fullWidth
                size="small"
                value={formData.columns}
                onChange={(e) => setFormData({ ...formData, columns: parseInt(e.target.value) || 1 })}
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                label="Label Width (mm)"
                type="number"
                fullWidth
                size="small"
                value={formData.label_width_mm}
                onChange={(e) => setFormData({ ...formData, label_width_mm: parseFloat(e.target.value) || 0 })}
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                label="Label Height (mm)"
                type="number"
                fullWidth
                size="small"
                value={formData.label_height_mm}
                onChange={(e) => setFormData({ ...formData, label_height_mm: parseFloat(e.target.value) || 0 })}
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                label="Margin Top (mm)"
                type="number"
                fullWidth
                size="small"
                value={formData.margin_top_mm}
                onChange={(e) => setFormData({ ...formData, margin_top_mm: parseFloat(e.target.value) || 0 })}
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                label="Margin Left (mm)"
                type="number"
                fullWidth
                size="small"
                value={formData.margin_left_mm}
                onChange={(e) => setFormData({ ...formData, margin_left_mm: parseFloat(e.target.value) || 0 })}
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                label="Gutter X (mm)"
                type="number"
                fullWidth
                size="small"
                value={formData.gutter_x_mm}
                onChange={(e) => setFormData({ ...formData, gutter_x_mm: parseFloat(e.target.value) || 0 })}
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                label="Gutter Y (mm)"
                type="number"
                fullWidth
                size="small"
                value={formData.gutter_y_mm}
                onChange={(e) => setFormData({ ...formData, gutter_y_mm: parseFloat(e.target.value) || 0 })}
              />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                select
                label="Fill Order"
                fullWidth
                size="small"
                value={formData.fill_order}
                onChange={(e) => setFormData({ ...formData, fill_order: e.target.value as any })}
              >
                <MenuItem value="row-major">Row-Major (Left to Right, Top to Bottom)</MenuItem>
                <MenuItem value="column-major">Column-Major (Top to Bottom, Left to Right)</MenuItem>
              </TextField>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setIsModalOpen(false)} color="inherit">
            Cancel
          </Button>
          <Button variant="contained" onClick={handleSavePaper}>
            Save Paper Stock
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
