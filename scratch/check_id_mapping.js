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
    const url = `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/swimmers?select=member_id,full_name,scm_numeric_id`;
    const res = await fetch(url, {
        headers: {
            'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
        }
    });
    
    const data = await res.json();
    if (Array.isArray(data)) {
        const mapped = data.filter(s => s.scm_numeric_id !== null);
        console.log(`Total Swimmers: ${data.length}`);
        console.log(`Mapped Swimmers: ${mapped.length}`);
        if (mapped.length > 0) {
            console.log("\nSample Mapping:");
            console.log(`${mapped[0].full_name} -> ${mapped[0].scm_numeric_id}`);
        }
    } else {
        console.log("Error data:", data);
    }
}

check().catch(console.error);
