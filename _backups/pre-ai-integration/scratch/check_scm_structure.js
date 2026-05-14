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

    cookies = `${cookies}; ${(loginPostRes.headers.get('set-cookie') || '').split(', ').map(c => c.split(';')[0]).join('; ')}`;

    // 2. Fetch Swimmer Profile first to see all tabs
    const profileRes = await fetch(`https://app.swimclubmanager.co.uk/Users/view-user?id=${swimmerId}`, {
        headers: { ...commonHeaders, 'Cookie': cookies }
    });
    const profileHtml = await profileRes.text();
    const profile$ = cheerio.load(profileHtml);
    
    console.log("Tabs found:");
    profile$('.nav-tabs a').each((i, el) => {
        console.log(`- ${profile$(el).text().trim()} (${profile$(el).attr('href')})`);
    });

    // 3. Try fetching the attendance history explicitly
    // Some SCM versions use a different tab or a different URL for history
    const historyUrl = `https://app.swimclubmanager.co.uk/Users/ajax/users.ashx?action=view-user&tab=attendance&id=${swimmerId}&dateFrom=01%20Sep%202023&dateTo=13%20May%202024`;
    const res = await fetch(historyUrl, {
        headers: { ...commonHeaders, 'Cookie': cookies }
    });
    const html = await res.text();
    console.log("History HTML length:", html.length);
    if (html.includes('table')) {
        console.log("Table FOUND in history HTML!");
        const history$ = cheerio.load(html);
        console.log("First few rows:", history$('tr').text().substring(0, 500));
    } else {
        console.log("No table in history HTML. Searching for clues...");
        console.log("Snippet:", html.substring(0, 2000));
    }
}

testFetch();
