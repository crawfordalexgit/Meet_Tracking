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

async function findSearchFunc() {
    const username = env.SCM_WEB_USERNAME;
    const password = env.SCM_WEB_PASSWORD;
    
    const commonHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };

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

    // Fetch the attendance tab HTML
    const res = await fetch(`https://app.swimclubmanager.co.uk/Users/ajax/users.ashx?action=view-user&tab=attendance&id=759211`, {
        headers: { ...commonHeaders, 'Cookie': cookies, 'X-Requested-With': 'XMLHttpRequest' }
    });
    const html = await res.text();
    const $$ = cheerio.load(html);
    
    console.log("Search buttons found:");
    $$('button, a.btn').each((i, el) => {
        const text = $$(el).text().trim();
        const onclick = $$(el).attr('onclick') || '';
        if (text.toLowerCase().includes('search') || onclick.toLowerCase().includes('attendance')) {
            console.log(`- Text: "${text}", Onclick: "${onclick}"`);
        }
    });

    console.log("Input fields found:");
    $$('input').each((i, el) => {
        console.log(`- ID: "${$$(el).attr('id')}", Name: "${$$(el).attr('name')}", Value: "${$$(el).attr('value')}"`);
    });
}

findSearchFunc();
