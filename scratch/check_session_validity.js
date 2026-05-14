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

async function checkSession() {
    const username = env.SCM_WEB_USERNAME;
    const password = env.SCM_WEB_PASSWORD;
    
    const commonHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };

    // 1. Initial GET to get cookies and form state
    const loginGetRes = await fetch('https://app.swimclubmanager.co.uk/login', { headers: commonHeaders });
    let cookies = (loginGetRes.headers.get('set-cookie') || '').split(', ').map(c => c.split(';')[0]).join('; ');
    const loginHtml = await loginGetRes.text();
    const $ = cheerio.load(loginHtml);
    
    const params = new URLSearchParams();
    params.append('__VIEWSTATE', $('#__VIEWSTATE').val());
    params.append('__VIEWSTATEGENERATOR', $('#__VIEWSTATEGENERATOR').val());
    params.append('__EVENTVALIDATION', $('#__EVENTVALIDATION').val());
    params.append('username', username);
    params.append('password', password);
    params.append('stayLoggedIn', 'on');
    params.append('m', '0');

    // 2. POST login
    const loginPostRes = await fetch('https://app.swimclubmanager.co.uk/login', {
      method: 'POST',
      headers: { ...commonHeaders, 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': cookies },
      body: params.toString(),
      redirect: 'manual'
    });

    console.log("Post status:", loginPostRes.status);
    const postCookies = (loginPostRes.headers.get('set-cookie') || '').split(', ').map(c => c.split(';')[0]).join('; ');
    cookies = `${cookies}; ${postCookies}`;

    // 3. GET profile
    const profileRes = await fetch(`https://app.swimclubmanager.co.uk/Users/view-user?id=759211`, {
        headers: { ...commonHeaders, 'Cookie': cookies }
    });
    console.log("Profile status:", profileRes.status);
    const profileHtml = await profileRes.text();
    console.log("Profile HTML Snippet:", profileHtml.substring(0, 500));
    
    if (profileHtml.includes('login') && profileHtml.includes('password')) {
        console.log("RE-REDIRECTED TO LOGIN. Session failed.");
    } else {
        console.log("SESSION VALID. Profile page reached.");
    }
}

checkSession();
