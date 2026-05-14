const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function debugKariYu() {
    const swimmerName = 'Kari Yu';
    const { data: swimmer } = await supabase.from('swimmers').select('*').ilike('full_name', `%${swimmerName}%`).single();
    
    if (!swimmer) {
        console.log('Swimmer not found');
        return;
    }
    
    console.log(`Debug for ${swimmer.full_name} (${swimmer.id})`);
    
    const { data: results } = await supabase
        .from('results')
        .select('*, meets(*)')
        .eq('swimmer_id', swimmer.id)
        .order('date', { ascending: false });
        
    console.log(`Total results: ${results.length}`);
    
    const uniqueMeets = new Set();
    const openMeets = [];
    
    results.forEach(r => {
        const type = (r.meets?.type || 'open').toLowerCase();
        if (type === 'open') {
            uniqueMeets.add(r.meet_id);
            openMeets.push({
                date: r.date,
                name: r.meets?.name,
                type: r.meets?.type
            });
        } else {
            console.log(`Skipping non-open meet: ${r.meets?.name} (${r.meets?.type})`);
        }
    });
    
    console.log(`Unique Open Meets: ${uniqueMeets.size}`);
    console.log('Open Meet Details:');
    console.log(openMeets);
}

debugKariYu();
