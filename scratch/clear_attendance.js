const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function clearAndSync() {
  console.log('--- CLEARING ATTENDANCE DATA ---');
  const { error: deleteError } = await supabase
    .from('training_attendance')
    .delete()
    .neq('id', 0); // Hack to delete all rows

  if (deleteError) {
    console.error('Error clearing attendance:', deleteError);
    return;
  }
  console.log('Successfully cleared training_attendance table.');

  console.log('\n--- TRIGGERING RE-IMPORT ---');
  console.log('You should now trigger the sync from the dashboard to repopulate the data.');
  console.log('Alternatively, I can try to trigger the API route for you.');
}

clearAndSync();
