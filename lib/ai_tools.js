import { fetchAllocationData, fetchAttendanceRange } from './allocation-data';
import { buildAllocationReport } from './session-allocations';
import { getDayOrder } from './analytics-utils';

/**
 * Tools the chat assistant can call.
 *
 * The alternative — pre-loading every dataset into the system prompt — cost
 * ~20k tokens on every turn, could not answer a window the prompt didn't
 * anticipate, and made the model do arithmetic over hundreds of rows (which it
 * got wrong). Each tool here computes its answer in JavaScript and returns a
 * small result, so the numbers are exact and only the relevant slice is paid
 * for.
 */

// Allocation data changes only when a sync runs; a short cache keeps a
// multi-tool turn from re-reading the whole timetable several times over.
const CACHE_MS = 2 * 60 * 1000;
let cache = { data: null, at: 0 };

async function allocation() {
  if (cache.data && Date.now() - cache.at < CACHE_MS) return cache.data;
  const data = await fetchAllocationData();
  cache = { data, at: Date.now() };
  return data;
}

const round = (n, dp = 1) => Math.round(n * 10 ** dp) / 10 ** dp;

function matchSwimmers(swimmers, { swimmerName, squad }) {
  const name = (swimmerName || '').trim().toLowerCase();
  const sq = (squad || '').trim().toLowerCase();
  return swimmers.filter(s => {
    if (!s.is_squad_member) return false;
    if (sq && (s.squad_name || '').toLowerCase() !== sq) return false;
    if (name && !(s.preferred_name || s.full_name || '').toLowerCase().includes(name)) return false;
    return true;
  });
}

