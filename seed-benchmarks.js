require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function seedBenchmarks() {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase environment variables');
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const benchmarks = [
    // KENT COUNTY 2026 - MALE (Sample from your PDF dump)
    { category: 'County', year: 2026, gender: 'Male', age_group: 13, event: '400m Individual Medley', course: 'SC', time_standard: '5:20.00', time_seconds: 320.0 },
    { category: 'County', year: 2026, gender: 'Male', age_group: 14, event: '400m Individual Medley', course: 'SC', time_standard: '5:14.00', time_seconds: 314.0 },
    { category: 'County', year: 2026, gender: 'Male', age_group: 13, event: '400m Individual Medley', course: 'LC', time_standard: '5:25.40', time_seconds: 325.4 },
    
    // Add more common ones (Estimates based on typical Kent QTs if not in dump)
    { category: 'County', year: 2026, gender: 'Female', age_group: 13, event: '100m Freestyle', course: 'SC', time_standard: '1:06.50', time_seconds: 66.5 },
    { category: 'County', year: 2026, gender: 'Female', age_group: 14, event: '100m Freestyle', course: 'SC', time_standard: '1:04.20', time_seconds: 64.2 },
    { category: 'County', year: 2026, gender: 'Male', age_group: 13, event: '100m Freestyle', course: 'SC', time_standard: '1:05.10', time_seconds: 65.1 },
    { category: 'County', year: 2026, gender: 'Male', age_group: 14, event: '100m Freestyle', course: 'SC', time_standard: '1:01.80', time_seconds: 61.8 },
  ];

  console.log(`Seeding ${benchmarks.length} benchmarks...`);
  const { error } = await supabase.from('benchmarks').upsert(benchmarks, { onConflict: 'category, year, gender, age_group, event, course' });
  
  if (error) {
    console.error('Seeding failed:', error);
  } else {
    console.log('SUCCESS: Benchmarks seeded.');
  }
}

seedBenchmarks();
