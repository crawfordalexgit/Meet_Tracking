const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Manual env load
const envContent = fs.readFileSync('.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const [key, value] = line.split('=');
  if (key && value) env[key.trim()] = value.trim();
});
console.log('Parsed Env URL:', `"${env.NEXT_PUBLIC_SUPABASE_URL}"`);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function seed() {
  const membersPath = path.join('scratch', 'members.json');
  if (!fs.existsSync(membersPath)) {
    console.error('members.json not found in scratch folder');
    return;
  }

  const rawData = JSON.parse(fs.readFileSync(membersPath, 'utf8'));
  const members = rawData.data || [];
  console.log(`Found ${members.length} members in JSON.`);

  // 1. Extract squads
  const squadNames = new Set();
  members.forEach(m => {
    if (m.groups) {
      m.groups.split(',').forEach(g => {
        const name = g.trim();
        if (name) squadNames.add(name);
      });
    }
  });

  const squadsToInsert = Array.from(squadNames).map(name => ({ name }));
  console.log(`Upserting ${squadsToInsert.length} squads...`);
  
  const { data: squadResult, error: squadError } = await supabase.from('squads').upsert(squadsToInsert, { onConflict: 'name' }).select();
  console.log('Squad Upsert Result:', JSON.stringify(squadResult, null, 2));
  console.log('Squad Upsert Error:', JSON.stringify(squadError, null, 2));
  
  if (squadError) {
    console.error('Squad error:', squadError);
    return;
  }

  // Fetch squads back to get IDs
  const { data: dbSquads } = await supabase.from('squads').select('id, name');
  const squadMap = {};
  dbSquads.forEach(s => squadMap[s.name] = s.id);

  // 2. Process swimmers
  const swimmersToInsert = [];
  const now = new Date();
  
  members.forEach(member => {
    // Extract name from HTML in 'avatar' or just use 'avatar' text
    // The format is: <a ... class="user-link">Agboeze, Orla</a> <br />1718630 (1)
    const nameMatch = member.avatar.match(/>([^<]+)<\/a>/);
    const fullName = nameMatch ? nameMatch[1].trim() : 'Unknown';
    
    // Extract SE Number (member_id)
    const seMatch = member.avatar.match(/<br \/>(\d+)/);
    const memberId = seMatch ? seMatch[1] : null;
    
    if (!memberId) return;

    // Squad assignment (take first group as primary for now)
    let squadId = null;
    if (member.groups) {
      const firstGroup = member.groups.split(',')[0].trim();
      squadId = squadMap[firstGroup] || null;
    }

    const birthYear = member.age ? (now.getFullYear() - parseInt(member.age)) : null;

    swimmersToInsert.push({
      member_id: memberId,
      full_name: fullName,
      squad_id: squadId,
      year_of_birth: birthYear,
      gender: member.gender || null,
      squad_join_date: new Date().toISOString().split('T')[0]
    });
  });

  console.log(`Prepared ${swimmersToInsert.length} swimmers. Deduplicating...`);
  const uniqueSwimmers = [];
  const seenIds = new Set();
  for (const s of swimmersToInsert) {
    if (!seenIds.has(s.member_id)) {
      uniqueSwimmers.push(s);
      seenIds.add(s.member_id);
    }
  }

  console.log(`Upserting ${uniqueSwimmers.length} unique swimmers...`);
  const { error: swimmerError } = await supabase.from('swimmers').upsert(uniqueSwimmers, { onConflict: 'member_id' });
  
  if (swimmerError) {
    console.error('Swimmer error:', swimmerError);
  } else {
    console.log('Successfully seeded database from members.json!');
  }
}

seed();
