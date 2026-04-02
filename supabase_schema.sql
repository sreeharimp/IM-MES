-- Supabase Schema for IMM Production Tracker

-- 1. Machines Table
CREATE TABLE machines (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  model TEXT,
  status TEXT DEFAULT 'Idle',
  current_mould_id TEXT,
  current_operator_id TEXT,
  active_product_id TEXT,
  current_material_id TEXT,
  material_grade TEXT,
  material_batch TEXT,
  current_bin_number INTEGER DEFAULT 1,
  current_shift_production INTEGER DEFAULT 0,
  current_day_production INTEGER DEFAULT 0,
  cycle_time INTEGER,
  cavities INTEGER,
  bin_target INTEGER,
  bin_start_time BIGINT,
  active_batch_id TEXT,
  active_batch_date TEXT,
  breakdown_start_time BIGINT,
  oee NUMERIC DEFAULT 0,
  availability NUMERIC DEFAULT 0,
  quality NUMERIC DEFAULT 0,
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 1.1 Profiles Table (Linked to Auth Users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  role TEXT DEFAULT 'Supervisor',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 1.2 Authorized Supervisors (Whitelist)
CREATE TABLE IF NOT EXISTS authorized_supervisors (
  email TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Products Table
CREATE TABLE products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  mould_id TEXT REFERENCES moulds(id),
  item_code TEXT,
  bin_qty INTEGER DEFAULT 4000,
  std_pack_size INTEGER DEFAULT 1000
);

-- 3. Moulds Table
CREATE TABLE moulds (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  cavities INTEGER,
  cycle_time INTEGER,
  standard_bin_qty INTEGER
);

-- 4. Operators Table
CREATE TABLE operators (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  employee_id TEXT,
  is_certified BOOLEAN DEFAULT TRUE
);

-- 5. Raw Materials Table
CREATE TABLE raw_materials (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  vendor TEXT
);

-- 6. Approved Materials (Junction)
CREATE TABLE approved_materials (
  product_id TEXT REFERENCES products(id),
  material_id TEXT REFERENCES raw_materials(id),
  PRIMARY KEY (product_id, material_id)
);

-- 5. Batch Records Table
CREATE TABLE batch_records (
  id TEXT PRIMARY KEY,
  machine_id TEXT REFERENCES machines(id),
  product_id TEXT,
  product_name TEXT,
  product_code TEXT,
  mould_id TEXT,
  material_id TEXT,
  material_grade TEXT,
  material_batch TEXT,
  operator_id TEXT,
  start_time TIMESTAMP WITH TIME ZONE,
  end_time TIMESTAMP WITH TIME ZONE,
  crates INTEGER DEFAULT 0,
  total_output INTEGER DEFAULT 0,
  status TEXT,
  batch_date DATE
);

-- 6. Breakdown Records Table
CREATE TABLE breakdown_records (
  id TEXT PRIMARY KEY,
  machine_id TEXT REFERENCES machines(id),
  machine_name TEXT,
  start_time TIMESTAMP WITH TIME ZONE,
  end_time TIMESTAMP WITH TIME ZONE,
  duration_minutes INTEGER,
  reason TEXT,
  remarks TEXT,
  operator_id TEXT,
  supervisor_name TEXT,
  status TEXT
);

-- 7. Crates Table
CREATE TABLE crates (
  id TEXT PRIMARY KEY,
  batch_id TEXT,
  machine_id TEXT REFERENCES machines(id),
  bin_number INTEGER,
  start_time TIMESTAMP WITH TIME ZONE,
  end_time TIMESTAMP WITH TIME ZONE,
  gross_qty INTEGER,
  startup_scrap INTEGER DEFAULT 0,
  qc_sample INTEGER DEFAULT 0,
  net_qty INTEGER,
  operator_id TEXT,
  supervisor_id TEXT,
  status TEXT
);

-- Real-time Subscriptions (Optional but recommended for all tables)
ALTER PUBLICATION supabase_realtime ADD TABLE machines;
ALTER PUBLICATION supabase_realtime ADD TABLE moulds;
ALTER PUBLICATION supabase_realtime ADD TABLE products;
ALTER PUBLICATION supabase_realtime ADD TABLE raw_materials;
ALTER PUBLICATION supabase_realtime ADD TABLE approved_materials;
ALTER PUBLICATION supabase_realtime ADD TABLE batch_records;
ALTER PUBLICATION supabase_realtime ADD TABLE breakdown_records;
ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE authorized_supervisors;

-- 8. App Settings Table
CREATE TABLE IF NOT EXISTS app_settings (
  id TEXT PRIMARY KEY,
  current_shift TEXT,
  pending_handover BOOLEAN DEFAULT FALSE,
  last_handover_summary JSONB
);

-- 9. Shift Settings Table
CREATE TABLE IF NOT EXISTS shift_settings (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL
);

-- Insert Default Shifts
INSERT INTO shift_settings (id, name, start_time, end_time) 
VALUES 
  ('A', 'Shift A', '06:00', '14:00'),
  ('B', 'Shift B', '14:00', '22:00'),
  ('C', 'Shift C', '22:00', '06:00')
ON CONFLICT (id) DO NOTHING;

INSERT INTO app_settings (id, current_shift, pending_handover, last_handover_summary)
VALUES ('global', 'A', false, null)
ON CONFLICT (id) DO NOTHING;

-- 10. Shift Summaries Table
CREATE TABLE IF NOT EXISTS shift_summaries (
  id TEXT PRIMARY KEY,
  shift_date DATE NOT NULL,
  shift_id TEXT NOT NULL,
  supervisor_name TEXT,
  total_output INTEGER DEFAULT 0,
  running_machines INTEGER DEFAULT 0,
  pending_crates INTEGER DEFAULT 0,
  handover_time TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER PUBLICATION supabase_realtime ADD TABLE app_settings;
ALTER PUBLICATION supabase_realtime ADD TABLE shift_settings;

-- 11. Activity Logs Table
CREATE TABLE IF NOT EXISTS activity_logs (
  id TEXT PRIMARY KEY,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  event_type TEXT NOT NULL,
  machine_id TEXT NOT NULL,
  operator_id TEXT,
  supervisor_name TEXT,
  details TEXT,
  qty INTEGER
);

ALTER PUBLICATION supabase_realtime ADD TABLE activity_logs;