export const TOOLS = [
  {
    name: 'list_squads',
    description: 'List the club\'s squads with headcount and weekly training targets. Call this first if you need to know which squads exist or how a squad name is spelled.',
    input_schema: { type: 'object', properties: {} },
    async run() {
      const data = await allocation();
      const { groups } = buildAllocationReport(data, { groupBy: 'squad', includeUnallocated: true });
      return {
        squads: data.squads.map(sq => {
          const g = groups.find(x => x.label === sq.name);
          return {
            name: sq.name,
            athletes: g?.totalSwimmers || 0,
            target_sessions_per_week: sq.target_sessions_per_week || null,
            target_hours_per_week: sq.target_hours_per_week || null,
            avg_sessions_allocated: g ? round(g.avgSessions) : null,
            avg_hours_allocated: g ? round(g.avgHours) : null
          };
        })
      };
    }
  },

  {
    name: 'get_timetable',
    description: 'The club training timetable: every session with its day, duration, location and how many athletes are allocated to it.',
    input_schema: {
      type: 'object',
      properties: {
        day: { type: 'string', description: 'Optional weekday filter, e.g. "Monday".' }
      }
    },
    async run({ day }) {
      const data = await allocation();
      const headcount = {};
      data.allocations.forEach(a => { headcount[a.session_id] = (headcount[a.session_id] || 0) + 1; });
      const sessions = data.sessions
        .filter(s => !day || s.day.toLowerCase() === day.trim().toLowerCase())
        .sort((a, b) => getDayOrder(a.day) - getDayOrder(b.day) || a.name.localeCompare(b.name))
        .map(s => ({
          day: s.day, name: s.name, hours: s.durationHours,
          location: s.location, active: s.is_active, athletes_allocated: headcount[s.id] || 0
        }));
      return { session_count: sessions.length, sessions };
    }
  },

  {
    name: 'get_session_allocations',
    description: 'Per-athlete session allocation: how many sessions each athlete is scheduled into, weekly hours, and variance against their squad target. Filter by squad and/or swimmer name. Use for "how many sessions is X allocated" and "who is under/over their target".',
    input_schema: {
      type: 'object',
      properties: {
        squad: { type: 'string', description: 'Squad name, exactly as returned by list_squads.' },
        swimmerName: { type: 'string', description: 'Full or partial athlete name.' },
        onlyUnallocated: { type: 'boolean', description: 'Return only athletes with zero allocated sessions.' },
        onlyBelowTarget: { type: 'boolean', description: 'Return only athletes allocated fewer sessions than their squad target. Note this is relative to each squad\'s target, not an absolute number.' },
        belowSessions: { type: 'number', description: 'Strictly fewer than this many allocated sessions. Use for "less than N sessions".' },
        maxSessions: { type: 'number', description: 'At most this many allocated sessions (inclusive).' },
        aboveSessions: { type: 'number', description: 'Strictly more than this many allocated sessions.' },
        minSessions: { type: 'number', description: 'At least this many allocated sessions (inclusive).' },
        belowHours: { type: 'number', description: 'Strictly fewer than this many allocated weekly hours.' },
        aboveHours: { type: 'number', description: 'Strictly more than this many allocated weekly hours.' }
      }
    },
    async run({ squad, swimmerName, onlyUnallocated, onlyBelowTarget,
      belowSessions, maxSessions, aboveSessions, minSessions, belowHours, aboveHours }) {
      const data = await allocation();
      const { groups } = buildAllocationReport(data, {
        groupBy: 'squad', sortBy: 'name', sortDir: 'asc', includeUnallocated: true
      });

      let rows = groups.flatMap(g => g.entries).map(e => ({
        swimmer: e.swimmer.preferred_name,
        squad: e.swimmer.squad_name,
        sessions_allocated: e.count,
        weekly_hours: e.hours,
        target_sessions: e.targetSessions || null,
        target_hours: e.targetHours || null,
        session_variance: e.sessionVariance,
        days: e.sessions.map(s => s.day),
        session_names: e.sessions.map(s => s.name)
      }));

      const wanted = new Set(matchSwimmers(data.swimmers, { swimmerName, squad }).map(s => s.preferred_name));
      const inScope = rows.filter(r => wanted.has(r.swimmer));
      rows = inScope;

      if (onlyUnallocated) rows = rows.filter(r => r.sessions_allocated === 0);
      if (onlyBelowTarget) rows = rows.filter(r => r.session_variance !== null && r.session_variance < 0);
      if (belowSessions != null) rows = rows.filter(r => r.sessions_allocated < belowSessions);
      if (maxSessions != null) rows = rows.filter(r => r.sessions_allocated <= maxSessions);
      if (aboveSessions != null) rows = rows.filter(r => r.sessions_allocated > aboveSessions);
      if (minSessions != null) rows = rows.filter(r => r.sessions_allocated >= minSessions);
      if (belowHours != null) rows = rows.filter(r => r.weekly_hours < belowHours);
      if (aboveHours != null) rows = rows.filter(r => r.weekly_hours > aboveHours);

      rows.sort((a, b) => a.sessions_allocated - b.sessions_allocated || a.swimmer.localeCompare(b.swimmer));

      // A count filtered on an absolute number is easy to misread as a
      // shortfall, so return the squad targets alongside it: "under 3 sessions"
      // includes everyone on target in a squad whose target is 2.
      const targets = {};
      inScope.forEach(r => {
        if (r.target_sessions != null) targets[r.squad] = r.target_sessions;
      });

      const distribution = {};
      inScope.forEach(r => {
        distribution[r.sessions_allocated] = (distribution[r.sessions_allocated] || 0) + 1;
      });

      return {
        count: rows.length,
        total_in_scope: inScope.length,
        squad_session_targets: targets,
        distribution_of_all_in_scope: distribution,
        athletes: rows
      };
    }
  },

  {
    name: 'get_attendance',
    description: 'Actual attendance from training registers over any period you specify. Rate is present/(present+absent). Use for "who has attended less than X% in the last N weeks". Returns exact counts — do not recompute them yourself.',
    input_schema: {
      type: 'object',
      properties: {
        weeks: { type: 'number', description: 'Length of the lookback window in weeks. Any value is allowed.' },
        squad: { type: 'string' },
        swimmerName: { type: 'string' },
        belowRatePercent: { type: 'number', description: 'Strictly less than this percentage. Use for "less than X%" / "under X%".' },
        maxRatePercent: { type: 'number', description: 'At or below this percentage (inclusive). Use for "X% or less".' },
        aboveRatePercent: { type: 'number', description: 'Strictly greater than this percentage.' },
        minRatePercent: { type: 'number', description: 'At or above this percentage (inclusive).' },
        minRegisters: { type: 'number', description: 'Ignore athletes with fewer than this many registers in the window. Useful for excluding tiny samples.' }
      },
      required: ['weeks']
    },
    async run({ weeks, squad, swimmerName, belowRatePercent, maxRatePercent, aboveRatePercent, minRatePercent, minRegisters }) {
      const data = await allocation();
      const { since, bySwimmer } = await fetchAttendanceRange(weeks);

      const people = matchSwimmers(data.swimmers, { swimmerName, squad });
      let rows = people.map(s => {
        const rec = bySwimmer[s.id];
        const total = rec?.total || 0;
        return {
          swimmer: s.preferred_name,
          squad: s.squad_name,
          present: rec?.present || 0,
          registers: total,
          attendance_percent: total ? Math.round((rec.present / total) * 100) : null,
          last_present: rec?.lastPresent || null
        };
      });

      const noData = rows.filter(r => r.registers === 0).map(r => r.swimmer);
      rows = rows.filter(r => r.registers > 0);
      if (minRegisters) rows = rows.filter(r => r.registers >= minRegisters);
      if (belowRatePercent != null) rows = rows.filter(r => r.attendance_percent < belowRatePercent);
      if (maxRatePercent != null) rows = rows.filter(r => r.attendance_percent <= maxRatePercent);
      if (aboveRatePercent != null) rows = rows.filter(r => r.attendance_percent > aboveRatePercent);
      if (minRatePercent != null) rows = rows.filter(r => r.attendance_percent >= minRatePercent);
      rows.sort((a, b) => a.attendance_percent - b.attendance_percent);

      const criteria = [];
      if (belowRatePercent != null) criteria.push(`attendance < ${belowRatePercent}%`);
      if (maxRatePercent != null) criteria.push(`attendance <= ${maxRatePercent}%`);
      if (aboveRatePercent != null) criteria.push(`attendance > ${aboveRatePercent}%`);
      if (minRatePercent != null) criteria.push(`attendance >= ${minRatePercent}%`);
      if (minRegisters) criteria.push(`at least ${minRegisters} registers`);

      return {
        window_weeks: weeks,
        registers_since: since,
        criteria_applied: criteria.length ? criteria.join(', ') : 'none',
        count: rows.length,
        athletes: rows,
        excluded_no_registers: {
          count: noData.length,
          note: 'These athletes have no registers in the window. That is missing data, not 0% attendance.',
          swimmers: noData.slice(0, 40)
        }
      };
    }
  }
];

export const TOOL_SPECS = TOOLS.map(({ name, description, input_schema }) => ({ name, description, input_schema }));

export async function runTool(name, input) {
  const tool = TOOLS.find(t => t.name === name);
  if (!tool) return { error: `Unknown tool "${name}".` };
  try {
    return await tool.run(input || {});
  } catch (e) {
    console.error(`AI TOOL ${name} failed:`, e.message);
    return { error: `Tool "${name}" failed: ${e.message}` };
  }
}
