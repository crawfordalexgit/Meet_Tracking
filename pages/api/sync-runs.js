import { getServiceSupabase } from '../../lib/supabase';
import { requireAuth } from '../../lib/api-auth';
import { recordSyncRun } from '../../lib/sync-log';

/**
 * Sync run history.
 *
 * GET  — the most recent runs, newest first, for the Settings health panel.
 * POST — record a completed run. Used by orchestrators that drive a job in
 *        batches (the Actions driver, the Settings buttons), where no single
 *        request represents the run.
 */
export default async function handler(req, res) {
  const isCron = !!process.env.CRON_SECRET && req.headers.authorization === `Bearer ${process.env.CRON_SECRET}`;
  if (!isCron) {
    if (!await requireAuth(req, res)) return;
  }

  if (req.method === 'GET') {
    try {
      const supabase = getServiceSupabase();
      const { data, error } = await supabase
        .from('sync_runs')
        .select('*')
        .order('finished_at', { ascending: false })
        .limit(parseInt(req.query.limit || '50', 10));

      // 42P01 is Postgres's "undefined table"; PGRST205 is PostgREST failing to
      // find it in the schema cache. Either means the migration hasn't run, and
      // the panel should say so rather than show an error.
      if (error) {
        if (error.code === '42P01' || error.code === 'PGRST205' || /find the table/i.test(error.message || '')) {
          return res.status(200).json({ runs: [], schemaMissing: true });
        }
        throw error;
      }
      return res.status(200).json({ runs: data || [] });
    } catch (err) {
      console.error('SYNC RUNS READ ERROR:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'POST') {
    const { job, status, summary, error, startedAt, triggeredBy } = req.body || {};
    if (!job || !status) {
      return res.status(400).json({ error: 'job and status are required' });
    }
    await recordSyncRun({
      job,
      status,
      summary: summary ?? null,
      error: error ?? null,
      startedAt: startedAt ?? null,
      triggeredBy: triggeredBy || (isCron ? 'cron' : 'user'),
    });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
