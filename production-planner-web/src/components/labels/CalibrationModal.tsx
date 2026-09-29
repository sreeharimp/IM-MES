import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Alert,
} from '@mui/material';
import {
  Print as PrintIcon,
  Download as DownloadIcon,
} from '@mui/icons-material';
import { LabelPaperType } from '../../types';
import { saveCalibrationPDF } from '../../services/pdfGenerator';
import { PaperScalePreview } from '../admin/PaperScalePreview';

interface CalibrationModalProps {
  open: boolean;
  paper: LabelPaperType | null;
  onClose: () => void;
}

export const CalibrationModal: React.FC<CalibrationModalProps> = ({
  open,
  paper,
  onClose,
}) => {
  if (!paper) return null;

  const handleDownloadCalibration = () => {
    const filename = `Calibration_${paper.name.replace(/\s+/g, '_')}.pdf`;
    saveCalibrationPDF(paper, filename);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontWeight: 700, pb: 1, borderBottom: '1px solid #e2e8f0' }}>
        Paper Calibration & Margin Verification: {paper.name}
      </DialogTitle>
      <DialogContent sx={{ pt: 2.5 }}>
        <Alert severity="info" sx={{ mb: 2.5, fontSize: '0.8125rem' }}>
          Print this 1-sheet calibration grid onto plain paper or sticker backing to verify margins and die-cut alignment against your printer feed tray before running full production batches.
        </Alert>

        <Box sx={{ display: 'flex', justifyContent: 'center', my: 2 }}>
          <PaperScalePreview paper={paper} previewScale={0.75} />
        </Box>

        <Box sx={{ p: 2, borderRadius: 2, backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#0f172a', mb: 0.5 }}>
            Physical Die-Cut Specifications
          </Typography>
          <Typography variant="body2" sx={{ color: '#475569' }}>
            • Page: {paper.page_width_mm} x {paper.page_height_mm} mm ({paper.columns} columns × {paper.rows} rows = {paper.rows * paper.columns} stickers/sheet)<br />
            • Label Size: {paper.label_width_mm} x {paper.label_height_mm} mm<br />
            • Margins: Top {paper.margin_top_mm} mm | Left {paper.margin_left_mm} mm<br />
            • Gutters: Horizontal {paper.gutter_x_mm} mm | Vertical {paper.gutter_y_mm} mm | Fill: {paper.fill_order}
          </Typography>
        </Box>
      </DialogContent>
      <DialogActions sx={{ p: 2, borderTop: '1px solid #e2e8f0' }}>
        <Button onClick={onClose} color="inherit">
          Close
        </Button>
        <Button
          variant="contained"
          startIcon={<DownloadIcon />}
          onClick={handleDownloadCalibration}
        >
          Download Calibration PDF
        </Button>
      </DialogActions>
    </Dialog>
  );
};
