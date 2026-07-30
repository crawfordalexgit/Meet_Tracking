import { createClient } from '@supabase/supabase-js';
import { getServiceSupabase } from './supabase';

async function getUserFromToken(token) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

export async function requireAuth(req, res) {
  // Anchored and case-insensitive: a bare `.replace('Bearer ', '')` also
  // strips the string mid-token and lets `bearer <tok>` through unparsed.
  const token = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  const user = await getUserFromToken(token);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  return user;
}

export async function requireAdminAuth(req, res) {
  const user = await requireAuth(req, res);
  if (!user) return null;

  const supabase = getServiceSupabase();
  const { data: profile, error } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (error) {
    // Don't report a transient DB failure as "not an admin" — that sends the
    // caller chasing a permissions problem that doesn't exist.
    console.error('requireAdminAuth: profile lookup failed:', error.message);
    res.status(503).json({ error: 'Could not verify permissions, please retry' });
    return null;
  }
  if (!['admin', 'headcoach'].includes(profile?.role)) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  return { user, profile };
}
