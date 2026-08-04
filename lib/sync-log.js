import { getServiceSupabase } from './supabase';

/**
 * Records one row per logical sync run in sync_runs.
 *
 * Logging must never break the sync it is describing, so every failure here is
 * swallowed and warned about — a missing log row is worth far less than a
 * completed sync.
 */

export async function recordSyncRun({ job, status, triggeredBy = null, startedAt = null, summary = null, error = null }) {
  try {
    const supabase = getServiceSupabase();
    const finishedAt = new Date();
    const started = startedAt ? new Date(startedAt) : null;

    const { error: insertError } = await supabase.from('sync_runs').insert({
      job,
      status,
      triggered_by: triggeredBy,
      started_at: started ? started.toISOString() : null,
      finished_at: finishedAt.toISOString(),
      duration_ms: started ? finishedAt.getTime() - started.getTime() : null,
      summary,
      error: error ? String(error).slice(0, 2000) : null,
    });

    if (insertError) {
      // Table missing (Postgres 42P01 / PostgREST PGRST205): schema not applied.
      if (insertError.code === '42P01' || insertError.code === 'PGRST205' || /find the table/i.test(insertError.message || '')) {
        console.warn('sync_runs table not found — apply sync_runs_schema.sql to enable sync history.');
      } else {
        console.warn('Could not record sync run:', insertError.message);
      }
    }
  } catch (err) {
    console.warn('Could not record sync run:', err.message);
  }
}

/** Derives status from a summary without callers repeating the rules. */
export function statusFromSummary({ errored = 0, skipped = 0, failedBatches = 0 } = {}) {
  if (errored > 0 || failedBatches > 0) return 'partial';
  if (skipped > 0) return 'partial';
  return 'success';
}
