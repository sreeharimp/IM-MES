-- Migration: Add show_borders to label_paper_types
-- Allows users to switch on/off the outer light guide outline border per paper stock

ALTER TABLE label_paper_types 
ADD COLUMN IF NOT EXISTS show_borders BOOLEAN DEFAULT true;

COMMENT ON COLUMN label_paper_types.show_borders IS 'Controls whether light rectangular boundary outline is drawn during PDF printing';
