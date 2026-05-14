const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function backfill() {
  console.log("🚀 Starting Course Backfill...");

  const { data: results, error } = await supabase
    .from('results')
    .select('id, event, meets(name, license)')
    .is('course', null);

  if (error) {
    console.error("Fetch Error:", error);
    return;
  }

  console.log(`Found ${results.length} results without a course.`);

  let updated = 0;
  for (const r of results) {
    const meetName = r.meets?.name?.toLowerCase() || '';
    const license = r.meets?.license || '';
    
    let course = 'SC'; // Default to Short Course
    if (meetName.includes('lc') || meetName.includes('long course') || license.startsWith('1')) {
      course = 'LC';
    }

    const { error: uErr } = await supabase
      .from('results')
      .update({ course })
      .eq('id', r.id);

    if (!uErr) updated++;
    if (updated % 50 === 0) console.log(`Updated ${updated}/${results.length}...`);
  }

  console.log(`✅ Backfill Complete. Total updated: ${updated}`);
}

backfill();
