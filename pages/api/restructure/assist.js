import fs from 'fs';
import path from 'path';
import { requireAuth } from '../../../lib/api-auth';
import { chat } from '../../../lib/ai_provider';
import { solveRestructure } from '../../../lib/restructure-solver';
import { summariseModel } from '../../../lib/restructure-summary';
import { scoreGoals, GOALS } from '../../../lib/restructure-goals';
import { applyPatch } from '../../../lib/restructure-patch';
import { fetchRestructureBaseline } from '../../../lib/restructure-baseline';

/**
 * The assistant that sits beside a model.
 *
 * Two things are load-bearing here.
 *
 * First, it has no figures in its prompt. Everything it can say comes back from
 * a tool that read the solved model, so it quotes rather than computes. Stuffing
 * the metrics into the system prompt would have been simpler and would have let
 * it drift the moment a question needed a number that was not in the stuffing.
 *
 * Second, when it changes something it does not describe the effect — it calls
 * propose_change, which applies the change in ordinary code and re-runs the
 * solver, and gets the real before-and-after back. So "that would free up four
 * lane-hours" is the solver's answer, not a guess dressed as one.
 *
 * Nothing is saved. The proposed inputs go back to the browser, where the user
 * either takes them or does not.
 */

const TOOLS = [
  {
    name: 'get_model',
    description: 'The model currently on screen: what it does compared with the club today, the goals it is chasing and whether each was met, and the headline figures. Start here for almost any question.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'get_squads',
    description: 'Every squad in the model: age band, size, sessions and hours a week, places against what its swimmers need, LTAD band and gap, and whether it is locked.',
    input_schema: {
      type: 'object',
      properties: {
        squad: { type: 'string', description: 'Optional squad name to narrow to one.' }
      }
    }
  },
  {
    name: 'get_pool_time',
    description: 'The pool slots in the model — day, time, venue, lanes, lane-hours, whether the club runs it today or it is a candidate, and how much of it the plan actually used.',
    input_schema: {
      type: 'object',
      properties: {
        venue: { type: 'string' },
        day: { type: 'string' },
        onlyUnused: { type: 'boolean', description: 'Just the slots the plan left empty.' }
      }
    }
  },
  {
    name: 'get_session_usage',
    description:
      'How hard every session the club runs today is actually worked: places, how many swimmers are booked into it, how many turn up on average from the registers, and both as a percentage of capacity. Use this for anything about which water is busy, which is going to waste, or whether a session is worth keeping. Sorted emptiest first by default.',
    input_schema: {
      type: 'object',
      properties: {
        venue: { type: 'string' },
        day: { type: 'string' },
        squad: { type: 'string', description: 'Narrow to the sessions one squad uses.' },
        sortBy: {
          type: 'string',
          enum: ['emptiest', 'busiest', 'day'],
          description: 'emptiest (default) ranks by attendance against capacity, lowest first.'
        },
        limit: { type: 'number', description: 'Default 20. Use a larger number only if the whole week is genuinely needed.' }
      }
    }
  },
  {
    name: 'get_club_today',
    description: 'The club as it actually is: squads with real headcounts and age spreads, lane-hours booked, measured attendance. Use for any question about what happens now rather than in the model.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'get_coach_cover',
    description: 'Coach hours needed against hours the roster covers, peak concurrent demand, and every uncovered session.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'propose_change',
    description:
      'Change the model and get the real result back. The change is applied and the solver re-run, so the figures returned are measured, not estimated. Use this for every "what if" — never work out an effect yourself. Nothing is saved; the user decides whether to keep it.',
    input_schema: {
      type: 'object',
      properties: {
        changes: {
          type: 'array',
          description: 'One or more changes, applied in order.',
          items: {
            type: 'object',
            properties: {
              op: {
                type: 'string',
                enum: ['set_squad', 'add_slots', 'set_slot_enabled', 'remove_slots', 'set_goals', 'set_growth'],
                description: 'set_squad: alter a squad. add_slots: add candidate pool time. set_slot_enabled / remove_slots: take slots out. set_goals: change what the model optimises for. set_growth: change expected intake and drop-out.'
              },
              squad: { type: 'string', description: 'set_squad: squad name or id.' },
              sessionsPerWeek: { type: 'number' },
              hoursPerWeek: { type: 'number' },
              targetSize: { type: 'number' },
              swimmersPerLane: { type: 'number' },
              minAge: { type: 'number', description: 'Swimming age — age reached by 31 December.' },
              maxAge: { type: 'number' },
              locked: { type: 'boolean', description: 'true holds the squad exactly as it is.' },
              requireWeekend: { type: 'boolean' },
              days: { type: 'array', items: { type: 'string' }, description: 'add_slots: e.g. ["Tuesday","Thursday"].' },
              startTime: { type: 'string', description: 'HH:MM, 24-hour.' },
              endTime: { type: 'string' },
              lanes: { type: 'number' },
              venue: { type: 'string' },
              slot: { type: 'string', description: 'Slot id or label.' },
              slots: { type: 'array', items: { type: 'string' } },
              enabled: { type: 'boolean' },
              goals: {
                type: 'array',
                items: { type: 'string' },
                description: `Goal keys: ${GOALS.map(g => g.key).join(', ')}.`
              },
              expectedNewSwimmers: { type: 'number' },
              attritionPct: { type: 'number' }
            },
            required: ['op']
          }
        }
      },
      required: ['changes']
    }
  }
];

