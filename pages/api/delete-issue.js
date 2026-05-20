import { getServiceSupabase } from '../../lib/supabase';

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { issueId, userId } = req.body;
  if (!issueId || !userId) {
    return res.status(400).json({ error: 'Missing required parameters: issueId or userId' });
  }

  try {
    const supabase = getServiceSupabase();

    // Security Check: Verify user role is admin or headcoach
    if (userId !== 'local-dev-user') {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single();

      if (profileError || !profile || !['admin', 'headcoach'].includes(profile.role)) {
        return res.status(403).json({ error: 'Unauthorized: Only admins or head coaches can delete issues.' });
      }
    }

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
