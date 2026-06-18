import { getServiceSupabase } from '../../lib/supabase';
import { requireAdminAuth } from '../../lib/api-auth';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!await requireAdminAuth(req, res)) return;

  const { coachId } = req.body;
  
  if (!coachId) {
    return res.status(400).json({ error: 'Missing coachId' });
  }

  try {
    const supabase = getServiceSupabase();

    const { data: targetProfile } = await supabase.from('profiles').select('role').eq('id', coachId).single();
    if (!targetProfile || targetProfile.role !== 'coach') {
      return res.status(403).json({ error: 'Cannot delete this user' });
    }

    // Detach coach from any AI feedback records to prevent foreign key constraint violations
    // (The schema.sql defines this without ON DELETE CASCADE or SET NULL)
    const { error: detachError } = await supabase
      .from('swimmer_ai_feedback')
      .update({ coach_id: null })
      .eq('coach_id', coachId);
      
    if (detachError) {
      console.warn('Could not detach coach from feedback:', detachError);
    }
    
    // Explicitly delete from the profiles table first to ensure they are removed from the frontend queries
    // This is a failsafe in case the ON DELETE CASCADE constraint is missing in the actual database schema
    const { error: profileError } = await supabase.from('profiles').delete().eq('id', coachId);
    
    if (profileError) {
      console.error('Explicit profile deletion warning:', profileError);
    }
    
    // Delete from Supabase Auth
    const { data, error } = await supabase.auth.admin.deleteUser(coachId);
    
    if (error) throw error;
    
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Delete Coach Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
