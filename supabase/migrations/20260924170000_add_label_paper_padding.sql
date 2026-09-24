-- Migration: Add internal padding configuration to label_paper_types
-- Run this in Supabase SQL Editor if modifying the database directly

ALTER TABLE label_paper_types 
  ADD COLUMN IF NOT EXISTS internal_padding_mm NUMERIC(5, 2) DEFAULT 1.8 CHECK (internal_padding_mm >= 0);

ALTER TABLE label_paper_types 
  ADD COLUMN IF NOT EXISTS padding_top_mm NUMERIC(5, 2) DEFAULT NULL;

ALTER TABLE label_paper_types 
  ADD COLUMN IF NOT EXISTS padding_left_mm NUMERIC(5, 2) DEFAULT NULL;

ALTER TABLE label_paper_types 
  ADD COLUMN IF NOT EXISTS padding_right_mm NUMERIC(5, 2) DEFAULT NULL;

ALTER TABLE label_paper_types 
  ADD COLUMN IF NOT EXISTS padding_bottom_mm NUMERIC(5, 2) DEFAULT NULL;

COMMENT ON COLUMN label_paper_types.internal_padding_mm IS 'Default inner padding (mm) between die-cut edge and printed content';
COMMENT ON COLUMN label_paper_types.padding_top_mm IS 'Optional individual top padding override (mm)';
COMMENT ON COLUMN label_paper_types.padding_left_mm IS 'Optional individual left padding override (mm)';
COMMENT ON COLUMN label_paper_types.padding_right_mm IS 'Optional individual right padding override (mm)';
COMMENT ON COLUMN label_paper_types.padding_bottom_mm IS 'Optional individual bottom padding override (mm)';
