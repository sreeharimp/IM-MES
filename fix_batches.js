import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://eelyuahpkpiwobchtuxv.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVlbHl1YWhwa3Bpd29iY2h0dXh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3MTA5MjksImV4cCI6MjA5MDI4NjkyOX0.C5aR4VUx2bo0cgocuaDCNZiVdtvcRJk6UnDFdcj1-LA'
);

async function fixBatches() {
  console.log('Fetching batches...');
  const { data: batches, error: bErr } = await supabase.from('batch_records').select('*');
  if (bErr) { console.error(bErr); return; }
  
  if (!batches) return;

  for (const batch of batches) {
    const { data: crates, error: cErr } = await supabase.from('crates').select('net_qty').eq('batch_id', batch.id);
    if (cErr) { console.error(cErr); continue; }
    
    if (crates) {
      const totalOutput = crates.reduce((sum, c) => sum + (c.net_qty || 0), 0);
      const crateCount = crates.length;
      
      if (totalOutput !== batch.total_output || crateCount !== batch.crates) {
        console.log(`Fixing Batch ${batch.id}: crates ${batch.crates} -> ${crateCount}, output ${batch.total_output} -> ${totalOutput}`);
        await supabase.from('batch_records').update({ crates: crateCount, total_output: totalOutput }).eq('id', batch.id);
      }
      
      // Ensure machine is aligned
      const { data: machines } = await supabase.from('machines').select('id, current_bin_number').eq('active_batch_id', batch.id);
      if (machines && machines.length > 0) {
        for (const m of machines) {
          if (m.current_bin_number !== crateCount + 1) {
            console.log(`Fixing Machine ${m.id} bin count: ${m.current_bin_number} -> ${crateCount + 1}`);
            await supabase.from('machines').update({ current_bin_number: crateCount + 1 }).eq('id', m.id);
          }
        }
      }
    }
  }
  console.log('Database sync complete!');
}

fixBatches();