function round(n) {
  return typeof n === 'number' ? Math.round(n * 10) / 10 : n;
}

/** The few figures every comparison turns on. Kept identical before and after a change. */
function headline(metrics) {
  const squads = (metrics.bySquad || []).filter(s => s.sessionsTarget > 0);
  return {
    squads: squads.length,
    squadsGettingFullWeek: `${squads.filter(s => s.requirementMet).length} of ${squads.length}`,
    swimmersCovered: metrics.swimmersServed,
    swimmersNotCovered: metrics.unservedDemand,
    laneHoursAvailable: round(metrics.availableLaneHours),
    laneHoursUsed: round(metrics.assignedLaneHours),
    poolUtilisationPct: round(metrics.utilisationPct),
    laneOccupancyPct: round(metrics.occupancyPct),
    ltadFit: round(metrics.ltadCompliancePct),
    coachHoursShort: metrics.coach ? round(metrics.coach.gapHours) : null,
    overallScore: round(metrics.total)
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!await requireAuth(req, res)) return;

  try {
    const { history, inputs, scenarioName } = req.body || {};
    if (!Array.isArray(history) || !history.length) {
      return res.status(400).json({ error: 'history is required' });
    }
    if (!inputs || typeof inputs !== 'object') {
      return res.status(400).json({ error: 'inputs is required' });
    }

    // The baseline is what "today" means. It is cached upstream, and the
    // assistant is useless without it — half its questions are comparisons.
    const baseline = await fetchRestructureBaseline();
    const solveOpts = { baselineLaneHours: baseline?.utilisation?.totalLaneHours };

    const current = solveRestructure(inputs, solveOpts);
    if (!current.ok) {
      return res.status(200).json({
        success: true,
        reply: `That model will not solve at the moment: ${(current.errors || ['unknown reason']).join(' ')} Fix that on the editing tabs and ask me again.`,
        proposal: null
      });
    }

    // What the assistant would hand back if the user accepts. Rebuilt by every
    // propose_change so the last one wins, which is what "no, try 5 instead"
    // means to a person.
    let proposal = null;

    const runTool = async (name, input = {}) => {
      switch (name) {
        case 'get_model': {
          const summary = summariseModel(current.metrics, baseline, { name: scenarioName });
          return {
            name: scenarioName || 'Unsaved model',
            comparedWithToday: summary?.headline,
            whatChanges: summary?.changes,
            whatItCosts: summary?.costs,
            goals: (inputs.goals || []).length
              ? scoreGoals(inputs.goals, current.metrics, baseline)
              : 'No goal chosen yet, so the model is being scored on default weights.',
            headline: headline(current.metrics),
            subScores: current.metrics.subScores,
            warnings: current.warnings
          };
        }

        case 'get_squads': {
          const rows = (current.metrics.bySquad || [])
            .filter(s => !input.squad
              || String(s.name).toLowerCase().includes(String(input.squad).toLowerCase()))
            .map(s => ({
              name: s.name,
              ages: `${s.minAge}-${s.maxAge}`,
              swimmers: s.targetSize,
              sessionsPerWeek: `${s.sessionsAssigned} placed of ${s.sessionsTarget} set`,
              hoursPerWeek: s.effectiveTargetHours,
              hoursAreDerived: s.targetHoursDerived,
              placesAcrossWeek: s.weeklyPlaces,
              placesItsSwimmersNeed: s.swimmerSessionsRequired,
              placesShort: s.placesShortfall,
              getsFullWeek: s.requirementMet,
              ltadBand: s.ltadBand?.stageCount
                ? `${s.ltadBand.min}-${s.ltadBand.max}h (${s.ltadBand.stageNames.join(', ')})`
                : null,
              ltadVerdict: s.ltadVerdict,
              ltadGapHours: s.ltadGapHours,
              ageBandSpansTooManyStages: s.bandWidthWarning,
              trainsOutsideAgeTimeGuide: s.curfewPenalty > 0,
              locked: (inputs.squads || []).find(x => x.id === s.squadId)?.locked === true,
              competitive: s.competitive
            }));
          return rows.length ? rows : 'No squad matched that name.';
        }

        case 'get_pool_time': {
          const used = new Map();
          (current.plan?.assignments || []).forEach(a => {
            used.set(a.slotId, (used.get(a.slotId) || 0) + (a.lanes || 0));
          });
          const rows = (inputs.poolSlots || [])
            .filter(s => s.enabled !== false)
            .filter(s => !input.venue
              || String(s.venue).toLowerCase().includes(String(input.venue).toLowerCase()))
            .filter(s => !input.day
              || String(s.day).toLowerCase() === String(input.day).toLowerCase())
            .map(s => ({
              id: s.id,
              label: s.label,
              day: s.day,
              time: `${s.startTime}-${s.endTime}`,
              venue: s.venue,
              lanes: s.lanes,
              lanesUsed: used.get(s.id) || 0,
              runsToday: s.source === 'existing',
              reservedFor: s.reservedFor || null,
              // What this water does today, where it is water the club already
              // runs. Without it, "should we keep this session" is a question
              // about lane counts rather than about swimmers.
              usedTodayBy: s.currentUse ? {
                places: s.currentUse.places,
                booked: s.currentUse.booked,
                bookedPctOfPlaces: s.currentUse.bookedPctOfPlaces,
                averageAttending: s.currentUse.averageAttending,
                attendingPctOfPlaces: s.currentUse.attendingPctOfPlaces
              } : null,
              squads: (current.plan?.assignments || [])
                .filter(a => a.slotId === s.id).map(a => a.squadName)
            }))
            .filter(r => !input.onlyUnused || r.lanesUsed === 0);
          return {
            slots: rows,
            note: 'lanesUsed is what this plan allocated. usedTodayBy is what the club puts in that water now, and is null for candidate slots that do not exist yet. A slot with lanesUsed 0 is water this plan put nothing into.'
          };
        }

        case 'get_session_usage': {
          const squadName = id =>
            (baseline.squads || []).find(s => s.id === id)?.name || null;

          let rows = (baseline.sessions || [])
            .filter(s => s.isActive)
            .filter(s => !input.venue
              || String(s.location).toLowerCase().includes(String(input.venue).toLowerCase()))
            .filter(s => !input.day
              || String(s.day).toLowerCase() === String(input.day).toLowerCase())
            .filter(s => !input.squad
              || String(squadName(s.squadIdFromName) || '').toLowerCase()
                .includes(String(input.squad).toLowerCase()))
            .map(s => ({
              session: s.name,
              day: s.day,
              time: s.startTime && s.endTime ? `${s.startTime}-${s.endTime}` : null,
              venue: s.location,
              lanes: s.lanes,
              laneHours: s.laneHours,
              lengthIsInferred: s.durationInferred,
              squad: squadName(s.squadIdFromName),
              places: s.places,
              booked: s.rosterCount,
              bookedPctOfPlaces: s.occupancyPct,
              registersSeen: s.attendance.registers,
              averageAttending: s.attendance.avgPresent,
              attendingPctOfPlaces: s.attendance.ofCapacityPct ?? null,
              attendingPctOfBooked: s.attendance.ofBookedPct ?? null
            }));

          const sortBy = input.sortBy || 'emptiest';
          if (sortBy === 'day') {
            rows.sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));
          } else {
            // A session with no register has no attendance figure, and ranking
            // it as though it were empty would put "we have never taken a
            // register here" at the top of a list titled "least used water".
            const key = r => (r.attendingPctOfPlaces === null
              ? r.bookedPctOfPlaces ?? 0 : r.attendingPctOfPlaces);
            rows.sort((a, b) => (sortBy === 'busiest' ? key(b) - key(a) : key(a) - key(b)));
          }

          const limit = Math.max(1, Math.min(200, Math.round(Number(input.limit) || 20)));
          const shown = rows.slice(0, limit);

          return {
            sessions: shown,
            showing: `${shown.length} of ${rows.length} sessions, sorted ${sortBy}`,
            club: {
              laneHoursBooked: baseline.utilisation?.totalLaneHours,
              placesBooked: baseline.utilisation?.totalPlaces,
              bookedPctOfPlaces: baseline.utilisation?.occupancyPct,
              attendingPctOfPlaces: baseline.utilisation?.actualOccupancyPct,
              measuredShowRate: baseline.utilisation?.measuredShowRate,
              sessionsWithNoRegister:
                (baseline.utilisation?.activeSessionCount || 0)
                - (baseline.utilisation?.sessionsWithRegisters || 0),
              sessionsWithNobodyBooked: baseline.utilisation?.emptySessionCount
            },
            note: 'booked is allocation, averageAttending is what the registers show. They differ widely at this club, so say which one you are quoting. attendingPctOfPlaces is null where no register has ever been taken — that is missing data, not an empty session.'
          };
        }

        case 'get_club_today':
          return {
            squads: (baseline.squads || []).map(s => ({
              name: s.name,
              swimmers: s.activeNonExemptCount,
              ageSpread: s.p10Age === null ? null : `${s.p10Age}-${s.p90Age}`,
              sessionsSetPerWeek: s.targetSessionsPerWeek,
              hoursSetPerWeek: s.targetHoursPerWeek,
              sessionsOfferedPerWeek: s.sessionsOfferedPerWeek,
              laneHoursItOccupies: s.currentLaneHours,
              placesAcrossWeek: s.weeklyPlaces,
              getsFullWeek: s.requirementMet
            })),
            club: {
              laneHoursBooked: baseline.utilisation?.totalLaneHours,
              sessions: baseline.utilisation?.activeSessionCount,
              placesBooked: baseline.utilisation?.totalPlaces,
              measuredShowRate: baseline.utilisation?.measuredShowRate,
              venues: baseline.venues
            },
            warnings: baseline.warnings
          };

        case 'get_coach_cover': {
          const c = current.metrics.coach;
          if (!c || c.coveragePct === null) {
            return 'No coach roster has been entered for this model, so coach cover cannot be reported. It is entered on the Coaches tab.';
          }
          return {
            hoursNeeded: round(c.requiredCoachHours),
            hoursCovered: round(c.coveredCoachHours),
            hoursShort: round(c.gapHours),
            coveragePct: round(c.coveragePct),
            mostCoachesNeededAtOnce: c.peakConcurrent,
            peakByDay: c.peakByDay,
            rosterSize: c.rosterSize,
            uncovered: (current.gaps?.coach || []).map(g => ({
              squad: g.squadName, day: g.day, time: `${g.startTime}-${g.endTime}`,
              venue: g.venue, short: g.shortfall, of: g.required, hoursPerWeek: g.hoursPerWeek
            }))
          };
        }

        case 'propose_change': {
          // Start from the model on screen, not from the last proposal: two
          // successive answers to "what if 5 sessions / no, what if 6" must both
          // measure against the same starting point.
          const patched = applyPatch(inputs, input.changes);
          if (!patched.applied.length) {
            return { applied: [], rejected: patched.rejected, note: 'Nothing changed.' };
          }

          const after = solveRestructure(patched.inputs, solveOpts);
          if (!after.ok) {
            return {
              applied: patched.applied,
              rejected: patched.rejected,
              note: 'That change leaves the model unsolvable, so it has not been offered to the user.',
              errors: after.errors
            };
          }

          const summary = summariseModel(after.metrics, baseline, { name: scenarioName });
          proposal = {
            inputs: patched.inputs,
            applied: patched.applied,
            rejected: patched.rejected,
            before: headline(current.metrics),
            after: headline(after.metrics),
            summary
          };

          return {
            applied: patched.applied,
            rejected: patched.rejected,
            before: proposal.before,
            after: proposal.after,
            goalsAfter: (patched.inputs.goals || []).length
              ? scoreGoals(patched.inputs.goals, after.metrics, baseline)
              : null,
            whatItCosts: summary?.costs,
            note: 'These are solved figures. The change is waiting for the user to accept or discard it — tell them what it does and that it is theirs to take.'
          };
        }

        default:
          return `Unknown tool: ${name}`;
      }
    };

    const promptPath = path.join(process.cwd(), 'lib', 'prompts', 'restructure-assistant.md');
    const systemPrompt = fs.readFileSync(promptPath, 'utf8');

    const reply = await chat({
      history: history.slice(-16),
      systemPrompt,
      tools: TOOLS,
      runTool,
      maxToolRounds: 8
    });

    return res.status(200).json({ success: true, reply, proposal });
  } catch (error) {
    console.error('restructure/assist failed:', error);
    // Non-fatal like the narrative route: a missing key or a provider outage
    // must not take the planner down with it.
    return res.status(200).json({
      success: false,
      reply: null,
      proposal: null,
      error: error.message
    });
  }
}
