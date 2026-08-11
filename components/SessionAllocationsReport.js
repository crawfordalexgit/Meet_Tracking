import { useState, useEffect, useMemo } from 'react';
import { authedFetch } from '../lib/api-client';
import { DAY_NAMES_FULL, getDayOrder } from '../lib/analytics-utils';

const GROUP_OPTIONS = [
  { value: 'none', label: 'No Grouping (Flat Roster)' },
  { value: 'squad', label: 'Squad' },
  { value: 'day', label: 'Day of Week' },
  { value: 'session', label: 'Session' },
  { value: 'location', label: 'Location' }
];

const SORT_OPTIONS = [
  { value: 'sessions', label: 'Sessions Allocated' },
  { value: 'hours', label: 'Weekly Hours' },
  { value: 'name', label: 'Swimmer Name' },
  { value: 'variance', label: 'Variance vs Target' }
];

// Targets are per-swimmer-per-week, so they are only meaningful on a row that
// covers the swimmer's whole allocation. Slicing by day/session/location shows a
// fragment of it, and comparing a fragment to a weekly target would read as a
// deficit that isn't real.
const GROUPINGS_WITH_TARGETS = ['none', 'squad'];

const fmtHours = (h) => `${(Math.round(h * 10) / 10).toFixed(1)}h`;
const fmtDelta = (d, unit) => `${d > 0 ? '+' : ''}${Math.round(d * 10) / 10}${unit}`;

