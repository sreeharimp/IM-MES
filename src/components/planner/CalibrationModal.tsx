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
import { Print as PrintIcon, Download as DownloadIcon } from '@mui/icons-material';
import type { LabelPaperType } from '../../types';
import { saveCalibrationPDF, openCalibrationPDF } from './services/pdfGenerator';

interface CalibrationModalProps {
  open: boolean;
  paper: LabelPaperType;
  onClose: () => void;
}

export const CalibrationModal: React.FC<CalibrationModalProps> = ({ open, paper, onClose }) => {
  if (!paper) return null;

  const handlePrint = () => {
    openCalibrationPDF(paper);
    onClose();
  };

  const handleDownload = () => {
    saveCalibrationPDF(paper, `Calibration_Sheet_${paper.name.replace(/\s+/g, '_')}.pdf`);
    onClose();
  };

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="xs" 
      fullWidth
      PaperProps={{
        sx: {
          bgcolor: 'var(--bg2, #141720)',
          border: '1px solid var(--border, #2e3340)',
          backgroundImage: 'none',
        }
      }}
    >
      <DialogTitle sx={{ fontWeight: 700, color: 'var(--text, #e2e6f0)' }}>Print Calibration Sheet</DialogTitle>
      <DialogContent sx={{ pt: 2 }}>
        <Alert severity="info" sx={{ mb: 2 }}>
          Print this calibration test page on plain A4 paper first. Hold it up to a light over your sticker backing sheet to verify zero margin drift before peeling labels.
        </Alert>
        <Box sx={{ p: 2, bgcolor: 'var(--bg3, #1c2028)', borderRadius: 2, border: '1px solid var(--border, #2e3340)' }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'var(--text, #e2e6f0)' }}>
            {paper.name}
          </Typography>
          <Typography variant="body2" sx={{ color: 'var(--text2, #8a92a8)' }}>
            {paper.columns} columns × {paper.rows} rows ({paper.rows * paper.columns} labels)
          </Typography>
          <Typography variant="caption" sx={{ color: 'var(--text2, #8a92a8)', display: 'block', mt: 0.5 }}>
            Label size: {paper.label_width_mm} × {paper.label_height_mm} mm
          </Typography>
        </Box>
      </DialogContent>
      <DialogActions sx={{ p: 2, borderTop: '1px solid var(--border, #2e3340)' }}>
        <Button onClick={onClose} color="inherit">
          Cancel
        </Button>
        <Button variant="outlined" startIcon={<PrintIcon />} onClick={handlePrint}>
          Open & Print
        </Button>
        <Button variant="contained" startIcon={<DownloadIcon />} onClick={handleDownload} sx={{ bgcolor: 'var(--blue, #4d9fff)', color: '#ffffff' }}>
          Download PDF
        </Button>
      </DialogActions>
    </Dialog>
  );
};
