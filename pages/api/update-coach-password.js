import { getServiceSupabase } from '../../lib/supabase';
import { requireAdminAuth } from '../../lib/api-auth';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!await requireAdminAuth(req, res)) return;

  const { coachId, newPassword } = req.body;
  
  if (!coachId || !newPassword) {
    return res.status(400).json({ error: 'Missing coachId or newPassword' });
  }

  try {
    const supabase = getServiceSupabase();

    const { data: targetProfile } = await supabase.from('profiles').select('role').eq('id', coachId).single();
    if (!targetProfile || targetProfile.role !== 'coach') {
      return res.status(403).json({ error: 'Cannot modify this user' });
    }

    const { data, error } = await supabase.auth.admin.updateUserById(coachId, {
      password: newPassword
    });
    
    if (error) throw error;
    
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Update Coach Password Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
