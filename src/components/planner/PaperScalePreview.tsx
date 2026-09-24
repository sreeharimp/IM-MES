import React from 'react';
import { Box, Typography } from '@mui/material';
import type { LabelPaperType } from '../../types';

interface PaperScalePreviewProps {
  paper: Partial<LabelPaperType>;
}

export const PaperScalePreview: React.FC<PaperScalePreviewProps> = ({ paper }) => {
  const pW = Number(paper.page_width_mm) || 210;
  const pH = Number(paper.page_height_mm) || 297;
  const rows = Number(paper.rows) || 8;
  const cols = Number(paper.columns) || 3;
  const lW = Number(paper.label_width_mm) || 70;
  const lH = Number(paper.label_height_mm) || 37;
  const mT = Number(paper.margin_top_mm) || 0.5;
  const mL = Number(paper.margin_left_mm) || 0;
  const gX = Number(paper.gutter_x_mm) || 0;
  const gY = Number(paper.gutter_y_mm) || 0;

  const previewBoxWidth = 320;
  const scale = previewBoxWidth / pW;
  const previewBoxHeight = pH * scale;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <Box
        sx={{
          width: previewBoxWidth,
          height: previewBoxHeight,
          backgroundColor: '#ffffff',
          border: '1px solid #cbd5e1',
          boxShadow: '0 8px 24px rgba(15, 23, 42, 0.08)',
          position: 'relative',
          overflow: 'hidden',
          borderRadius: '4px',
        }}
      >
        <svg width="100%" height="100%" viewBox={`0 0 ${pW} ${pH}`}>
          {Array.from({ length: rows }).map((_, r) => {
            return Array.from({ length: cols }).map((__, c) => {
              const x = mL + c * (lW + gX);
              const y = mT + r * (lH + gY);

              return (
                <g key={`${r}-${c}`}>
                  <rect
                    x={x}
                    y={y}
                    width={lW}
                    height={lH}
                    fill="#f8fafc"
                    stroke="#94a3b8"
                    strokeWidth={0.3}
                    rx={1}
                  />
                  <text
                    x={x + 1.5}
                    y={y + 3.5}
                    fontSize={2.5}
                    fill="#475569"
                    fontWeight="bold"
                    fontFamily="monospace"
                  >
                    R{r + 1}C{c + 1}
                  </text>
                  <text
                    x={x + 1.5}
                    y={y + 7}
                    fontSize={2}
                    fill="#64748b"
                    fontFamily="sans-serif"
                  >
                    {lW}×{lH}mm
                  </text>
                </g>
              );
            });
          })}
        </svg>
      </Box>
      <Typography variant="caption" sx={{ mt: 1, color: '#64748b', fontWeight: 600 }}>
        True Aspect Ratio SVG Scale Preview ({pW} × {pH} mm)
      </Typography>
    </Box>
  );
};