export default function SessionAllocationsReport({ initialSquadId = 'all' }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  // Filters — seeded from the page-level squad focus, then owned by this report
  const [squadFilter, setSquadFilter] = useState(
    initialSquadId && initialSquadId !== 'all' ? [initialSquadId] : []
  ); // [] = all
  const [dayFilter, setDayFilter] = useState([]); // [] = all
  const [locationFilter, setLocationFilter] = useState('all');
  const [sessionFilter, setSessionFilter] = useState('all');
  const [activeOnly, setActiveOnly] = useState(true);
  const [includeExempt, setIncludeExempt] = useState(true);
  const [includeUnallocated, setIncludeUnallocated] = useState(true);
  const [search, setSearch] = useState('');

  // Shaping
  const [groupBy, setGroupBy] = useState('squad');
  const [sortBy, setSortBy] = useState('sessions');
  const [sortDir, setSortDir] = useState('desc');
  const [collapsed, setCollapsed] = useState({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await authedFetch('/api/session-allocations');
        const payload = await res.json();
        if (cancelled) return;
        if (!res.ok || !payload.success) throw new Error(payload.error || 'Failed to load allocations');
        setData(payload);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const sessionsById = useMemo(() => {
    const map = {};
    (data?.sessions || []).forEach(s => { map[s.id] = s; });
    return map;
  }, [data]);

  const squadById = useMemo(() => {
    const map = {};
    (data?.squads || []).forEach(s => { map[s.id] = s; });
    return map;
  }, [data]);

  const locations = useMemo(() => {
    const set = new Set((data?.sessions || []).map(s => s.location).filter(Boolean));
    return [...set].sort();
  }, [data]);

  const sessionPickList = useMemo(() => {
    return [...(data?.sessions || [])].sort((a, b) => {
      const d = getDayOrder(a.day) - getDayOrder(b.day);
      return d !== 0 ? d : (a.name || '').localeCompare(b.name || '');
    });
  }, [data]);

  const daysPresent = useMemo(() => {
    const set = new Set((data?.sessions || []).map(s => s.day));
    const known = DAY_NAMES_FULL.filter(d => set.has(d));
    return set.has('Unknown') ? [...known, 'Unknown'] : known;
  }, [data]);

  // Swimmers that survive the swimmer-level filters
  const eligibleSwimmers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data?.swimmers || []).filter(sw => {
      if (!sw.is_squad_member) return false;
      if (squadFilter.length && !squadFilter.includes(sw.squad_id)) return false;
      if (!includeExempt && sw.is_exempt) return false;
      if (term && !(sw.preferred_name || sw.full_name || '').toLowerCase().includes(term)) return false;
      return true;
    });
  }, [data, squadFilter, includeExempt, search]);

  // Allocation rows that survive the session-level filters, joined to swimmer + session
  const rows = useMemo(() => {
    if (!data) return [];
    const swimmerById = {};
    eligibleSwimmers.forEach(sw => { swimmerById[sw.id] = sw; });

    return data.allocations.reduce((acc, a) => {
      const swimmer = swimmerById[a.swimmer_id];
      const session = sessionsById[a.session_id];
      if (!swimmer || !session) return acc;
      if (activeOnly && !session.is_active) return acc;
      if (dayFilter.length && !dayFilter.includes(session.day)) return acc;
      if (locationFilter !== 'all' && session.location !== locationFilter) return acc;
      if (sessionFilter !== 'all' && session.id !== sessionFilter) return acc;
      acc.push({ swimmer, session });
      return acc;
    }, []);
  }, [data, eligibleSwimmers, sessionsById, activeOnly, dayFilter, locationFilter, sessionFilter]);

  const showTargets = GROUPINGS_WITH_TARGETS.includes(groupBy);
  // A swimmer with zero allocations has no row to carry them, so only a grouping
  // keyed off the swimmer (not off a session attribute) can show them at all.
  const canShowUnallocated = showTargets && includeUnallocated
    && !dayFilter.length && locationFilter === 'all' && sessionFilter === 'all';

  const groups = useMemo(() => {
    if (!data) return [];

    const keyOf = (row) => {
      switch (groupBy) {
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
        const key = groupBy === 'squad' ? (sw.squad_id || 'unassigned') : 'all';
        const label = groupBy === 'squad' ? sw.squad_name : 'All Athletes';
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
        ...bucket,
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

    const dir = sortDir === 'asc' ? 1 : -1;
    const compare = (a, b) => {
      switch (sortBy) {
        case 'name': return (a.swimmer.preferred_name || '').localeCompare(b.swimmer.preferred_name || '') * dir;
        case 'hours': return (a.hours - b.hours) * dir;
        case 'variance': return ((a.sessionVariance ?? 0) - (b.sessionVariance ?? 0)) * dir;
        default: return (a.count - b.count) * dir;
      }
    };
    built.forEach(g => g.entries.sort(compare));

    if (groupBy === 'day') built.sort((a, b) => getDayOrder(a.key) - getDayOrder(b.key));
    else if (groupBy === 'session') built.sort((a, b) => {
      const d = getDayOrder(sessionsById[a.key]?.day) - getDayOrder(sessionsById[b.key]?.day);
      return d !== 0 ? d : a.label.localeCompare(b.label);
    });
    else built.sort((a, b) => a.label.localeCompare(b.label));

    return built;
  }, [data, rows, eligibleSwimmers, groupBy, sortBy, sortDir, showTargets, canShowUnallocated, squadById, sessionsById]);

  const totals = useMemo(() => {
    // Group by day/session/location repeats a swimmer across buckets, so headline
    // figures are computed from the de-duplicated allocation rows instead.
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
  }, [rows, eligibleSwimmers, canShowUnallocated, squadById]);

  const toggleIn = (list, setList, value) => {
    setList(list.includes(value) ? list.filter(v => v !== value) : [...list, value]);
  };

  const exportCsv = () => {
    const head = ['Group', 'Swimmer', 'Squad', 'Sessions Allocated', 'Weekly Hours', 'Target Sessions', 'Target Hours', 'Session Variance', 'Hour Variance', 'Allocated Sessions'];
    const lines = [head];
    groups.forEach(g => {
      g.entries.forEach(e => {
        lines.push([
          g.label,
          e.swimmer.preferred_name,
          e.swimmer.squad_name,
          e.count,
          e.hours,
          e.targetSessions || '',
          e.targetHours || '',
          e.sessionVariance ?? '',
          e.hourVariance ?? '',
          e.sessions.map(s => `${s.day} ${s.name}`).join(' | ')
        ]);
      });
    });
    const csv = lines
      .map(cols => cols.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `session-allocations-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const resetFilters = () => {
    setSquadFilter([]);
    setDayFilter([]);
    setLocationFilter('all');
    setSessionFilter('all');
    setActiveOnly(true);
    setIncludeExempt(true);
    setIncludeUnallocated(true);
    setSearch('');
  };

  if (loading) {
    return (
      <div className="glass-card p-12 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-cyan-400 mx-auto mb-4"></div>
        <p className="text-xs font-black uppercase tracking-widest text-white/60">Loading Session Allocations…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass-card p-8 border border-rose-400/30">
        <h3 className="text-md font-black uppercase tracking-wider text-rose-400 mb-2">Allocation Load Failed</h3>
        <p className="text-xs text-white/70">{error}</p>
      </div>
    );
  }

  const pillClass = (active) =>
    `px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider border transition-all ${
      active
        ? 'bg-cyan-400 text-black border-cyan-400'
        : 'bg-white/5 text-white/60 border-white/10 hover:border-cyan-400/40'
    }`;

  const selectClass = 'bg-slate-900 border border-white/10 rounded-lg p-2 text-white text-xs font-semibold focus:border-cyan-400 outline-none';
  const thClass = 'p-4 text-[10px] font-black uppercase text-white/60 tracking-wider';

  return (
    <div className="space-y-8">
      {/* Headline metrics */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: 'Athletes In Scope', value: totals.swimmers },
          { label: 'Total Allocations', value: totals.allocations },
          { label: 'Avg Sessions / Athlete', value: totals.avgSessions.toFixed(1) },
          { label: 'Weekly Pool Hours', value: fmtHours(totals.hours) },
          {
            label: 'Meeting Session Target',
            value: totals.meetingPct === null ? '—' : `${totals.meetingPct}%`,
            accent: totals.meetingPct !== null && totals.meetingPct < 75 ? 'text-amber-400' : 'text-emerald-400'
          }
        ].map(tile => (
          <div key={tile.label} className="glass-card p-5">
            <div className="text-[10px] font-black tracking-widest text-white/50 uppercase mb-2">{tile.label}</div>
            <div className={`text-2xl font-black ${tile.accent || 'text-white'}`}>{tile.value}</div>
          </div>
        ))}
      </div>

      {/* Filter & grouping controls */}
      <div className="glass-card p-6 space-y-5 no-print">
        <div className="flex flex-wrap gap-6 items-end">
          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-black tracking-widest text-cyan-400/80 uppercase">Group By</label>
            <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)} className={`${selectClass} w-56`}>
              {GROUP_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-black tracking-widest text-cyan-400/80 uppercase">Sort Athletes By</label>
            <div className="flex gap-2">
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className={`${selectClass} w-44`}>
                {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <button onClick={() => setSortDir(sortDir === 'asc' ? 'desc' : 'asc')} className={pillClass(false)}>
                {sortDir === 'asc' ? '↑ Asc' : '↓ Desc'}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-black tracking-widest text-cyan-400/80 uppercase">Location</label>
            <select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)} className={`${selectClass} w-44`}>
              <option value="all">All Locations</option>
              {locations.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-black tracking-widest text-cyan-400/80 uppercase">Session</label>
            <select value={sessionFilter} onChange={(e) => setSessionFilter(e.target.value)} className={`${selectClass} w-64`}>
              <option value="all">All Sessions</option>
              {sessionPickList.map(s => <option key={s.id} value={s.id}>{s.day} — {s.name}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-black tracking-widest text-cyan-400/80 uppercase">Find Athlete</label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name…"
              className={`${selectClass} w-48`}
            />
          </div>

          <div className="ml-auto flex gap-2">
            <button onClick={exportCsv} className={pillClass(false)}>⬇ Export CSV</button>
            <button onClick={resetFilters} className={pillClass(false)}>Reset Filters</button>
          </div>
        </div>

        <div>
          <label className="text-[10px] font-black tracking-widest text-cyan-400/80 uppercase block mb-2">Squads</label>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setSquadFilter([])} className={pillClass(squadFilter.length === 0)}>All Squads</button>
            {(data?.squads || []).map(sq => (
              <button key={sq.id} onClick={() => toggleIn(squadFilter, setSquadFilter, sq.id)} className={pillClass(squadFilter.includes(sq.id))}>
                {sq.name}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-[10px] font-black tracking-widest text-cyan-400/80 uppercase block mb-2">Days</label>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setDayFilter([])} className={pillClass(dayFilter.length === 0)}>All Days</button>
            {daysPresent.map(d => (
              <button key={d} onClick={() => toggleIn(dayFilter, setDayFilter, d)} className={pillClass(dayFilter.includes(d))}>
                {d.slice(0, 3)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button onClick={() => setActiveOnly(!activeOnly)} className={pillClass(activeOnly)}>Active Sessions Only</button>
          <button onClick={() => setIncludeExempt(!includeExempt)} className={pillClass(includeExempt)}>Include Exempt Athletes</button>
          <button
            onClick={() => setIncludeUnallocated(!includeUnallocated)}
            disabled={!showTargets}
            title={showTargets ? '' : 'Only available when grouping by squad or not grouping'}
            className={`${pillClass(includeUnallocated && canShowUnallocated)} ${showTargets ? '' : 'opacity-40 cursor-not-allowed'}`}
          >
            Show Unallocated Athletes
          </button>
        </div>

        {!showTargets && (
          <p className="text-[10px] text-white/40 italic">
            Weekly targets are hidden when grouping by {GROUP_OPTIONS.find(o => o.value === groupBy)?.label.toLowerCase()} — each row covers only part of an athlete&apos;s week.
          </p>
        )}
        {totals.unallocated > 0 && (
          <p className="text-[10px] text-amber-400 font-bold uppercase tracking-wider">
            {totals.unallocated} athlete{totals.unallocated === 1 ? '' : 's'} in scope with zero allocated sessions
          </p>
        )}
      </div>

      {/* Groups */}
      {groups.length === 0 && (
        <div className="glass-card p-12 text-center text-xs text-white/50 font-semibold">
          No allocations match the current filters.
        </div>
      )}

      {groups.map(group => {
        const isCollapsed = !!collapsed[group.key];
        return (
          <div key={group.key} className="glass-card overflow-hidden">
            <div
              className="p-6 border-b border-white/10 flex flex-wrap justify-between items-center gap-4 cursor-pointer hover:bg-white/5 transition-all"
              onClick={() => setCollapsed({ ...collapsed, [group.key]: !isCollapsed })}
            >
              <div>
                <h3 className="text-md font-black tracking-wider text-white uppercase">
                  <span className="text-white/30 mr-2 text-xs">{isCollapsed ? '▶' : '▼'}</span>
                  {group.label}
                </h3>
                <p className="text-[10px] text-white/50 font-semibold uppercase tracking-wider mt-1">
                  {group.totalSwimmers} athletes · {group.totalSessions} allocations · {fmtHours(group.totalHours)} per week
                </p>
              </div>
              <div className="flex gap-6 text-right">
                <div>
                  <div className="text-[10px] font-black tracking-widest text-white/40 uppercase">Avg Sessions</div>
                  <div className="text-lg font-black text-cyan-400">{group.avgSessions.toFixed(1)}</div>
                </div>
                <div>
                  <div className="text-[10px] font-black tracking-widest text-white/40 uppercase">Avg Hours</div>
                  <div className="text-lg font-black text-white">{fmtHours(group.avgHours)}</div>
                </div>
                {showTargets && group.scoredCount > 0 && (
                  <div>
                    <div className="text-[10px] font-black tracking-widest text-white/40 uppercase">On Target</div>
                    <div className={`text-lg font-black ${group.onTargetCount === group.scoredCount ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {group.onTargetCount}/{group.scoredCount}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {!isCollapsed && (
              <div className="overflow-x-auto text-left">
                <table className="w-full text-left border-collapse stats-table-glass">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className={thClass}>Swimmer</th>
                      {groupBy !== 'squad' && <th className={thClass}>Squad</th>}
                      <th className={thClass}>Sessions Allocated</th>
                      <th className={thClass}>Weekly Hours</th>
                      {showTargets && <th className={thClass}>Weekly Target</th>}
                      {showTargets && <th className={thClass}>Variance</th>}
                      <th className={`${thClass} text-right`}>Allocated Sessions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.entries.map(e => (
                      <tr key={e.swimmer.id} className="border-b border-white/5 hover:bg-white/5 transition-all text-xs font-semibold align-top">
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <span className="text-white font-bold">{e.swimmer.preferred_name}</span>
                            {e.swimmer.is_exempt && (
                              <span className="bg-amber-400/10 text-amber-400 text-[8px] font-black px-1.5 py-0.5 rounded tracking-widest uppercase border border-amber-400/20">Exempt</span>
                            )}
                          </div>
                        </td>
                        {groupBy !== 'squad' && <td className="p-4 text-white/60">{e.swimmer.squad_name}</td>}
                        <td className="p-4">
                          <span className={`font-black ${e.count === 0 ? 'text-rose-400' : 'text-cyan-400'}`}>{e.count}</span>
                        </td>
                        <td className="p-4 text-white/80">{fmtHours(e.hours)}</td>
                        {showTargets && (
                          <td className="p-4 text-white/50">
                            {e.targetSessions || e.targetHours
                              ? `${e.targetSessions || '—'} / ${e.targetHours ? fmtHours(e.targetHours) : '—'}`
                              : <span className="text-white/30">Not set</span>}
                          </td>
                        )}
                        {showTargets && (
                          <td className="p-4">
                            {e.sessionVariance === null && e.hourVariance === null ? (
                              <span className="text-white/30">—</span>
                            ) : (
                              <div className="flex flex-col">
                                {e.sessionVariance !== null && (
                                  <span className={e.sessionVariance >= 0 ? 'text-emerald-400 font-black' : 'text-rose-400 font-black'}>
                                    {fmtDelta(e.sessionVariance, '')} sessions
                                  </span>
                                )}
                                {e.hourVariance !== null && (
                                  <span className={`text-[10px] ${e.hourVariance >= 0 ? 'text-emerald-400/70' : 'text-rose-400/70'}`}>
                                    {fmtDelta(e.hourVariance, 'h')}
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                        )}
                        <td className="p-4 text-right">
                          {e.sessions.length === 0 ? (
                            <span className="text-rose-400/70 text-[10px] font-black uppercase tracking-wider">No sessions allocated</span>
                          ) : (
                            <div className="flex flex-wrap gap-1.5 justify-end">
                              {[...e.sessions]
                                .sort((a, b) => getDayOrder(a.day) - getDayOrder(b.day))
                                .map((s, i) => (
                                  <span key={`${s.id}-${i}`} className="bg-white/5 border border-white/10 rounded px-2 py-0.5 text-[10px] text-white/70">
                                    {s.day.slice(0, 3)} · {s.name} <span className="text-white/40">({fmtHours(s.durationHours)})</span>
                                  </span>
                                ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
