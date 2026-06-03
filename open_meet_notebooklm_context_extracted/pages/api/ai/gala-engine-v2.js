import { getServiceSupabase } from '../../../lib/supabase';
import { analyzeMeet } from '../../../lib/ai_engine';
import { normalizeName, normalizeEvent, timeToSeconds, getPreferredName } from '../../../lib/analytics-utils';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { meet, stats, results: bodyResults, pdfText, staffText, correction } = req.body;
  console.log("**************************************************");
  console.log(`>>> ENGINE HEARTBEAT: ${meet?.name}`);
  console.log(`>>> PDF DATA: ${pdfText?.length || 0} chars`);
  console.log(`>>> STAFF DATA: ${staffText?.length || 0} chars`);
  console.log(`>>> CORRECTION: ${correction || 'None'}`);
  console.log("**************************************************");

  try {
    const supabase = getServiceSupabase();

    // 1. Resolve the WHOLE family (Parent + All Children)
    let parentId = meet.id;
    if (meet.parent_id) {
      parentId = meet.parent_id;
    }

    const { data: familyMeets } = await supabase
      .from('meets')
      .select('id, staff_text, name, parent_id')
      .or(`id.eq.${parentId},parent_id.eq.${parentId}`);

    const meetIds = familyMeets.map(m => m.id);
    const parseNote = (text, sourceName) => {
      try {
        if (text && text.startsWith('[') && text.endsWith(']')) {
          const notes = JSON.parse(text);
          return notes.map(note => `[${sourceName} - ${new Date(note.date).toLocaleDateString()}]: ${note.text}`).join('\n');
        }
        return text ? `[From ${sourceName}]: ${text}` : '';
      } catch (e) {
        return text ? `[From ${sourceName}]: ${text}` : '';
      }
    };

    const consolidatedStaffText = familyMeets
      ?.filter(n => n.staff_text)
      .map(n => parseNote(n.staff_text, n.name))
      .join('\n\n') || parseNote(staffText, meet.name) || '';

    console.log(`>>> FAMILY DETECTED: Found ${familyMeets.length} related sessions/weekends.`);

    // 2. Re-fetch ALL results and ALL stats for the family to ensure complete DNA
    const { data: familyResults } = await supabase
      .from('results')
      .select('*, swimmers(full_name, known_as, squad, gender, year_of_birth)')
      .in('meet_id', meetIds)
      .order('rank', { ascending: true });

    // Use family results as the source of truth
    const results = (familyResults || bodyResults).map(r => ({
      ...r,
      resolved_name: getPreferredName(r.swimmers)
    }));

    const swimmerNameParts = results.flatMap(r => {
      const preferred = r.swimmers?.known_as || r.swimmers?.full_name;
      const lower = preferred?.toLowerCase();
      if (!lower) return [];
      // Catch individual names (First, Last, etc) to ensure we catch variations in PDF
      return lower.replace(/[^a-z\s]/g, "").split(/\s+/).filter(word => word.length > 2);
    });
    const uniqueNameParts = [...new Set(swimmerNameParts)];

    const allLines = pdfText ? pdfText.split('\n') : [];
    const contextIndices = new Set();
    
    allLines.forEach((line, i) => {
      const lowerLine = line.toLowerCase();
      const hasTonbridge = /tonbridge|tsc|tonb|ton /i.test(lowerLine);
      const hasSwimmer = uniqueNameParts.some(part => lowerLine.includes(part));
      const hasPodium = ['gold', 'silver', 'bronze', 'medal', 'podium', 'winner', '1st', '2nd', '3rd', 'place'].some(k => lowerLine.includes(k));
      const hasEvent = lowerLine.includes('event ') || lowerLine.includes('boys') || lowerLine.includes('girls') || lowerLine.includes('age group') || lowerLine.includes('results');
      const hasPlace = /^([123][\.\s])|^(Place|Pos|Rank)[:\s]*[123]/i.test(line.trim()); 
      
      if (hasTonbridge || hasSwimmer || hasPodium || hasPlace || hasEvent) {
        // Reduced context window to 10 lines to save tokens while keeping event/result context
        for (let j = Math.max(0, i - 10); j <= Math.min(allLines.length - 1, i + 10); j++) {
          contextIndices.add(j);
        }
      }
    });

    const filteredPdfText = Array.from(contextIndices)
      .sort((a, b) => a - b)
      .map(idx => allLines[idx])
      .join('\n');

    // 3. JS-based Podium Detection (Guaranteed Redundancy Layer)
    const detectedMedals = [];
    let currentEvent = 'Unknown Event';
    const { data: allSwimmers } = await supabase.from('swimmers').select('id, full_name, known_as');
    
    allLines.forEach((line, i) => {
      const lower = line.toLowerCase();
      if (/^\s*EVENT\s+\d+/i.test(line)) {
        currentEvent = line.trim();
      }

      const hasTonbridge = /tonbridge|tsc|tonb|ton /i.test(line);
      const podiumMatch = line.trim().match(/^([123])[\.\s]/) || 
                          line.trim().match(/^(Place|Pos|Rank)[:\s]*([123])/i) ||
                          lower.includes('1st') || lower.includes('2nd') || lower.includes('3rd');
      
      if (hasTonbridge && podiumMatch && allSwimmers) {
        let medalType = 'Bronze';
        if (lower.includes('1st') || lower.includes('1.') || lower.includes('place 1') || lower.includes('pos 1')) medalType = 'Gold';
        else if (lower.includes('2nd') || lower.includes('2.') || lower.includes('place 2') || lower.includes('pos 2')) medalType = 'Silver';
        
        // Improved name matching: Last name must match, plus either first name or initial
        const normalizedLine = lower.replace(/[^a-z0-9]/g, ' ');
        const swimmerMatch = allSwimmers.find(s => {
          // Check both full name and known as name
          const nameOptions = [s.full_name];
          if (s.known_as) {
            const lastName = s.full_name.split(/[,\s]+/).filter(w => w.length > 1)[0];
            nameOptions.push(`${s.known_as} ${lastName}`);
          }

          return nameOptions.some(nameStr => {
            const names = nameStr.toLowerCase().split(/[,\s]+/).filter(w => w.length > 1);
            if (names.length < 2) return false;
            
            const lastName = names[0]; 
            const firstName = names[1];
            
            const hasLast = normalizedLine.includes(lastName);
            const hasFirst = normalizedLine.includes(firstName) || normalizedLine.includes(firstName[0] + ' ');
            
            if (hasLast && hasFirst) return true;
            
            const lastName2 = names[names.length - 1];
            const firstName2 = names[0];
            const hasLast2 = normalizedLine.includes(lastName2);
            const hasFirst2 = normalizedLine.includes(firstName2) || normalizedLine.includes(firstName2[0] + ' ');
            
            return hasLast2 && hasFirst2;
          });
        });

        if (swimmerMatch) {
          detectedMedals.push({
            swimmer_name: getPreferredName(swimmerMatch),
            medal_type: medalType,
            event: currentEvent,
            evidence: line.trim()
          });
        }
      }
    });

    // 3. Structured Medal Check (from results table rank data)
    results.forEach(r => {
      if (r.rank && r.rank >= 1 && r.rank <= 3) {
        const medalType = r.rank === 1 ? 'Gold' : r.rank === 2 ? 'Silver' : 'Bronze';
        // Avoid duplicate if already found in PDF
        const alreadyFound = detectedMedals.find(m => 
          m.swimmer_name === r.swimmers?.full_name && 
          m.event === r.event &&
          m.medal_type === medalType
        );
        
        if (!alreadyFound) {
          detectedMedals.push({
            swimmer_name: getPreferredName(r.swimmers),
            medal_type: medalType,
            event: r.event,
            evidence: `Rank ${r.rank} detected in race results table.`
          });
        }
      }
    });

    console.log(`>>> FINAL GALA ENGINE: Captured ${detectedMedals.length} medals (Text + Structured).`);

    // 3. Fetch Pathway Benchmarks (National Top 40, Regional Top 30, County Top 10)
    // Filter by the ages and genders present in this meet to keep context lean
    const ages = [...new Set(results.map(r => r.swimmers?.year_of_birth ? new Date().getFullYear() - r.swimmers.year_of_birth : null).filter(Boolean))];
    const genders = [...new Set(results.map(r => r.swimmers?.gender).filter(Boolean))];
    
    const { data: benchmarks } = await supabase
      .from('benchmarks')
      .select('*')
      .in('age_group', ages)
      .in('gender', genders.map(g => (g === 'M' || g === 'Male') ? 'Male' : 'Female'));

    // 4. Final Medal Deduplication: Group by Swimmer + Event to catch Heat vs Final duplicates
    // Use robust normalization for the keys
    const medalGroups = {};
    detectedMedals.forEach(m => {
      const normName = normalizeName(m.swimmer_name);
      const normEvent = normalizeEvent(m.event);
      const key = `${normName}-${normEvent}`;
      
      if (!medalGroups[key]) medalGroups[key] = [];
      medalGroups[key].push(m);
    });

    const finalMedalists = Object.values(medalGroups).map(group => {
      // Prioritize "Gold" then "Silver" then "Bronze"
      const priority = { 'gold': 1, 'silver': 2, 'bronze': 3 };
      return group.sort((a, b) => {
        const pA = priority[a.medal_type.toLowerCase()] || 99;
        const pB = priority[b.medal_type.toLowerCase()] || 99;
        return pA - pB;
      })[0];
    });

    const medalCounts = {
      gold: finalMedalists.filter(m => m.medal_type.toLowerCase().includes('gold')).length,
      silver: finalMedalists.filter(m => m.medal_type.toLowerCase().includes('silver')).length,
      bronze: finalMedalists.filter(m => m.medal_type.toLowerCase().includes('bronze')).length,
      total: finalMedalists.length
    };

    console.log(`>>> FINAL GALA ENGINE: Reduced ${detectedMedals.length} potential matches to ${finalMedalists.length} unique medals.`);

    // 5. Near-Miss Bubble Analysis (Find 9th/10th places and calculate gap to 8th)
    const nearMisses = [];
    results.filter(r => (r.rank === 9 || r.rank === 10) && r.round?.toLowerCase().includes('heat')).forEach(r => {
      // Find the 8th place time for this event in the PDF
      // Look for the "Event X" header nearest to our swimmer
      const eventPattern = new RegExp(`Event\\s+\\d+.*${r.event.replace('m ', '.*').replace(/\s+/g, '.*')}`, 'i');
      let eighthTime = null;
      let foundEvent = false;

      for (let i = 0; i < allLines.length; i++) {
        const line = allLines[i];
        if (eventPattern.test(line)) {
          foundEvent = true;
          // Look forward from here for the 8th place
          for (let j = i + 1; j < Math.min(i + 100, allLines.length); j++) {
            const innerLine = allLines[j];
            if (innerLine.includes('Event ') || innerLine.includes('Results -')) {
              if (eighthTime) break;
            }
            // HY-TEK format can be "8 Name Team Time" or "Team Age 8 Name Time"
            // We look for a standalone "8" followed by a name and then a time
            const match8 = innerLine.match(/\s8\s+[A-Z][a-z]+,?\s+[A-Z].*?(\d+[:\.]\d+[\.\d]*)/) || 
                           innerLine.match(/^\s*8\s+[A-Z].*?(\d+[:\.]\d+[\.\d]*)/);
            if (match8) {
              eighthTime = match8[1];
              break;
            }
          }
          if (eighthTime) break;
        }
      }

      if (eighthTime) {
        const gap = Math.abs(timeToSeconds(r.time) - timeToSeconds(eighthTime)).toFixed(2);
        nearMisses.push({
          swimmer: getPreferredName(r.swimmers),
          event: r.event,
          rank: r.rank,
          gap,
          eighth_place_time: eighthTime,
          your_time: r.time
        });
      }
    });

    // === HISTORICAL COMPARATIVE ENGINE ===
    // Robust normalizer to match the EXACT same gala across seasons
    const cleanNameForMatch = (nameStr) => {
      if (!nameStr) return '';
      return nameStr
        .toLowerCase()
        .replace(/\b20\d{2}\b/g, '') // remove year
        .replace(/\b(lc|sc|swimming|club|championships|championship|gala|open|meet|tsc|champs|long\s+course|short\s+course)\b/g, '') // remove fillers
        .replace(/[^a-z0-9]/g, '') // strip punctuation and spaces
        .trim();
    };

    const currentCleaned = cleanNameForMatch(meet.name);
    console.log(`>>> HISTORICAL MATCHING: Current Cleaned Signature: "${currentCleaned}"`);
    
    // Extract the primary words from the meet name, ignoring filler words and numbers
    const cleanWords = meet.name
      .split(/\s+/)
      .filter(w => w.length > 2 && !/^(swimming|championships|championship|gala|open|meet|club|long|short|course|champs|series)$/i.test(w) && !/^\d+$/.test(w));

    let queryBuilder = supabase.from('meets').select('id, name, date, parent_id, course');
    if (cleanWords.length >= 2) {
      queryBuilder = queryBuilder.ilike('name', `%${cleanWords[0]}%`).ilike('name', `%${cleanWords[1]}%`);
    } else if (cleanWords.length === 1) {
      queryBuilder = queryBuilder.ilike('name', `%${cleanWords[0]}%`);
    } else {
      const firstWord = meet.name.split(/\s+/).find(w => !/^\d+$/.test(w));
      if (firstWord) {
        queryBuilder = queryBuilder.ilike('name', `%${firstWord}%`);
      }
    }

    // Fetch matching meets matching keyword queries
    const { data: allActiveMeets } = await queryBuilder;
      
    // Find all matching meets strictly matching the signature and the course type (LC vs SC)
    const historicalMeets = (allActiveMeets || []).filter(m => {
      if (m.id === meet.id || m.id === parentId || m.parent_id === parentId) return false;
      const mCleaned = cleanNameForMatch(m.name);
      const courseMatch = !m.course || !meet.course || m.course === meet.course;
      return mCleaned === currentCleaned && courseMatch;
    });
    
    console.log(`>>> HISTORICAL MATCHING: Found ${historicalMeets.length} matching gala seasons.`);
    
    // Group matches by their gala family group (master ID) to avoid dividing multi-session galas
    const familyIds = new Set();
    historicalMeets.forEach(m => {
      familyIds.add(m.parent_id || m.id);
    });

    let comparisons = [];
    if (familyIds.size > 0) {
      // Find all sibling meets belonging to these families
      const familyMeets = (allActiveMeets || []).filter(m => familyIds.has(m.parent_id || m.id));
      const familyMeetIds = familyMeets.map(m => m.id);
      
      // Query results for all these meets in a single batched query
      const { data: historicalResults } = await supabase
        .from('results')
        .select('id, meet_id, swimmer_id, wa_pts, rank, is_pb')
        .in('meet_id', familyMeetIds);
        
      if (historicalResults) {
        comparisons = Array.from(familyIds).map(familyId => {
          // Filter meets belonging to this specific family
          const siblingMeets = familyMeets.filter(m => (m.parent_id || m.id) === familyId);
          const siblingIds = siblingMeets.map(m => m.id);
          
          // Master meet represents the name and general date
          const masterMeet = siblingMeets.find(m => !m.parent_id) || siblingMeets[0];
          const mResults = historicalResults.filter(r => siblingIds.includes(r.meet_id));
          
          // Skip if no results exist in our DB for this family
          if (mResults.length === 0) return null;
          
          const swimmerIds = new Set(mResults.map(r => r.swimmer_id));
          const galaYear = new Date(masterMeet.date).getFullYear();
          const avgPts = Math.round(mResults.reduce((a, b) => a + (b.wa_pts || 0), 0) / (mResults.length || 1));
          
          return {
            meet_id: masterMeet.id,
            name: `${masterMeet.name.replace(/\b20\d{2}\b/g, '').trim()} (${galaYear})`,
            date: masterMeet.date,
            year: galaYear,
            total_swimmers: swimmerIds.size,
            total_races: mResults.length,
            avg_wa_pts: avgPts
          };
        })
        .filter(Boolean)
        .sort((a, b) => b.year - a.year); // Sort by year descending (newest first)
      }
    }

    // Prepare Meet DNA
    const dna = {
      type: 'meet_audit',
      metadata: {
        id: meet.id,
        name: meet.name,
        date: meet.date,
        license: meet.license,
        course: meet.course
      },
      stats: {
        ...stats,
        finalists: results.filter(r => r.round?.toLowerCase().includes('final')).length,
        near_misses: nearMisses.length
      },
      medal_counts: medalCounts, // Explicitly provide pre-calculated counts
      bubble_analysis: nearMisses,
      pdf_evidence: filteredPdfText || null, 
      detected_medals: finalMedalists,
      staff_context: consolidatedStaffText || null,
      user_correction: correction || null,
      benchmarks: benchmarks || [], // Inject benchmarks into the AI context
      results: (() => {
        const seen = new Set();
        const deduped = [];
        
        // Sort to prioritize Finals over Heats
        const sortedResults = [...results].sort((a, b) => {
          const aFinal = (a.round || '').toLowerCase() === 'final' ? 0 : 1;
          const bFinal = (b.round || '').toLowerCase() === 'final' ? 0 : 1;
          return aFinal - bFinal;
        });

        sortedResults.forEach(r => {
          const normEvent = normalizeEvent(r.event);
          const key = `${r.swimmer_id}|${normEvent}|${r.time}`;
          if (!seen.has(key)) {
            seen.add(key);
            deduped.push({
              name: getPreferredName(r.swimmers),
              squad: r.swimmers?.squads?.name,
              gender: r.swimmers?.gender,
              age: r.swimmers?.year_of_birth ? new Date().getFullYear() - r.swimmers.year_of_birth : null,
              event: r.event,
              time: r.time,
              round: r.round,
              rank: r.rank,
              wa_pts: r.wa_pts,
              is_pb: r.is_pb
            });
          }
        });
        return deduped;
      })()
    };

    // DEBUG: Log DNA to scratch
    try {
      const fs = require('fs');
      const path = require('path');
      fs.writeFileSync(path.join(process.cwd(), 'scratch', 'last_dna.json'), JSON.stringify(dna, null, 2));
    } catch (e) {}


    const analysis = await analyzeMeet(dna);

    // Merge JS-detected medals & comparisons as the source of truth for the UI
    if (analysis) {
      analysis.medalists = finalMedalists;
      analysis.historical_comparisons = comparisons;
    }

    // Save to ai_reports
    if (analysis && !analysis.error) {
      await supabase.from('ai_reports').insert({
        meet_id: meet.id,
        type: 'meet_audit',
        content: analysis,
        created_at: new Date().toISOString()
      });
    }

    return res.status(200).json(analysis);

  } catch (error) {
    console.error("API Final Gala Engine Error:", error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
