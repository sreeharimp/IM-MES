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

async function fixBatchRecords() {
  console.log("Fetching all batch records...");
  const { data: batches, error: batchError } = await supabase.from('batch_records').select('*');
  
  if (batchError) {
    console.error("Error fetching batches:", batchError);
    return;
  }

  console.log(`Found ${batches.length} batches. Checking against crates...`);

  let fixCount = 0;

  for (const batch of batches) {
    const { data: crates, error: cratesError } = await supabase
      .from('crates')
      .select('net_qty')
      .eq('batch_id', batch.id);

    if (cratesError) {
      console.error(`Error fetching crates for batch ${batch.id}:`, cratesError);
      continue;
    }

    const actualCrateCount = crates.length;
    const actualTotalOutput = crates.reduce((sum, crate) => sum + (crate.net_qty || 0), 0);

    if (actualCrateCount !== batch.crates || actualTotalOutput !== batch.total_output) {
      console.log(`\nBatch: ${batch.id}`);
      console.log(`  Expected Crates: ${batch.crates} -> Actual: ${actualCrateCount}`);
      console.log(`  Expected Output: ${batch.total_output} -> Actual: ${actualTotalOutput}`);
      
      const { error: updateError } = await supabase
        .from('batch_records')
        .update({
          crates: actualCrateCount,
          total_output: actualTotalOutput
        })
        .eq('id', batch.id);
        
      if (updateError) {
        console.error("  Failed to update:", updateError);
      } else {
        console.log("  Successfully synced!");
        fixCount++;
      }
    }
  }

  console.log(`\nDone. Fixed ${fixCount} batch records.`);
}

fixBatchRecords();
