-- Migration: Add cleaning_tasks table
CREATE TABLE IF NOT EXISTS cleaning_tasks (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE cleaning_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated read access" ON cleaning_tasks;
CREATE POLICY "Allow authenticated read access" 
ON cleaning_tasks FOR SELECT 
TO authenticated 
USING (true);

DROP POLICY IF EXISTS "Allow admin/poweruser modifications" ON cleaning_tasks;
CREATE POLICY "Allow admin/poweruser modifications" 
ON cleaning_tasks FOR ALL 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND (profiles.role IN ('Admin', 'PowerUser'))
  )
);

-- Seed defaults
INSERT INTO cleaning_tasks (id, label) VALUES 
  ('C1', 'Hopper Cleaned & Inspected'),
  ('C2', 'Barrel & Screw Purged'),
  ('C3', 'Nozzle Obstruction Check'),
  ('C4', 'Mould Platen Surfaces Cleaned'),
  ('C5', 'First Article Inspection (FAI) Done')
ON CONFLICT (id) DO NOTHING;

-- Enable Real-time
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'cleaning_tasks') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE cleaning_tasks;
  END IF;
END $$;
