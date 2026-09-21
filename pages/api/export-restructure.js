import ExcelJS from 'exceljs';
import { requireAuth } from '../../lib/api-auth';
import { getServiceSupabase } from '../../lib/supabase';
import { solveRestructure, DEFAULT_POLICY } from '../../lib/restructure-solver';
// The workbook lands in a committee inbox without the screen beside it, so it
// has to use exactly the same words the screen does.
import { TERMS as T, LTAD_VERDICT_LABELS, SLOT_SOURCE_LABELS } from '../../lib/restructure-glossary';

// Midnight Stealth palette from styles/globals.css, so the workbook reads as the
// same product as the screen. ExcelJS wants ARGB without the leading '#'.
const C = {
  bgDeep: 'FF050B10',
  bgCard: 'FF0A1921',
  bgRow: 'FF0E222C',
  bgRowAlt: 'FF0B1B24',
  cyan: 'FF0096FF',
  teal: 'FF2DD4BF',
  amber: 'FFFBBF24',
  emerald: 'FF10B981',
  rose: 'FFF43F5E',
  white: 'FFFFFFFF',
  dim: 'FF8A9BA5',
  border: 'FF1C3440'
};

const FONT = 'Aptos Narrow';

const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const thin = { style: 'thin', color: { argb: C.border } };

