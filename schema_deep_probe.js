/**
 * Deep schema probe — uses PostgREST's HEAD request + Content-Type response,
 * and fetches OpenAPI spec with Accept: application/openapi+json to get
 * full column definitions even for tables with RLS that blocks row reads.
 */
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

const KNOWN_TABLES = [
  'machines', 'profiles', 'authorized_supervisors', 'products', 'moulds',
  'operators', 'raw_materials', 'approved_materials', 'batch_records',
  'breakdown_records', 'crates', 'app_settings', 'shift_settings',
  'shift_summaries', 'activity_logs', 'defect_types', 'breakdown_reasons',
  'cleaning_tasks'
];

// PostgREST returns column descriptions in the OpenAPI spec with the anon key
// if Accept: application/vnd.pgrst.object+json doesn't work, try the full spec URL
async function fetchOpenApiWithKey() {
  // Try fetching spec endpoint
  const urls = [
    `${supabaseUrl}/rest/v1/`,
  ];
  
  for (const url of urls) {
    for (const accept of ['application/openapi+json', 'application/json', '*/*']) {
      const res = await fetch(url, {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Accept': accept
        }
      });
      if (res.ok) {
        const ct = res.headers.get('content-type') || '';
        const body = await res.text();
        console.log(`Got response from ${url} with Accept: ${accept}, Content-Type: ${ct}`);
        console.log('Body preview:', body.substring(0, 500));
        return { url, accept, body };
      } else {
        console.log(`  ${url} [${accept}] → ${res.status}`);
      }
    }
  }
  return null;
}

