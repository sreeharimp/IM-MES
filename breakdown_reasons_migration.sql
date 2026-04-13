-- Migration: Add breakdown_reasons table
CREATE TABLE IF NOT EXISTS breakdown_reasons (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE breakdown_reasons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated read access" ON breakdown_reasons;
CREATE POLICY "Allow authenticated read access" 
ON breakdown_reasons FOR SELECT 
TO authenticated 
USING (true);

DROP POLICY IF EXISTS "Allow admin/poweruser modifications" ON breakdown_reasons;
CREATE POLICY "Allow admin/poweruser modifications" 
ON breakdown_reasons FOR ALL 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND (profiles.role IN ('Admin', 'PowerUser'))
  )
);

-- Seed default reasons
INSERT INTO breakdown_reasons (id, name) VALUES 
  ('B1', 'Nozzle Jam / Blockage'),
  ('B2', 'Heater / Thermocouple Failure'),
  ('B3', 'Mould Damage / Stuck Part'),
  ('B4', 'Material Shortage / Feed Issue'),
  ('B5', 'Power / Electrical Fluctuation'),
  ('B6', 'Hydraulic / Oil Leak'),
  ('B7', 'Robotic / Ejector Failure'),
  ('B8', 'Cooling / Water Temp Issue')
ON CONFLICT (id) DO NOTHING;

-- Enable Real-time
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'breakdown_reasons'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE breakdown_reasons;
  END IF;
END $$;
