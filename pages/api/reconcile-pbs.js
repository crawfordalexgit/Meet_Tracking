import { getServiceSupabase } from '../../lib/supabase';
import { timeToSeconds } from '../../lib/analytics-utils';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = getServiceSupabase();

    // Fetch all rows from the results table, joining meets!inner(date)
    const { data, error } = await supabase
      .from('results')
      .select('*, meets!inner(date)')
      .order('date', { foreignTable: 'meets', ascending: true });

    if (error) {
      console.error(">>> PB RECONCILER: Fetch error:", error);
      return res.status(500).json({ error: error.message });
    }

    // Secondary sorting in JavaScript to guarantee chronological order
    const sortedResults = [...(data || [])].sort((a, b) => {
      const dateA = a.meets?.date ? new Date(a.meets.date).getTime() : 0;
      const dateB = b.meets?.date ? new Date(b.meets.date).getTime() : 0;
      return dateA - dateB;
    });

    const bests = {};
    const updates = [];

    for (const r of sortedResults) {
      const seconds = timeToSeconds(r.time);
      
      // Clone row and delete the joined 'meets' object to avoid upsert schema errors
      const updateRow = { ...r };
      delete updateRow.meets;

      if (seconds <= 0) {
        updateRow.is_pb = false;
        updates.push(updateRow);
        continue;
      }

      const key = `${r.swimmer_id}_${r.event}_${r.course}`;
      if (!(key in bests) || seconds < bests[key]) {
        bests[key] = seconds;
        updateRow.is_pb = true;
      } else {
        updateRow.is_pb = false;
      }
      updates.push(updateRow);
    }

    console.log(`>>> PB RECONCILER: Processing updates for ${updates.length} records...`);

    // Update results table in batches of 500 using upsert
    const batchSize = 500;
    for (let i = 0; i < updates.length; i += batchSize) {
      const batch = updates.slice(i, i + batchSize);
      const { error: upsertError } = await supabase
        .from('results')
        .upsert(batch);

      if (upsertError) {
        console.error(`>>> PB RECONCILER: Batch error starting at index ${i}:`, upsertError);
        return res.status(500).json({ error: upsertError.message });
      }
    }

    console.log(`>>> PB RECONCILER: Successfully reconciled ${updates.length} results.`);
    return res.status(200).json({ success: true, updatedCount: updates.length });
  } catch (err) {
    console.error(">>> PB RECONCILER: Unexpected error:", err);
    return res.status(500).json({ error: err.message });
  }
}
