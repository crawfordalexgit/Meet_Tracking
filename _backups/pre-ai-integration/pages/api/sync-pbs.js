import { getServiceSupabase } from '../../lib/supabase';
import * as cheerio from 'cheerio';

export default async function handler(req, res) {
  console.log('PB SYNC API CALLED');
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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
    let query = supabase.from('swimmers').select('id, member_id, full_name');
    if (swimmerId) {
      query = query.eq('id', swimmerId);
    }
    const { data: swimmers, error: swimmerError } = await query;
    if (swimmerError) throw swimmerError;

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
          const pbsToInsert = pbs.map(pb => ({
            swimmer_id: swimmer.id,
            event: pb.event,
            course: pb.course,
            time: pb.time,
            time_seconds: timeToSeconds(pb.time),
            date: pb.date,
            gala: pb.gala,
            last_updated: new Date().toISOString()
          }));

          const { error: pbError } = await supabase
            .from('swimmer_pbs')
            .upsert(pbsToInsert, { onConflict: 'swimmer_id, event, course' });

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

  // Find all rows in all tables
  $('tr').each((i, row) => {
    const tds = $(row).find('td');
    if (tds.length >= 6) {
      const event = $(tds[0]).text().trim();
      const time = $(tds[1]).text().trim();
      const dateStr = $(tds[4]).text().trim();
      const gala = $(tds[5]).text().trim();

      // Skip headers
      if (event.toLowerCase().includes('event') || time.toLowerCase().includes('time')) return;

      if (event && time && dateStr && dateStr.includes('/')) {
        // Figure out course: find the nearest preceding heading or look at the time link
        let course = 'S';
        const pageTextBefore = $(row).prevAll().text().toLowerCase();
        // Also check the event link itself, often has tcourse=L or S
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

        pbs.push({
          event,
          course,
          time,
          date: formatDate(dateStr),
          gala
        });
      }
    }
  });

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