/**
 * Spreadsheet export of a restructuring scenario.
 *
 * Re-runs the same solver on the same saved inputs rather than accepting a
 * result from the client. That is what keeps the workbook and the screen in
 * agreement — the same split that makes the session-allocations export reliable.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!await requireAuth(req, res)) return;

  try {
    let { inputs, name } = req.body || {};
    const { scenarioId } = req.body || {};

    if (scenarioId) {
      const supabase = getServiceSupabase();
      const { data, error } = await supabase
        .from('planning_scenarios').select('name, inputs').eq('id', scenarioId).single();
      if (error || !data) return res.status(404).json({ error: 'Scenario not found' });
      inputs = data.inputs;
      name = data.name;
    }

    if (!inputs || typeof inputs !== 'object') {
      return res.status(400).json({ error: 'inputs or scenarioId is required' });
    }

    const result = solveRestructure(inputs, { baselineLaneHours: inputs.baselineLaneHours });
    if (!result.metrics) {
      return res.status(400).json({ error: 'Scenario is not valid', details: result.errors });
    }

    const wb = new ExcelJS.Workbook();
    wb.creator = 'The Coaches Eye';
    wb.created = new Date();

    const title = name || 'Restructuring scenario';
    buildProposalSheet(wb, result, title);
    buildTimetableSheet(wb, result);
    buildMetricsSheet(wb, result, title);
    buildCoachSheet(wb, result);
    buildAssumptionsSheet(wb, inputs);

    const buffer = await wb.xlsx.writeBuffer();
    const stamp = new Date().toISOString().split('T')[0];
    const safe = title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'scenario';

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="restructure-${safe}-${stamp}.xlsx"`);
    return res.status(200).send(Buffer.from(buffer));
  } catch (error) {
    console.error('Restructure export error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

/** Shared page setup: dark card, no gridlines, landscape, fitted to width. */
function newSheet(wb, name) {
  const ws = wb.addWorksheet(name, {
    views: [{ showGridLines: false, state: 'frozen', ySplit: 1 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
  });
  return ws;
}

function styleHeader(ws) {
  const row = ws.getRow(1);
  row.eachCell(cell => {
    cell.font = { name: FONT, bold: true, size: 10, color: { argb: C.white } };
    cell.fill = fill(C.bgCard);
    cell.border = { top: thin, left: thin, bottom: thin, right: thin };
    cell.alignment = { vertical: 'middle', wrapText: true };
  });
  row.height = 26;
}

function styleBody(ws, startRow = 2) {
  for (let r = startRow; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    row.eachCell(cell => {
      cell.font = cell.font?.bold
        ? { name: FONT, size: 10, bold: true, color: cell.font.color || { argb: C.white } }
        : { name: FONT, size: 10, color: { argb: C.white } };
      cell.fill = fill(r % 2 === 0 ? C.bgRow : C.bgRowAlt);
      cell.border = { top: thin, left: thin, bottom: thin, right: thin };
    });
  }
}

/** Sheet 1 — the squad structure being proposed. */
function buildProposalSheet(wb, result, title) {
  const ws = newSheet(wb, 'Proposal');
  ws.columns = [
    { header: 'Squad', key: 'name', width: 26 },
    { header: 'Ages', key: 'ages', width: 10 },
    { header: 'Development stages', key: 'stages', width: 38 },
    { header: 'Target size', key: 'size', width: 12 },
    { header: 'Sessions/wk', key: 'sessions', width: 13 },
    { header: 'Hours/wk', key: 'hours', width: 11 },
    { header: 'Derived?', key: 'derived', width: 10 },
    { header: 'Lane-hours', key: 'laneHours', width: 12 },
    { header: 'Volume guide', key: 'band', width: 13 },
    { header: 'Volume fit', key: 'verdict', width: 20 },
    { header: 'Gap (h)', key: 'gap', width: 9 },
    { header: 'Covered', key: 'served', width: 9 },
    { header: 'Not covered', key: 'unserved', width: 12 }
  ];

  result.metrics.bySquad.forEach(s => {
    ws.addRow({
      name: s.name,
      ages: `${s.minAge}-${s.maxAge}`,
      stages: s.ltadBand.stageNames.join(', ') || '—',
      size: s.targetSize,
      sessions: `${s.sessionsAssigned} / ${s.sessionsTarget}`,
      hours: s.effectiveTargetHours,
      derived: s.targetHoursDerived ? 'Yes' : '',
      laneHours: s.laneHours,
      band: s.ltadBand.stageCount ? `${s.ltadBand.min}-${s.ltadBand.max}h` : '—',
      verdict: s.competitive ? (LTAD_VERDICT_LABELS[s.ltadVerdict] || s.ltadVerdict) : 'n/a (non-competitive)',
      gap: s.competitive ? s.ltadGapHours : '',
      served: s.served,
      unserved: s.unserved
    });
  });

  styleHeader(ws);
  styleBody(ws);

  // Colour the verdict and unserved columns so the sheet reads at a glance.
  const col = key => {
    const idx = ws.columns.findIndex(c => c.key === key);
    return idx === -1 ? null : String.fromCharCode(65 + idx);
  };
  const verdictCol = col('verdict');
  if (verdictCol) {
    ws.addConditionalFormatting({
      ref: `${verdictCol}2:${verdictCol}${ws.rowCount}`,
      rules: [
        // Matched against the words the sheet now prints, not the solver's
        // constants. 'On band' has to win, because every other verdict also
        // contains the word 'band'.
        { type: 'containsText', operator: 'containsText', text: 'On band', priority: 1, style: { font: { color: { argb: 'FF006100' } }, fill: fill('FFC6EFCE') } },
        { type: 'containsText', operator: 'containsText', text: 'Below band', priority: 2, style: { font: { color: { argb: 'FF9C5700' } }, fill: fill('FFFFEB9C') } },
        { type: 'containsText', operator: 'containsText', text: 'Above band', priority: 3, style: { font: { color: { argb: 'FF9C5700' } }, fill: fill('FFFFEB9C') } }
      ]
    });
  }
  const unservedCol = col('unserved');
  if (unservedCol) {
    ws.addConditionalFormatting({
      ref: `${unservedCol}2:${unservedCol}${ws.rowCount}`,
      rules: [
        { type: 'cellIs', operator: 'greaterThan', formulae: [0], priority: 1, style: { font: { color: { argb: 'FF9C0006' } }, fill: fill('FFFFC7CE') } }
      ]
    });
  }

  addNote(ws, [
    `Scenario: ${title}`,
    'Hours marked derived are calculated from sessions x session length because the club record holds zero for that squad. Nothing is written back to the club record.',
    'Volume fit compares a squad\'s weekly hours to the training volume guide its age range implies. The club\'s targets sit below that guide by design, so read the gap as context rather than a failure.'
  ]);
}

/** Sheet 2 — the week, one row per squad session. */
function buildTimetableSheet(wb, result) {
  const ws = newSheet(wb, 'Timetable');
  ws.columns = [
    { header: 'Day', key: 'day', width: 12 },
    { header: 'Start', key: 'start', width: 9 },
    { header: 'End', key: 'end', width: 9 },
    { header: 'Venue', key: 'venue', width: 22 },
    { header: 'Slot', key: 'slot', width: 30 },
    { header: 'Squad', key: 'squad', width: 24 },
    { header: 'Lanes', key: 'lanes', width: 8 },
    { header: 'Capacity', key: 'capacity', width: 10 },
    { header: 'Expected', key: 'expected', width: 10 },
    { header: 'Coaches', key: 'coaches', width: 26 },
    { header: 'Coach need', key: 'coachNeed', width: 12 },
    { header: 'Source', key: 'source', width: 11 },
    { header: 'Flags', key: 'flags', width: 60 }
  ];

  result.plan.assignments.forEach(a => {
    ws.addRow({
      day: a.day, start: a.startTime, end: a.endTime,
      venue: a.venue, slot: a.label, squad: a.squadName,
      lanes: a.lanes, capacity: a.capacity, expected: a.expected,
      coaches: a.coachNames.join(', ') || '—',
      coachNeed: `${a.coachesAssigned} / ${a.coachesRequired}`,
      source: SLOT_SOURCE_LABELS[a.source === 'existing' ? 'existing' : 'candidate'].term,
      flags: a.flags.map(f => f.message).join(' | ')
    });
  });

  styleHeader(ws);
  styleBody(ws);
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } };

  const col = key => {
    const idx = ws.columns.findIndex(c => c.key === key);
    return idx === -1 ? null : String.fromCharCode(65 + idx);
  };
  const flagsCol = col('flags');
  if (flagsCol && ws.rowCount > 1) {
    ws.addConditionalFormatting({
      ref: `${flagsCol}2:${flagsCol}${ws.rowCount}`,
      rules: [
        { type: 'containsText', operator: 'containsText', text: 'coaches available', priority: 1, style: { font: { color: { argb: 'FF9C0006' } }, fill: fill('FFFFC7CE') } },
        { type: 'containsText', operator: 'containsText', text: 'past the', priority: 2, style: { font: { color: { argb: 'FF9C5700' } }, fill: fill('FFFFEB9C') } }
      ]
    });
  }

  if (result.diagnostics.unusableSlots.length) {
    ws.addRow({});
    const header = ws.addRow({ day: 'SLOTS LEFT UNUSED' });
    header.getCell(1).font = { name: FONT, bold: true, size: 10, color: { argb: C.amber } };
    result.diagnostics.unusableSlots.forEach(s => {
      ws.addRow({
        day: s.day, start: s.startTime, end: s.endTime, venue: s.venue,
        slot: s.label, lanes: s.lanes, flags: s.reasons[0] || 'No squad needed it.'
      });
    });
  }
}

