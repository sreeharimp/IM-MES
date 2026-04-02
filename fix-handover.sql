ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS outgoing_supervisor_email TEXT;
ALTER TABLE public.shift_summaries ADD COLUMN IF NOT EXISTS remarks TEXT;
-- Ensure permissions
GRANT ALL ON TABLE public.app_settings TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.shift_summaries TO anon, authenticated, service_role;
