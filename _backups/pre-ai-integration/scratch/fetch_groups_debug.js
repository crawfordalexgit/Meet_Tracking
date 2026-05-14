const fs = require('fs');
const cheerio = require('cheerio');

const envContent = fs.readFileSync('.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
    if (line && line.includes('=')) {
        const [key, ...rest] = line.split('=');
        env[key.trim()] = rest.join('=').trim().replace(/^"|"$/g, '');
    }
});

async function fetchGroups(swimmerId) {
    const commonHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };

    // 1. Login
    const loginGetRes = await fetch('https://app.swimclubmanager.co.uk/login', { headers: commonHeaders });
    let cookies = (loginGetRes.headers.get('set-cookie') || '').split(', ').map(c => c.split(';')[0]).join('; ');
    const loginHtml = await loginGetRes.text();
    const $ = cheerio.load(loginHtml);
    
    const params = new URLSearchParams();
    params.append('__VIEWSTATE', $('#__VIEWSTATE').val());
    params.append('__VIEWSTATEGENERATOR', $('#__VIEWSTATEGENERATOR').val());
    params.append('__EVENTVALIDATION', $('#__EVENTVALIDATION').val());
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
    cookies = `${cookies}; ${(loginPostRes.headers.get('set-cookie') || '').split(', ').map(c => c.split(';')[0]).join('; ')}`;

    // 2. Fetch Groups Tab
    const groupsUrl = `https://app.swimclubmanager.co.uk/Users/ajax/users.ashx?action=view-user&tab=groups&id=${swimmerId}`;
    const res = await fetch(groupsUrl, {
        headers: { ...commonHeaders, 'Cookie': cookies }
    });
    const html = await res.text();
    fs.writeFileSync('kieran_groups_debug.html', html);
    console.log("Groups HTML saved to kieran_groups_debug.html");
    
    const $$ = cheerio.load(html);
    console.log("Tables found:", $$('table').length);
    $$('table').each((i, table) => {
        console.log(`Table ${i} text snippet:`, $$(table).text().substring(0, 500).replace(/\s+/g, ' '));
    });
}

fetchGroups('536151');
