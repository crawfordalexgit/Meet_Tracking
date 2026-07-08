// Signs in the test users once per run and writes:
//   tests/.auth/tokens.json  – bearer tokens for API specs (admin + coach)
//   tests/.auth/state.json   – Playwright storageState with the Supabase session
//                              in localStorage, so e2e specs start authenticated.
const fs = require('fs');
const path = require('path');
const { requireEnv } = require('./helpers/env');
const { createClient } = require('@supabase/supabase-js');

const AUTH_DIR = path.join(__dirname, '.auth');

async function signIn(email, password) {
  const client = createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    { auth: { persistSession: false } }
  );
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Test login failed for ${email}: ${error.message}. Run: node scripts/create-test-user.js`);
  return data.session;
}

module.exports = async () => {
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  const adminSession = await signIn(requireEnv('TEST_USER_EMAIL'), requireEnv('TEST_USER_PASSWORD'));
  const coachSession = await signIn(requireEnv('TEST_COACH_EMAIL'), requireEnv('TEST_COACH_PASSWORD'));

  fs.writeFileSync(
    path.join(AUTH_DIR, 'tokens.json'),
    JSON.stringify({
      admin: { access_token: adminSession.access_token, user_id: adminSession.user.id },
      coach: { access_token: coachSession.access_token, user_id: coachSession.user.id },
    }, null, 2)
  );

  // Replicate what supabase-js persists in the browser: sb-<ref>-auth-token in localStorage.
  const url = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const projectRef = new URL(url).hostname.split('.')[0];
  const baseURL = process.env.TEST_BASE_URL || 'http://localhost:3000';

  const storageState = {
    cookies: [],
    origins: [
      {
        origin: baseURL,
        localStorage: [
          { name: `sb-${projectRef}-auth-token`, value: JSON.stringify(adminSession) },
        ],
      },
    ],
  };
  fs.writeFileSync(path.join(AUTH_DIR, 'state.json'), JSON.stringify(storageState, null, 2));
};
