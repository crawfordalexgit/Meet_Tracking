const path = require('path');

// Parents first — restore inserts in this order, deletes in reverse.
const TABLES = [
  'squads',
  'sessions',
  'meets',
  'swimmers',
  'coach_squads',
  'results',
  'swimmer_pbs',
  'training_attendance',
  'session_memberships',
  'rankings',
  'club_exemptions',
  'user_issues',
  'issue_upvotes',
];

const BACKUP_DIR = path.join(__dirname, '..', 'tests', '.backups');

const fs = require('fs');
function latestBackup() {
  if (!fs.existsSync(BACKUP_DIR)) return null;
  const files = fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith('backup-') && f.endsWith('.json')).sort();
  if (files.length === 0) return null;
  return path.join(BACKUP_DIR, files[files.length - 1]);
}

module.exports = { TABLES, BACKUP_DIR, latestBackup };
