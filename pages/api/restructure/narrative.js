import fs from 'fs';
import path from 'path';
import { requireAdminAuth } from '../../../lib/api-auth';
import { generateText } from '../../../lib/ai_provider';

/**
 * Committee-ready write-up of a solved scenario.
 *
 * Narrative only. Every figure reaching this route has already been computed by
 * the solver, and the prompt instructs that they be quoted verbatim rather than
 * recalculated — the screen, the spreadsheet and this briefing must not be able
 * to disagree about a number.
 *
 * Failure is deliberately non-fatal: a 200 with a null narrative, so a missing
 * API key or a provider outage leaves the planner fully usable.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!await requireAdminAuth(req, res)) return;

  try {
    const { metrics, gaps, warnings, scenarioName, comparison } = req.body || {};
    if (!metrics) return res.status(400).json({ error: 'metrics is required' });

    const promptPath = path.join(process.cwd(), 'lib', 'prompts', 'restructure.md');
    const systemPrompt = fs.readFileSync(promptPath, 'utf8');

    // Only what the briefing needs. Sending the whole solver output would bury
    // the figures that matter in per-decision diagnostics.
    const payload = {
      scenarioName: scenarioName || 'Proposed structure',
      headline: {
        laneHoursAvailable: metrics.availableLaneHours,
        laneHoursUsed: metrics.assignedLaneHours,
        laneHoursGainedVsToday: metrics.newLaneHoursGained,
        poolUtilisationPct: metrics.utilisationPct,
        laneOccupancyPct: metrics.occupancyPct,
        swimmersServed: metrics.swimmersServed,
        totalDemand: metrics.totalDemand,
        notAccommodated: metrics.unservedDemand,
        squadCount: metrics.squadCount
      },
      subScores: metrics.subScores,
      coach: metrics.coach ? {
        hoursNeeded: metrics.coach.requiredCoachHours,
        hoursCovered: metrics.coach.coveredCoachHours,
        hoursShort: metrics.coach.gapHours,
        coveragePct: metrics.coach.coveragePct,
        peakAtOnce: metrics.coach.peakConcurrent,
        peakByDay: metrics.coach.peakByDay,
        rosterSize: metrics.coach.rosterSize,
        coachesUsed: metrics.coach.headcountUsed
      } : null,
      squads: (metrics.bySquad || []).map(s => ({
        name: s.name, ages: `${s.minAge}-${s.maxAge}`,
        targetSize: s.targetSize, served: s.served, unserved: s.unserved,
        sessionsAssigned: s.sessionsAssigned, sessionsTarget: s.sessionsTarget,
        weeklyHours: s.effectiveTargetHours, hoursAreDerived: s.targetHoursDerived,
        ltadBand: s.ltadBand.stageCount ? `${s.ltadBand.min}-${s.ltadBand.max}h` : null,
        ltadStages: s.ltadBand.stageNames,
        ltadVerdict: s.ltadVerdict, ltadGapHours: s.ltadGapHours,
        ageBandTooWide: s.bandWidthWarning
      })),
      coachGaps: (gaps?.coach || []).map(g => ({
        day: g.day, time: `${g.startTime}-${g.endTime}`, venue: g.venue,
        squad: g.squadName, short: g.shortfall, of: g.required, hoursPerWeek: g.hoursPerWeek
      })),
      capacityGaps: (gaps?.capacity || []).map(g => g.message),
      youthTimePenalty: metrics.totalCurfewPenalty,
      warnings: warnings || [],
      comparison: comparison || null
    };

    const userPrompt = comparison
      ? `Compare these scenarios for the club committee and recommend one.\n\n${JSON.stringify(payload, null, 2)}`
      : `Write the committee briefing for this scenario.\n\n${JSON.stringify(payload, null, 2)}`;

    const narrative = await generateText({
      systemPrompt,
      userPrompt,
      // Reasoning is charged against max_tokens, so a 2000 budget can be spent
      // thinking and return a briefing truncated mid-sentence. See asis.js.
      maxTokens: 16000,
      temperature: 0.4,
      logLabel: 'RESTRUCTURE NARRATIVE'
    });

    return res.status(200).json({ success: true, narrative });
  } catch (error) {
    console.error('restructure/narrative failed:', error);
    // Non-fatal by design — the planner must stand up without it.
    return res.status(200).json({ success: false, narrative: null, error: error.message });
  }
}
