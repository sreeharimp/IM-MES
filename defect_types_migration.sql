-- Migration: Add defect_types table
CREATE TABLE IF NOT EXISTS defect_types (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE defect_types ENABLE ROW LEVEL SECURITY;

-- Allow all access for now (consistent with other tables in this project)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all for defect_types') THEN
        CREATE POLICY "Allow all for defect_types" ON defect_types FOR ALL TO public USING (true) WITH CHECK (true);
    END IF;
END $$;

-- Optional: Initial defect types
INSERT INTO defect_types (id, name) VALUES 
  ('D1', 'Flash / Burrs'),
  ('D2', 'Short Shot'),
  ('D3', 'Burn Marks'),
  ('D4', 'Silver Streaks'),
  ('D5', 'Dimensional Out')
ON CONFLICT (id) DO NOTHING;

-- Add to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE defect_types;
