import { getServiceSupabase } from '../../lib/supabase';
import { fetchScmNumericIds } from '../../lib/scm-scraper';
import { requireAuth } from '../../lib/api-auth';

/**
 * Backfills swimmers.scm_numeric_id from the SCM member directory.
 *
 * This matters more than it looks: every other web sync (session memberships,
 * attendance, join dates, targets) filters on `.not('scm_numeric_id','is',null)`,
 * so a swimmer without one is silently invisible to all of them and stays on
 * zero sessions and zero attendance forever.
 *
 * It lives in its own route because the equivalent block inside /api/sync-scm
 * sits behind `includeWebTasks`, which no caller sets, alongside per-swimmer
 * scraping that genuinely is slow. This is one directory fetch plus an update
 * per unlinked swimmer, so it is cheap enough to run on every sync.
 */
export default async function handler(req, res) {
  // GET is allowed because Vercel cron invokes with GET, matching sync-attendance.
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const isCron = !!process.env.CRON_SECRET && req.headers.authorization === `Bearer ${process.env.CRON_SECRET}`;
  if (!isCron && !await requireAuth(req, res)) return;

  const username = process.env.SCM_WEB_USERNAME;
  const password = process.env.SCM_WEB_PASSWORD;
  if (!username || !password) {
    return res.status(500).json({ error: 'SCM web credentials missing in environment' });
  }

  try {
    const supabase = getServiceSupabase();

    const { data: unlinked, error } = await supabase
      .from('swimmers')
      .select('id, full_name, member_id')
      .is('scm_numeric_id', null);
    if (error) throw error;

    if (!unlinked?.length) {
      return res.status(200).json({ success: true, unlinked: 0, linked: 0, results: [] });
    }

    const mappings = await fetchScmNumericIds(username, password);
    if (!mappings.length) {
      return res.status(502).json({ error: 'SCM returned no member directory entries; nothing was changed.' });
    }

    const byMemberId = new Map();
    const byName = new Map();
    const norm = (s) => (s || '').toLowerCase().replace(/[^a-z]/g, '');
    mappings.forEach(m => {
      if (m.memberId) byMemberId.set(String(m.memberId), m);
      if (m.fullName) {
        const key = norm(m.fullName);
        // Ambiguous names must not be linked by guesswork
        byName.set(key, byName.has(key) ? null : m);
      }
    });

    const results = [];
    for (const swimmer of unlinked) {
      const match = (swimmer.member_id && byMemberId.get(String(swimmer.member_id)))
        || byName.get(norm(swimmer.full_name))
        || null;

      if (!match) {
        results.push({ swimmer: swimmer.full_name, linked: false, reason: 'No unambiguous match in the SCM directory.' });
        continue;
      }

      const { error: upError } = await supabase
        .from('swimmers')
        .update({ scm_numeric_id: match.numericId })
        .eq('id', swimmer.id);

      if (upError) {
        results.push({ swimmer: swimmer.full_name, linked: false, reason: upError.message });
      } else {
        results.push({ swimmer: swimmer.full_name, linked: true, scm_numeric_id: match.numericId, matchedBy: swimmer.member_id && byMemberId.get(String(swimmer.member_id)) ? 'member_id' : 'name' });
      }
    }

    const linked = results.filter(r => r.linked).length;
    console.log(`SCM ID SYNC: linked ${linked} of ${unlinked.length} unlinked swimmers.`);
    return res.status(200).json({ success: true, unlinked: unlinked.length, linked, results });
  } catch (err) {
    console.error('SCM ID SYNC ERROR:', err);
    return res.status(500).json({ error: err.message });
  }
}
