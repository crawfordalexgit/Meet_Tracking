require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function seedShutdown() {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase environment variables');
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  const exemptions = [
    { 
      name: 'Summer Shutdown 2025', 
      start_date: '2025-08-01', 
      end_date: '2025-08-15', 
      type: 'credit' // Count as 100% attendance
    }
  ];

  console.log(`Seeding ${exemptions.length} club exemptions...`);
  const { error } = await supabase.from('club_exemptions').upsert(exemptions, { onConflict: 'name, start_date' });
  
  if (error) {
    console.error('Seeding failed:', error);
  } else {
    console.log('SUCCESS: Club exemptions seeded.');
  }
}

seedShutdown();
