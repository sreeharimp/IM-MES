/**
 * Schema Inspector — queries live Supabase for the actual column-level schema
 * of all public tables, RLS policies, and constraints.
 * Uses the PostgREST OpenAPI + information_schema via rpc fallback.
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
const supabase = createClient(supabaseUrl, supabaseKey);

// --- 1. Fetch OpenAPI spec (describes all columns PostgREST can see) ---
async function fetchOpenApiSpec() {
  const res = await fetch(`${supabaseUrl}/rest/v1/`, {
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Accept': 'application/openapi+json'
    }
  });
  if (!res.ok) throw new Error(`OpenAPI fetch failed: ${res.status}`);
  return res.json();
}

// --- 2. Try querying information_schema.columns directly ---
async function fetchColumnsViaPostgREST() {
  // PostgREST can expose information_schema if configured; try it
  const res = await fetch(`${supabaseUrl}/rest/v1/`, {
    headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
  });
  return res.ok;
}

// --- 3. Probe each known table for its actual columns + data types ---
const KNOWN_TABLES = [
  'machines', 'profiles', 'authorized_supervisors', 'products', 'moulds',
  'operators', 'raw_materials', 'approved_materials', 'batch_records',
  'breakdown_records', 'crates', 'app_settings', 'shift_settings',
  'shift_summaries', 'activity_logs', 'defect_types', 'breakdown_reasons',
  'cleaning_tasks'
];

async function probeTable(tableName) {
  // Fetch a single row to see actual columns returned
  const { data, error } = await supabase.from(tableName).select('*').limit(1);
  if (error) return { table: tableName, error: error.message, columns: [] };
  
  // If we got data, look at keys. If empty, try with explicit select
  const row = data?.[0];
  const columns = row ? Object.keys(row) : [];
  
  // Also check HEAD request to get PostgREST column info from Prefer header
  const headRes = await fetch(`${supabaseUrl}/rest/v1/${tableName}?limit=0`, {
    method: 'GET',
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Accept': 'application/json',
      'Prefer': 'count=exact'
    }
  });
  
  const count = headRes.headers.get('content-range');
  
  return { table: tableName, columns, sampleRow: row, rowCount: count, error: null };
}

async function getPendingCratesCount() {
  const { count, error } = await supabase
    .from('crates')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'Pending Inspection');
  return { count, error };
}

async function getAllCratesCount() {
  const { count, error } = await supabase
    .from('crates')
    .select('*', { count: 'exact', head: true });
  return { count, error };
}

async function getOldestPendingCrates() {
  // Get beyond-1000 crates (i.e. check if any exist with range 1000+)
  const { data: oldest } = await supabase
    .from('crates')
    .select('id, end_time, machine_id')
    .eq('status', 'Pending Inspection')
    .order('end_time', { ascending: true })
    .limit(10);
  
  const { data: newest } = await supabase
    .from('crates')
    .select('id, end_time, machine_id')
    .eq('status', 'Pending Inspection')
    .order('end_time', { ascending: false })
    .limit(10);

  return { oldest, newest };
}

// Probe specific drifted columns
async function probeDriftedColumns() {
  const results = {};
  
  // app_settings
  const { data: appData } = await supabase.from('app_settings').select('*').eq('id', 'global').maybeSingle();
  results.app_settings = appData ? Object.keys(appData) : [];
  results.app_settings_sample = appData;
  
  // machines - check a row
  const { data: machData } = await supabase.from('machines').select('*').limit(1).maybeSingle();
  results.machines = machData ? Object.keys(machData) : [];
  
  // products - check a row
  const { data: prodData } = await supabase.from('products').select('*').limit(1).maybeSingle();
  results.products = prodData ? Object.keys(prodData) : [];
  
  return results;
}

// Fetch OpenAPI spec and extract column info
async function extractFromOpenApi() {
  try {
    const spec = await fetchOpenApiSpec();
    const tables = {};
    
    if (spec.definitions) {
      for (const [name, def] of Object.entries(spec.definitions)) {
        if (def.properties) {
          tables[name] = Object.entries(def.properties).map(([col, info]) => ({
            column: col,
            type: info.type || info.format || (info.$ref ? '$ref' : 'unknown'),
            format: info.format,
            description: info.description,
            required: (def.required || []).includes(col)
          }));
        }
      }
    }
    return tables;
  } catch (e) {
    return { error: e.message };
  }
}

async function main() {
  console.log('=== SCHEMA INSPECTOR ===\n');
  
  // 1. OpenAPI spec
  console.log('Fetching OpenAPI spec...');
  const openApiTables = await extractFromOpenApi();
  
  // 2. Probe each table  
  console.log('Probing tables...');
  const tableProbes = {};
  for (const t of KNOWN_TABLES) {
    tableProbes[t] = await probeTable(t);
    console.log(`  ${t}: ${tableProbes[t].columns.length} columns visible, error=${tableProbes[t].error}`);
  }
  
  // 3. Probe drifted columns specifically
  console.log('\nProbing drifted columns...');
  const driftedCols = await probeDriftedColumns();
  
  // 4. Crate counts
  console.log('\nChecking crate counts...');
  const pendingCount = await getPendingCratesCount();
  const allCount = await getAllCratesCount();
  const crateTimestamps = await getOldestPendingCrates();
  
  // Write full results to JSON
  const results = {
    timestamp: new Date().toISOString(),
    openApiTables,
    tableProbes,
    driftedColumns: driftedCols,
    crateStats: {
      totalCrates: allCount,
      pendingInspection: pendingCount,
      oldest10Pending: crateTimestamps.oldest,
      newest10Pending: crateTimestamps.newest
    }
  };
  
  fs.writeFileSync('schema_inspect_results.json', JSON.stringify(results, null, 2));
  console.log('\n✅ Full results written to schema_inspect_results.json');
  
  // Print human-readable summary
  console.log('\n=== DRIFTED COLUMN ANALYSIS ===');
  console.log('\n[app_settings] columns:', driftedCols.app_settings.join(', '));
  console.log('[machines] columns:', driftedCols.machines.join(', '));
  console.log('[products] columns:', driftedCols.products.join(', '));
  
  console.log('\n=== CRATE STATS ===');
  console.log(`Total crates in DB: ${allCount.count}`);
  console.log(`Pending Inspection: ${pendingCount.count}`);
  console.log(`Crates beyond top-1000 (invisible to UI): ${Math.max(0, pendingCount.count - 1000)}`);
  
  if (crateTimestamps.oldest) {
    console.log('\nOldest 10 pending crates (currently invisible in Inspections tab):');
    crateTimestamps.oldest.forEach(c => console.log(`  ${c.id} | ${c.end_time} | ${c.machine_id}`));
  }
  
  // OpenAPI table summary
  console.log('\n=== OPENAPI COLUMN COUNTS ===');
  if (!openApiTables.error) {
    for (const [t, cols] of Object.entries(openApiTables)) {
      if (Array.isArray(cols)) console.log(`  ${t}: ${cols.length} cols → ${cols.map(c => c.column).join(', ')}`);
    }
  } else {
    console.log('OpenAPI error:', openApiTables.error);
  }
}

main().catch(console.error);
