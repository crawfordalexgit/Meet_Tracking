import { getServiceSupabase } from '../../lib/supabase';
import { fetchScmNumericIds, fetchSwimmerAttendance } from '../../lib/scm-scraper';
import * as cheerio from 'cheerio';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const isSSE = req.method === 'GET';

  if (isSSE) {
    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.flushHeaders(); 
    
    console.log("SSE: Connection established. Sending initial message...");
    res.write(`data: ${JSON.stringify({ message: "Connection established. Initializing...", progress: 1 })}\n\n`);

    // Keep-alive heartbeat
    const heartbeat = setInterval(() => {
      res.write(': heartbeat\n\n');
    }, 15000);

    req.on('close', () => {
      clearInterval(heartbeat);
    });
  }

  const sendProgress = (data) => {
    console.log(`SSE SEND: ${data.message} (${data.progress}%)`);
    if (isSSE) {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } else {
      console.log("Progress:", data.message);
    }
  };

  try {
    const supabase = getServiceSupabase();
    
    sendProgress({ message: "Connecting to SCM Portal...", progress: 5 });
    
    // 1. Authenticate and get cookies
    const username = process.env.SCM_WEB_USERNAME;
    const password = process.env.SCM_WEB_PASSWORD;
    
    if (!username || !password) {
      throw new Error('SCM Web credentials not set in environment.');
    }

    console.log(`SCM ATTENDANCE: Starting login as ${username}...`);
    sendProgress({ message: "Authenticating with SCM...", progress: 10 });

    // Perform login flow to get cookies
    const commonHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const loginGetRes = await fetch('https://app.swimclubmanager.co.uk/login', {
      headers: commonHeaders,
      signal: controller.signal
    });
    clearTimeout(timeout);
    
    const loginHtml = await loginGetRes.text();
    const $ = cheerio.load(loginHtml);
    
    const loginCookies = loginGetRes.headers.get('set-cookie') || '';
    let cookies = loginCookies.split(', ').map(c => c.split(';')[0]).join('; ');

    const params = new URLSearchParams();
    params.append('__VIEWSTATE', $('#__VIEWSTATE').val());
    params.append('__VIEWSTATEGENERATOR', $('#__VIEWSTATEGENERATOR').val());
    params.append('__EVENTVALIDATION', $('#__EVENTVALIDATION').val());
    params.append('username', username);
    params.append('password', password);
    params.append('stayLoggedIn', 'on');
    params.append('m', '0');

    const loginPostRes = await fetch('https://app.swimclubmanager.co.uk/login', {
      method: 'POST',
      headers: { 
        ...commonHeaders,
        'Content-Type': 'application/x-www-form-urlencoded', 
        'Cookie': cookies 
      },
      body: params.toString(),
      redirect: 'manual'
    });

    if (loginPostRes.status !== 302 && loginPostRes.status !== 301) {
      throw new Error('SCM Login failed. Check credentials.');
    }

    const authCookies = loginPostRes.headers.get('set-cookie') || '';
    cookies = `${cookies}; ${authCookies.split(',').map(c => c.split(';')[0]).join('; ')}`;

    // 2. Get sessions for mapping
    sendProgress({ message: "Mapping club sessions...", progress: 5 });
    const { data: sessions, error: sessionTableError } = await supabase.from('sessions').select('id, name');
    
    if (sessionTableError) {
      if (sessionTableError.code === 'PGRST204' || sessionTableError.code === 'PGRST205') {
        throw new Error('Database tables are missing. Please run the SQL block I provided in Supabase.');
      }
      throw sessionTableError;
    }

    if (!sessions || sessions.length === 0) {
      throw new Error('No sessions found in database. Please run "SCM Sync" in System settings first to import your club sessions.');
    }

    const sessionMap = {};
    sessions.forEach(s => {
      sessionMap[s.name.toLowerCase().trim()] = s.id;
    });

    // 3. Get swimmers to sync
    const { data: swimmers } = await supabase
      .from('swimmers')
      .select('id, full_name, scm_numeric_id')
      .not('scm_numeric_id', 'is', null);

    if (!swimmers || swimmers.length === 0) {
      sendProgress({ message: "No swimmers found with SCM Numeric IDs. Run SCM Sync first.", progress: 100 });
      res.end();
      return;
    }

    sendProgress({ message: `Starting sync for ${swimmers.length} swimmers...`, progress: 10 });

    const dateTo = new Date();
    const dateFrom = new Date();
    if (req.method === 'POST') {
      dateFrom.setDate(dateTo.getDate() - 14); 
    } else {
      dateFrom.setFullYear(dateTo.getFullYear() - 1);
    }

    const monthsArr = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const formatDate = (d) => {
      const day = d.getDate().toString().padStart(2, '0');
      const month = monthsArr[d.getMonth()];
      const year = d.getFullYear();
      return `${day} ${month} ${year}`;
    };

    const dateToStr = formatDate(dateTo);
    const dateFromStr = formatDate(dateFrom);

    let count = 0;
    for (const swimmer of swimmers) {
      count++;
      const progress = Math.floor(10 + (count / swimmers.length) * 85);
      sendProgress({ 
        message: `Syncing ${swimmer.full_name} (${count}/${swimmers.length})...`, 
        progress 
      });

      try {
        const attendanceData = await fetchSwimmerAttendance(swimmer.scm_numeric_id, cookies, dateFromStr, dateToStr);
        
        if (attendanceData.length > 0) {
          const attendanceToInsert = attendanceData.map(att => {
            const scmSessionName = att.sessionName.toLowerCase().trim();
            
            // Fuzzy Match: Find session where the DB name is a prefix of the SCM name
            // e.g. "AGE DEVELOPMENT Sunday MORNING" matches "AGE DEVELOPMENT Sunday MORNING (Sun 07:00 - 09:00)"
            let sessionId = sessionMap[scmSessionName];
            
            if (!sessionId) {
              const matchedName = Object.keys(sessionMap).find(dbName => scmSessionName.startsWith(dbName));
              if (matchedName) {
                sessionId = sessionMap[matchedName];
              }
            }

            if (!sessionId) {
              if (!global.missingSessions) global.missingSessions = new Set();
              global.missingSessions.add(att.sessionName);
              return null;
            }

            return {
              swimmer_id: swimmer.id,
              session_id: sessionId,
              date: att.date,
              status: att.status
            };
          }).filter(Boolean);

          if (attendanceToInsert.length > 0) {
            await supabase.from('training_attendance').upsert(attendanceToInsert, { 
              onConflict: 'swimmer_id, session_id, date' 
            });
          }
        }
      } catch (err) {
        console.error(`Error syncing ${swimmer.full_name}:`, err.message);
      }
    }

    sendProgress({ message: "Attendance sync complete!", progress: 100 });
    if (!isSSE) return res.status(200).json({ message: "Sync complete" });
    res.end();

  } catch (error) {
    console.error("Attendance Sync Error:", error);
    if (isSSE) {
      sendProgress({ error: error.message });
      res.end();
    } else {
      return res.status(500).json({ error: error.message });
    }
  }
}
