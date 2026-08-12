import { getDayOrder } from './analytics-utils';

export const GROUP_OPTIONS = [
  { value: 'none', label: 'No Grouping (Flat Roster)' },
  { value: 'squad', label: 'Squad' },
  { value: 'day', label: 'Day of Week' },
  { value: 'session', label: 'Session' },
  { value: 'location', label: 'Location' }
];

export const SORT_OPTIONS = [
  { value: 'sessions', label: 'Sessions Allocated' },
  { value: 'hours', label: 'Weekly Hours' },
  { value: 'name', label: 'Swimmer Name' },
  { value: 'variance', label: 'Variance vs Target' }
];

// Targets are per-swimmer-per-week, so they are only meaningful on a row that
// covers the swimmer's whole allocation. Slicing by day/session/location shows a
// fragment of it, and comparing a fragment to a weekly target would read as a
// deficit that isn't real.
export const GROUPINGS_WITH_TARGETS = ['none', 'squad'];

export const DEFAULT_OPTIONS = {
  squadFilter: [],
  dayFilter: [],
  locationFilter: 'all',
  sessionFilter: 'all',
  activeOnly: true,
  includeExempt: true,
  includeUnallocated: true,
  search: '',
  groupBy: 'squad',
  sortBy: 'sessions',
  sortDir: 'desc'
};

/**
 * Turns the raw allocation payload into the grouped, filtered shape the report
 * renders. Kept out of the component so the spreadsheet export produces exactly
 * the same numbers as the screen rather than reimplementing the aggregation.
 */
