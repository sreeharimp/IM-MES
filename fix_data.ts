import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

// Load .env
const envText = fs.readFileSync('.env', 'utf-8');
const env = Object.fromEntries(envText.split('\n').filter(l => l.includes('=')).map(l => l.split('=')));

const supabaseUrl = env.VITE_SUPABASE_URL.trim();
const supabaseKey = env.VITE_SUPABASE_ANON_KEY.trim();

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixBatchData() {
  const { data: batches } = await supabase.from('batch_records').select('id');
  if (!batches) return;

  for (const b of batches) {
    const { data: crates } = await supabase.from('crates').select('net_qty').eq('batch_id', b.id);
    if (!crates) continue;

    const totalOutput = crates.reduce((acc, c) => acc + (c.net_qty || 0), 0);
    const count = crates.length;

    await supabase.from('batch_records')
      .update({ total_output: totalOutput, crates: count })
      .eq('id', b.id);
    console.log(`Updated batch ${b.id}: ${totalOutput} pcs, ${count} crates`);
  }
}

fixBatchData().then(() => console.log('Done'));
