import { getServiceSupabase } from '../../lib/supabase';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { squadId, isSquad, targetMeets } = req.body;
  
  if (!squadId) {
    return res.status(400).json({ error: 'Missing squadId' });
  }

  try {
    const supabase = getServiceSupabase();
    
    const updateData = {};
    if (typeof isSquad === 'boolean') updateData.is_squad = isSquad;
    if (typeof targetMeets === 'number') updateData.target_meets = targetMeets;

    const { data, error } = await supabase
      .from('squads')
      .update(updateData)
      .eq('id', squadId)
      .select();

    if (error) throw error;

    return res.status(200).json({ success: true, squad: data[0] });
  } catch (error) {
    console.error('Update Squad Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
