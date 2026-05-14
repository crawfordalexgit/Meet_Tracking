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

async function capture() {
    const username = env.SCM_WEB_USERNAME;
    const password = env.SCM_WEB_PASSWORD;
    const swimmerId = '759211'; 
    
    const commonHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };

    const loginGetRes = await fetch('https://app.swimclubmanager.co.uk/login', { headers: commonHeaders });
    let cookies = (loginGetRes.headers.get('set-cookie') || '').split(', ').map(c => c.split(';')[0]).join('; ');
    const loginHtml = await loginGetRes.text();
    const $ = cheerio.load(loginHtml);
    const params = new URLSearchParams();
    params.append('__VIEWSTATE', $('#__VIEWSTATE').val());
    params.append('username', username);
    params.append('password', password);
    params.append('m', '0');
    const loginPostRes = await fetch('https://app.swimclubmanager.co.uk/login', {
      method: 'POST',
      headers: { ...commonHeaders, 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': cookies },
      body: params.toString(),
      redirect: 'manual'
    });
    cookies = `${cookies}; ${(loginPostRes.headers.get('set-cookie') || '').split(', ').map(c => c.split(';')[0]).join('; ')}`;

    // Try a direct POST search
    const bodyParams = new URLSearchParams();
    bodyParams.append('id', swimmerId);
    bodyParams.append('dateFrom', '01 Sep 2023');
    bodyParams.append('dateTo', '13 May 2024');
    bodyParams.append('tab', 'attendance');
    bodyParams.append('action', 'search-attendance'); // GUESSING action name

    const res = await fetch(`https://app.swimclubmanager.co.uk/Users/ajax/users.ashx`, {
        method: 'POST',
        headers: {
            'Cookie': cookies,
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-Requested-With': 'XMLHttpRequest',
            ...commonHeaders
        },
        body: bodyParams.toString()
    });
    
    const html = await res.text();
    fs.writeFileSync('scm_attendance_debug.html', html);
    console.log("HTML captured to scm_attendance_debug.html. Length:", html.length);
}

capture();
