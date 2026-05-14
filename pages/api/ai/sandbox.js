import { getServiceSupabase } from '../../../lib/supabase';
import { getSwimmerDNA } from '../../../lib/ai-context';
import { analyzeFacet } from '../../../lib/ai';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { swimmerId, facet, customPrompt, period = 365 } = req.body;
  if (!swimmerId || !facet) return res.status(400).json({ error: 'Swimmer ID and Facet required' });

  try {
    const supabase = getServiceSupabase();

    const fetchPaged = async (table, select = '*', filter = null) => {
      let all = []; let page = 0; let more = true;
      while (more && page < 10) {
        let q = supabase.from(table).select(select).range(page * 1000, (page + 1) * 1000 - 1);
        if (filter) q = filter(q);
        const { data, error } = await q;
        if (error || !data) break;
        all = [...all, ...data];
        if (data.length < 1000) more = false;
        page++;
      }
      return all;
    };

    // 1. Fetch all data needed for DNA
    const { data: swimmer } = await supabase
      .from('swimmers')
      .select('*, squads(id,name,target_meets,target_sessions_per_week,target_training_percent,target_hours_per_week,require_weekend,use_or_logic)')
      .eq('id', swimmerId)
      .single();

    if (!swimmer) throw new Error("Swimmer not found");

    const [results, attendance, sessions, feedback] = await Promise.all([
      fetchPaged('results', '*, meets(name,license,date,course,level)', q => q.eq('swimmer_id', swimmerId).order('date', { ascending: false })),
      fetchPaged('training_attendance', '*', q => q.eq('swimmer_id', swimmerId).order('date', { ascending: false })),
      supabase.from('sessions').select('*'),
      fetchPaged('swimmer_ai_feedback', '*', q => q.eq('swimmer_id', swimmerId).order('created_at', { ascending: false }))
    ]);

    // Convert to the format expected by getSwimmerDNA
    const resultsData = results || [];
    const attendanceData = attendance || [];
    const sessionsData = (sessions.data || []);
    const feedbackData = feedback || [];


    // 2. Generate DNA
    const dna = await getSwimmerDNA(
      swimmer, 
      resultsData, 
      attendanceData, 
      sessionsData, 
      feedbackData, 
      0, // Default slope for now
      period
    );


    if (req.body.previewOnly) {
      return res.status(200).json({ 
        metrics: {
          consistency_pct: dna.training.consistency_pct,
          volume_pct: dna.training.volume_pct,
          peak_wa: dna.technical.peak_wa,
          analysis_period: period
        }
      });
    }

    // 3. Run AI Analysis

    const result = await analyzeFacet(dna, facet, customPrompt);
    
    // DEBUG LOGGING
    try {
      const fs = require('fs');
      const path = require('path');
      const logPath = path.join(process.cwd(), 'scratch', 'last_sandbox_ai_response.json');
      fs.writeFileSync(logPath, JSON.stringify({ dna, result }, null, 2));
      
      // Log the prompt used for debugging
      fs.writeFileSync(path.join(process.cwd(), 'scratch', 'last_sandbox_prompt.txt'), customPrompt || "LOADED_FROM_FILE");
    } catch (e) {}


    res.status(200).json({ result, dna });
  } catch (err) {
    console.error("Sandbox API Error:", err);
    res.status(500).json({ error: err.message });
  }
}
