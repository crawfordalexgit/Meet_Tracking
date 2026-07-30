import { getServiceSupabase } from '../../../lib/supabase';
import { requireAuth } from '../../../lib/api-auth';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await requireAuth(req, res);
  if (!user) return;

  const { swimmerId, originalInsight, coachCorrection, isPositive } = req.body;

  try {
    // Lazily constructed so a missing env var surfaces as a request error
    // rather than throwing at module import and breaking the route at boot.
    const supabase = getServiceSupabase();

    const { data, error } = await supabase
      .from('swimmer_ai_feedback')
      .insert([
        {
          swimmer_id: swimmerId,
          // Attributed to the authenticated caller, never a client-supplied id
          // — this row is training data and its audit trail must hold.
          coach_id: user.id,
          original_insight: originalInsight,
          coach_correction: coachCorrection,
          is_positive: isPositive
        }
      ]);

    if (error) throw error;

    return res.status(200).json({ message: 'Feedback saved successfully. This will be used to refine future reports.' });
  } catch (error) {
    console.error("Feedback Save Error:", error);
    return res.status(500).json({ error: error.message });
  }
}
