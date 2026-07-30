import { timeToSeconds, normalizeEvent } from './analytics-utils';
import { fetchAllRows } from './paginate';

// Recomputes is_pb flags across the whole results table.
// Throws on any Supabase error; returns the number of rows processed.
export async function reconcilePbs(supabase) {
  // Paginated: a plain .select() is capped at 1000 rows by PostgREST, so with a
  // few thousand results most of the table was never examined and is_pb was
  // wrong for every row past the cap.
  const data = await fetchAllRows(supabase, 'results', {
    select: '*, meets!inner(date)',
    filter: q => q.order('date', { foreignTable: 'meets', ascending: true }),
  });

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

    // normalizeEvent so that "50m Freestyle" and "50 Free" from different
    // scrape sources are one event, not two each with their own PB.
    const key = `${r.swimmer_id}_${normalizeEvent(r.event)}_${r.course}`;
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
      throw new Error(upsertError.message);
    }
  }

  console.log(`>>> PB RECONCILER: Successfully reconciled ${updates.length} results.`);
  return updates.length;
}
