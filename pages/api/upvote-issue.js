import { getServiceSupabase } from '../../lib/supabase';
import { requireAuth } from '../../lib/api-auth';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await requireAuth(req, res);
  if (!user) return;

  const { issueId } = req.body;
  // Vote is attributed to the authenticated user, not a client-supplied id.
  const userId = user.id;
  if (!issueId) {
    return res.status(400).json({ error: 'Missing required parameter: issueId' });
  }

  try {
    const supabase = getServiceSupabase();
    const isValidUserUUID = true;

    let shouldIncrement = false;

    if (isValidUserUUID) {
      // Attempt to record the upvote to enforce unique constraint
      const { error: upvoteError } = await supabase
        .from('issue_upvotes')
        .insert({ issue_id: issueId, user_id: userId });

      if (!upvoteError) {
        shouldIncrement = true;
      } else {
        // Soft error if already upvoted (duplicate key value violates unique constraint)
        console.warn('Upvote skipped or already exists:', upvoteError.message);
        return res.status(200).json({ success: false, code: 'ALREADY_VOTED', message: 'You have already upvoted this issue.' });
      }
    } else {
      // For local development or non-UUID users, allow the upvote to register directly on the count
      shouldIncrement = true;
    }

    if (shouldIncrement) {
      // Fetch current upvotes count
      const { data: issueData, error: fetchError } = await supabase
        .from('user_issues')
        .select('upvotes')
        .eq('id', issueId)
        .single();

      if (fetchError) throw fetchError;

      // Increment by 1
      const currentUpvotes = issueData?.upvotes || 0;
      const { error: updateError } = await supabase
        .from('user_issues')
        .update({ upvotes: currentUpvotes + 1 })
        .eq('id', issueId);

      if (updateError) throw updateError;
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Upvote Issue Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