export function buildAllocationReport(data, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const empty = { groups: [], totals: emptyTotals(), showTargets: false, canShowUnallocated: false, hasRoster: false };
  if (!data) return empty;

  const sessionsById = {};
  (data.sessions || []).forEach(s => { sessionsById[s.id] = s; });

  const squadById = {};
  (data.squads || []).forEach(s => { squadById[s.id] = s; });

  const term = (opts.search || '').trim().toLowerCase();
  const eligibleSwimmers = (data.swimmers || []).filter(sw => {
    if (!sw.is_squad_member) return false;
    if (opts.squadFilter.length && !opts.squadFilter.includes(sw.squad_id)) return false;
    if (!opts.includeExempt && sw.is_exempt) return false;
    if (term && !(sw.preferred_name || sw.full_name || '').toLowerCase().includes(term)) return false;
    return true;
  });

  const swimmerById = {};
  eligibleSwimmers.forEach(sw => { swimmerById[sw.id] = sw; });

  const rows = (data.allocations || []).reduce((acc, a) => {
    const swimmer = swimmerById[a.swimmer_id];
    const session = sessionsById[a.session_id];
    if (!swimmer || !session) return acc;
    if (opts.activeOnly && !session.is_active) return acc;
    if (opts.dayFilter.length && !opts.dayFilter.includes(session.day)) return acc;
    if (opts.locationFilter !== 'all' && session.location !== opts.locationFilter) return acc;
    if (opts.sessionFilter !== 'all' && session.id !== opts.sessionFilter) return acc;
    acc.push({ swimmer, session });
    return acc;
  }, []);

  const showTargets = GROUPINGS_WITH_TARGETS.includes(opts.groupBy);
  // A swimmer with zero allocations has no row to carry them, so only a grouping
  // keyed off the swimmer (not off a session attribute) can show them at all.
  const canShowUnallocated = showTargets && opts.includeUnallocated
    && !opts.dayFilter.length && opts.locationFilter === 'all' && opts.sessionFilter === 'all';

  const keyOf = (row) => {
    switch (opts.groupBy) {
      case 'squad': return { key: row.swimmer.squad_id || 'unassigned', label: row.swimmer.squad_name };
      case 'day': return { key: row.session.day, label: row.session.day };
      case 'session': return { key: row.session.id, label: `${row.session.day} — ${row.session.name}` };
      case 'location': return { key: row.session.location, label: row.session.location };
      default: return { key: 'all', label: 'All Athletes' };
    }
  };

  const buckets = new Map();
  const bucketFor = (key, label) => {
    if (!buckets.has(key)) buckets.set(key, { key, label, swimmers: new Map() });
    return buckets.get(key);
  };

  rows.forEach(row => {
    const { key, label } = keyOf(row);
    const bucket = bucketFor(key, label);
    if (!bucket.swimmers.has(row.swimmer.id)) {
      bucket.swimmers.set(row.swimmer.id, { swimmer: row.swimmer, sessions: [], hours: 0 });
    }
    const entry = bucket.swimmers.get(row.swimmer.id);
    entry.sessions.push(row.session);
    entry.hours += row.session.durationHours;
  });

  if (canShowUnallocated) {
    const seen = new Set(rows.map(r => r.swimmer.id));
    eligibleSwimmers.filter(sw => !seen.has(sw.id)).forEach(sw => {
      const key = opts.groupBy === 'squad' ? (sw.squad_id || 'unassigned') : 'all';
      const label = opts.groupBy === 'squad' ? sw.squad_name : 'All Athletes';
      const bucket = bucketFor(key, label);
      if (!bucket.swimmers.has(sw.id)) bucket.swimmers.set(sw.id, { swimmer: sw, sessions: [], hours: 0 });
    });
  }

  const built = [...buckets.values()].map(bucket => {
    const entries = [...bucket.swimmers.values()].map(e => {
      const squad = squadById[e.swimmer.squad_id];
      const targetSessions = showTargets ? (squad?.target_sessions_per_week || 0) : 0;
      const targetHours = showTargets ? (squad?.target_hours_per_week || 0) : 0;
      return {
        ...e,
        sessions: [...e.sessions].sort((a, b) => getDayOrder(a.day) - getDayOrder(b.day)),
        count: e.sessions.length,
        hours: Math.round(e.hours * 100) / 100,
        targetSessions,
        targetHours,
        sessionVariance: targetSessions ? e.sessions.length - targetSessions : null,
        hourVariance: targetHours ? Math.round((e.hours - targetHours) * 100) / 100 : null
      };
    });

    const totalSessions = entries.reduce((a, e) => a + e.count, 0);
    const totalHours = entries.reduce((a, e) => a + e.hours, 0);
    const scored = entries.filter(e => e.sessionVariance !== null || e.hourVariance !== null);
    const onTarget = scored.filter(e => (e.sessionVariance ?? 0) >= 0 && (e.hourVariance ?? 0) >= 0).length;

    return {
      key: bucket.key,
      label: bucket.label,
      entries,
      totalSwimmers: entries.length,
      totalSessions,
      totalHours: Math.round(totalHours * 100) / 100,
      avgSessions: entries.length ? totalSessions / entries.length : 0,
      avgHours: entries.length ? totalHours / entries.length : 0,
      scoredCount: scored.length,
      onTargetCount: onTarget
    };
  });

  const dir = opts.sortDir === 'asc' ? 1 : -1;
  const compare = (a, b) => {
    switch (opts.sortBy) {
      case 'name': return (a.swimmer.preferred_name || '').localeCompare(b.swimmer.preferred_name || '') * dir;
      case 'hours': return (a.hours - b.hours) * dir;
      case 'variance': return ((a.sessionVariance ?? 0) - (b.sessionVariance ?? 0)) * dir;
      default: return (a.count - b.count) * dir;
    }
  };
  built.forEach(g => g.entries.sort(compare));

  if (opts.groupBy === 'day') built.sort((a, b) => getDayOrder(a.key) - getDayOrder(b.key));
  else if (opts.groupBy === 'session') built.sort((a, b) => {
    const d = getDayOrder(sessionsById[a.key]?.day) - getDayOrder(sessionsById[b.key]?.day);
    return d !== 0 ? d : a.label.localeCompare(b.label);
  });
  else built.sort((a, b) => a.label.localeCompare(b.label));

  return {
    groups: built,
    totals: computeTotals(rows, eligibleSwimmers, canShowUnallocated, squadById),
    showTargets,
    canShowUnallocated,
    hasRoster: (data.swimmers || []).some(sw => sw.is_squad_member)
  };
}

function emptyTotals() {
  return { swimmers: 0, allocations: 0, hours: 0, avgSessions: 0, unallocated: 0, meetingPct: null };
}

