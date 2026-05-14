const fs = require('fs');
const envContent = fs.readFileSync('.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
    if (line && line.includes('=')) {
        const [key, ...rest] = line.split('=');
        env[key.trim()] = rest.join('=').trim().replace(/^"|"$/g, '');
    }
});

const SCM_API_KEY = env.SCM_API_KEY; // The user might have it in env or passed it in body.

async function testApi(endpoint) {
    console.log(`Testing endpoint: ${endpoint}`);
    const res = await fetch(`https://api.swimclubmanager.co.uk/api/${endpoint}?page=1`, {
        headers: {
            'Authorization': SCM_API_KEY,
            'Accept': 'application/json'
        }
    });
    console.log(`Status: ${res.status}`);
    const data = await res.json();
    console.log(`Data keys: ${Object.keys(data).join(', ')}`);
    if (Array.isArray(data)) {
        console.log(`Array length: ${data.length}`);
        if (data.length > 0) console.log(`Sample:`, JSON.stringify(data[0]).substring(0, 500));
    } else {
        const items = data.data || data.Members || data.ClubGroups || data.ClubSessions || data.sessions || [];
        console.log(`Extracted items length: ${items.length}`);
        if (items.length > 0) console.log(`Sample:`, JSON.stringify(items[0]).substring(0, 500));
    }
}

async function run() {
    if (!SCM_API_KEY) {
        console.error("SCM_API_KEY not found in .env.local");
        return;
    }
    await testApi('ClubSessions');
    await testApi('Sessions'); // Trying alias
}

run().catch(console.error);
