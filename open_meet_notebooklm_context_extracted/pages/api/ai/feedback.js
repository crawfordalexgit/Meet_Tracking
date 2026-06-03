import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { swimmerId, coachId, originalInsight, coachCorrection, isPositive } = req.body;

  try {
    const { data, error } = await supabase
      .from('swimmer_ai_feedback')
      .insert([
        {
          swimmer_id: swimmerId,
          coach_id: coachId,
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
