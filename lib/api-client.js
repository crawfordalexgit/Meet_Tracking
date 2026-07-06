import { supabase } from './supabase';

/**
 * Returns the current user's Supabase access token, or null if signed out.
 */
export async function getAccessToken() {
  if (!supabase) return null;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || null;
  } catch {
    return null;
  }
}

/**
 * fetch() wrapper that attaches the signed-in user's bearer token so protected
 * API routes (requireAuth / requireAdminAuth) accept the request. Preserves any
 * caller-supplied headers and leaves the body untouched (works with FormData).
 */
export async function authedFetch(url, options = {}) {
  const token = await getAccessToken();
  const headers = { ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(url, { ...options, headers });
}
