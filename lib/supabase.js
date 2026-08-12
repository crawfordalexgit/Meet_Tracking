import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Ensure we don't crash the build if vars are missing
if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase environment variables are missing. Client initialization skipped.');
}

// Client for frontend (respects RLS)
export const supabase = (supabaseUrl && supabaseAnonKey) 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null;

// Guard against the failure mode where SUPABASE_SERVICE_ROLE_KEY holds the
// publishable/anon key. Everything still looks healthy — the client builds and
// requests return 200 — but the server runs as an anonymous user, so RLS
// silently yields zero rows on reads and rejects every write. That presents as
// an empty database rather than a misconfiguration, so say so loudly.
let serviceKeyChecked = false;
const warnIfNotSecretKey = () => {
  if (serviceKeyChecked) return;
  serviceKeyChecked = true;

  if (supabaseServiceKey === supabaseAnonKey) {
    console.error(
      '[supabase] SUPABASE_SERVICE_ROLE_KEY is identical to NEXT_PUBLIC_SUPABASE_ANON_KEY. ' +
      'Server-side queries will run as an anonymous user: reads return no rows and writes fail with ' +
      '"new row violates row-level security policy". Set it to the project secret key ' +
      '(sb_secret_… or the legacy service_role JWT).'
    );
  } else if (supabaseServiceKey.startsWith('sb_publishable_')) {
    console.error(
      '[supabase] SUPABASE_SERVICE_ROLE_KEY holds a publishable key. It must be the secret key ' +
      '(sb_secret_… or the legacy service_role JWT), or RLS will block all server-side access.'
    );
  }
};

// Client for backend API routes (bypasses RLS for inserting scraped/synced data)
export const getServiceSupabase = () => {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY or URL');
  }
  warnIfNotSecretKey();
  return createClient(supabaseUrl, supabaseServiceKey);
};
