import { getServiceSupabase } from '../../lib/supabase';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { coachId, squadId, assign } = req.body;
  if (!coachId || !squadId || typeof assign !== 'boolean') {
    return res.status(400).json({ error: 'Missing or invalid parameters' });
  }

  try {
    const supabase = getServiceSupabase();
    
    if (assign) {
      const { error } = await supabase
        .from('coach_squads')
        .upsert({ coach_id: coachId, squad_id: squadId });
      
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('coach_squads')
        .delete()
        .match({ coach_id: coachId, squad_id: squadId });
        
      if (error) throw error;
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Assign Coach Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
