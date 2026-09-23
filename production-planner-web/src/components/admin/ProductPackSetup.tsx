import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Checkbox,
  ListItemText,
  Radio,
  RadioGroup,
  FormControlLabel,
  Alert,
  Chip,
} from '@mui/material';
import {
  Edit as EditIcon,
  CheckCircle as ActiveIcon,
  Inventory as ProductIcon,
} from '@mui/icons-material';
import { Product, LabelPaperType, ProductLabelType } from '../../types';
import { supabase } from '../../lib/supabase';

interface ProductPackSetupProps {
  products: Product[];
  onRefreshProducts: () => void;
}

export const ProductPackSetup: React.FC<ProductPackSetupProps> = ({
  products,
  onRefreshProducts,
}) => {
  const [paperTypes, setPaperTypes] = useState<LabelPaperType[]>([]);
  const [productLinks, setProductLinks] = useState<ProductLabelType[]>([]);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [selectedPackQty, setSelectedPackQty] = useState<number>(1000);
  const [selectedPaperIds, setSelectedPaperIds] = useState<string[]>([]);
  const [defaultPaperId, setDefaultPaperId] = useState<string>('');
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchPaperAndLinks = async () => {
    try {
      const { data: papers } = await supabase
        .from('label_paper_types')
        .select('*')
        .eq('active', true);
      setPaperTypes(papers || []);

      const { data: links } = await supabase
        .from('product_label_types')
        .select('*');
      setProductLinks(links || []);
    } catch (err: any) {
      console.error('Failed to load paper links:', err);
    }
  };

  useEffect(() => {
    fetchPaperAndLinks();
  }, []);

  const handleOpenEdit = (prod: Product) => {
    setEditingProduct(prod);
    setSelectedPackQty(prod.std_pack_size || prod.standard_packing_qty || 1000);

    const linked = productLinks.filter((l) => l.product_id === prod.id);
    const ids = linked.map((l) => l.label_paper_type_id);
    setSelectedPaperIds(ids);

    const defaultLink = linked.find((l) => l.is_default);
    setDefaultPaperId(defaultLink ? defaultLink.label_paper_type_id : ids[0] || '');
  };

  const handleSaveProductConfig = async () => {
    if (!editingProduct) return;

    try {
      // 1. Update product std_pack_size and standard_packing_qty together
      const { error: prodError } = await supabase
        .from('products')
        .update({
          std_pack_size: selectedPackQty,
          standard_packing_qty: selectedPackQty,
        })
        .eq('id', editingProduct.id);

      if (prodError) throw prodError;

      // 2. Remove previous product_label_types mappings
      await supabase
        .from('product_label_types')
        .delete()
        .eq('product_id', editingProduct.id);

      // 3. Insert new product_label_types mappings
      if (selectedPaperIds.length > 0) {
        const rowsToInsert = selectedPaperIds.map((paperId) => ({
          product_id: editingProduct.id,
          label_paper_type_id: paperId,
          is_default: paperId === defaultPaperId,
        }));

        const { error: linkError } = await supabase
          .from('product_label_types')
          .insert(rowsToInsert);

        if (linkError) throw linkError;
      }

      setNotification({ type: 'success', message: `Updated packaging settings for ${editingProduct.name}.` });
      setEditingProduct(null);
      fetchPaperAndLinks();
      onRefreshProducts();
    } catch (err: any) {
      console.error('Failed to save product packaging config:', err);
      setNotification({ type: 'error', message: err.message || 'Error saving packaging configuration.' });
    }
  };

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, color: '#0f172a' }}>
          Product Packaging & Label Stock Mapping
        </Typography>
        <Typography variant="body2" sx={{ color: '#64748b' }}>
          Define the standard case packing quantity and assign authorized sticker sheet types for each product master record.
        </Typography>
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

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: 3 }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Product Name & Code</TableCell>
              <TableCell align="right">Standard Case Qty</TableCell>
              <TableCell>Approved Label Stocks</TableCell>
              <TableCell>Default Stock</TableCell>
              <TableCell align="center">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {products.map((p) => {
              const links = productLinks.filter((l) => l.product_id === p.id);
              const defaultLink = links.find((l) => l.is_default);
              const defaultPaper = paperTypes.find((x) => x.id === defaultLink?.label_paper_type_id);

              return (
                <TableRow key={p.id} hover>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: '#0f172a' }}>
                      {p.name}
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#64748b', fontFamily: 'monospace' }}>
                      {p.item_code || p.id} • Batch ID: {p.batch_identifier || 'N/A'}
                    </Typography>
                  </TableCell>

                  <TableCell align="right">
                    <Typography variant="body2" sx={{ fontWeight: 700, color: '#0284c7' }}>
                      {(p.std_pack_size || p.standard_packing_qty || 1000).toLocaleString()} pcs / case
                    </Typography>
                  </TableCell>

                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                      {links.length === 0 ? (
                        <Typography variant="caption" sx={{ color: '#94a3b8' }}>
                          Using System Default Stock
                        </Typography>
                      ) : (
                        links.map((link) => {
                          const paper = paperTypes.find((x) => x.id === link.label_paper_type_id);
                          return (
                            <Chip
                              key={link.label_paper_type_id}
                              label={paper ? paper.name : link.label_paper_type_id}
                              size="small"
                              variant={link.is_default ? 'filled' : 'outlined'}
                              color={link.is_default ? 'primary' : 'default'}
                              sx={{ height: 22, fontSize: '0.6875rem' }}
                            />
                          );
                        })
                      )}
                    </Box>
                  </TableCell>

                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: '#334155' }}>
                      {defaultPaper ? defaultPaper.name : 'None Selected'}
                    </Typography>
                  </TableCell>

                  <TableCell align="center">
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<EditIcon />}
                      onClick={() => handleOpenEdit(p)}
                      sx={{ textTransform: 'none', fontSize: '0.75rem' }}
                    >
                      Configure
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Edit Configuration Dialog */}
      {editingProduct && (
        <Dialog open={Boolean(editingProduct)} onClose={() => setEditingProduct(null)} maxWidth="sm" fullWidth>
          <DialogTitle sx={{ fontWeight: 700, borderBottom: '1px solid #e2e8f0' }}>
            Configure Packaging: {editingProduct.name}
          </DialogTitle>
          <DialogContent sx={{ pt: 2.5 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
              {/* Standard Case Quantity */}
              <TextField
                label="Standard Case Quantity (pcs)"
                type="number"
                fullWidth
                size="small"
                value={selectedPackQty}
                onChange={(e) => setSelectedPackQty(Math.max(1, parseInt(e.target.value) || 1))}
                helperText="Fixed carton count used for deriving planned crate count."
              />

              {/* Multi-select Approved Paper Types */}
              <FormControl fullWidth size="small">
                <InputLabel id="approved-papers-label">Approved Label Stocks</InputLabel>
                <Select
                  labelId="approved-papers-label"
                  multiple
                  value={selectedPaperIds}
                  onChange={(e) => {
                    const ids = typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value;
                    setSelectedPaperIds(ids);
                    if (!ids.includes(defaultPaperId) && ids.length > 0) {
                      setDefaultPaperId(ids[0]);
                    }
                  }}
                  renderValue={(selected) => (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {selected.map((id) => {
                        const p = paperTypes.find((x) => x.id === id);
                        return <Chip key={id} label={p?.name || id} size="small" />;
                      })}
                    </Box>
                  )}
                >
                  {paperTypes.map((p) => (
                    <MenuItem key={p.id} value={p.id}>
                      <Checkbox checked={selectedPaperIds.indexOf(p.id) > -1} />
                      <ListItemText primary={`${p.name} (${p.rows * p.columns} labels/sheet)`} />
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {/* Default Selector */}
              {selectedPaperIds.length > 0 && (
                <Box sx={{ p: 2, borderRadius: 2, backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#1e293b', mb: 1 }}>
                    Default Label Stock
                  </Typography>
                  <RadioGroup
                    value={defaultPaperId}
                    onChange={(e) => setDefaultPaperId(e.target.value)}
                  >
                    {selectedPaperIds.map((id) => {
                      const paper = paperTypes.find((x) => x.id === id);
                      return (
                        <FormControlLabel
                          key={id}
                          value={id}
                          control={<Radio size="small" />}
                          label={<Typography variant="body2">{paper?.name}</Typography>}
                        />
                      );
                    })}
                  </RadioGroup>
                </Box>
              )}
            </Box>
          </DialogContent>
          <DialogActions sx={{ p: 2, borderTop: '1px solid #e2e8f0' }}>
            <Button onClick={() => setEditingProduct(null)} color="inherit">
              Cancel
            </Button>
            <Button variant="contained" onClick={handleSaveProductConfig}>
              Save Packaging Config
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </Box>
  );
};
