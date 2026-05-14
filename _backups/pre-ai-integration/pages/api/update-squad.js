import { getServiceSupabase } from '../../lib/supabase';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { 
    squadId, isSquad, targetMeets, targetSessionsPerWeek, targetTrainingPercent, 
    targetHoursPerWeek, requireWeekend, useOrLogic,
    health_weight_reliability, health_weight_progress, health_weight_competition, health_weight_volume 
  } = req.body;
  
  if (!squadId) {
    return res.status(400).json({ error: 'Missing squadId' });
  }

  try {
    const supabase = getServiceSupabase();
    
    const updateData = {};
    if (typeof isSquad === 'boolean') updateData.is_squad = isSquad;
    if (typeof targetMeets === 'number') updateData.target_meets = targetMeets;
    if (typeof targetSessionsPerWeek === 'number') updateData.target_sessions_per_week = targetSessionsPerWeek;
    if (typeof targetTrainingPercent === 'number') updateData.target_training_percent = targetTrainingPercent;
    if (typeof targetHoursPerWeek === 'number') updateData.target_hours_per_week = targetHoursPerWeek;
    if (typeof requireWeekend === 'boolean') updateData.require_weekend = requireWeekend;
    if (typeof useOrLogic === 'boolean') updateData.use_or_logic = useOrLogic;
    if (typeof health_weight_reliability === 'number') updateData.health_weight_reliability = health_weight_reliability;
    if (typeof health_weight_progress === 'number') updateData.health_weight_progress = health_weight_progress;
    if (typeof health_weight_competition === 'number') updateData.health_weight_competition = health_weight_competition;
    if (typeof health_weight_volume === 'number') updateData.health_weight_volume = health_weight_volume;

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
