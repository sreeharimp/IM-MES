import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  TextField,
  MenuItem,
  Alert,
  CircularProgress,
  Chip,
} from '@mui/material';
import { Save as SaveIcon, CheckCircle as CheckIcon } from '@mui/icons-material';
import type { Product, LabelPaperType, ProductLabelType } from '../../types';
import { supabase } from '../../lib/supabase';

interface ProductPackSetupProps {
  products: Product[];
  currentUserRole?: string;
  onRefreshProducts?: () => void;
}

export const ProductPackSetup: React.FC<ProductPackSetupProps> = ({
  products,
  currentUserRole = 'Admin',
  onRefreshProducts,
}) => {
  const [papers, setPapers] = useState<LabelPaperType[]>([]);
  const [packSizes, setPackSizes] = useState<Record<string, number>>({});
  const [defaultPapers, setDefaultPapers] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState<Record<string, boolean>>({});
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const canEdit =
    currentUserRole === 'Admin' || currentUserRole === 'PowerUser' || currentUserRole === 'Planner';

  useEffect(() => {
    const fetchConfigs = async () => {
      try {
        const { data: pData } = await supabase
          .from('label_paper_types')
          .select('*')
          .eq('active', true)
          .order('name');
        setPapers(pData || []);

        const { data: mappings } = await supabase
          .from('product_label_types')
          .select('*');

        const initialPapers: Record<string, string> = {};
        (mappings || []).forEach((m: ProductLabelType) => {
          if (m.is_default) {
            initialPapers[m.product_id] = m.label_paper_type_id;
          }
        });
        setDefaultPapers(initialPapers);

        const initialPacks: Record<string, number> = {};
        products.forEach((p: any) => {
          initialPacks[p.id] = p.stdPackSize || p.std_pack_size || p.standard_packing_qty || 1000;
        });
        setPackSizes(initialPacks);
      } catch (err: any) {
        console.error('Error fetching pack configs:', err);
      }
    };

    fetchConfigs();
  }, [products]);

  const handleSaveProductConfig = async (productId: string) => {
    setIsSaving((prev) => ({ ...prev, [productId]: true }));
    setSuccessMsg(null);

    try {
      const qty = packSizes[productId] || 1000;

      // Update both std_pack_size and standard_packing_qty for full system sync
      await supabase
        .from('products')
        .update({
          std_pack_size: qty,
          standard_packing_qty: qty,
        })
        .eq('id', productId);

      const paperId = defaultPapers[productId];
      if (paperId) {
        await supabase
          .from('product_label_types')
          .upsert(
            {
              product_id: productId,
              label_paper_type_id: paperId,
              is_default: true,
            },
            { onConflict: 'product_id,label_paper_type_id' }
          );
      }

      setSuccessMsg(`Successfully saved packaging configuration.`);
      if (onRefreshProducts) onRefreshProducts();
    } catch (err: any) {
      console.error('Failed to save packaging configuration:', err);
    } finally {
      setIsSaving((prev) => ({ ...prev, [productId]: false }));
    }
  };

  return (
    <Box>
      <Box sx={{ mb: 2.5 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, color: 'var(--text, #e2e6f0)' }}>
          Product Master & Packaging Setup
        </Typography>
        <Typography variant="body2" sx={{ color: 'var(--text2, #8a92a8)' }}>
          Configure standard case pack quantities and assign default label paper stocks per SKU
        </Typography>
      </Box>

      {successMsg && (
        <Alert severity="success" icon={<CheckIcon />} sx={{ mb: 2.5 }} onClose={() => setSuccessMsg(null)}>
          {successMsg}
        </Alert>
      )}

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid var(--border, #2e3340)', borderRadius: 2, bgcolor: 'var(--bg2, #141720)' }}>
        <Table>
          <TableHead sx={{ bgcolor: 'var(--bg4, #252a35)' }}>
            <TableRow>
              <TableCell sx={{ fontWeight: 700, color: 'var(--text2, #8a92a8)' }}>Product Name</TableCell>
              <TableCell sx={{ fontWeight: 700, color: 'var(--text2, #8a92a8)' }}>Item / SKU Code</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 220, color: 'var(--text2, #8a92a8)' }}>Std Case Pack (pcs/case)</TableCell>
              <TableCell sx={{ fontWeight: 700, width: 260, color: 'var(--text2, #8a92a8)' }}>Default Label Stock</TableCell>
              <TableCell align="center" sx={{ fontWeight: 700, width: 120, color: 'var(--text2, #8a92a8)' }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {products.map((p: any) => {
              const currentPack = packSizes[p.id] || p.stdPackSize || p.std_pack_size || p.standard_packing_qty || 1000;
              const currentPaper = defaultPapers[p.id] || (papers[0]?.id || '');
              const savingThis = isSaving[p.id];

              return (
                <TableRow key={p.id} hover>
                  <TableCell sx={{ fontWeight: 700, color: 'var(--text, #e2e6f0)' }}>{p.name}</TableCell>
                  <TableCell>
                    <Chip
                      label={p.itemCode || p.item_code || p.batchIdentifier || p.batch_identifier || p.id}
                      size="small"
                      sx={{ fontFamily: 'monospace', fontWeight: 700, bgcolor: 'rgba(255, 255, 255, 0.05)', color: 'var(--text, #e2e6f0)' }}
                    />
                  </TableCell>
                  <TableCell>
                    <TextField
                      type="number"
                      size="small"
                      fullWidth
                      disabled={!canEdit}
                      value={currentPack}
                      onChange={(e) =>
                        setPackSizes({
                          ...packSizes,
                          [p.id]: Math.max(1, parseInt(e.target.value) || 1),
                        })
                      }
                      slotProps={{ htmlInput: { min: 1 } }}
                    />
                  </TableCell>
                  <TableCell>
                    <TextField
                      select
                      size="small"
                      fullWidth
                      disabled={!canEdit}
                      value={currentPaper}
                      onChange={(e) =>
                        setDefaultPapers({
                          ...defaultPapers,
                          [p.id]: e.target.value,
                        })
                      }
                    >
                      {papers.map((paper) => (
                        <MenuItem key={paper.id} value={paper.id}>
                          {paper.name} ({paper.rows * paper.columns}-up)
                        </MenuItem>
                      ))}
                    </TextField>
                  </TableCell>
                  <TableCell align="center">
                    {canEdit && (
                      <Button
                        size="small"
                        variant="contained"
                        startIcon={savingThis ? <CircularProgress size={14} /> : <SaveIcon />}
                        disabled={savingThis}
                        onClick={() => handleSaveProductConfig(p.id)}
                        sx={{ bgcolor: 'var(--blue, #4d9fff)', color: '#ffffff' }}
                      >
                        {savingThis ? 'Saving' : 'Save'}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};
