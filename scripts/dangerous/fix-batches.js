/**
 * scripts/dangerous/fix-batches.js
 *
 * ⚠️  DESTRUCTIVE / MUTATING: Recalculates batch_records crates and total_output from actual crates table rows.
 *
 * SAFETY GATES (both required to actually run):
 *   --dry-run (default)    Print what WOULD be updated. Does not modify the DB.
 *   --execute              Actually run the updates.
 *
 * PRODUCTION GUARD:
 *   Refuses to run against a remote database without --confirm-production.
 *
 * Usage:
 *   node scripts/dangerous/fix-batches.js               # Dry-run (safe, default)
 *   node scripts/dangerous/fix-batches.js --execute --confirm-production     # Apply fixes
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const isDryRun          = !args.includes('--execute');
const confirmProduction = args.includes('--confirm-production');

const envPath = path.resolve(process.cwd(), '.env');
if (!fs.existsSync(envPath)) {
  console.error('❌ .env file not found.');
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

let isProduction = false;
try {
  const parsedUrl = new URL(supabaseUrl);
  isProduction = !parsedUrl.hostname.includes('localhost') && !parsedUrl.hostname.includes('127.0.0.1');
} catch (e) {
  isProduction = true;
}

if (isProduction && !confirmProduction) {
  console.error('\n🔴 REMOTE / PRODUCTION DATABASE DETECTED');
  console.error('   Pass --confirm-production to run on production.\n');
  process.exit(1);
}

console.log(`\n═══════════════════════════════════════════════════`);
console.log(`  ${isDryRun ? '🔍 DRY-RUN MODE' : '⚠️  EXECUTE MODE'} — Syncing batch records`);
console.log(`  Database: ${supabaseUrl}`);
console.log(`═══════════════════════════════════════════════════\n`);

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixBatchRecords() {
  const { data: batches, error: batchError } = await supabase.from('batch_records').select('*');
  if (batchError) {
    console.error('Error fetching batches:', batchError.message);
    return;
  }

  console.log(`Checking ${batches.length} batch records...`);
  let fixCount = 0;

  for (const batch of batches) {
    const { data: crates, error: cratesError } = await supabase
      .from('crates')
      .select('net_qty')
      .eq('batch_id', batch.id);

    if (cratesError) continue;

    const actualCrateCount = crates.length;
    const actualTotalOutput = crates.reduce((sum, crate) => sum + (crate.net_qty || 0), 0);

    if (actualCrateCount !== batch.crates || actualTotalOutput !== batch.total_output) {
      console.log(`Batch ${batch.id}:`);
      console.log(`  Crates: ${batch.crates} -> ${actualCrateCount}`);
      console.log(`  Output: ${batch.total_output} -> ${actualTotalOutput}`);
      
      if (!isDryRun) {
        const { error: updateError } = await supabase
          .from('batch_records')
          .update({ crates: actualCrateCount, total_output: actualTotalOutput })
          .eq('id', batch.id);
        if (updateError) console.error('  Failed:', updateError.message);
        else console.log('  Updated successfully.');
      }
      fixCount++;
    }
  }

  console.log(`\nSummary: ${fixCount} batch records ${isDryRun ? 'need fixing' : 'fixed'}.`);
}

fixBatchRecords().catch(console.error);
