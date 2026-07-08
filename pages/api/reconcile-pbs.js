import { getServiceSupabase } from '../../lib/supabase';
import { reconcilePbs } from '../../lib/reconcile-pbs';
import { requireAuth } from '../../lib/api-auth';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!await requireAuth(req, res)) return;

  try {
    const supabase = getServiceSupabase();
    const updatedCount = await reconcilePbs(supabase);
    return res.status(200).json({ success: true, updatedCount });
  } catch (err) {
    console.error(">>> PB RECONCILER: Unexpected error:", err);
    return res.status(500).json({ error: err.message });
  }
}