/** Sheet 3 — the figures, weekly and annualised. */
function buildMetricsSheet(wb, result, title) {
  const ws = newSheet(wb, 'Metrics');
  ws.columns = [
    { header: 'Measure', key: 'measure', width: 42 },
    { header: 'Value', key: 'value', width: 16 },
    { header: 'Notes', key: 'notes', width: 74 }
  ];

  const m = result.metrics;
  const rows = [
    [T.fitScore.term, m.total, T.fitScore.short],
    ['— ' + T.volumeFit.term, m.subScores.ltad, T.volumeFit.short],
    ['— ' + T.waterUsed.term, m.subScores.utilisation, T.waterUsed.short],
    ['— ' + T.swimmersCovered.term, m.subScores.served, T.swimmersCovered.short],
    ['— Coach cover', m.subScores.coachCover === undefined ? 'not scored' : m.subScores.coachCover,
      m.subScores.coachCover === undefined ? 'Nobody is on the roster, so cover is unanswered rather than failed.' : 'Coach-hours covered against coach-hours needed.'],
    ['— ' + T.timetableQuality.term, m.subScores.timetableQuality, T.timetableQuality.short],
    ['— ' + T.sessionsThatStayPut.term, m.subScores.continuity, T.sessionsThatStayPut.short],
    [null, null, null],
    [T.poolTimeOnOffer.term, m.availableLaneHours, T.poolTimeOnOffer.short],
    [T.poolTimeOccupied.term, m.assignedLaneHours, T.poolTimeOccupied.short],
    ['Pool time gained against today', m.newLaneHoursGained, 'Against the club timetable this plan was seeded from.'],
    [T.waterUsed.term + ' %', m.utilisationPct, T.waterUsed.short],
    [T.lanesFilled.term + ' %', m.occupancyPct, T.lanesFilled.short],
    [null, null, null],
    [T.swimmersCovered.term, m.swimmersServed, T.swimmersCovered.short],
    ['Roster today', m.rosterDemand, ''],
    ['Total demand', m.totalDemand, 'Roster plus expected joiners, less expected attrition.'],
    [T.swimmersNotCovered.term, m.unservedDemand, T.swimmersNotCovered.short],
    [null, null, null],
    ['Coach-hours needed', m.coach?.requiredCoachHours ?? '—', ''],
    ['Coach-hours covered', m.coach?.coveredCoachHours ?? '—', ''],
    [T.coachHoursShort.term, m.coach?.gapHours ?? '—', T.coachHoursShort.short],
    [T.coachesAtOnce.term, m.coach?.peakConcurrent ?? '—', T.coachesAtOnce.long],
    ['Coaches used', m.coach?.headcountUsed ?? '—', `Of ${m.coach?.rosterSize ?? 0} on the roster.`],
    [null, null, null],
    [T.timeGuidePenalty.term, m.totalCurfewPenalty, T.timeGuidePenalty.short],
    ['Weekend requirement met', m.weekendRequirementMet ? 'Yes' : 'No', ''],
    ['Squads unplaced in full', m.unscheduledSquads, ''],
    [T.squadCount.term, m.squadCount, T.squadCount.short]
  ];

  rows.forEach(([measure, value, notes]) => {
    if (measure === null) { ws.addRow({}); return; }
    ws.addRow({ measure, value, notes });
  });

  const annual = Number(result.metrics.assignedLaneHours) * 46;
  ws.addRow({});
  ws.addRow({ measure: 'Lane-hours per year (46 weeks)', value: +annual.toFixed(1), notes: 'Term-time weeks; adjust if the club runs a different year.' });

  styleHeader(ws);
  styleBody(ws);
  addNote(ws, [`Scenario: ${title}`].concat(result.warnings.slice(0, 12)));
}

