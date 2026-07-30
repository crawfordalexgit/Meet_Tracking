import { getServiceSupabase } from '../../lib/supabase';
import * as cheerio from 'cheerio';
import { extractSwimId, fetchSplits } from '../../lib/rankings-scraper';
import { requireAuth } from '../../lib/api-auth';
import { fetchAllRows } from '../../lib/paginate';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!await requireAuth(req, res)) return;

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  
  res.write(': ' + ' '.repeat(2048) + '\n\n');

  const sendProgress = (message, progress = 0, isDone = false, error = null) => {
    res.write(`data: ${JSON.stringify({ message, progress, isDone, error })}\n\n`);
    if (res.flush) res.flush();
  };

  const { swimmerId } = req.body || {};
  const supabase = getServiceSupabase();

  try {
    sendProgress('Fetching swimmers list...', 5);
    // Paginated: an unbounded select caps at 1000 rows and silently skips the rest.
    const swimmers = await fetchAllRows(supabase, 'swimmers', {
      select: 'id, member_id, full_name',
      filter: swimmerId ? (q => q.eq('id', swimmerId)) : null,
    });

    let synced = 0;
    let errors = 0;

    for (let i = 0; i < swimmers.length; i++) {
      const swimmer = swimmers[i];
      if (!swimmer.member_id) continue;

      const progress = 5 + Math.round(((i + 1) / swimmers.length) * 90);
      sendProgress(`Syncing PBs for ${swimmer.full_name}...`, progress);

      try {
        const lastName = swimmer.full_name.split(' ').pop();
        const pbs = await scrapePBs(swimmer.member_id, lastName);
        console.log(`Synced ${pbs.length} PBs for ${swimmer.full_name}`);
        
        if (pbs.length > 0) {
          const pbsWithSplits = [];
          for (const pb of pbs) {
            let splits = pb.splits;
            if (!splits && pb.swimId) {
              // Fetch splits if available
              splits = await fetchSplits(pb.swimId);
              // Small delay to be polite
              await new Promise(r => setTimeout(r, 100));
            }
            
            // Database splits fallback query
            if (!splits) {
              const resultsCourse = pb.course === 'S' ? 'SC' : 'LC';
              const { data: matchedResults } = await supabase
                .from('results')
                .select('splits')
                .eq('swimmer_id', swimmer.id)
                .eq('event', pb.event)
                .eq('time', pb.time)
                .eq('course', resultsCourse)
                .eq('date', pb.date)
                .not('splits', 'is', null);
              
              if (matchedResults && matchedResults.length > 0) {
                splits = matchedResults[0].splits;
              }
            }
            
            pbsWithSplits.push({
              swimmer_id: swimmer.id,
              event: pb.event,
              course: pb.course,
              time: pb.time,
              time_seconds: timeToSeconds(pb.time),
              date: pb.date,
              gala: pb.gala,
              splits: splits,
              level: pb.level, // New column
              last_updated: new Date().toISOString()
            });
          }

          let { error: pbError } = await supabase
            .from('swimmer_pbs')
            .upsert(pbsWithSplits, { onConflict: 'swimmer_id, event, course' });

          if (pbError && pbError.message && pbError.message.includes('level')) {
            console.warn(`[PB Sync] 'level' column not found in swimmer_pbs. Retrying without it.`);
            const cleanedPbs = pbsWithSplits.map(({ level, ...rest }) => rest);
            const { error: retryError } = await supabase
              .from('swimmer_pbs')
              .upsert(cleanedPbs, { onConflict: 'swimmer_id, event, course' });
            pbError = retryError;
          }

          if (pbError) throw pbError;
          synced++;
        }
      } catch (err) {
        console.error(`Error syncing PB for ${swimmer.full_name}:`, err.message);
        errors++;
      }
      
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    sendProgress(`Success! Synced PBs for ${synced} swimmers. (${errors} skipped or errored)`, 100, true);
    res.end();
  } catch (error) {
    console.error('PB Sync Error:', error);
    sendProgress('Sync failed', 0, true, error.message);
    res.end();
  }
}

async function scrapePBs(tiref, lastName = '') {
  const url = `https://www.swimmingresults.org/individualbest/personal_best.php?mode=A&tiref=${tiref}&name=${encodeURIComponent(lastName)}`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  });
  const html = await response.text();
  const $ = cheerio.load(html);
  
  const pbs = [];

  // Find all rows in all tables and sequentially fetch true splits
  const rows = $('tr').toArray();
  for (const row of rows) {
    const tds = $(row).find('td');
    if (tds.length >= 6) {
      const event = $(tds[0]).text().trim();
      // Column 2 contains the time and the split link on the PB page
      const timeNode = $(tds[1]); 
      const time = timeNode.text().trim();
      const dateStr = $(tds[4]).text().trim();
      const gala = $(tds[5]).text().trim();

      // Skip headers
      const eventLower = event.toLowerCase();
      if (
        eventLower === 'event' || 
        eventLower === 'stroke' || 
        eventLower === 'event / stroke' ||
        time.toLowerCase().includes('time')
      ) continue;

      if (event && time && dateStr && dateStr.includes('/')) {
        // Extract swimid and fetch true in-race splits
        const href = timeNode.find('a').attr('href');
        const swimid = href ? extractSwimId(href) : null;
        let splits = null;

        if (swimid) {
          splits = await fetchSplits(swimid);
          // Small delay to be polite
          await new Promise(r => setTimeout(r, 100));
        }

        // Figure out course: find the nearest preceding heading or look at the time link
        let course = 'S';
        const eventLink = $(tds[0]).find('a').attr('href') || '';
        if (eventLink.includes('tcourse=L')) {
            course = 'L';
        } else if (eventLink.includes('tcourse=S')) {
            course = 'S';
        } else {
            // Fallback to searching upwards for the course header
            let prev = $(row).parent().parent().prevAll().text().toLowerCase();
            if (prev.includes('long course') && !prev.includes('short course')) course = 'L';
            if (prev.indexOf('long course') > prev.indexOf('short course')) course = 'L';
        }

        // Detect level (L1, L2, L3, L4) from lvl column or gala name
        let level = null;
        if (tds.length >= 9) {
          const lvlText = $(tds[8]).text().trim();
          if (lvlText && ['1', '2', '3', '4'].includes(lvlText)) {
            level = 'L' + lvlText;
          }
        }
        if (!level) {
          const levelMatch = gala.match(/Level\s*([1-4])|L([1-4])\b/i);
          if (levelMatch) {
            level = 'L' + (levelMatch[1] || levelMatch[2]);
          }
        }

        pbs.push({
          event,
          course,
          time,
          date: formatDate(dateStr),
          gala,
          level,
          splits,
          swimId: swimid // Store temporarily for outer flow if needed
        });
      }
    }
  }

  return pbs;
}

function timeToSeconds(timeStr) {
  if (!timeStr || timeStr === 'NT') return null;
  const parts = timeStr.split(':');
  if (parts.length === 2) {
    return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
  }
  return parseFloat(parts[0]);
}

function formatDate(ukDateStr) {
  const parts = ukDateStr.split('/');
  if (parts.length !== 3) return null;
  let [day, month, year] = parts;
  if (year.length === 2) {
    const y = parseInt(year);
    year = y > 50 ? '19' + year : '20' + year;
  }
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}