function computeTotals(rows, eligibleSwimmers, canShowUnallocated, squadById) {
  // Grouping by day/session/location repeats a swimmer across buckets, so the
  // headline figures come from the de-duplicated allocation rows instead.
  const bySwimmer = new Map();
  rows.forEach(r => {
    if (!bySwimmer.has(r.swimmer.id)) bySwimmer.set(r.swimmer.id, { swimmer: r.swimmer, count: 0, hours: 0 });
    const e = bySwimmer.get(r.swimmer.id);
    e.count += 1;
    e.hours += r.session.durationHours;
  });
  if (canShowUnallocated) {
    eligibleSwimmers.forEach(sw => {
      if (!bySwimmer.has(sw.id)) bySwimmer.set(sw.id, { swimmer: sw, count: 0, hours: 0 });
    });
  }
  const list = [...bySwimmer.values()];
  const scored = list.filter(e => squadById[e.swimmer.squad_id]?.target_sessions_per_week);
  const meeting = scored.filter(e => e.count >= squadById[e.swimmer.squad_id].target_sessions_per_week).length;
  return {
    swimmers: list.length,
    allocations: rows.length,
    hours: list.reduce((a, e) => a + e.hours, 0),
    avgSessions: list.length ? rows.length / list.length : 0,
    unallocated: list.filter(e => e.count === 0).length,
    meetingPct: scored.length ? Math.round((meeting / scored.length) * 100) : null
  };
}

/**
 * Compact plain-text rendering of every athlete's allocation, for the AI chat
 * context. The chat prompt is a string, so this trades JSON for a line-per-
 * athlete format that costs far fewer tokens than the equivalent object graph.
 *
 * `charBudget` bounds the worst case; the roster summary and squad totals are
 * always emitted, and only the per-athlete detail is trimmed, with an explicit
 * note so the model never presents a truncated roster as complete.
 */
