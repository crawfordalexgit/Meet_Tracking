import { createClient } from '@supabase/supabase-js';
import { scmLogin, fetchSwimmerSquadJoinDate } from '../../lib/scm-scraper';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Set up Server-Sent Events for progress tracking
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  const sendProgress = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const username = process.env.SCM_WEB_USERNAME;
    const password = process.env.SCM_WEB_PASSWORD;

    if (!username || !password) {
      throw new Error('SCM Web credentials not configured in environment');
    }

    sendProgress({ message: 'Logging into SCM...', type: 'info' });
    const cookies = await scmLogin(username, password);
    sendProgress({ message: 'Login successful.', type: 'success' });

    // 1. Fetch swimmers and their squads
    sendProgress({ message: 'Fetching swimmers from database...', type: 'info' });
    const { data: swimmers, error: swimmersError } = await supabase
      .from('swimmers')
      .select('id, full_name, scm_numeric_id, squad_id, squads(name)')
      .not('scm_numeric_id', 'is', null);

    if (swimmersError) throw swimmersError;

    sendProgress({ message: `Found ${swimmers.length} swimmers to process.`, type: 'info' });

    let updatedCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < swimmers.length; i++) {
      const swimmer = swimmers[i];
      const squadName = swimmer.squads?.name;

      if (!squadName) {
        sendProgress({ message: `Skipping ${swimmer.full_name}: No squad assigned.`, type: 'warning' });
        skippedCount++;
        continue;
      }

      sendProgress({ 
        message: `Processing ${swimmer.full_name} (${i + 1}/${swimmers.length})...`, 
        type: 'info',
        progress: Math.round(((i + 1) / swimmers.length) * 100)
      });

      try {
        const realJoinDate = await fetchSwimmerSquadJoinDate(swimmer.scm_numeric_id, squadName, cookies);

        if (realJoinDate) {
          const { error: updateError } = await supabase
            .from('swimmers')
            .update({ squad_join_date: realJoinDate })
            .eq('id', swimmer.id);

          if (updateError) throw updateError;
          updatedCount++;
        } else {
          sendProgress({ message: `Could not find join date for ${swimmer.full_name} in squad ${squadName}.`, type: 'warning' });
          skippedCount++;
        }
      } catch (err) {
        sendProgress({ message: `Error processing ${swimmer.full_name}: ${err.message}`, type: 'error' });
      }
    }

    sendProgress({ 
      message: `Join date sync complete! Updated: ${updatedCount}, Skipped: ${skippedCount}`, 
      type: 'done' 
    });

  } catch (error) {
    console.error('Join Date Sync Error:', error);
    sendProgress({ message: `Fatal Error: ${error.message}`, type: 'error' });
  } finally {
    res.end();
  }
}
