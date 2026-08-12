import { getServiceSupabase } from '../../lib/supabase';
import { scmLogin, fetchSwimmerSessions } from '../../lib/scm-scraper';
import { requireAuth } from '../../lib/api-auth';

// A swimmer's memberships are deleted and rebuilt from what SCM returns. If a
// scrape or parse half-fails we would silently drop real memberships, so a run
// that would remove most of an established set is skipped for manual review
// instead. Tuned to allow ordinary changes (a swimmer dropping one session)
// while catching wholesale loss.
const MIN_EXISTING_TO_GUARD = 3;
const MAX_SHRINK_RATIO = 0.5;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Accept the scheduled invocation (Bearer CRON_SECRET), matching
  // sync-attendance; otherwise require an authenticated user.
  const isCron = !!process.env.CRON_SECRET && req.headers.authorization === `Bearer ${process.env.CRON_SECRET}`;
  if (!isCron) {
    if (!await requireAuth(req, res)) return;
  }

  const { swimmerIds } = req.body;
  if (!swimmerIds || !Array.isArray(swimmerIds)) {
    return res.status(400).json({ error: 'Missing swimmerIds array' });
  }

  const username = process.env.SCM_WEB_USERNAME;
  const password = process.env.SCM_WEB_PASSWORD;

  if (!username || !password) {
    return res.status(500).json({ error: 'SCM Web credentials missing in .env.local' });
  }

  try {
    const supabase = getServiceSupabase();
    console.log(`SESSION SYNC: Processing batch of ${swimmerIds.length} swimmers...`);
    
    const cookies = await scmLogin(username, password);
    
    // Fetch session map to convert names to IDs
    const { data: dbSessions } = await supabase.from('sessions').select('id, name');
    const sessionNameToId = {};
    if (dbSessions) dbSessions.forEach(s => sessionNameToId[s.name.trim()] = s.id);

    // Fetch swimmers to get their numeric IDs. Anyone without an scm_numeric_id
    // cannot be scraped, but they must still be reported: silently filtering
    // them out makes a swimmer with no SCM link indistinguishable from one who
    // genuinely has no sessions, and they simply stay on zero forever.
    const { data: allRequested } = await supabase
      .from('swimmers')
      .select('id, full_name, scm_numeric_id')
      .in('id', swimmerIds);

    const swimmers = (allRequested || []).filter(s => s.scm_numeric_id != null);
    const unlinked = (allRequested || []).filter(s => s.scm_numeric_id == null);

    const results = unlinked.map(s => {
      console.warn(`SESSION SYNC: ${s.full_name} has no scm_numeric_id — cannot scrape sessions.`);
      return {
        swimmer: s.full_name,
        skipped: true,
        reason: 'No scm_numeric_id on this swimmer, so SCM cannot be queried. Link the member record in SCM first.'
      };
    });

    if (swimmers.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No swimmers in this batch have an SCM link.',
        summary: { processed: results.length, updated: 0, skipped: results.length, errored: 0 },
        results
      });
    }
    for (const swimmer of swimmers) {
      try {
        console.log(`SESSION SYNC: Scraping ${swimmer.full_name}...`);
        const officialSessions = await fetchSwimmerSessions(swimmer.scm_numeric_id, cookies);
        
        if (officialSessions && officialSessions.length > 0) {
          const memberships = officialSessions
            .map(name => ({
              swimmer_id: swimmer.id,
              session_id: sessionNameToId[name.trim()]
            }))
            .filter(m => m.session_id);

          if (memberships.length > 0) {
            // Circuit breaker: refuse to shrink an established set by more than
            // half. A partial scrape looks identical to a genuine withdrawal
            // here, and unattended is exactly when nobody would notice.
            const { count: existingCount } = await supabase
              .from('session_memberships')
              .select('id', { count: 'exact', head: true })
              .eq('swimmer_id', swimmer.id);

            if (existingCount >= MIN_EXISTING_TO_GUARD && memberships.length < existingCount * MAX_SHRINK_RATIO) {
              console.warn(`SESSION SYNC: skipped ${swimmer.full_name} — SCM returned ${memberships.length} session(s) vs ${existingCount} on file.`);
              results.push({
                swimmer: swimmer.full_name,
                skipped: true,
                reason: `Would drop ${existingCount} memberships to ${memberships.length}; skipped for review.`
              });
              continue;
            }

            // Insert the new set before removing the old one. Deleting first
            // means a failed insert leaves the swimmer on zero sessions with no
            // way back; this way a failure leaves the previous set intact and
            // the worst case is a transient duplicate.
            const { data: superseded } = await supabase
              .from('session_memberships')
              .select('id')
              .eq('swimmer_id', swimmer.id);

            const { error } = await supabase.from('session_memberships').insert(memberships);
            if (error) throw error;

            if (superseded?.length) {
              const { error: delError } = await supabase
                .from('session_memberships')
                .delete()
                .in('id', superseded.map(r => r.id));
              if (delError) {
                console.error(`SESSION SYNC: ${swimmer.full_name} left with duplicates — ${delError.message}`);
                results.push({
                  swimmer: swimmer.full_name,
                  sessions: memberships.length,
                  warning: `New sessions written but ${superseded.length} old row(s) could not be removed; counts may be doubled until re-run.`
                });
                continue;
              }
            }
            results.push({ swimmer: swimmer.full_name, sessions: memberships.length });
          } else {
            // SCM listed sessions but none matched a row in `sessions` by exact
            // name, so the existing set is deliberately left untouched.
            results.push({
              swimmer: swimmer.full_name,
              sessions: 0,
              warning: `SCM returned ${officialSessions.length} session name(s), none matching the sessions table: ${officialSessions.join(' | ')}`
            });
          }
        } else {
          results.push({ swimmer: swimmer.full_name, sessions: 0, note: 'SCM has no sessions assigned to this member.' });
        }
      } catch (err) {
        console.error(`SESSION SYNC ERROR for ${swimmer.full_name}:`, err.message);
        results.push({ swimmer: swimmer.full_name, error: err.message });
      }
    }

    const summary = {
      processed: results.length,
      updated: results.filter(r => typeof r.sessions === 'number' && r.sessions > 0).length,
      skipped: results.filter(r => r.skipped).length,
      errored: results.filter(r => r.error).length
    };
    return res.status(200).json({ success: true, summary, results });
  } catch (error) {
    console.error('GLOBAL SESSION SYNC ERROR:', error);
    return res.status(500).json({ error: error.message });
  }
}
