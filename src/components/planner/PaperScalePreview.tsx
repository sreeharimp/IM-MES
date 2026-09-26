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

  const padTop = Number(paper.padding_top_mm ?? paper.internal_padding_mm ?? 1.8);
  const padLeft = Number(paper.padding_left_mm ?? paper.internal_padding_mm ?? 1.8);
  const padRight = Number(paper.padding_right_mm ?? paper.internal_padding_mm ?? 1.8);
  const padBottom = Number(paper.padding_bottom_mm ?? paper.internal_padding_mm ?? 1.8);

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

              const innerW = Math.max(0.5, lW - (padLeft + padRight));
              const innerH = Math.max(0.5, lH - (padTop + padBottom));

              return (
                <g key={`${r}-${c}`}>
                  {/* Die-cut label shape */}
                  <rect
                    x={x}
                    y={y}
                    width={lW}
                    height={lH}
                    fill="#f8fafc"
                    stroke={paper.show_borders === false ? '#cbd5e1' : '#94a3b8'}
                    strokeWidth={paper.show_borders === false ? 0.2 : 0.35}
                    strokeDasharray={paper.show_borders === false ? '0.8,0.8' : undefined}
                    rx={1}
                  />

                  {/* Internal padding safe printable zone */}
                  {(padLeft > 0 || padTop > 0 || padRight > 0 || padBottom > 0) && (
                    <rect
                      x={x + padLeft}
                      y={y + padTop}
                      width={innerW}
                      height={innerH}
                      fill="none"
                      stroke="#0284c7"
                      strokeWidth={0.2}
                      strokeDasharray="0.8,0.8"
                    />
                  )}

                  <text
                    x={x + padLeft + 1}
                    y={y + padTop + 3.2}
                    fontSize={2.3}
                    fill="#475569"
                    fontWeight="bold"
                    fontFamily="monospace"
                  >
                    R{r + 1}C{c + 1}
                  </text>
                  <text
                    x={x + padLeft + 1}
                    y={y + padTop + 6.2}
                    fontSize={1.8}
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
      <Box sx={{ mt: 1, display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
        <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600 }}>
          Scale: {pW} × {pH} mm
        </Typography>
        <Typography variant="caption" sx={{ color: '#0284c7', fontWeight: 600 }}>
          • Safe zone (pad: {padTop}mm)
        </Typography>
        <Typography variant="caption" sx={{ color: paper.show_borders === false ? '#f59e0b' : '#10b981', fontWeight: 600 }}>
          • Outline: {paper.show_borders === false ? 'OFF (no borders)' : 'ON (borders)'}
        </Typography>
      </Box>
    </Box>
  );
};
