const { fetchSwimmerAttendance } = require('../lib/scm-scraper');
const fs = require('fs');

const envContent = fs.readFileSync('.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
    if (line && line.includes('=')) {
        const [key, ...rest] = line.split('=');
        env[key.trim()] = rest.join('=').trim().replace(/^"|"$/g, '');
    }
});

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

async function testParams() {
    try {
        const cookies = await login();
        const url = 'https://app.swimclubmanager.co.uk/Users/ajax/users.ashx';
        
        console.log("Attempt 1: With sessionid=0...");
        const res1 = await fetch(url, {
            method: 'POST',
            headers: {
                'Cookie': cookies,
                'X-Requested-With': 'XMLHttpRequest',
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            body: `action=view-user&tab=attendance&id=536151&dateFrom=12/04/2025&dateTo=12/05/2026&sessionid=0`
        });
        const html1 = await res1.text();
        console.log("Attempt 1 length:", html1.length);
        fs.writeFileSync('test1.html', html1);

        console.log("Attempt 2: Without sessionid...");
        const res2 = await fetch(url, {
            method: 'POST',
            headers: {
                'Cookie': cookies,
                'X-Requested-With': 'XMLHttpRequest',
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            body: `action=view-user&tab=attendance&id=536151&dateFrom=12/04/2025&dateTo=12/05/2026`
        });
        const html2 = await res2.text();
        console.log("Attempt 2 length:", html2.length);
        fs.writeFileSync('test2.html', html2);

    } catch (err) {
        console.error("Test Error:", err.message);
    }
}

testParams();
