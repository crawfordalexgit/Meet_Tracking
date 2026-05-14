const { fetchSwimmerAttendance } = require('../lib/scm-scraper');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envContent = fs.readFileSync('.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
    if (line && line.includes('=')) {
        const [key, ...rest] = line.split('=');
        env[key.trim()] = rest.join('=').trim().replace(/^"|"$/g, '');
    }
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function login() {
    const commonHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };
    const loginGetRes = await fetch('https://app.swimclubmanager.co.uk/login', { headers: commonHeaders });
    let cookies = (loginGetRes.headers.get('set-cookie') || '').split(',').map(c => c.split(';')[0].trim()).join('; ');
    const html = await loginGetRes.text();
    const cheerio = require('cheerio');
    const $ = cheerio.load(html);
    const params = new URLSearchParams();
    params.append('__VIEWSTATE', $('#__VIEWSTATE').val() || '');
    params.append('__VIEWSTATEGENERATOR', $('#__VIEWSTATEGENERATOR').val() || '');
    params.append('__EVENTVALIDATION', $('#__EVENTVALIDATION').val() || '');
    params.append('username', env.SCM_WEB_USERNAME);
    params.append('password', env.SCM_WEB_PASSWORD);
    params.append('stayLoggedIn', 'on');
    params.append('m', '0');
    const loginPostRes = await fetch('https://app.swimclubmanager.co.uk/login', {
      method: 'POST',
      headers: { ...commonHeaders, 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': cookies },
      body: params.toString(),
      redirect: 'manual'
    });
    let postSetCookie = loginPostRes.headers.get('set-cookie');
    if (postSetCookie) {
        cookies = `${cookies}; ${postSetCookie.split(',').map(c => c.split(';')[0].trim()).join('; ')}`;
    }
    return cookies;
}

async function syncKieran() {
    try {
        const cookies = await login();
        console.log("Logged in. Fetching Kieran (536151)...");
        
        const attendance = await fetchSwimmerAttendance('536151', cookies, '01 May 2025', '13 May 2026');
        console.log(`Found ${attendance.length} records in SCM.`);

        const { data: swimmer } = await supabase.from('swimmers').select('id').ilike('full_name', '%Kieran Crawford%').single();
        const { data: sessions } = await supabase.from('sessions').select('id, name');
        
        const sessionMap = {};
        sessions.forEach(s => sessionMap[s.name.toLowerCase().trim()] = s.id);

        const toInsert = attendance.map(att => {
            const scmSessionName = att.sessionName.toLowerCase().trim();
            let sessionId = sessionMap[scmSessionName];
            
            if (!sessionId) {
              const matchedName = Object.keys(sessionMap).find(dbName => scmSessionName.startsWith(dbName));
              if (matchedName) sessionId = sessionMap[matchedName];
            }

            if (!sessionId) return null;

            return {
              swimmer_id: swimmer.id,
              session_id: sessionId,
              date: att.date,
              status: att.status
            };
        }).filter(Boolean);

        console.log(`Mapping successful. Inserting ${toInsert.length} records into database...`);
        const { error } = await supabase.from('training_attendance').upsert(toInsert, { onConflict: 'swimmer_id, session_id, date' });
        
        if (error) throw error;
        console.log("SUCCESS! Kieran Crawford's attendance is now in the database.");
    } catch (err) {
        console.error("Sync Error:", err.message);
    }
}

syncKieran();
