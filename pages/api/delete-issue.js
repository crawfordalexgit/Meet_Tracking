import { getServiceSupabase } from '../../lib/supabase';
import { requireAdminAuth } from '../../lib/api-auth';

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Role is verified from the authenticated session, never from the request body.
  if (!await requireAdminAuth(req, res)) return;

  const { issueId } = req.body;
  if (!issueId) {
    return res.status(400).json({ error: 'Missing required parameter: issueId' });
  }

  try {
    const supabase = getServiceSupabase();

    // Delete the issue (cascades to upvotes due to ON DELETE CASCADE)
    const { error: deleteError } = await supabase
      .from('user_issues')
      .delete()
      .eq('id', issueId);

    if (deleteError) throw deleteError;

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Delete Issue Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
