CREATE TABLE IF NOT EXISTS public.activity_logs (
  id TEXT PRIMARY KEY,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  event_type TEXT NOT NULL,
  machine_id TEXT NOT NULL,
  operator_id TEXT,
  supervisor_name TEXT,
  details TEXT,
  qty INTEGER
);

-- Ensure RLS is enabled but allows public access (for now, based on your other policies)
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow all for activity_logs') THEN
        CREATE POLICY "Allow all for activity_logs" ON public.activity_logs FOR ALL TO public USING (true) WITH CHECK (true);
    END IF;
END $$;

-- Enable real-time for activity_logs
ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_logs;
