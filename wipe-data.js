import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
});

const supabaseUrl = env['VITE_SUPABASE_URL'];
const supabaseKey = env['VITE_SUPABASE_ANON_KEY'];

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function clearAllProductionData() {
  console.log("Starting full database wipe of production data...");

  // 1. Delete all crates
  console.log("Deleting all crates...");
  const { error: errCrates } = await supabase.from('crates').delete().neq('id', 'dummy');
  if (errCrates) console.error("Error deleting crates:", errCrates);

  // 2. Delete all batch records
  console.log("Deleting all batch records...");
  const { error: errBatches } = await supabase.from('batch_records').delete().neq('id', 'dummy');
  if (errBatches) console.error("Error deleting batch records:", errBatches);

  // 3. Delete all breakdown records
  console.log("Deleting all breakdown records...");
  const { error: errBreakdowns } = await supabase.from('breakdown_records').delete().neq('id', 'dummy');
  if (errBreakdowns) console.error("Error deleting breakdown records:", errBreakdowns);

  // 4. Delete all shift summaries
  console.log("Deleting all shift summaries...");
  const { error: errShiftSummaries } = await supabase.from('shift_summaries').delete().neq('id', 'dummy');
  if (errShiftSummaries) console.error("Error deleting shift summaries:", errShiftSummaries);

  // 5. Delete all activity logs
  console.log("Deleting all activity logs...");
  const { error: errLogs } = await supabase.from('activity_logs').delete().neq('id', 'dummy');
  if (errLogs) console.error("Error deleting logs:", errLogs);

  // 6. Reset Machine states
  console.log("Resetting machine states...");
  const { error: errMachines } = await supabase.from('machines').update({
    status: 'Idle',
    current_mould_id: null,
    current_operator_id: null,
    active_product_id: null,
    current_material_id: null,
    material_grade: null,
    material_batch: null,
    current_bin_number: 1,
    current_shift_production: 0,
    current_day_production: 0,
    bin_start_time: null,
    active_batch_id: null,
    active_batch_date: null,
    breakdown_start_time: null,
    oee: 0,
    availability: 0,
    quality: 0
  }).neq('id', 'dummy');
  
  if (errMachines) console.error("Error resetting machines:", errMachines);

  // 7. Reset App Settings
  console.log("Resetting app settings...");
  const { error: errApp } = await supabase.from('app_settings').update({
    pending_handover: false,
    active_supervisor_name: null,
    last_handover_summary: null
  }).eq('id', 'global');
  
  if (errApp) console.error("Error resetting app settings:", errApp);

  console.log("Production and batch data successfully wiped! You are ready to start fresh.");
}

clearAllProductionData();