/** Sheet 4 — coach load and what it would take to close the gaps. */
function buildCoachSheet(wb, result) {
  const ws = newSheet(wb, 'Coach Load & Gaps');
  ws.columns = [
    { header: 'Coach', key: 'coach', width: 26 },
    { header: 'Level', key: 'level', width: 11 },
    { header: 'Hours/wk', key: 'hours', width: 11 },
    { header: 'Sessions', key: 'sessions', width: 10 },
    { header: 'Cap', key: 'cap', width: 9 },
    { header: 'Status', key: 'status', width: 16 }
  ];

  const byCoach = result.metrics.coach?.byCoach || [];
  byCoach.forEach(c => {
    ws.addRow({
      coach: c.name, level: c.level || '', hours: c.hours, sessions: c.sessions,
      cap: c.maxHoursPerWeek ?? '',
      status: c.overCommitted ? 'Over cap' : c.unused ? 'Unused' : 'OK'
    });
  });
  if (!byCoach.length) ws.addRow({ coach: 'Nobody on the roster' });

  styleHeader(ws);
  styleBody(ws);

  ws.addRow({});
  const peakHeader = ws.addRow({ coach: 'PEAK COACHES NEEDED AT ONCE, BY DAY' });
  peakHeader.getCell(1).font = { name: FONT, bold: true, size: 10, color: { argb: C.cyan } };
  Object.entries(result.metrics.coach?.peakByDay || {}).forEach(([day, n]) => {
    ws.addRow({ coach: day, hours: n });
  });

  ws.addRow({});
  const gapHeader = ws.addRow({ coach: 'RECRUITMENT BRIEF — UNCOVERED SESSIONS' });
  gapHeader.getCell(1).font = { name: FONT, bold: true, size: 10, color: { argb: C.rose } };

  const gaps = result.gaps.coach || [];
  if (!gaps.length) {
    ws.addRow({ coach: byCoach.length ? 'Every session is covered.' : 'Not assessed — no roster entered.' });
  } else {
    ws.addRow({ coach: 'When', level: 'Venue', hours: 'Squad', sessions: 'Short', cap: 'Hrs/wk' });
    gaps.forEach(g => {
      ws.addRow({
        coach: `${g.day} ${g.startTime}-${g.endTime}`,
        level: g.venue,
        hours: g.squadName,
        sessions: `${g.shortfall} of ${g.required}`,
        cap: g.hoursPerWeek
      });
    });
  }
}

