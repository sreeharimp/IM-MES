/**
 * scripts/dangerous/wipe-data.js
 * 
 * ⚠️  DESTRUCTIVE: Deletes ALL production data and resets machine states.
 *
 * SAFETY GATES (both required to actually run):
 *   --dry-run (default)    Print what WOULD be deleted. Does not modify the DB.
 *   --execute              Actually run the deletions (requires --dry-run to be omitted).
 *
 * PRODUCTION GUARD:
 *   By default this script REFUSES to run against a remote Supabase project.
 *   Pass --confirm-production to override this guard (use with extreme caution).
 *
 * Usage:
 *   node scripts/dangerous/wipe-data.js               # Dry-run (safe, default)
 *   node scripts/dangerous/wipe-data.js --execute     # Actually wipes data (dev/staging only)
 *   node scripts/dangerous/wipe-data.js --execute --confirm-production   # Forced prod wipe
 *
 * Run from project root: node scripts/dangerous/wipe-data.js
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// ── Parse flags ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const isDryRun          = !args.includes('--execute');
const confirmProduction = args.includes('--confirm-production');

// ── Load .env from project root ───────────────────────────────────────────────
const envPath = path.resolve(process.cwd(), '.env');
if (!fs.existsSync(envPath)) {
  console.error('❌ .env file not found. Run this script from the project root.');
  process.exit(1);
}
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
});

const supabaseUrl = env['VITE_SUPABASE_URL'];
const supabaseKey = env['VITE_SUPABASE_ANON_KEY'];

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env');
  process.exit(1);
}

// ── Dynamic Production Guard ──────────────────────────────────────────────────
// Extract project ref dynamically from VITE_SUPABASE_URL host
let isProduction = false;
try {
  const parsedUrl = new URL(supabaseUrl);
  // Remote supabase.co or non-localhost domain is treated as remote production
  isProduction = !parsedUrl.hostname.includes('localhost') && !parsedUrl.hostname.includes('127.0.0.1');
} catch (e) {
  isProduction = true;
}

if (isProduction && !confirmProduction) {
  console.error('');
  console.error('🔴 REMOTE / PRODUCTION DATABASE DETECTED');
  console.error(`   Target URL: ${supabaseUrl}`);
  console.error('');
  console.error('   This script is targeted at a remote database.');
  console.error('   To proceed, you must explicitly pass --confirm-production.');
  console.error('');
  console.error('   Example (dry-run mode):');
  console.error('     node scripts/dangerous/wipe-data.js --confirm-production');
  console.error('');
  console.error('   Example (ACTUAL wipe - IRREVERSIBLE):');
  console.error('     node scripts/dangerous/wipe-data.js --execute --confirm-production');
  console.error('');
  process.exit(1);
}

// ── Mode banner ───────────────────────────────────────────────────────────────
console.log('');
console.log('═══════════════════════════════════════════════════');
if (isDryRun) {
  console.log('  🔍 DRY-RUN MODE — No data will be modified');
} else {
  console.log('  ⚠️  EXECUTE MODE — Data WILL be permanently deleted');
}
console.log(`  Database: ${supabaseUrl}`);
console.log(`  Environment: ${isProduction ? '🔴 REMOTE PRODUCTION' : '🟢 LOCAL'}`);
console.log('═══════════════════════════════════════════════════');
console.log('');

if (!isDryRun && isProduction) {
  console.log('Proceeding in 3 seconds... (Ctrl+C to abort)');
  await new Promise(resolve => setTimeout(resolve, 3000));
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ── Count rows before deletion ────────────────────────────────────────────────
async function countTable(table) {
  const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
  return error ? `ERROR: ${error.message}` : count;
}

async function main() {
  console.log('Counting rows that would be affected:');
  const counts = {
    crates:            await countTable('crates'),
    batch_records:     await countTable('batch_records'),
    breakdown_records: await countTable('breakdown_records'),
    shift_summaries:   await countTable('shift_summaries'),
    activity_logs:     await countTable('activity_logs'),
  };

  console.log(`  crates:            ${counts.crates} rows`);
  console.log(`  batch_records:     ${counts.batch_records} rows`);
  console.log(`  breakdown_records: ${counts.breakdown_records} rows`);
  console.log(`  shift_summaries:   ${counts.shift_summaries} rows`);
  console.log(`  activity_logs:     ${counts.activity_logs} rows`);
  console.log(`  machines:          ALL rows will have state reset to Idle`);
  console.log(`  app_settings:      pending_handover, active_supervisor_name will be cleared`);
  console.log('');

  if (isDryRun) {
    console.log('✅ Dry-run complete. No changes made.');
    console.log('   To execute: node scripts/dangerous/wipe-data.js --execute --confirm-production');
    return;
  }

  // ── ACTUAL DELETION ──────────────────────────────────────────────────────
  console.log('🗑️  Deleting all crates...');
  const { error: e1 } = await supabase.from('crates').delete().neq('id', 'dummy');
  if (e1) console.error('   ERROR:', e1.message); else console.log('   ✅ Done');

  console.log('🗑️  Deleting all batch records...');
  const { error: e2 } = await supabase.from('batch_records').delete().neq('id', 'dummy');
  if (e2) console.error('   ERROR:', e2.message); else console.log('   ✅ Done');

  console.log('🗑️  Deleting all breakdown records...');
  const { error: e3 } = await supabase.from('breakdown_records').delete().neq('id', 'dummy');
  if (e3) console.error('   ERROR:', e3.message); else console.log('   ✅ Done');

  console.log('🗑️  Deleting all shift summaries...');
  const { error: e4 } = await supabase.from('shift_summaries').delete().neq('id', 'dummy');
  if (e4) console.error('   ERROR:', e4.message); else console.log('   ✅ Done');

  console.log('🗑️  Deleting all activity logs...');
  const { error: e5 } = await supabase.from('activity_logs').delete().neq('id', 'dummy');
  if (e5) console.error('   ERROR:', e5.message); else console.log('   ✅ Done');

  console.log('🔄 Resetting machine states to Idle...');
  const { error: e6 } = await supabase.from('machines').update({
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
    quality: 0,
    last_cleaning_done: null,
    fai_approved: null
  }).neq('id', 'dummy');
  if (e6) console.error('   ERROR:', e6.message); else console.log('   ✅ Done');

  console.log('🔄 Resetting app settings...');
  const { error: e7 } = await supabase.from('app_settings').update({
    pending_handover: false,
    active_supervisor_name: null,
    last_handover_summary: null
  }).eq('id', 'global');
  if (e7) console.error('   ERROR:', e7.message); else console.log('   ✅ Done');

  console.log('\n✅ Wipe complete. Database is in a clean initial state.');
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
