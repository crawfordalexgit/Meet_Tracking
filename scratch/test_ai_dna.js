const { getServiceSupabase } = require('./lib/supabase');
const { getSwimmerDNA } = require('./lib/ai-context');

async function testDNA() {
  const supabase = getServiceSupabase();
  const swimmerId = '2653807e-04ac-43fe-88ac-e4206cabb905'; // Kari Yu from metadata

  const [
    { data: swimmer },
    { data: results },
    { data: attendance },
    { data: sessions }
  ] = await Promise.all([
    supabase.from('swimmers').select('*, squads(*)').eq('id', swimmerId).single(),
    supabase.from('results').select('*').eq('swimmer_id', swimmerId),
    supabase.from('training_attendance').select('*').eq('swimmer_id', swimmerId),
    supabase.from('sessions').select('*').eq('is_active', true)
  ]);

  const dna = await getSwimmerDNA(swimmer, results, attendance, sessions);
  console.log("ATHLETE DNA:", JSON.stringify(dna, null, 2));
}

testDNA();
