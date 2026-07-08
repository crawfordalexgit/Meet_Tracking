// Creates (or refreshes) two password-auth test users via the service role key:
//   - TEST_USER_EMAIL / TEST_USER_PASSWORD           -> role 'admin'
//   - TEST_COACH_EMAIL / TEST_COACH_PASSWORD         -> role 'coach' (no squads)
// Idempotent: safe to re-run. Run with: node scripts/create-test-user.js
const { requireEnv } = require('../tests/helpers/env');
const { getServiceClient } = require('../tests/helpers/supabase');

async function ensureUser(supabase, email, password, role) {
  // Look for an existing auth user with this email
  let userId = null;
  for (let page = 1; page <= 20 && !userId; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    const found = data.users.find(u => u.email === email);
    if (found) userId = found.id;
    if (data.users.length < 200) break;
  }

  if (userId) {
    const { error } = await supabase.auth.admin.updateUserById(userId, { password, email_confirm: true });
    if (error) throw new Error(`updateUser(${email}): ${error.message}`);
    console.log(`Refreshed existing user ${email}`);
  } else {
    const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw new Error(`createUser(${email}): ${error.message}`);
    userId = data.user.id;
    console.log(`Created user ${email}`);
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .upsert({ id: userId, email, role }, { onConflict: 'id' });
  if (profileError) throw new Error(`profiles upsert(${email}): ${profileError.message}`);
  console.log(`  profile role = ${role}`);
  return userId;
}

async function main() {
  const supabase = getServiceClient();
  await ensureUser(supabase, requireEnv('TEST_USER_EMAIL'), requireEnv('TEST_USER_PASSWORD'), 'admin');
  await ensureUser(supabase, requireEnv('TEST_COACH_EMAIL'), requireEnv('TEST_COACH_PASSWORD'), 'coach');
  console.log('Test users ready.');
}

main().catch(err => { console.error(err.message); process.exit(1); });
