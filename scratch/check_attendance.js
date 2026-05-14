const fs = require('fs');
const envContent = fs.readFileSync('.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
    if (line && line.includes('=')) {
        const [key, ...rest] = line.split('=');
        env[key.trim()] = rest.join('=').trim().replace(/^"|"$/g, '');
    }
});

async function check() {
    const headers = {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Prefer': 'count=exact'
    };
    
    const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/training_attendance?select=*&limit=1`, { headers });
    console.log("Status:", res.status);
    const count = res.headers.get('content-range');
    console.log("Count Range:", count);
    const data = await res.json();
    console.log("Sample Attendance:", data);
}

check().catch(console.error);
