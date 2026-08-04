/**
 * Scheduled-sync driver.
 *
 * Calls the deployed API in small batches instead of asking it to process the
 * whole club in one request. The heavy syncs log into SCM and scrape a page per
 * swimmer, which cannot finish inside a serverless timeout — that is why this
 * work was disabled in /api/sync-scm and why it needs an external scheduler.
 *
 * No database credentials required: the app already holds them server-side, so
 * this only needs CRON_SECRET to authenticate.
 *
 * Usage:
 *   node scripts/drive-sync.mjs memberships
 *   node scripts/drive-sync.mjs join-dates
 *
 * Env:
 *   APP_URL       e.g. https://www.coacheseye.co.uk   (required)
 *   CRON_SECRET   must match the deployment's value    (required)
 *   BATCH_SIZE    swimmers per request (default 5)
 */

const JOBS = {
  memberships: { path: '/api/sync-session-memberships', label: 'Session memberships' },
  'join-dates': { path: '/api/sync-join-dates', label: 'Join dates' },
};

const job = JOBS[process.argv[2]];
if (!job) {
  console.error(`Usage: node scripts/drive-sync.mjs <${Object.keys(JOBS).join('|')}>`);
  process.exit(1);
}

const APP_URL = (process.env.APP_URL || '').replace(/\/$/, '');
const CRON_SECRET = process.env.CRON_SECRET;
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '5', 10);

if (!APP_URL || !CRON_SECRET) {
  console.error('APP_URL and CRON_SECRET must both be set.');
  process.exit(1);
}

const headers = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${CRON_SECRET}`,
};

/** Swimmer IDs come from the app so this script needs no database access. */
async function fetchSwimmerIds() {
  const res = await fetch(`${APP_URL}/api/sync-targets`, { headers });
  if (!res.ok) {
    throw new Error(`Could not list swimmers (${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
  const { swimmerIds } = await res.json();
  if (!Array.isArray(swimmerIds) || swimmerIds.length === 0) {
    throw new Error('No swimmers with SCM IDs returned — refusing to continue.');
  }
  return swimmerIds;
}

const totals = { processed: 0, updated: 0, skipped: 0, errored: 0 };
let failedBatches = 0;
const startedAt = new Date().toISOString();

const ids = await fetchSwimmerIds();
console.log(`${job.label}: ${ids.length} swimmers, ${Math.ceil(ids.length / BATCH_SIZE)} batches of ${BATCH_SIZE}`);

for (let i = 0; i < ids.length; i += BATCH_SIZE) {
  const batch = ids.slice(i, i + BATCH_SIZE);
  const n = Math.floor(i / BATCH_SIZE) + 1;
  try {
    const res = await fetch(`${APP_URL}${job.path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ swimmerIds: batch }),
    });
    if (!res.ok) {
      console.warn(`  batch ${n}: HTTP ${res.status} ${(await res.text()).slice(0, 150)}`);
      failedBatches++;
      continue;
    }
    const { summary } = await res.json();
    if (summary) for (const k of Object.keys(totals)) totals[k] += summary[k] || 0;
    console.log(`  batch ${n}/${Math.ceil(ids.length / BATCH_SIZE)} ok`, summary || '');
  } catch (err) {
    // One bad batch shouldn't abandon the rest of the club.
    console.warn(`  batch ${n}: ${err.message}`);
    failedBatches++;
  }
}

console.log(`\n${job.label} complete:`, totals, `failedBatches=${failedBatches}`);

// Record the run so the app can show sync health without anyone reading these
// logs. Never let a logging failure fail an otherwise good sync.
try {
  const status = failedBatches > 0 || totals.errored > 0 || totals.skipped > 0 ? 'partial' : 'success';
  const res = await fetch(`${APP_URL}/api/sync-runs`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      job: process.argv[2],
      status,
      startedAt,
      triggeredBy: 'cron',
      summary: { ...totals, failedBatches, swimmers: ids.length },
    }),
  });
  if (!res.ok) console.warn(`  (could not record run: HTTP ${res.status})`);
} catch (err) {
  console.warn(`  (could not record run: ${err.message})`);
}

if (totals.skipped > 0) {
  console.log(`NOTE: ${totals.skipped} swimmer(s) were skipped by the shrink guard — review before re-running.`);
}

// Fail the workflow run (and trigger GitHub's failure email) if a meaningful
// share of batches failed. A single blip is tolerated; a broken scrape is not.
if (failedBatches > Math.ceil(ids.length / BATCH_SIZE) * 0.2) {
  console.error(`Too many failed batches (${failedBatches}) — failing the run.`);
  process.exit(1);
}
