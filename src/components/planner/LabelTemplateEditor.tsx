import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Grid,
  TextField,
  MenuItem,
  FormControlLabel,
  Switch,
  Paper,
  Chip,
  Alert,
  Tabs,
  Tab,
  IconButton,
  Tooltip,
  Divider,
} from '@mui/material';
import {
  Save as SaveIcon,
  Print as PrintIcon,
  Download as DownloadIcon,
  RestartAlt as ResetIcon,
  CheckCircle as CheckIcon,
  ZoomIn as ZoomInIcon,
  ZoomOut as ZoomOutIcon,
  CenterFocusStrong as FitIcon,
} from '@mui/icons-material';
import type { LabelPaperType } from '../../types';
import { supabase } from '../../lib/supabase';
import {
  DEFAULT_LABEL_TEMPLATE,
  type LabelTemplateConfig,
  type IsoSymbolsConfig,
} from './services/isoSymbols';
import { saveLabelsPDF } from './services/pdfGenerator';
import QRCode from 'qrcode';

interface LabelTemplateEditorProps {
  currentUserRole?: string;
  currentUserName?: string;
  onNavigateToPaper?: () => void;
}

export const LabelTemplateEditor: React.FC<LabelTemplateEditorProps> = ({
  currentUserRole = 'Admin',
  currentUserName = 'System User',
}) => {
  const [papers, setPapers] = useState<LabelPaperType[]>([]);
  const [selectedPaperId, setSelectedPaperId] = useState<string>('');
  const [template, setTemplate] = useState<LabelTemplateConfig>(DEFAULT_LABEL_TEMPLATE);
  const [activeTab, setActiveTab] = useState<number>(0);
  const [zoomScale, setZoomScale] = useState<number>(2.5); // 2.5x zoom for fine details
  const [sampleQrUrl, setSampleQrUrl] = useState<string>('');
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);

  const canEdit = currentUserRole === 'Admin' || currentUserRole === 'PowerUser';

  // Load available paper types
  useEffect(() => {
    const fetchPapers = async () => {
      try {
        const { data, error } = await supabase
          .from('label_paper_types')
          .select('*')
          .eq('active', true)
          .order('name');
        if (error) throw error;
        const loaded = data || [];
        setPapers(loaded);
        if (loaded.length > 0 && !selectedPaperId) {
          setSelectedPaperId(loaded[0].id);
        }
      } catch (err) {
        console.error('Error fetching paper types:', err);
      }
    };
    fetchPapers();
  }, []);

  // Generate sample QR code data URL for preview
  useEffect(() => {
    QRCode.toDataURL('SAMPLE-LOT-2026-CASE-01', {
      margin: 0,
      width: 120,
      errorCorrectionLevel: 'M',
    }).then(setSampleQrUrl).catch(() => {});
  }, []);

  // Load template for selected paper stock (from database paper, localStorage or default)
  useEffect(() => {
    if (!selectedPaperId) return;

    // 1. Check if paper has template_config in DB
    const paper = papers.find((p) => p.id === selectedPaperId);
    if (paper && paper.template_config && typeof paper.template_config === 'object') {
      setTemplate(paper.template_config);
      return;
    }

    // 2. Check localStorage for this paper
    try {
      const saved = localStorage.getItem(`label_template_${selectedPaperId}`);
      if (saved) {
        setTemplate(JSON.parse(saved));
        return;
      }
      // Check global template
      const globalSaved = localStorage.getItem('label_template_global');
      if (globalSaved) {
        setTemplate(JSON.parse(globalSaved));
        return;
      }
    } catch (_) {}
    setTemplate(DEFAULT_LABEL_TEMPLATE);
  }, [selectedPaperId, papers]);

  const activePaper = useMemo(() => {
    return (
      papers.find((p) => p.id === selectedPaperId) || {
        id: 'default',
        name: 'Standard Avery 24-Up (70x37mm)',
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
        fill_order: 'row-major' as const,
        active: true,
        internal_padding_mm: 1.8,
        created_at: new Date().toISOString(),
      }
    );
  }, [papers, selectedPaperId]);

  const lW = activePaper.label_width_mm || 70;
  const lH = activePaper.label_height_mm || 37;
  const padTop = Number(activePaper.padding_top_mm ?? activePaper.internal_padding_mm ?? 1.8);
  const padLeft = Number(activePaper.padding_left_mm ?? activePaper.internal_padding_mm ?? 1.8);
  const padRight = Number(activePaper.padding_right_mm ?? activePaper.internal_padding_mm ?? 1.8);
  const padBottom = Number(activePaper.padding_bottom_mm ?? activePaper.internal_padding_mm ?? 1.8);

  const safeW = Math.max(10, lW - (padLeft + padRight));
  const safeH = Math.max(10, lH - (padTop + padBottom));

  const handleUpdateIsoSymbol = (key: keyof IsoSymbolsConfig, value: any) => {
    setTemplate((prev) => ({
      ...prev,
      isoSymbols: {
        ...prev.isoSymbols,
        [key]: value,
      },
    }));
  };

  const handleApplyPreset = (presetType: string) => {
    switch (presetType) {
      case 'medical':
        setTemplate({
          ...DEFAULT_LABEL_TEMPLATE,
          name: 'Medical Device ISO 15223-1',
          showCompanyName: true,
          subtitleText: 'MEDICAL DEVICE COMPONENTS',
          showSubtitle: true,
          showProductCode: true,
          productCodeLabel: 'REF',
          showBatchCode: true,
          batchCodeLabel: 'LOT',
          showQcApproval: true,
          showQrCode: true,
          isoSymbols: {
            showLot: true,
            showRef: true,
            showSn: false,
            showMd: true,
            showManufacturer: true,
            showMfgDate: true,
            showExpiryDate: true,
            showSingleUse: true,
            showSterile: false,
            sterileType: 'NON-STERILE',
            showConsultIfu: true,
            showCaution: false,
            showKeepDry: true,
            showKeepAwaySunlight: false,
            showTempLimit: false,
            tempMin: '15°C',
            tempMax: '25°C',
            showCeMark: true,
            notifiedBodyNumber: '0123',
          },
        });
        break;
      case 'sterile':
        setTemplate({
          ...DEFAULT_LABEL_TEMPLATE,
          name: 'Sterile Barrier Medical Package',
          showCompanyName: true,
          subtitleText: 'STERILE MEDICAL GRADE PACKAGING',
          showSubtitle: true,
          showProductCode: true,
          productCodeLabel: 'REF',
          showBatchCode: true,
          batchCodeLabel: 'LOT',
          showQcApproval: true,
          showQrCode: true,
          isoSymbols: {
            showLot: true,
            showRef: true,
            showSn: true,
            showMd: true,
            showManufacturer: true,
            showMfgDate: true,
            showExpiryDate: true,
            showSingleUse: true,
            showSterile: true,
            sterileType: 'R',
            showConsultIfu: true,
            showCaution: true,
            showKeepDry: true,
            showKeepAwaySunlight: true,
            showTempLimit: true,
            tempMin: '10°C',
            tempMax: '30°C',
            showCeMark: true,
            notifiedBodyNumber: '0123',
          },
        });
        break;
      case 'industrial':
        setTemplate({
          ...DEFAULT_LABEL_TEMPLATE,
          name: 'Industrial Moulded Components',
          showCompanyName: true,
          showSubtitle: false,
          showProductCode: true,
          productCodeLabel: 'PART #',
          showBatchCode: true,
          batchCodeLabel: 'BATCH',
          showQcApproval: true,
          showQrCode: true,
          isoSymbols: {
            showLot: true,
            showRef: false,
            showSn: false,
            showMd: false,
            showManufacturer: true,
            showMfgDate: true,
            showExpiryDate: false,
            showSingleUse: false,
            showSterile: false,
            sterileType: 'NON-STERILE',
            showConsultIfu: false,
            showCaution: false,
            showKeepDry: true,
            showKeepAwaySunlight: false,
            showTempLimit: false,
            tempMin: '',
            tempMax: '',
            showCeMark: false,
            notifiedBodyNumber: '',
          },
        });
        break;
      default:
        setTemplate(DEFAULT_LABEL_TEMPLATE);
        break;
    }
  };

  const handleSaveTemplate = async () => {
    setSaving(true);
    try {
      // 1. Save to localStorage keyed by paper format for instant client-side cache
      if (selectedPaperId) {
        localStorage.setItem(`label_template_${selectedPaperId}`, JSON.stringify(template));
      }
      localStorage.setItem('label_template_global', JSON.stringify(template));

      // 2. Persist directly to Supabase DB so all connected devices stay synced
      if (selectedPaperId) {
        const { error } = await supabase
          .from('label_paper_types')
          .update({ template_config: template })
          .eq('id', selectedPaperId);

        if (error) {
          console.warn('Could not save template_config to DB:', error.message);
          if (error.code === 'PGRST204' || error.message?.includes('column')) {
            alert(
              'Template saved in this browser! To sync across all other PCs and devices, run this SQL in Supabase SQL Editor:\n\nALTER TABLE label_paper_types ADD COLUMN IF NOT EXISTS template_config JSONB;'
            );
          }
        } else {
          // Update in-memory papers state so the current session reflects it immediately
          setPapers((prev) =>
            prev.map((p) => (p.id === selectedPaperId ? { ...p, template_config: template } : p))
          );
        }
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      alert('Failed to save template: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadSamplePDF = async () => {
    try {
      const sampleLabels: any[] = Array.from({ length: activePaper.columns * activePaper.rows }).map(
        (_, i) => ({
          id: `sample-${i + 1}`,
          sequenceNumber: i + 1,
          batchCode: 'APBT26I23',
          productName: 'BOV Tube Hub Connector 20C',
          expectedQuantity: 500,
          isPartial: i === 0,
        })
      );

      const qrMap = new Map<string, string>();
      if (sampleQrUrl) {
        sampleLabels.forEach((l) => qrMap.set(l.id, sampleQrUrl));
      }

      await saveLabelsPDF(
        {
          plan: {
            id: 'sample-plan',
            product_id: 'sample',
            target_quantity: 12000,
            produced_quantity: 0,
            cases_generated: activePaper.columns * activePaper.rows,
            status: 'draft',
            created_at: new Date().toISOString(),
          } as any,
          paper: activePaper,
          labels: sampleLabels,
          qrMap,
          fillOrder: activePaper.fill_order,
          template,
        },
        `Sample_Template_${activePaper.name.replace(/\s+/g, '_')}.pdf`
      );
    } catch (err: any) {
      alert('Error generating sample PDF: ' + err.message);
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2.5, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, color: 'var(--text, #e2e6f0)' }}>
            Label Template & ISO 15223-1 Symbols Designer
          </Typography>
          <Typography variant="body2" sx={{ color: 'var(--text2, #8a92a8)' }}>
            Fully customizable label layouts with standard medical device symbols, dynamic barcodes, and real-time millimetric preview
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
          <Button
            variant="outlined"
            startIcon={<ResetIcon />}
            onClick={() => handleApplyPreset('medical')}
            sx={{ borderColor: 'var(--border, #2e3340)', color: 'var(--text, #e2e6f0)' }}
          >
            Reset to Medical Preset
          </Button>
          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={handleDownloadSamplePDF}
            sx={{ borderColor: 'var(--blue, #4d9fff)', color: 'var(--blue, #4d9fff)' }}
          >
            Download Test Sheet
          </Button>
          {canEdit && (
            <Button
              variant="contained"
              startIcon={<SaveIcon />}
              onClick={handleSaveTemplate}
              disabled={saving}
              sx={{ bgcolor: 'var(--blue, #4d9fff)', color: '#ffffff' }}
            >
              {saving ? 'Saving...' : 'Save Template'}
            </Button>
          )}
        </Box>
      </Box>

      {saveSuccess && (
        <Alert severity="success" sx={{ mb: 2 }} icon={<CheckIcon fontSize="inherit" />}>
          Label template configuration saved successfully! It will now be used across batch label printing.
        </Alert>
      )}

      {/* Stock Selection & Presets Bar */}
      <Paper elevation={0} sx={{ p: 2, mb: 3, border: '1px solid var(--border, #2e3340)', borderRadius: 2, bgcolor: 'var(--bg2, #141720)' }}>
        <Grid container spacing={2} alignItems="center">
          <Grid size={{ xs: 12, md: 5 }}>
            <TextField
              select
              label="Selected Paper Stock Format"
              fullWidth
              size="small"
              value={selectedPaperId}
              onChange={(e) => setSelectedPaperId(e.target.value)}
              helperText={`Die-cut dimensions: ${lW} × ${lH} mm | Sheet: ${activePaper.page_width_mm} × ${activePaper.page_height_mm} mm (${activePaper.rows * activePaper.columns} labels/sheet)`}
            >
              {papers.map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  {p.name} ({p.label_width_mm} × {p.label_height_mm} mm — {p.rows * p.columns} Up)
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, md: 7 }}>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
              <Typography variant="body2" sx={{ color: 'var(--text2, #8a92a8)', fontWeight: 600 }}>
                Quick Presets:
              </Typography>
              <Chip
                label="ISO 15223-1 Medical Device"
                color="primary"
                variant="outlined"
                onClick={() => handleApplyPreset('medical')}
                sx={{ cursor: 'pointer' }}
              />
              <Chip
                label="Sterile Cleanroom Barrier"
                color="secondary"
                variant="outlined"
                onClick={() => handleApplyPreset('sterile')}
                sx={{ cursor: 'pointer' }}
              />
              <Chip
                label="Industrial Component"
                variant="outlined"
                onClick={() => handleApplyPreset('industrial')}
                sx={{ cursor: 'pointer', color: 'var(--text, #e2e6f0)' }}
              />
            </Box>
          </Grid>
        </Grid>
      </Paper>

      <Grid container spacing={3}>
        {/* Left Column: Template Controls */}
        <Grid size={{ xs: 12, lg: 6 }}>
          <Card elevation={0} sx={{ border: '1px solid var(--border, #2e3340)', borderRadius: 2, bgcolor: 'var(--bg2, #141720)' }}>
            <Box sx={{ borderBottom: '1px solid var(--border, #2e3340)' }}>
              <Tabs
                value={activeTab}
                onChange={(_, v) => setActiveTab(v)}
                variant="fullWidth"
                sx={{
                  minHeight: 44,
                  '& .MuiTab-root': {
                    minHeight: 44,
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    textTransform: 'none',
                    color: 'var(--text2, #8a92a8)',
                    '&.Mui-selected': { color: 'var(--blue, #4d9fff)' },
                  },
                }}
              >
                <Tab label="1. Header & Text" />
                <Tab label="2. Fields & Data" />
                <Tab label="3. ISO 15223-1 Symbols" />
                <Tab label="4. Barcode & QR" />
              </Tabs>
            </Box>

            <CardContent sx={{ p: 2.5 }}>
              {/* TAB 0: Header & Branding */}
              {activeTab === 0 && (
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'var(--text, #e2e6f0)' }}>
                        Company Branding
                      </Typography>
                      <FormControlLabel
                        control={
                          <Switch
                            size="small"
                            checked={template.showCompanyName}
                            onChange={(e) => setTemplate({ ...template, showCompanyName: e.target.checked })}
                          />
                        }
                        label={<Typography variant="caption" sx={{ color: 'var(--text2, #8a92a8)' }}>Show Header</Typography>}
                      />
                    </Box>
                  </Grid>

                  {template.showCompanyName && (
                    <Grid size={{ xs: 12 }}>
                      <TextField
                        label="Company / Manufacturer Name"
                        fullWidth
                        size="small"
                        value={template.companyName}
                        onChange={(e) => setTemplate({ ...template, companyName: e.target.value })}
                        placeholder="e.g. AGNEY POLYSOFT INDIA PVT LTD"
                      />
                    </Grid>
                  )}

                  <Grid size={{ xs: 12 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'var(--text, #e2e6f0)' }}>
                        Category Subtitle / Compliance Tagline
                      </Typography>
                      <FormControlLabel
                        control={
                          <Switch
                            size="small"
                            checked={template.showSubtitle}
                            onChange={(e) => setTemplate({ ...template, showSubtitle: e.target.checked })}
                          />
                        }
                        label={<Typography variant="caption" sx={{ color: 'var(--text2, #8a92a8)' }}>Show Tagline</Typography>}
                      />
                    </Box>
                  </Grid>

                  {template.showSubtitle && (
                    <Grid size={{ xs: 12 }}>
                      <TextField
                        label="Subtitle Text"
                        fullWidth
                        size="small"
                        value={template.subtitleText || ''}
                        onChange={(e) => setTemplate({ ...template, subtitleText: e.target.value })}
                        placeholder="e.g. MEDICAL DEVICE COMPONENTS / ISO 13485 CERTIFIED"
                      />
                    </Grid>
                  )}

                  <Grid size={{ xs: 12 }}>
                    <Divider sx={{ my: 1, borderColor: 'var(--border, #2e3340)' }} />
                  </Grid>

                  <Grid size={{ xs: 12 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'var(--text, #e2e6f0)', mb: 1 }}>
                      Custom Footer / Storage Instructions
                    </Typography>
                    <FormControlLabel
                      control={
                        <Switch
                          size="small"
                          checked={template.showFooterText}
                          onChange={(e) => setTemplate({ ...template, showFooterText: e.target.checked })}
                        />
                      }
                      label={<Typography variant="caption" sx={{ color: 'var(--text2, #8a92a8)' }}>Enable Custom Footer Notes</Typography>}
                    />
                  </Grid>

                  {template.showFooterText && (
                    <Grid size={{ xs: 12 }}>
                      <TextField
                        label="Footer Notes (e.g. Storage, Handling, Batch Origin)"
                        fullWidth
                        multiline
                        rows={2}
                        size="small"
                        value={template.customFooterText || ''}
                        onChange={(e) => setTemplate({ ...template, customFooterText: e.target.value })}
                        placeholder="Store in a cool dry place. Single patient use. Handle with clean gloves."
                      />
                    </Grid>
                  )}
                </Grid>
              )}

              {/* TAB 1: Fields & Data */}
              {activeTab === 1 && (
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'var(--text, #e2e6f0)' }}>
                      Product Name Styling
                    </Typography>
                  </Grid>

                  <Grid size={{ xs: 6 }}>
                    <TextField
                      select
                      label="Product Name Font Size"
                      fullWidth
                      size="small"
                      value={template.productNameSize || 'medium'}
                      onChange={(e) => setTemplate({ ...template, productNameSize: e.target.value as any })}
                    >
                      <MenuItem value="small">Small (Compact, for long titles)</MenuItem>
                      <MenuItem value="medium">Medium (Standard, balanced)</MenuItem>
                      <MenuItem value="large">Large (High visibility)</MenuItem>
                    </TextField>
                  </Grid>

                  <Grid size={{ xs: 6 }}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={template.showMouldDetails}
                          onChange={(e) => setTemplate({ ...template, showMouldDetails: e.target.checked })}
                        />
                      }
                      label="Include Mould / Tool Info"
                    />
                  </Grid>

                  <Grid size={{ xs: 12 }}>
                    <Divider sx={{ my: 1, borderColor: 'var(--border, #2e3340)' }} />
                  </Grid>

                  <Grid size={{ xs: 6 }}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={template.showProductCode}
                            onChange={(e) => setTemplate({ ...template, showProductCode: e.target.checked })}
                          />
                        }
                        label="Catalogue / REF Number"
                      />
                      {template.showProductCode && (
                        <TextField
                          label="REF Label Prefix"
                          size="small"
                          value={template.productCodeLabel || 'REF'}
                          onChange={(e) => setTemplate({ ...template, productCodeLabel: e.target.value })}
                        />
                      )}
                    </Box>
                  </Grid>

                  <Grid size={{ xs: 6 }}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={template.showBatchCode}
                            onChange={(e) => setTemplate({ ...template, showBatchCode: e.target.checked })}
                          />
                        }
                        label="Batch / LOT Number"
                      />
                      {template.showBatchCode && (
                        <TextField
                          label="LOT Label Prefix"
                          size="small"
                          value={template.batchCodeLabel || 'LOT'}
                          onChange={(e) => setTemplate({ ...template, batchCodeLabel: e.target.value })}
                        />
                      )}
                    </Box>
                  </Grid>

                  <Grid size={{ xs: 6 }}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={template.showCaseNumber}
                            onChange={(e) => setTemplate({ ...template, showCaseNumber: e.target.checked })}
                          />
                        }
                        label="Case / Box Number"
                      />
                      {template.showCaseNumber && (
                        <TextField
                          label="Case Prefix"
                          size="small"
                          value={template.caseNumberPrefix || 'CASE NO: #'}
                          onChange={(e) => setTemplate({ ...template, caseNumberPrefix: e.target.value })}
                        />
                      )}
                    </Box>
                  </Grid>

                  <Grid size={{ xs: 6 }}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={template.showQuantity}
                            onChange={(e) => setTemplate({ ...template, showQuantity: e.target.checked })}
                          />
                        }
                        label="Quantity / Pack Count"
                      />
                      {template.showQuantity && (
                        <TextField
                          label="Quantity Prefix"
                          size="small"
                          value={template.quantityLabel || 'QTY:'}
                          onChange={(e) => setTemplate({ ...template, quantityLabel: e.target.value })}
                        />
                      )}
                    </Box>
                  </Grid>

                  <Grid size={{ xs: 12 }}>
                    <Divider sx={{ my: 1, borderColor: 'var(--border, #2e3340)' }} />
                  </Grid>

                  <Grid size={{ xs: 12 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'var(--text, #e2e6f0)' }}>
                        Quality Control Status Bar
                      </Typography>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={template.showQcApproval}
                            onChange={(e) => setTemplate({ ...template, showQcApproval: e.target.checked })}
                          />
                        }
                        label={<Typography variant="caption" sx={{ color: 'var(--text2, #8a92a8)' }}>Show QC Status Line</Typography>}
                      />
                    </Box>
                  </Grid>

                  {template.showQcApproval && (
                    <Grid size={{ xs: 12 }}>
                      <TextField
                        label="QC Status Text"
                        size="small"
                        fullWidth
                        value={template.qcApprovalText || 'APPROVED'}
                        onChange={(e) => setTemplate({ ...template, qcApprovalText: e.target.value })}
                        helperText="Displays as: QC STATUS: [STATUS] │ Inspected by :"
                      />
                    </Grid>
                  )}
                </Grid>
              )}

              {/* TAB 2: ISO 15223-1 Symbols */}
              {activeTab === 2 && (
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12 }}>
                    <Alert severity="info" sx={{ mb: 1.5, py: 0.5 }}>
                      ISO 15223-1 regulates medical device labeling symbols. Toggle symbols on/off according to your device classification.
                    </Alert>
                  </Grid>

                  {/* Identification Symbols */}
                  <Grid size={{ xs: 12 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'var(--text, #e2e6f0)', mb: 1 }}>
                      Identification & Traceability (ISO 15223-1 Clause 5.1 & 5.7)
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                      <Chip
                        label="[MD] Medical Device"
                        color={template.isoSymbols.showMd ? 'primary' : 'default'}
                        onClick={() => handleUpdateIsoSymbol('showMd', !template.isoSymbols.showMd)}
                        variant={template.isoSymbols.showMd ? 'filled' : 'outlined'}
                        sx={{ fontWeight: 600 }}
                      />
                      <Chip
                        label="[LOT] Batch Code"
                        color={template.isoSymbols.showLot ? 'primary' : 'default'}
                        onClick={() => handleUpdateIsoSymbol('showLot', !template.isoSymbols.showLot)}
                        variant={template.isoSymbols.showLot ? 'filled' : 'outlined'}
                        sx={{ fontWeight: 600 }}
                      />
                      <Chip
                        label="[REF] Catalogue No"
                        color={template.isoSymbols.showRef ? 'primary' : 'default'}
                        onClick={() => handleUpdateIsoSymbol('showRef', !template.isoSymbols.showRef)}
                        variant={template.isoSymbols.showRef ? 'filled' : 'outlined'}
                        sx={{ fontWeight: 600 }}
                      />
                      <Chip
                        label="[SN] Serial Number"
                        color={template.isoSymbols.showSn ? 'primary' : 'default'}
                        onClick={() => handleUpdateIsoSymbol('showSn', !template.isoSymbols.showSn)}
                        variant={template.isoSymbols.showSn ? 'filled' : 'outlined'}
                        sx={{ fontWeight: 600 }}
                      />
                      <Chip
                        label="🏭 Manufacturer"
                        color={template.isoSymbols.showManufacturer ? 'primary' : 'default'}
                        onClick={() => handleUpdateIsoSymbol('showManufacturer', !template.isoSymbols.showManufacturer)}
                        variant={template.isoSymbols.showManufacturer ? 'filled' : 'outlined'}
                        sx={{ fontWeight: 600 }}
                      />
                      <Chip
                        label="📅 Mfg Date"
                        color={template.isoSymbols.showMfgDate ? 'primary' : 'default'}
                        onClick={() => handleUpdateIsoSymbol('showMfgDate', !template.isoSymbols.showMfgDate)}
                        variant={template.isoSymbols.showMfgDate ? 'filled' : 'outlined'}
                        sx={{ fontWeight: 600 }}
                      />
                      <Chip
                        label="⌛ Use-by / Expiry"
                        color={template.isoSymbols.showExpiryDate ? 'primary' : 'default'}
                        onClick={() => handleUpdateIsoSymbol('showExpiryDate', !template.isoSymbols.showExpiryDate)}
                        variant={template.isoSymbols.showExpiryDate ? 'filled' : 'outlined'}
                        sx={{ fontWeight: 600 }}
                      />
                    </Box>
                  </Grid>

                  {/* Safety & Handling Symbols */}
                  <Grid size={{ xs: 12 }}>
                    <Divider sx={{ my: 1, borderColor: 'var(--border, #2e3340)' }} />
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'var(--text, #e2e6f0)', mb: 1 }}>
                      Safety, Handling & Environmental (ISO 15223-1 Clause 5.3 & 5.4)
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                      <Chip
                        label="② Do Not Re-use (Single Use)"
                        color={template.isoSymbols.showSingleUse ? 'primary' : 'default'}
                        onClick={() => handleUpdateIsoSymbol('showSingleUse', !template.isoSymbols.showSingleUse)}
                        variant={template.isoSymbols.showSingleUse ? 'filled' : 'outlined'}
                        sx={{ fontWeight: 600 }}
                      />
                      <Chip
                        label="📖 Consult IFU"
                        color={template.isoSymbols.showConsultIfu ? 'primary' : 'default'}
                        onClick={() => handleUpdateIsoSymbol('showConsultIfu', !template.isoSymbols.showConsultIfu)}
                        variant={template.isoSymbols.showConsultIfu ? 'filled' : 'outlined'}
                        sx={{ fontWeight: 600 }}
                      />
                      <Chip
                        label="⚠ Caution"
                        color={template.isoSymbols.showCaution ? 'primary' : 'default'}
                        onClick={() => handleUpdateIsoSymbol('showCaution', !template.isoSymbols.showCaution)}
                        variant={template.isoSymbols.showCaution ? 'filled' : 'outlined'}
                        sx={{ fontWeight: 600 }}
                      />
                      <Chip
                        label="☂ Keep Dry"
                        color={template.isoSymbols.showKeepDry ? 'primary' : 'default'}
                        onClick={() => handleUpdateIsoSymbol('showKeepDry', !template.isoSymbols.showKeepDry)}
                        variant={template.isoSymbols.showKeepDry ? 'filled' : 'outlined'}
                        sx={{ fontWeight: 600 }}
                      />
                      <Chip
                        label="☀ Keep Away Sunlight"
                        color={template.isoSymbols.showKeepAwaySunlight ? 'primary' : 'default'}
                        onClick={() => handleUpdateIsoSymbol('showKeepAwaySunlight', !template.isoSymbols.showKeepAwaySunlight)}
                        variant={template.isoSymbols.showKeepAwaySunlight ? 'filled' : 'outlined'}
                        sx={{ fontWeight: 600 }}
                      />
                      <Chip
                        label="🌡 Temp Limits"
                        color={template.isoSymbols.showTempLimit ? 'primary' : 'default'}
                        onClick={() => handleUpdateIsoSymbol('showTempLimit', !template.isoSymbols.showTempLimit)}
                        variant={template.isoSymbols.showTempLimit ? 'filled' : 'outlined'}
                        sx={{ fontWeight: 600 }}
                      />
                    </Box>
                  </Grid>

                  {/* Temperature limit options */}
                  {template.isoSymbols.showTempLimit && (
                    <Grid size={{ xs: 12 }}>
                      <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
                        <TextField
                          label="Min Temp (e.g. 15°C)"
                          size="small"
                          value={template.isoSymbols.tempMin || ''}
                          onChange={(e) => handleUpdateIsoSymbol('tempMin', e.target.value)}
                        />
                        <TextField
                          label="Max Temp (e.g. 25°C)"
                          size="small"
                          value={template.isoSymbols.tempMax || ''}
                          onChange={(e) => handleUpdateIsoSymbol('tempMax', e.target.value)}
                        />
                      </Box>
                    </Grid>
                  )}

                  {/* Sterilization & Conformity */}
                  <Grid size={{ xs: 12 }}>
                    <Divider sx={{ my: 1, borderColor: 'var(--border, #2e3340)' }} />
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'var(--text, #e2e6f0)', mb: 1 }}>
                      Sterilization & Conformity (ISO 15223-1 Clause 5.2)
                    </Typography>
                    <Grid container spacing={2}>
                      <Grid size={{ xs: 6 }}>
                        <FormControlLabel
                          control={
                            <Switch
                              checked={template.isoSymbols.showSterile}
                              onChange={(e) => handleUpdateIsoSymbol('showSterile', e.target.checked)}
                            />
                          }
                          label="Sterilization Status Symbol"
                        />
                        {template.isoSymbols.showSterile && (
                          <TextField
                            select
                            label="Sterile Method"
                            size="small"
                            fullWidth
                            sx={{ mt: 1 }}
                            value={template.isoSymbols.sterileType || 'NON-STERILE'}
                            onChange={(e) => handleUpdateIsoSymbol('sterileType', e.target.value)}
                          >
                            <MenuItem value="R">STERILE | R (Irradiation)</MenuItem>
                            <MenuItem value="EO">STERILE | EO (Ethylene Oxide)</MenuItem>
                            <MenuItem value="STEAM">STERILE | STEAM (Autoclave)</MenuItem>
                            <MenuItem value="NON-STERILE">NON-STERILE</MenuItem>
                          </TextField>
                        )}
                      </Grid>

                      <Grid size={{ xs: 6 }}>
                        <FormControlLabel
                          control={
                            <Switch
                              checked={template.isoSymbols.showCeMark}
                              onChange={(e) => handleUpdateIsoSymbol('showCeMark', e.target.checked)}
                            />
                          }
                          label="CE Mark"
                        />
                        {template.isoSymbols.showCeMark && (
                          <TextField
                            label="Notified Body # (e.g. 0123)"
                            size="small"
                            fullWidth
                            sx={{ mt: 1 }}
                            value={template.isoSymbols.notifiedBodyNumber || ''}
                            onChange={(e) => handleUpdateIsoSymbol('notifiedBodyNumber', e.target.value)}
                          />
                        )}
                      </Grid>
                    </Grid>
                  </Grid>
                </Grid>
              )}

              {/* TAB 3: Barcode & QR Code */}
              {activeTab === 3 && (
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'var(--text, #e2e6f0)' }}>
                        2D QR Code Matrix
                      </Typography>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={template.showQrCode}
                            onChange={(e) => setTemplate({ ...template, showQrCode: e.target.checked })}
                          />
                        }
                        label="Enable QR Code"
                      />
                    </Box>
                  </Grid>

                  {template.showQrCode && (
                    <>
                      <Grid size={{ xs: 6 }}>
                        <TextField
                          label="QR Code Size (mm)"
                          type="number"
                          size="small"
                          fullWidth
                          value={template.qrSizeMm || 14}
                          onChange={(e) => setTemplate({ ...template, qrSizeMm: parseFloat(e.target.value) || 10 })}
                          helperText="Standard recommendation: 12 - 16 mm"
                        />
                      </Grid>

                      <Grid size={{ xs: 6 }}>
                        <TextField
                          select
                          label="QR Placement Position"
                          size="small"
                          fullWidth
                          value={template.qrCodePosition || 'right'}
                          onChange={(e) => setTemplate({ ...template, qrCodePosition: e.target.value as any })}
                        >
                          <MenuItem value="right">Right Side (Centered Vertically)</MenuItem>
                          <MenuItem value="bottom-right">Bottom-Right Corner</MenuItem>
                        </TextField>
                      </Grid>

                      <Grid size={{ xs: 12 }}>
                        <TextField
                          select
                          label="QR Payload Data Format"
                          size="small"
                          fullWidth
                          value={template.qrPayloadType || 'batch-case'}
                          onChange={(e) => setTemplate({ ...template, qrPayloadType: e.target.value as any })}
                          helperText="Format encoded into the 2D matrix for automated optical scanners"
                        >
                          <MenuItem value="batch-case">Batch & Case: [BATCH_CODE]-[CASE_NUM]</MenuItem>
                          <MenuItem value="json">Structured JSON: {"{batch, case, product, qty}"}</MenuItem>
                          <MenuItem value="url">Web Portal Verification URL</MenuItem>
                        </TextField>
                      </Grid>
                    </>
                  )}
                </Grid>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Right Column: Interactive WYSIWYG Label Preview */}
        <Grid size={{ xs: 12, lg: 6 }}>
          <Card elevation={0} sx={{ border: '1px solid var(--border, #2e3340)', borderRadius: 2, bgcolor: 'var(--bg2, #141720)' }}>
            <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border, #2e3340)' }}>
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'var(--text, #e2e6f0)' }}>
                  WYSIWYG Label Scale Preview
                </Typography>
                <Typography variant="caption" sx={{ color: 'var(--text2, #8a92a8)' }}>
                  {lW} × {lH} mm | Safe zone: {safeW.toFixed(1)} × {safeH.toFixed(1)} mm
                </Typography>
              </Box>

              <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                <Tooltip title="Zoom Out">
                  <IconButton size="small" onClick={() => setZoomScale((s) => Math.max(1.5, s - 0.5))} sx={{ color: 'var(--text2, #8a92a8)' }}>
                    <ZoomOutIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Typography variant="caption" sx={{ color: 'var(--text2, #8a92a8)', minWidth: 36, textAlign: 'center' }}>
                  {Math.round(zoomScale * 40)}%
                </Typography>
                <Tooltip title="Zoom In">
                  <IconButton size="small" onClick={() => setZoomScale((s) => Math.min(4.5, s + 0.5))} sx={{ color: 'var(--text2, #8a92a8)' }}>
                    <ZoomInIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Reset Zoom">
                  <IconButton size="small" onClick={() => setZoomScale(2.5)} sx={{ color: 'var(--text2, #8a92a8)' }}>
                    <FitIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
            </Box>

            <CardContent sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', p: 3, bgcolor: '#0f172a', minHeight: 400, overflowX: 'auto' }}>
              {/* Scaled Label SVG Container */}
              <Box
                sx={{
                  width: lW * zoomScale,
                  height: lH * zoomScale,
                  backgroundColor: '#ffffff',
                  borderRadius: '3px',
                  boxShadow: '0 12px 32px rgba(0,0,0,0.3)',
                  position: 'relative',
                  overflow: 'hidden',
                  transition: 'all 0.15s ease',
                }}
              >
                <svg
                  width="100%"
                  height="100%"
                  viewBox={`0 0 ${lW} ${lH}`}
                  style={{ display: 'block' }}
                >
                  {/* Outer Die-Cut Label Boundary */}
                  <rect
                    x={0}
                    y={0}
                    width={lW}
                    height={lH}
                    fill="#ffffff"
                    stroke="#94a3b8"
                    strokeWidth={0.3}
                  />

                  {/* Safe Printable Zone (Internal Padding) */}
                  <rect
                    x={padLeft}
                    y={padTop}
                    width={safeW}
                    height={safeH}
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth={0.2}
                    strokeDasharray="0.8, 0.8"
                  />

                  {/* Header / Company Name */}
                  {template.showCompanyName && (
                    <text
                      x={padLeft}
                      y={padTop + 2.5}
                      fontSize={Math.min(2.8, safeW / 24)}
                      fontWeight="bold"
                      fill="#000000"
                      fontFamily="Helvetica, Arial, sans-serif"
                    >
                      {template.companyName}
                    </text>
                  )}

                  {/* Divider */}
                  {template.showCompanyName && (
                    <line
                      x1={padLeft}
                      y1={padTop + 3.4}
                      x2={padLeft + safeW}
                      y2={padTop + 3.4}
                      stroke="#000000"
                      strokeWidth={0.25}
                    />
                  )}

                  {/* Subtitle */}
                  {template.showSubtitle && template.subtitleText && (
                    <text
                      x={padLeft}
                      y={padTop + 5.2}
                      fontSize={1.8}
                      fontWeight="bold"
                      fill="#000000"
                      fontFamily="Helvetica, Arial, sans-serif"
                    >
                      {template.subtitleText}
                    </text>
                  )}

                  {/* Product Name */}
                  <text
                    x={padLeft}
                    y={padTop + (template.showSubtitle ? 8.2 : 6.8)}
                    fontSize={
                      template.productNameSize === 'large'
                        ? 3.6
                        : template.productNameSize === 'small'
                        ? 2.5
                        : 3.0
                    }
                    fontWeight="bold"
                    fill="#000000"
                    fontFamily="Helvetica, Arial, sans-serif"
                  >
                    Product Name
                  </text>

                  {/* Product Code / REF */}
                  {template.showProductCode && (
                    <g transform={`translate(${padLeft}, ${padTop + (template.showSubtitle ? 11.2 : 9.8)})`}>
                      {template.isoSymbols.showRef ? (
                        <>
                          <rect x={0} y={-2.2} width={5.5} height={2.6} fill="#ffffff" stroke="#000000" strokeWidth={0.25} />
                          <text x={2.75} y={-0.3} fontSize={1.7} fontWeight="bold" fill="#000000" textAnchor="middle" fontFamily="Helvetica, Arial, sans-serif">REF</text>
                          <text x={6.5} y={-0.3} fontSize={2.2} fontWeight="bold" fill="#000000" fontFamily="Helvetica, Arial, sans-serif">REF-001</text>
                        </>
                      ) : (
                        <text x={0} y={-0.3} fontSize={2.2} fontWeight="bold" fill="#000000" fontFamily="Helvetica, Arial, sans-serif">
                          {template.productCodeLabel || 'REF'}: REF-001
                        </text>
                      )}
                    </g>
                  )}

                  {/* Batch Code / LOT */}
                  {template.showBatchCode && (
                    <g transform={`translate(${padLeft}, ${padTop + (template.showSubtitle ? 14.2 : 12.8)})`}>
                      {template.isoSymbols.showLot ? (
                        <>
                          <rect x={0} y={-2.6} width={6.2} height={3.0} fill="#ffffff" stroke="#000000" strokeWidth={0.25} />
                          <text x={3.1} y={-0.4} fontSize={2.0} fontWeight="bold" fill="#000000" textAnchor="middle" fontFamily="Helvetica, Arial, sans-serif">LOT</text>
                          <text x={7.4} y={-0.3} fontSize={3.2} fontWeight="bold" fill="#000000" fontFamily="Helvetica, Arial, sans-serif">LOT-2409</text>
                        </>
                      ) : (
                        <text x={0} y={-0.3} fontSize={3.2} fontWeight="bold" fill="#000000" fontFamily="Helvetica, Arial, sans-serif">
                          {template.batchCodeLabel || 'LOT'}: LOT-2409
                        </text>
                      )}
                    </g>
                  )}

                  {/* Case / Box Number */}
                  {template.showCaseNumber && (
                    <text
                      x={padLeft}
                      y={padTop + (template.showSubtitle ? 17.2 : 15.8)}
                      fontSize={2.5}
                      fontWeight="bold"
                      fill="#000000"
                      fontFamily="Helvetica, Arial, sans-serif"
                    >
                      {template.caseNumberPrefix || 'CASE NO: #'}1
                    </text>
                  )}

                  {/* Quantity */}
                  {template.showQuantity && (
                    <text
                      x={padLeft}
                      y={padTop + (template.showSubtitle ? 20.2 : 18.8)}
                      fontSize={2.5}
                      fontWeight="bold"
                      fill="#000000"
                      fontFamily="Helvetica, Arial, sans-serif"
                    >
                      {template.quantityLabel || 'QTY:'} 500 PCS
                    </text>
                  )}

                  {/* ISO 15223-1 Symbols Row (Above footer or QC) */}
                  <g transform={`translate(${padLeft}, ${lH - padBottom - (template.showQcApproval ? 7.6 : 4.5)})`}>
                    {/* Render active ISO symbol icons in a neat millimetric cluster */}
                    {(() => {
                      const icons: JSX.Element[] = [];
                      let curX = 0;
                      const iconH = 3.6;

                      // MD Symbol
                      if (template.isoSymbols.showMd) {
                        icons.push(
                          <g key="md" transform={`translate(${curX}, 0)`}>
                            <rect x={0} y={-iconH} width={5.2} height={iconH} fill="#ffffff" stroke="#000000" strokeWidth={0.25} rx={0.3} />
                            <text x={2.6} y={-1.2} fontSize={2.1} fontWeight="bold" fill="#000000" textAnchor="middle" fontFamily="Helvetica, Arial, sans-serif">MD</text>
                          </g>
                        );
                        curX += 6.0;
                      }

                      // Single Use Symbol (2 with slash)
                      if (template.isoSymbols.showSingleUse) {
                        icons.push(
                          <g key="su" transform={`translate(${curX}, 0)`}>
                            <circle cx={1.8} cy={-1.8} r={1.8} fill="#ffffff" stroke="#000000" strokeWidth={0.25} />
                            <text x={1.8} y={-1.1} fontSize={2.2} fontWeight="bold" fill="#000000" textAnchor="middle" fontFamily="Helvetica, Arial, sans-serif">2</text>
                            <line x1={0.5} y1={-0.5} x2={3.1} y2={-3.1} stroke="#000000" strokeWidth={0.25} />
                          </g>
                        );
                        curX += 4.5;
                      }

                      // Factory Manufacturer Symbol
                      if (template.isoSymbols.showManufacturer) {
                        icons.push(
                          <g key="mfg" transform={`translate(${curX}, 0)`}>
                            <path d="M0,0 L0,-2 L1.3,-3 L1.3,-2 L2.6,-3 L2.6,-1.5 L3.6,-1.5 L3.6,0 Z" fill="#000000" />
                          </g>
                        );
                        curX += 4.5;
                      }

                      // Expiry Hourglass
                      if (template.isoSymbols.showExpiryDate) {
                        icons.push(
                          <g key="exp" transform={`translate(${curX}, 0)`}>
                            <line x1={0} y1={-iconH} x2={3} y2={-iconH} stroke="#000000" strokeWidth={0.25} />
                            <line x1={0} y1={0} x2={3} y2={0} stroke="#000000" strokeWidth={0.25} />
                            <line x1={0} y1={-iconH} x2={3} y2={0} stroke="#000000" strokeWidth={0.25} />
                            <line x1={3} y1={-iconH} x2={0} y2={0} stroke="#000000" strokeWidth={0.25} />
                          </g>
                        );
                        curX += 4.0;
                      }

                      // Keep Dry Umbrella
                      if (template.isoSymbols.showKeepDry) {
                        icons.push(
                          <g key="dry" transform={`translate(${curX}, 0)`}>
                            <path d="M0,-1.8 Q1.7,-3.6 3.4,-1.8 Z" fill="#000000" />
                            <line x1={1.7} y1={-1.8} x2={1.7} y2={0} stroke="#000000" strokeWidth={0.25} />
                            <path d="M1.7,0 Q1.2,0.4 0.9,0" fill="none" stroke="#000000" strokeWidth={0.25} />
                          </g>
                        );
                        curX += 4.2;
                      }

                      // Sterile / Non-Sterile
                      if (template.isoSymbols.showSterile) {
                        const st = template.isoSymbols.sterileType || 'NON-STERILE';
                        icons.push(
                          <g key="ste" transform={`translate(${curX}, 0)`}>
                            <rect x={0} y={-iconH} width={13} height={iconH} fill="#ffffff" stroke="#000000" strokeWidth={0.25} />
                            <text x={6.5} y={-1.2} fontSize={1.7} fontWeight="bold" fill="#000000" textAnchor="middle" fontFamily="Helvetica, Arial, sans-serif">
                              {st === 'NON-STERILE' ? 'NON-STERILE' : `STERILE|${st}`}
                            </text>
                          </g>
                        );
                        curX += 14.0;
                      }

                      // CE Mark
                      if (template.isoSymbols.showCeMark) {
                        icons.push(
                          <g key="ce" transform={`translate(${curX}, 0)`}>
                            <text x={0} y={-1.0} fontSize={3.2} fontWeight="bold" fill="#000000" fontFamily="Helvetica, Arial, sans-serif">CE</text>
                            {template.isoSymbols.notifiedBodyNumber && (
                              <text x={0} y={1.2} fontSize={1.2} fontWeight="bold" fill="#000000" fontFamily="Helvetica, Arial, sans-serif">{template.isoSymbols.notifiedBodyNumber}</text>
                            )}
                          </g>
                        );
                        curX += 6.5;
                      }

                      return icons;
                    })()}
                  </g>

                  {/* QC Status Line (Single Line: QC STATUS: APPROVED │ Inspected by :) */}
                  {template.showQcApproval && (
                    <g transform={`translate(${padLeft}, ${lH - padBottom - 3.0})`}>
                      <text
                        x={0}
                        y={0}
                        fontSize={1.8}
                        fontWeight="bold"
                        fill="#000000"
                        fontFamily="Helvetica, Arial, sans-serif"
                      >
                        QC STATUS: {template.qcApprovalText || 'APPROVED'}
                      </text>
                      <line
                        x1={Math.max(26, safeW * 0.44)}
                        y1={-2.2}
                        x2={Math.max(26, safeW * 0.44)}
                        y2={0.4}
                        stroke="#000000"
                        strokeWidth={0.2}
                      />
                      <text
                        x={Math.max(26, safeW * 0.44) + 2.5}
                        y={0}
                        fontSize={1.8}
                        fontWeight="bold"
                        fill="#000000"
                        fontFamily="Helvetica, Arial, sans-serif"
                      >
                        Inspected by : 
                      </text>
                    </g>
                  )}

                  {/* QR Code */}
                  {template.showQrCode && sampleQrUrl && (
                    <image
                      href={sampleQrUrl}
                      x={lW - padRight - (template.qrSizeMm || 14)}
                      y={
                        template.qrCodePosition === 'bottom-right'
                          ? lH - padBottom - (template.qrSizeMm || 14)
                          : padTop + 4.5
                      }
                      width={template.qrSizeMm || 14}
                      height={template.qrSizeMm || 14}
                    />
                  )}

                  {/* Custom Footer Text */}
                  {template.showFooterText && template.customFooterText && (
                    <text
                      x={padLeft}
                      y={lH - padBottom + 1.2}
                      fontSize={1.4}
                      fontWeight="bold"
                      fill="#000000"
                      fontFamily="Helvetica, Arial, sans-serif"
                    >
                      {template.customFooterText.substring(0, 50)}
                    </text>
                  )}
                </svg>
              </Box>

              <Box sx={{ mt: 2, display: 'flex', gap: 2, alignItems: 'center' }}>
                <Typography variant="caption" sx={{ color: '#38bdf8', fontWeight: 600 }}>
                  • Dashed Cyan: Safe printable margin ({padLeft}mm)
                </Typography>
                <Typography variant="caption" sx={{ color: '#94a3b8' }}>
                  • Solid Gray: Physical die-cut boundary
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};
