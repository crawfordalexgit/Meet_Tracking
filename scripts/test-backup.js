// Dumps every table the sync endpoints can mutate to a timestamped JSON file.
// Run before any destructive test pass:  node scripts/test-backup.js
// The destructive suite refuses to run without a backup newer than 24h.
const fs = require('fs');
const path = require('path');
const { getServiceClient, fetchAll } = require('../tests/helpers/supabase');
const { TABLES, BACKUP_DIR } = require('./backup-common');

async function main() {
  const supabase = getServiceClient();
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const dump = { created_at: new Date().toISOString(), tables: {} };
  for (const table of TABLES) {
    const rows = await fetchAll(supabase, table);
    dump.tables[table] = rows;
    console.log(`${table}: ${rows.length} rows`);
  }

  const stamp = dump.created_at.replace(/[:.]/g, '-');
  const file = path.join(BACKUP_DIR, `backup-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify(dump));
  console.log(`\nBackup written: ${file} (${(fs.statSync(file).size / 1024 / 1024).toFixed(1)} MB)`);
}

main().catch(err => { console.error(err.message); process.exit(1); });
