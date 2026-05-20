require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function syncPathwayBenchmarks() {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase environment variables');
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // EXAMPLE DATA - Replace with actual Swim England Rankings data
  // In a production scenario, this would be an automated scrape of the Top 40/30/10 times.
  const benchmarks = [
    { category: 'National Top 40', year: 2025, gender: 'Male', age_group: 13, event: '100m Butterfly', course: 'SC', time_standard: '1:18.50', time_seconds: 78.5 },
    { category: 'National Top 40', year: 2025, gender: 'Male', age_group: 14, event: '100m Butterfly', course: 'SC', time_standard: '1:08.20', time_seconds: 68.2 },
    { category: 'Regional Top 30', year: 2025, gender: 'Male', age_group: 13, event: '100m Butterfly', course: 'SC', time_standard: '1:20.10', time_seconds: 80.1 },
    { category: 'County Top 10', year: 2025, gender: 'Male', age_group: 13, event: '100m Butterfly', course: 'SC', time_standard: '1:24.00', time_seconds: 84.0 },
  ];

  console.log(`Syncing ${benchmarks.length} Pathway Benchmarks...`);
  
  const { error } = await supabase
    .from('benchmarks')
    .upsert(benchmarks, { onConflict: 'category, year, gender, age_group, event, course' });

  if (error) {
    console.error('Sync failed:', error);
  } else {
    console.log('SUCCESS: Pathway Benchmarks synchronized.');
  }
}

syncPathwayBenchmarks();
