import { getServiceSupabase } from '../../lib/supabase';
import { requireAuth } from '../../lib/api-auth';

/**
 * Lists the swimmers a scheduled sync should page through.
 *
 * Exists so the external scheduler needs no database credentials — it holds
 * CRON_SECRET only, and the service-role key stays on the server.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const isCron = !!process.env.CRON_SECRET && req.headers.authorization === `Bearer ${process.env.CRON_SECRET}`;
  if (!isCron) {
    if (!await requireAuth(req, res)) return;
  }

  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from('swimmers')
      .select('id')
      .not('scm_numeric_id', 'is', null)
      .order('id');
    if (error) throw error;

    return res.status(200).json({ swimmerIds: (data || []).map(s => s.id) });
  } catch (err) {
    console.error('SYNC TARGETS ERROR:', err);
    return res.status(500).json({ error: err.message });
  }
}
