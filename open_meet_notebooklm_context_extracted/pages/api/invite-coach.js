import { getServiceSupabase } from '../../lib/supabase';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email } = req.body;
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

    return res.status(200).json({ success: true, message: `Invitation sent to ${email}` });
  } catch (error) {
    console.error('Invite Coach Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
