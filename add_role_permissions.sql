-- Migration: Add role_permissions to app_settings
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS role_permissions JSONB;

-- Seed default role permissions
UPDATE app_settings 
SET role_permissions = '{
  "Admin": ["Shop Floor", "Inspections", "Batch Log", "Shift Log", "Breakdowns", "Packing", "Machines", "About"],
  "PowerUser": ["Shop Floor", "Inspections", "Batch Log", "Shift Log", "Breakdowns", "Packing", "Machines", "About"],
  "Supervisor": ["Shop Floor", "Inspections", "Batch Log", "Shift Log", "Breakdowns", "Packing", "About"],
  "QC": ["Batch Log", "Shift Log", "Packing", "Inspections", "About"]
}'::jsonb
WHERE id = 'global';
