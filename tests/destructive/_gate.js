// Safety gate for the destructive suite: refuses to run unless a DB backup
// newer than 24 hours exists (produced by scripts/test-backup.js).
const fs = require('fs');
const { latestBackup } = require('../../scripts/backup-common');

function assertFreshBackup() {
  const file = latestBackup();
  if (!file) {
    throw new Error('DESTRUCTIVE GATE: no backup found. Run `npm run test:backup` first.');
  }
  const ageHours = (Date.now() - fs.statSync(file).mtimeMs) / 3600000;
  if (ageHours > 24) {
    throw new Error(`DESTRUCTIVE GATE: newest backup is ${ageHours.toFixed(1)}h old (>24h). Run \`npm run test:backup\` again.`);
  }
  return file;
}

module.exports = { assertFreshBackup };
