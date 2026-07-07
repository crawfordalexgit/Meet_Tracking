import { getServiceSupabase } from '../../../lib/supabase';
import { analyzeMeet } from '../../../lib/ai_engine';
import { normalizeName, normalizeEvent, timeToSeconds, getPreferredName } from '../../../lib/analytics-utils';
import { requireAuth } from '../../../lib/api-auth';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!await requireAuth(req, res)) return;

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

    // Extract structured staff entries (type:'staff') — deterministic, no AI needed for names
    const structuredSupportStaff = familyMeets.flatMap(m => {
      try {
        if (m.staff_text?.startsWith('[')) {
          return JSON.parse(m.staff_text)
            .filter(n => n.type === 'staff')
            .map(n => ({ name: n.name, role: n.role || '' }));
        }
      } catch (e) {}
      return [];
    });

    const parseNote = (text, sourceName) => {
      try {
        if (text && text.startsWith('[') && text.endsWith(']')) {
          const notes = JSON.parse(text);
          // Exclude structured staff entries from coaching notes text
          return notes
            .filter(note => !note.type || note.type === 'note')
            .map(note => `[${sourceName} - ${new Date(note.date).toLocaleDateString()}]: ${note.text}`)
            .join('\n');
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
      .select('*, swimmers(full_name, known_as, squad, gender, year_of_birth, is_ranked_member)')
      .in('meet_id', meetIds)
      .order('rank', { ascending: true });

    // Use family results as the source of truth, excluding non-ranked members (2nd club swimmers)
    const results = (familyResults || bodyResults)
      .filter(r => r.swimmers?.is_ranked_member !== false)
      .map(r => ({
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

    // 3. HY-TEK PDF Medal Extraction — deterministic strict parser
    // Matches: "[1-3] Lastname, Firstname  Age  Tonbridge ..." on a single line.
    // Requires team name "Tonbridge" to appear right after the swimmer's age on the SAME line,
    // eliminating false positives from partial substring matches (e.g. "garfield" inside "ingarfield").
    const detectedMedals = [];
    let currentEvent = 'Unknown Event';
    const { data: allSwimmersRaw } = await supabase.from('swimmers').select('id, full_name, known_as, is_ranked_member');
    const allSwimmers = (allSwimmersRaw || []).filter(s => s.is_ranked_member !== false);

    if (pdfText) {
      allLines.forEach((line, i) => {
        // Track event headers (strip page-continuation parens)
        const cleanLine = line.trim().replace(/^\(/, '').replace(/\)$/, '');
        if (/^Event\s+\d+/i.test(cleanLine)) {
          // Truncate at end of stroke name to remove 2-column PDF bleed
          // (right-column event headers / result rows can follow on the same extracted line)
          const strokeMatch = cleanLine.match(/^(Event\s+\d+\b.*?\b(?:freestyle|backstroke|breaststroke|butterfly|individual\s*medley))\b/i);
          currentEvent = strokeMatch ? strokeMatch[1].trim() : cleanLine;
          return;
        }

        // Skip lines that belong to a non-Tonbridge team
        if (/Orpington|Ojays/i.test(line)) return;

        // Extract place + swimmer name + age from result lines starting with 1, 2, or 3.
        // Does NOT require the team name on the same line — some PDF extractors push the
        // team name onto a separate preceding line (e.g. " Tonbridge\n1 Garfield, Edward 11 ...").
        const placeMatch = line.match(/^\s*([123])\s+([A-Za-z][A-Za-z'\-.]+),\s+([A-Za-z][A-Za-z'\-\s]*?)\s+(\d{1,2})\s+/);
        if (!placeMatch) return;

        // Confirm Tonbridge ownership: either inline on this line, or on the line directly above
        const hasTonbridgeInline = /\bTonbridge\b/i.test(line);
        const prevLine = i > 0 ? allLines[i - 1] : '';
        const hasTonbridgePrev  = /^\s*Tonbridge\s*$/i.test(prevLine);
        if (!hasTonbridgeInline && !hasTonbridgePrev) return;

        const place = parseInt(placeMatch[1]);
        const rawLast       = placeMatch[2].trim().toLowerCase();
        const rawFirst      = placeMatch[3].trim().toLowerCase(); // full multi-word first name
        const rawFirstWords = rawFirst.split(/\s+/);
        const medalType = place === 1 ? 'Gold' : place === 2 ? 'Silver' : 'Bronze';

        // Word-by-word first-name match: every PDF first-name word must be a prefix of the
        // corresponding DB first-name word. Handles "Sum Yau" vs "Sum Carson" correctly,
        // and still tolerates HY-TEK truncation (e.g. "Jon" matching "Jonathan").
        const swimmerMatch = allSwimmers?.find(s => {
          const fn = (s.full_name || '').toLowerCase();
          let dbLast, dbAllFirst;
          if (fn.includes(',')) {
            const [last, rest] = fn.split(',').map(p => p.trim());
            dbLast = last;
            dbAllFirst = rest;
          } else {
            const parts = fn.split(/\s+/);
            dbLast = parts[parts.length - 1];
            dbAllFirst = parts.slice(0, -1).join(' ');
          }
          if (dbLast !== rawLast) return false;
          const dbFirstWords = dbAllFirst.split(/\s+/);
          return rawFirstWords.every((w, i) => dbFirstWords[i] && dbFirstWords[i].startsWith(w));
        });

        detectedMedals.push({
          swimmer_name: swimmerMatch ? getPreferredName(swimmerMatch) : `${placeMatch[3].trim()} ${placeMatch[2].trim()}`,
          swimmer_id: swimmerMatch?.id || null,
          medal_type: medalType,
          event: currentEvent,
          evidence: `HY-TEK position ${place}: ${line.trim()}`
        });
      });
    }

    // Fallback: derive medals from results table rank when PDF parser found nothing
    // (e.g. non-HY-TEK PDF format or no PDF uploaded)
    if (detectedMedals.length === 0) {
      results.forEach(r => {
        if (r.rank && r.rank >= 1 && r.rank <= 3) {
          const medalType = r.rank === 1 ? 'Gold' : r.rank === 2 ? 'Silver' : 'Bronze';
          detectedMedals.push({
            swimmer_name: getPreferredName(r.swimmers),
            swimmer_id: r.swimmer_id || null,
            medal_type: medalType,
            event: r.event,
            evidence: `Rank ${r.rank} from results table.`
          });
        }
      });
    }

    // === RELAY MEDAL DETECTION ===
    // Parses HY-TEK relay event blocks to find Tonbridge finishing 1st, 2nd, or 3rd.
    // Relay medals are tracked per relay team (not per swimmer) for the medal counter card,
    // but each swimmer leg is also tagged in detectedMedals for AI narrative context.
    const relayMedals = [];
    if (pdfText && allSwimmers) {
      const allPdfLines = pdfText.split('\n');
      let inRelayEvent = false;
      let currentRelayEvent = '';

      for (let i = 0; i < allPdfLines.length; i++) {
        const line = allPdfLines[i];
        // Strip page-continuation parens e.g. "(Event 2 Mixed 13-99 200 SC Meter Freestyle Relay)"
        const trimmed = line.trim().replace(/^\(/, '').replace(/\)$/, '');

        // Detect relay event header
        if (/^Event\s+\d+.*relay/i.test(trimmed)) {
          inRelayEvent = true;
          currentRelayEvent = trimmed;
          continue;
        }

        // New non-relay event resets the flag
        if (/^Event\s+\d+/i.test(trimmed) && !/relay/i.test(trimmed)) {
          inRelayEvent = false;
          currentRelayEvent = '';
          continue;
        }

        if (!inRelayEvent) continue;

        // Match Tonbridge finishing 1st, 2nd, or 3rd in this relay
        const tonbridgePlaceMatch = line.match(/^\s*([123])\s+Tonbridge\b/i);
        if (!tonbridgePlaceMatch) continue;

        const place = parseInt(tonbridgePlaceMatch[1]);
        const medalType = place === 1 ? 'Gold' : place === 2 ? 'Silver' : 'Bronze';

        // Get relay label from the result line (e.g. "Tonbridge   A   NT   2:02.78")
        const labelOnLine = line.match(/Tonbridge\s+([A-H])\s/i);
        let relayLabel = labelOnLine ? labelOnLine[1] : '';
        // Fallback: HY-TEK sometimes puts the relay letter on its own line just before the result
        if (!relayLabel && i > 0) {
          const prevLine = allPdfLines[i - 1].trim();
          if (/^[A-H]$/.test(prevLine)) relayLabel = prevLine;
        }

        // Collect swimmer legs from the next 1–5 lines (page breaks are skipped)
        const legSwimmers = [];
        for (let j = i + 1; j <= Math.min(i + 5, allPdfLines.length - 1); j++) {
          const legLine = allPdfLines[j];
          if (/^---\s*PAGE BREAK/i.test(legLine)) continue;
          // Stop if we hit a new result row (e.g. "4   Tonbridge   B   NT...") that isn't a leg
          if (/^\s*\d+\s+[A-Z]/.test(legLine) && !/^\s*\d+\)/.test(legLine)) break;
          const legMatches = [...legLine.matchAll(/\d+\)\s+([A-Za-z\s\-']+),\s+([A-Za-z]+)\s+[MWFmwf]\d+/g)];
          legMatches.forEach(m => {
            legSwimmers.push({ lastName: m[1].trim(), firstName: m[2].trim().split(' ')[0] });
          });
          if (legSwimmers.length >= 4) break;
        }

        // Match each leg swimmer to the DB; fall back to the parsed name if no match found
        const matchedNames = legSwimmers.map(leg => {
          const found = allSwimmers.find(s => {
            const parts = (s.full_name || '').toLowerCase().replace(/,/g, '').split(/\s+/).filter(w => w.length > 1);
            const hasLast = parts.some(p => p === leg.lastName.toLowerCase().split(/\s+/)[0]);
            const hasFirst = parts.some(p => p === leg.firstName.toLowerCase());
            return hasLast && hasFirst;
          });
          return found ? getPreferredName(found) : `${leg.firstName} ${leg.lastName}`;
        });

        relayMedals.push({
          event: currentRelayEvent,
          place,
          medal_type: medalType,
          relay_label: relayLabel || 'A',
          swimmers: matchedNames
        });

        // Tag each relay swimmer in detectedMedals so the AI narrative can mention them by name
        matchedNames.forEach(swimmerName => {
          detectedMedals.push({
            swimmer_name: swimmerName,
            medal_type: medalType,
            event: currentRelayEvent,
            evidence: `Relay leg — Tonbridge ${relayLabel || 'A'} finished ${place}${place === 1 ? 'st' : place === 2 ? 'nd' : 'rd'} in ${currentRelayEvent}`,
            is_relay: true
          });
        });
      }
    }
    console.log(`>>> RELAY MEDALS: ${relayMedals.length} relay team medals detected.`);

    const relayMedalCounts = {
      gold:   relayMedals.filter(m => m.medal_type === 'Gold').length,
      silver: relayMedals.filter(m => m.medal_type === 'Silver').length,
      bronze: relayMedals.filter(m => m.medal_type === 'Bronze').length,
    };
    relayMedalCounts.total = relayMedalCounts.gold + relayMedalCounts.silver + relayMedalCounts.bronze;

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

    console.log(`>>> FINAL GALA ENGINE: Captured ${detectedMedals.length} raw medal signals (Text + Structured). Medal totals delegated to AI prompt.`);

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

    // Derive individual medal counts from detectedMedals (PDF scan + DB rank data, already computed above).
    // Exclude relay legs — they are tracked separately in relayMedals.
    // De-duplicate: one medal per swimmer+event combination (prefer Final over Heat where both exist).
    const individualMedals = detectedMedals.filter(m => !m.is_relay);
    const dedupedMedalMap = new Map();
    individualMedals.forEach(m => {
      // Normalize both fields so PDF event headers and DB event strings collapse to the same key
      const key = `${normalizeName(m.swimmer_name)}||${normalizeEvent(m.event)}`;
      const existing = dedupedMedalMap.get(key);
      // Prefer DB-rank evidence over PDF-scan (more authoritative); otherwise keep first found
      const isDbRank = (m.evidence || '').toLowerCase().includes('rank');
      if (!existing || isDbRank) {
        dedupedMedalMap.set(key, m);
      }
    });
    const dedupedMedals = Array.from(dedupedMedalMap.values());

    const tonbridgeMedals = {
      gold:   dedupedMedals.filter(m => m.medal_type === 'Gold').length,
      silver: dedupedMedals.filter(m => m.medal_type === 'Silver').length,
      bronze: dedupedMedals.filter(m => m.medal_type === 'Bronze').length,
    };
    tonbridgeMedals.total = tonbridgeMedals.gold + tonbridgeMedals.silver + tonbridgeMedals.bronze;

    // detectedMedalists: swimmer+event list passed into AI prompt and returned to client
    const detectedMedalists = dedupedMedals.map(m => ({
      swimmer_name: m.swimmer_name,
      swimmer_id: m.swimmer_id || null,
      place: m.medal_type === 'Gold' ? 1 : m.medal_type === 'Silver' ? 2 : 3,
      medal_type: m.medal_type,
      event: m.event
    }));

    console.log(`>>> MEDAL COUNTER: ${tonbridgeMedals.gold}G / ${tonbridgeMedals.silver}S / ${tonbridgeMedals.bronze}B from ${dedupedMedals.length} de-duped individual medals (PDF + DB rank).`);

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
      medal_counts: tonbridgeMedals,
      detected_medalists: detectedMedalists,
      bubble_analysis: nearMisses,
      pdf_evidence: filteredPdfText || null,
      staff_context: consolidatedStaffText || null,
      support_staff: structuredSupportStaff.length > 0 ? structuredSupportStaff : null,
      user_correction: correction || null,
      benchmarks: benchmarks || [], // Inject benchmarks into the AI context
      relay_medals: relayMedals, // Relay team medal results for AI narrative
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

    // Merge historical comparisons, relay medals, and JS-computed medal counts into AI analysis response.
    // individual_medal_counts is the single source of truth for the podium card so it always
    // matches the medal totals the AI references in its narrative text.
    if (analysis) {
      analysis.historical_comparisons = comparisons;
      analysis.relay_medals = relayMedals;
      analysis.relay_medal_counts = relayMedalCounts;
      analysis.individual_medal_counts = tonbridgeMedals;
      analysis.detected_medalists = detectedMedalists;
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
