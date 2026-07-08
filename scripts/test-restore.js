// Restores the DB from a backup produced by test-backup.js.
//   node scripts/test-restore.js            -> restore newest backup
//   node scripts/test-restore.js <file>     -> restore specific file
// Deletes all rows in each backed-up table (children first) then re-inserts
// the dumped rows (parents first), preserving original IDs.
const fs = require('fs');
const { getServiceClient } = require('../tests/helpers/supabase');
const { TABLES, latestBackup } = require('./backup-common');

// Live DB has schema drift: some junction tables lack an `id` column.
const WIPE_KEY = { issue_upvotes: 'issue_id', coach_squads: 'coach_id' };

async function wipeTable(supabase, table) {
  const key = WIPE_KEY[table] || 'id';
  const { error } = await supabase.from(table).delete().not(key, 'is', null);
  if (error) throw new Error(`wipe ${table}: ${error.message}`);
}

async function insertRows(supabase, table, rows) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from(table).insert(rows.slice(i, i + 500));
    if (error) throw new Error(`insert ${table} (batch ${i / 500}): ${error.message}`);
  }
}

async function main() {
  const file = process.argv[2] || latestBackup();
  if (!file || !fs.existsSync(file)) {
    console.error('No backup file found. Run: node scripts/test-backup.js');
    process.exit(1);
  }
  console.log(`Restoring from ${file}`);
  const dump = JSON.parse(fs.readFileSync(file, 'utf8'));
  const supabase = getServiceClient();

  for (const table of [...TABLES].reverse()) {
    await wipeTable(supabase, table);
    console.log(`wiped ${table}`);
  }
  for (const table of TABLES) {
    const rows = dump.tables[table] || [];
    await insertRows(supabase, table, rows);
    console.log(`restored ${table}: ${rows.length} rows`);
  }
  console.log('Restore complete.');
}

main().catch(err => { console.error(err.message); process.exit(1); });