// Try to get schema from pg_meta (Supabase's own metadata API)
async function fetchPgMeta() {
  const projectRef = supabaseUrl.replace('https://', '').split('.')[0];
  console.log(`Project ref: ${projectRef}`);
  
  // Supabase exposes metadata at a different endpoint (requires service key)
  // With anon key, try to query RPC functions if any exist
  const rpcRes = await fetch(`${supabaseUrl}/rest/v1/rpc/`, {
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`
    }
  });
  console.log(`RPC endpoint: ${rpcRes.status}`);
  
  return { projectRef };
}

// For tables that block anon reads via RLS, try to SELECT specific columns
// by column-probing (this tells us what columns EXIST even if RLS blocks rows)
async function probeColumnsExistence(tableName, candidateColumns) {
  const results = {};
  
  for (const col of candidateColumns) {
    const res = await fetch(`${supabaseUrl}/rest/v1/${tableName}?select=${col}&limit=0`, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Accept': 'application/json'
      }
    });
    
    if (res.ok) {
      results[col] = 'EXISTS';
    } else {
      const body = await res.json().catch(() => ({}));
      if (body.message && body.message.includes('does not exist')) {
        results[col] = 'DOES_NOT_EXIST';
      } else if (body.code === '42703') {
        results[col] = 'DOES_NOT_EXIST';
      } else {
        // Other error (RLS, permission) means column exists but can't be read
        results[col] = `EXISTS_BUT_BLOCKED: ${body.message || res.status}`;
      }
    }
  }
  return results;
}

async function main() {
  console.log('=== DEEP SCHEMA PROBE ===\n');
  
  // 1. Try OpenAPI
  const openApi = await fetchOpenApiWithKey();
  
  // 2. Probe specific drifted columns on tables that returned 0 rows
  console.log('\n--- Probing app_settings columns ---');
  const appSettingsCandidates = [
    'id', 'current_shift', 'pending_handover', 'last_handover_summary',
    'active_supervisor_name', 'print_labels', 'outgoing_supervisor_email',
    'created_at', 'updated_at'
  ];
  const appSettingsCols = await probeColumnsExistence('app_settings', appSettingsCandidates);
  console.log('app_settings:', JSON.stringify(appSettingsCols, null, 2));
  
  console.log('\n--- Probing machines columns ---');
  const machinesCandidates = [
    'id', 'name', 'model', 'status', 'current_mould_id', 'current_operator_id',
    'active_product_id', 'current_material_id', 'material_grade', 'material_batch',
    'current_bin_number', 'current_shift_production', 'current_day_production',
    'cycle_time', 'cavities', 'bin_target', 'bin_start_time', 'active_batch_id',
    'active_batch_date', 'breakdown_start_time', 'oee', 'availability', 'quality',
    'last_updated', 'last_cleaning_done', 'fai_approved'
  ];
  const machinesCols = await probeColumnsExistence('machines', machinesCandidates);
  console.log('machines:', JSON.stringify(machinesCols, null, 2));
  
  console.log('\n--- Probing products columns ---');
  const productsCandidates = [
    'id', 'name', 'mould_id', 'item_code', 'bin_qty', 'std_pack_size',
    'batch_identifier', 'part_number', 'product_code', 'approved_grades', 'created_at'
  ];
  const productsCols = await probeColumnsExistence('products', productsCandidates);
  console.log('products:', JSON.stringify(productsCols, null, 2));

  console.log('\n--- Probing shift_settings columns ---');
  const shiftCandidates = ['id', 'name', 'start_time', 'end_time', 'created_at'];
  const shiftCols = await probeColumnsExistence('shift_settings', shiftCandidates);
  console.log('shift_settings:', JSON.stringify(shiftCols, null, 2));

  console.log('\n--- Probing defect_types columns ---');
  const defectCandidates = ['id', 'name', 'created_at', 'description', 'is_active'];
  const defectCols = await probeColumnsExistence('defect_types', defectCandidates);
  console.log('defect_types:', JSON.stringify(defectCols, null, 2));

  console.log('\n--- Probing breakdown_reasons columns ---');
  const bdReasonCandidates = ['id', 'name', 'created_at', 'description', 'category'];
  const bdReasonCols = await probeColumnsExistence('breakdown_reasons', bdReasonCandidates);
  console.log('breakdown_reasons:', JSON.stringify(bdReasonCols, null, 2));

  console.log('\n--- Probing cleaning_tasks columns ---');
  const cleaningCandidates = ['id', 'label', 'created_at', 'description', 'order_index'];
  const cleaningCols = await probeColumnsExistence('cleaning_tasks', cleaningCandidates);
  console.log('cleaning_tasks:', JSON.stringify(cleaningCols, null, 2));
  
  console.log('\n--- Probing crates extra columns ---');
  const cratesCandidates = [
    'id', 'batch_id', 'machine_id', 'bin_number', 'start_time', 'end_time',
    'gross_qty', 'startup_scrap', 'qc_sample', 'net_qty', 'rejected_qty',
    'rejection_details', 'operator_id', 'supervisor_id', 'inspected_by',
    'inspected_at', 'mould_id', 'material_batch', 'shift_id', 'status',
    'created_at', 'is_archived', 'qr_code'
  ];
  const cratesCols = await probeColumnsExistence('crates', cratesCandidates);
  console.log('crates:', JSON.stringify(cratesCols, null, 2));

  console.log('\n--- Probing batch_records extra columns ---');
  const batchCandidates = [
    'id', 'machine_id', 'product_id', 'product_name', 'product_code',
    'mould_id', 'material_id', 'material_grade', 'material_batch', 'operator_id',
    'start_time', 'end_time', 'crates', 'total_output', 'status', 'batch_date',
    'created_at', 'shift_id', 'remarks'
  ];
  const batchCols = await probeColumnsExistence('batch_records', batchCandidates);
  console.log('batch_records:', JSON.stringify(batchCols, null, 2));

  console.log('\n--- Probing profiles extra columns ---');
  const profilesCandidates = [
    'id', 'full_name', 'email', 'role', 'employee_code', 'updated_at',
    'created_at', 'avatar_url', 'phone', 'is_active'
  ];
  const profilesCols = await probeColumnsExistence('profiles', profilesCandidates);
  console.log('profiles:', JSON.stringify(profilesCols, null, 2));

  // Save results
  const results = {
    app_settings: appSettingsCols,
    machines: machinesCols,
    products: productsCols,
    shift_settings: shiftCols,
    defect_types: defectCols,
    breakdown_reasons: bdReasonCols,
    cleaning_tasks: cleaningCols,
    crates: cratesCols,
    batch_records: batchCols,
    profiles: profilesCols
  };
  
  fs.writeFileSync('schema_deep_probe.json', JSON.stringify(results, null, 2));
  console.log('\n✅ Deep probe results written to schema_deep_probe.json');
}

main().catch(console.error);
