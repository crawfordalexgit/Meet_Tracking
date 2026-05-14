const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envContent = fs.readFileSync('.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
    if (line && line.includes('=')) {
        const [key, ...rest] = line.split('=');
        env[key.trim()] = rest.join('=').trim().replace(/^"|"$/g, '');
    }
});

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkSquads() {
    const { data, error } = await supabase.from('squads').select('name').eq('is_squad', true);
    if (error) {
        console.error(error);
        return;
    }
    console.log('Squads in DB:', data.map(s => s.name));
}

checkSquads();
