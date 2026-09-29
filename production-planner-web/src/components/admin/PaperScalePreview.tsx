import React from 'react';
import { Box, Typography } from '@mui/material';
import { LabelPaperType } from '../../types';

interface PaperScalePreviewProps {
  paper: LabelPaperType;
  previewScale?: number; // Scaling factor from mm to px
}

export const PaperScalePreview: React.FC<PaperScalePreviewProps> = ({
  paper,
  previewScale = 1.0,
}) => {
  const pW = Number(paper.page_width_mm) || 210;
  const pH = Number(paper.page_height_mm) || 297;
  const lW = Number(paper.label_width_mm) || 70;
  const lH = Number(paper.label_height_mm) || 37;
  const mT = Number(paper.margin_top_mm) || 0;
  const mL = Number(paper.margin_left_mm) || 0;
  const gX = Number(paper.gutter_x_mm) || 0;
  const gY = Number(paper.gutter_y_mm) || 0;
  const rows = Number(paper.rows) || 1;
  const cols = Number(paper.columns) || 1;

  // ViewBox in real mm
  const viewBox = `0 0 ${pW} ${pH}`;
  const displayWidth = pW * previewScale;
  const displayHeight = pH * previewScale;

  const labels = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = mL + c * (lW + gX);
      const y = mT + r * (lH + gY);
      labels.push({ r, c, x, y });
    }
  }

  return (
    <Box sx={{ display: 'inline-block', textAlign: 'center' }}>
      <Box
        sx={{
          border: '2px solid #94a3b8',
          borderRadius: '4px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          backgroundColor: '#ffffff',
          overflow: 'hidden',
          display: 'inline-block',
        }}
      >
        <svg
          viewBox={viewBox}
          width={displayWidth}
          height={displayHeight}
          style={{ display: 'block', maxWidth: '100%', height: 'auto' }}
        >
          {/* Paper Background */}
          <rect x={0} y={0} width={pW} height={pH} fill="#ffffff" stroke="#cbd5e1" strokeWidth={0.5} />

          {/* Margins shaded guide */}
          <rect
            x={mL}
            y={mT}
            width={cols * lW + (cols - 1) * gX}
            height={rows * lH + (rows - 1) * gY}
            fill="#f8fafc"
            stroke="#e2e8f0"
            strokeWidth={0.3}
          />

          {/* Render individual stickers */}
          {labels.map((item, idx) => (
            <g key={idx}>
              {/* Sticker outline */}
              <rect
                x={item.x}
                y={item.y}
                width={lW}
                height={lH}
                rx={1.5}
                ry={1.5}
                fill="#ffffff"
                stroke="#0284c7"
                strokeWidth={0.4}
              />
              {/* Center marker */}
              <circle cx={item.x + lW / 2} cy={item.y + lH / 2} r={0.8} fill="#ef4444" />
              {/* Label text */}
              <text
                x={item.x + 2}
                y={item.y + 4.5}
                fontSize={3.2}
                fontFamily="sans-serif"
                fontWeight="bold"
                fill="#334155"
              >
                #{idx + 1} ({lW}x{lH}mm)
              </text>
            </g>
          ))}
        </svg>
      </Box>
      <Typography variant="caption" display="block" sx={{ mt: 1, color: '#64748b', fontWeight: 600 }}>
        Page: {pW} x {pH} mm | {cols} cols × {rows} rows ({rows * cols} labels/sheet)
      </Typography>
    </Box>
  );
};
