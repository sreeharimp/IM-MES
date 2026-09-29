-- Migration: Add template_config to label_paper_types for multi-device sync
-- Enables storing custom label template designer layouts, ISO symbols, and typography directly per paper stock

ALTER TABLE label_paper_types 
  ADD COLUMN IF NOT EXISTS template_config JSONB DEFAULT NULL;

COMMENT ON COLUMN label_paper_types.template_config IS 'Custom layout, ISO symbols, and typography configuration from Label Template Designer';
