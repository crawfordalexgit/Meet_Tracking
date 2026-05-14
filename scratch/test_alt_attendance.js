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
    const swimmerId = '759211'; 
    
    const commonHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };

    // 1. Login
    const loginGetRes = await fetch('https://app.swimclubmanager.co.uk/login', { headers: commonHeaders });
    const loginHtml = await loginGetRes.text();
    const $ = cheerio.load(loginHtml);
    let cookies = (loginGetRes.headers.get('set-cookie') || '').split(', ').map(c => c.split(';')[0]).join('; ');
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

    // 2. Try view-user-attendance
    const url = `https://app.swimclubmanager.co.uk/Users/view-user-attendance?id=${swimmerId}&dateFrom=01%20Sep%202023&dateTo=13%20May%202024`;
    console.log("Fetching URL:", url);

    const res = await fetch(url, {
        headers: { ...commonHeaders, 'Cookie': cookies }
    });
    
    console.log("Status:", res.status);
    const html = await res.text();
    console.log("HTML length:", html.length);
    if (html.includes('table')) {
        console.log("TABLE FOUND!");
    } else {
        console.log("No table. HTML Snippet:", html.substring(0, 500));
    }
}

testFetch();