/** Sheet 5 — every assumption, so the workbook explains itself in an inbox. */
function buildAssumptionsSheet(wb, inputs) {
  const ws = newSheet(wb, 'Assumptions');
  ws.columns = [
    { header: 'Setting', key: 'setting', width: 44 },
    { header: 'Value', key: 'value', width: 30 },
    { header: 'Notes', key: 'notes', width: 74 }
  ];

  const p = { ...DEFAULT_POLICY, ...(inputs.policy || {}) };
  const g = inputs.growth || {};
  const w = inputs.weights || {};

  ws.addRow({ setting: 'SESSION TIMES FOR YOUNGER SWIMMERS', value: '', notes: 'Guides, not hard limits: a session outside them is placed, flagged and scored down.' });
  p.timeWindows.forEach(row => {
    ws.addRow({
      setting: `  Up to age ${row.maxAge === 99 ? 'any' : row.maxAge}`,
      value: `${row.schoolNightEnd} / ${row.otherEnd}`,
      notes: `Finish by, school night / other. No earlier than ${row.earliestStart}.${row.morningsDiscouraged ? ' Mornings discouraged.' : ''}`
    });
  });
  ws.addRow({ setting: '  School nights', value: (p.schoolNights || []).join(', '), notes: '' });
  ws.addRow({ setting: '  Penalty per minute outside the guide', value: p.curfewPenaltyPerMinute, notes: '' });
  ws.addRow({ setting: '  Band chosen by', value: 'Youngest member', notes: 'A 10-14 squad is judged by the 10-year-old.' });

  ws.addRow({});
  ws.addRow({ setting: 'HARD RULES', value: '', notes: 'The solver refuses arrangements that break these.' });
  ws.addRow({ setting: '  Minutes needed between venues', value: p.venueTransitMinutes, notes: 'Applies to squads and to coaches.' });
  ws.addRow({ setting: '  Preferred rest between sessions (h)', value: p.minRestHoursBetweenSessions, notes: '' });
  ws.addRow({ setting: '  Coach cover required', value: p.requireCoachCover ? 'Yes' : 'No', notes: p.requireCoachCover ? '' : 'Gaps are reported rather than blocking the plan.' });
  ws.addRow({ setting: '  Lane capacity', value: 'Soft', notes: 'A squad short of lanes is placed and flagged, because the club does train at higher density.' });

  ws.addRow({});
  ws.addRow({ setting: 'COACHING RATIOS', value: '', notes: '' });
  ws.addRow({ setting: '  Lanes per coach', value: p.maxLanesPerCoach, notes: '' });
  ws.addRow({ setting: '  Minimum coaches per session', value: p.minCoachesPerSquadSession, notes: '' });
  ws.addRow({ setting: '  Minimum where under-14s train', value: p.minCoachesPerSquadSessionUnder14, notes: '' });

  ws.addRow({});
  ws.addRow({ setting: 'DEMAND', value: '', notes: '' });
  ws.addRow({ setting: '  Expected new swimmers', value: g.expectedNewSwimmers ?? 0, notes: '' });
  ws.addRow({ setting: '  Expected attrition %', value: g.attritionPct ?? 0, notes: '' });
  ws.addRow({ setting: '  Assumed turnout rate', value: p.showRate, notes: '1.0 plans for the whole roster in the water at once.' });

  ws.addRow({});
  ws.addRow({ setting: 'SCORING WEIGHTS', value: '', notes: 'Only decide which plan is preferred when there is a choice. Every figure is reported separately regardless.' });
  Object.entries(w).forEach(([k, v]) => ws.addRow({ setting: `  ${k}`, value: v, notes: '' }));

  ws.addRow({});
  ws.addRow({ setting: 'Training volume guide table', value: p.ltadTable || 'unified', notes: 'Unified matches the club\'s own LTAD reference document.' });
  ws.addRow({ setting: 'Slots in scenario', value: (inputs.poolSlots || []).length, notes: `${(inputs.poolSlots || []).filter(s => s.source === 'existing').length} already booked, ${(inputs.poolSlots || []).filter(s => s.source !== 'existing').length} being considered.` });
  ws.addRow({ setting: 'Coaches on roster', value: (inputs.coaches || []).length, notes: '' });

  styleHeader(ws);
  styleBody(ws);
}

/** Footnotes under a sheet's data, dimmed so they read as commentary. */
function addNote(ws, lines) {
  ws.addRow({});
  lines.filter(Boolean).forEach(text => {
    const row = ws.addRow([text]);
    row.getCell(1).font = { name: FONT, size: 9, italic: true, color: { argb: C.dim } };
    row.getCell(1).alignment = { wrapText: true };
  });
}