export function formatAllocationContext(data, { charBudget = 34000, attendance = null } = {}) {
  if (!data) return 'SESSION ALLOCATIONS: unavailable.';

  const { groups } = buildAllocationReport(data, {
    groupBy: 'squad',
    sortBy: 'name',
    sortDir: 'asc',
    includeUnallocated: true
  });

  const sessionsById = {};
  (data.sessions || []).forEach(s => { sessionsById[s.id] = s; });

  const headcount = {};
  (data.allocations || []).forEach(a => {
    headcount[a.session_id] = (headcount[a.session_id] || 0) + 1;
  });

  const lines = [];
  lines.push('SESSION ALLOCATIONS — which training sessions each athlete is scheduled into.');
  lines.push('Source: session_memberships (the club timetable in SCM). This is scheduled allocation, NOT attendance.');
  lines.push('');

  lines.push(`TIMETABLE (${(data.sessions || []).length} sessions):`);
  [...(data.sessions || [])]
    .sort((a, b) => getDayOrder(a.day) - getDayOrder(b.day) || a.name.localeCompare(b.name))
    .forEach(s => {
      lines.push(`  ${s.day} | ${s.name} | ${s.durationHours}h | ${headcount[s.id] || 0} athletes allocated${s.is_active ? '' : ' | INACTIVE'}`);
    });
  lines.push('');

  lines.push('SQUAD SUMMARY (weekly):');
  groups.forEach(g => {
    const t = (data.squads || []).find(s => s.name === g.label);
    const target = t && (t.target_sessions_per_week || t.target_hours_per_week)
      ? `target ${t.target_sessions_per_week || '—'} sessions / ${t.target_hours_per_week || '—'}h`
      : 'no target set';
    lines.push(
      `  ${g.label} | ${g.totalSwimmers} athletes | ${target} | ` +
      `avg ${g.avgSessions.toFixed(1)} sessions, ${g.avgHours.toFixed(1)}h` +
      (g.scoredCount ? ` | ${g.onTargetCount}/${g.scoredCount} meeting target` : '')
    );
  });
  lines.push('');

  if (attendance) {
    lines.push('ATTENDANCE (registers from training_attendance — actual turnout, distinct from allocation above):');
    lines.push(`  Rate = present / (present + absent) over each rolling window. Registers since ${attendance.since}.`);
    lines.push(`  Windows available: ${attendance.windows.map(w => `${w} weeks (since ${attendance.cutoffs?.[w] || '?'})`).join(', ')}. These are the ONLY windows you have.`);
    lines.push('  If asked for a window you do not have, use the closest available one and say which you used.');
    lines.push('  A blank rate means no registers exist for that athlete in the window — that is missing data, NOT 0% attendance.');
    lines.push('');
  }

  const header = lines.join('\n');
  const detail = [];
  detail.push(
    'PER-ATHLETE ROSTER (athlete | squad | allocated sessions | weekly hours | variance vs target | days'
    + (attendance ? ` | attendance by window (${attendance.windows.map(w => `${w}w`).join('/')}) | present/total in ${attendance.windows[1] ?? attendance.windows[0]}w | last present` : '')
    + '):'
  );
  detail.push('Days map to the sessions listed in TIMETABLE above; every athlete in the club is listed here.');

  let used = header.length;
  let shown = 0;
  let total = 0;

  groups.forEach(g => {
    g.entries.forEach(e => {
      total++;
      const variance = e.sessionVariance === null
        ? 'no target'
        : `${e.sessionVariance > 0 ? '+' : ''}${e.sessionVariance} sessions, ${e.hourVariance > 0 ? '+' : ''}${e.hourVariance ?? 0}h`;
      // Days rather than full session names: the timetable block above already
      // maps day to session, and repeating long names per athlete cost enough
      // context to truncate whole squads out of the roster.
      const sessions = e.sessions.length
        ? e.sessions.map(s => s.day.slice(0, 3)).join(',')
        : 'NONE ALLOCATED';
      let attPart = '';
      if (attendance) {
        const rec = attendance.bySwimmer[e.swimmer.id];
        const rates = attendance.windows.map(w => {
          const b = rec?.windows?.[w];
          return b && b.total ? `${w}w ${Math.round((b.present / b.total) * 100)}%` : `${w}w —`;
        }).join(' ');
        const focus = attendance.windows[1] ?? attendance.windows[0];
        const fb = rec?.windows?.[focus];
        const counts = fb && fb.total ? `${fb.present}/${fb.total} in ${focus}w` : `no registers in ${focus}w`;
        attPart = ` | ${rates} | ${counts} | last present ${rec?.lastPresent || 'never'}`;
      }
      const line = `  ${e.swimmer.preferred_name} | ${e.swimmer.squad_name} | ${e.count} | ${e.hours}h | ${variance} | ${sessions}${attPart}`;
      if (used + line.length < charBudget) {
        detail.push(line);
        used += line.length + 1;
        shown++;
      }
    });
  });

  if (shown < total) {
    detail.push(`  [TRUNCATED: ${shown} of ${total} athletes listed. Say so if asked for a complete roster.]`);
  }

  return `${header}\n${detail.join('\n')}`;
}

/** Human-readable description of the active filters, for export headers. */
export function describeFilters(data, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const squadNames = opts.squadFilter.length
    ? (data?.squads || []).filter(s => opts.squadFilter.includes(s.id)).map(s => s.name).join(', ')
    : 'All squads';
  const session = opts.sessionFilter !== 'all'
    ? (data?.sessions || []).find(s => s.id === opts.sessionFilter)
    : null;

  return [
    ['Grouped by', GROUP_OPTIONS.find(o => o.value === opts.groupBy)?.label || opts.groupBy],
    ['Squads', squadNames],
    ['Days', opts.dayFilter.length ? opts.dayFilter.join(', ') : 'All days'],
    ['Location', opts.locationFilter === 'all' ? 'All locations' : opts.locationFilter],
    ['Session', session ? `${session.day} — ${session.name}` : 'All sessions'],
    ['Sorted by', `${SORT_OPTIONS.find(o => o.value === opts.sortBy)?.label || opts.sortBy} (${opts.sortDir === 'asc' ? 'ascending' : 'descending'})`],
    ['Active sessions only', opts.activeOnly ? 'Yes' : 'No'],
    ['Exempt athletes included', opts.includeExempt ? 'Yes' : 'No'],
    ['Unallocated athletes shown', opts.includeUnallocated ? 'Yes' : 'No'],
    ['Athlete search', opts.search ? opts.search : '—']
  ];
}
