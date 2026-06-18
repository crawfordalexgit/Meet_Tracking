import { getServiceSupabase } from '../../lib/supabase';
import { requireAdminAuth } from '../../lib/api-auth';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const caller = await requireAdminAuth(req, res);
  if (!caller) return;

  const { email, role } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Missing email address' });
  }

  try {
    const supabase = getServiceSupabase();
    
    // Check if the user already exists in profiles
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email)
      .single();

    if (existingProfile) {
      return res.status(400).json({ error: 'A user with this email already exists.' });
    }

    // Invite the user via Supabase Auth Admin API
    const { data, error } = await supabase.auth.admin.inviteUserByEmail(email);

    if (error) throw error;

    if (role && data?.user?.id) {
      const allowedRoles = caller.profile.role === 'admin'
        ? ['admin', 'headcoach', 'coach']
        : ['coach'];
      if (allowedRoles.includes(role)) {
        await supabase.from('profiles').update({ role }).eq('id', data.user.id);
      } else {
        return res.status(403).json({ error: 'Insufficient permissions to assign this role' });
      }
    }

    return res.status(200).json({ success: true, message: `Invitation sent to ${email}` });
  } catch (error) {
    console.error('Invite Coach Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
