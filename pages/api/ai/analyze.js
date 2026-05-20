import { getServiceSupabase } from '../../../lib/supabase';
import { getSwimmerDNA, getSquadDNA } from '../../../lib/ai-context';
import { analyzeSwimmer, analyzeSquad } from '../../../lib/ai_engine';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { swimmerId, squadId, type = 'general', squadName, stats, strokeData, trend, swimmers, instructions } = req.body;

    try {
      const supabase = getServiceSupabase();

      // 1. SQUAD / CLUB LEVEL ANALYSIS
      if (squadId || type === 'club') {
        const dna = await getSquadDNA(squadName || 'Club Overview', stats, strokeData, trend, swimmers);
        const analysis = await analyzeSquad(dna, type);
        
        // Save to ai_reports
        if (analysis && !analysis.error) {
          await supabase.from('ai_reports').insert({
            squad_id: squadId || null,
            type: type === 'club' ? 'club' : 'squad',
            content: analysis,
            created_at: new Date().toISOString()
          });
        }
        
        return res.status(200).json(analysis);
      }

      // 1. Fetch all required data in parallel
      const [
        { data: swimmer, error: sErr },
        { data: results, error: rErr },
        { data: attendance, error: aErr },
        { data: sessions, error: sesErr },
        { data: feedback, error: fErr }
      ] = await Promise.all([
        supabase.from('swimmers').select('*, squads(*)').eq('id', swimmerId).single(),
        supabase.from('results').select('*, meets(*)').eq('swimmer_id', swimmerId).order('date', { ascending: false }),
        supabase.from('training_attendance').select('*').eq('swimmer_id', swimmerId).order('date', { ascending: false }),
        supabase.from('sessions').select('*').eq('is_active', true),
        supabase.from('swimmer_ai_feedback').select('coach_correction, created_at').eq('swimmer_id', swimmerId).eq('is_positive', false).order('created_at', { ascending: false }).limit(10)
      ]);

      if (sErr || rErr || aErr || sesErr || fErr) {
        console.error("DB Fetch Error:", { sErr, rErr, aErr, sesErr, fErr });
        return res.status(500).json({ error: 'Failed to fetch data for analysis' });
      }

      // 2. Build the DNA context
      const dna = await getSwimmerDNA(swimmer, results, attendance, sessions, feedback, req.body.performance_slope || 0);

      if (type === 'block_audit' && req.body.blockData) {
        dna.block_roi_data = req.body.blockData;
      }

      // 3. Call Gemini
      const analysis = await analyzeSwimmer(dna, type, instructions);

    // 4. Archive for Foresight Tracking
    if (analysis && !analysis.error) {
      await supabase.from('swimmer_insights').insert([{
        swimmer_id: swimmerId,
        headline: analysis.headline,
        full_report: analysis,
        risk_level: analysis.risk_level,
        flag: analysis.flag
      }]);
      
      // Save to ai_reports
      await supabase.from('ai_reports').insert({
        swimmer_id: swimmerId,
        type: type,
        content: analysis,
        created_at: new Date().toISOString()
      });
    }

    return res.status(200).json(analysis);

  } catch (error) {
    console.error("API Analysis Error:", error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
