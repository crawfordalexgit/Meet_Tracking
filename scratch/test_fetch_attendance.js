const cheerio = require('cheerio');
const fs = require('fs');

const envContent = fs.readFileSync('.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
    if (line && line.includes('=')) {
        const [key, ...rest] = line.split('=');
        env[key.trim()] = rest.join('=').trim().replace(/^"|"$/g, '');
    }
});

async function testFetch() {
    const username = env.SCM_WEB_USERNAME;
    const password = env.SCM_WEB_PASSWORD;
    const swimmerId = '759211'; // Natalie Agboeze (from previous check)
    
    console.log(`Starting fetch test for: ${username}`);
    
    const commonHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };

    // 1. Login
    const loginGetRes = await fetch('https://app.swimclubmanager.co.uk/login', { headers: commonHeaders });
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
      headers: { ...commonHeaders, 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': cookies },
      body: params.toString(),
      redirect: 'manual'
    });

    const authCookiesRaw = loginPostRes.headers.get('set-cookie') || '';
    const authCookies = authCookiesRaw.split(', ').map(c => c.split(';')[0]).join('; ');
    cookies = `${cookies}; ${authCookies}`;

    // 2. Fetch Attendance Tab
    // SCM format: /Users/ajax/users.ashx?action=view-user&tab=attendance&id=XXX&dateFrom=DD MMM YYYY&dateTo=DD MMM YYYY
    const dateTo = '12 May 2024';
    const dateFrom = '12 May 2023';
    
    const url = `https://app.swimclubmanager.co.uk/Users/ajax/users.ashx?action=view-user&tab=attendance&id=${swimmerId}&dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}`;
    console.log("Fetching URL:", url);

    const res = await fetch(url, {
        headers: { ...commonHeaders, 'Cookie': cookies }
    });
    
    console.log("Status:", res.status);
    const html = await res.text();
    console.log("HTML Sample:", html.substring(0, 1000));
    
    const $$ = cheerio.load(html);
    const rows = $$('table.table-striped tr').length;
    console.log("Table rows found:", rows);
}

testFetch();
