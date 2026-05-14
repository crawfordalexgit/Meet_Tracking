const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function fixMeetTypes() {
    console.log('Searching for Tonbridge SC Club Championships 2025...');
    
    const { data: meets, error } = await supabase
        .from('meets')
        .select('*')
        .ilike('name', '%Tonbridge SC Club Championships 2025%');
        
    if (error) {
        console.error('Error fetching meets:', error);
        return;
    }
    
    console.log(`Found ${meets.length} meet entries.`);
    
    for (const meet of meets) {
        console.log(`Meet: ${meet.name} | Date: ${meet.date} | Current Type: ${meet.type}`);
        if (meet.type === 'open' || !meet.type) {
            console.log(`  --> Updating to 'internal'...`);
            const { error: updateError } = await supabase
                .from('meets')
                .update({ type: 'internal' })
                .eq('id', meet.id);
            
            if (updateError) {
                console.error(`  !! Error updating meet ${meet.id}:`, updateError);
            } else {
                console.log(`  [OK] Updated.`);
            }
        }
    }
    
    console.log('Cleanup complete.');
}

fixMeetTypes();
