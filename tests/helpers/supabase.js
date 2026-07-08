const { requireEnv } = require('./env');
const { createClient } = require('@supabase/supabase-js');

let serviceClient = null;
let anonClient = null;

// Service-role client — bypasses RLS. Use for integrity queries, seeding, cleanup.
function getServiceClient() {
  if (!serviceClient) {
    serviceClient = createClient(
      requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
      requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { persistSession: false } }
    );
  }
  return serviceClient;
}

// Anon client — respects RLS, same as the browser.
function getAnonClient() {
  if (!anonClient) {
    anonClient = createClient(
      requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
      requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
      { auth: { persistSession: false } }
    );
  }
  return anonClient;
}

// Fetch every row of a table in 1000-row pages (mirrors lib/paginate.js behaviour).
async function fetchAll(client, table, select = '*', filter = null) {
  const rows = [];
  for (let page = 0; page < 100; page++) {
    let q = client.from(table).select(select).range(page * 1000, (page + 1) * 1000 - 1);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw new Error(`fetchAll(${table}): ${error.message}`);
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows;
}

module.exports = { getServiceClient, getAnonClient, fetchAll };
