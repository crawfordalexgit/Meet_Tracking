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

async function testLogin() {
    const username = env.SCM_WEB_USERNAME;
    const password = env.SCM_WEB_PASSWORD;
    
    console.log(`Starting login test for: ${username}`);
    
    const commonHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };

    try {
        console.log("1. Fetching login page...");
        const loginGetRes = await fetch('https://app.swimclubmanager.co.uk/login', { headers: commonHeaders });
        console.log("Status:", loginGetRes.status);
        const loginHtml = await loginGetRes.text();
        const $ = cheerio.load(loginHtml);
        
        const loginCookies = loginGetRes.headers.get('set-cookie') || '';
        let cookies = loginCookies.split(', ').map(c => c.split(';')[0]).join('; ');

        const viewState = $('#__VIEWSTATE').val();
        console.log("ViewState found:", !!viewState);

        const params = new URLSearchParams();
        params.append('__VIEWSTATE', viewState);
        params.append('__VIEWSTATEGENERATOR', $('#__VIEWSTATEGENERATOR').val());
        params.append('__EVENTVALIDATION', $('#__EVENTVALIDATION').val());
        params.append('username', username);
        params.append('password', password);
        params.append('stayLoggedIn', 'on');
        params.append('m', '0');

        console.log("2. Posting login credentials...");
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

        console.log("Post Status:", loginPostRes.status);
        console.log("Post Headers:", [...loginPostRes.headers.entries()]);

        if (loginPostRes.status === 302 || loginPostRes.status === 301) {
            console.log("SUCCESS: Redirected (probably logged in).");
            const authCookies = loginPostRes.headers.get('set-cookie') || '';
            console.log("Auth Cookies received:", !!authCookies);
        } else {
            console.log("FAILED: No redirect. Check credentials or site structure.");
            // Log a bit of the body to see if there's an error message
            const body = await loginPostRes.text();
            const $$ = cheerio.load(body);
            const error = $$('.alert-danger').text() || $$('#lblError').text();
            console.log("Error on page:", error.trim());
        }

    } catch (err) {
        console.error("Test Failed:", err);
    }
}

testLogin();
