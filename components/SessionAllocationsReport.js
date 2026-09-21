import { useState, useEffect, useMemo } from 'react';
import { authedFetch } from '../lib/api-client';
import { DAY_NAMES_FULL, getDayOrder } from '../lib/analytics-utils';
import { GROUP_OPTIONS, SORT_OPTIONS, buildAllocationReport } from '../lib/session-allocations';

const fmtHours = (h) => `${(Math.round(h * 10) / 10).toFixed(1)}h`;
const fmtDelta = (d, unit) => `${d > 0 ? '+' : ''}${Math.round(d * 10) / 10}${unit}`;

// This app has no Tailwind build — styles/globals.css hand-rolls a small subset
// of utility classes, so anything beyond it is styled inline against the theme
// variables. Keep to CSS custom properties so the report follows theme switches.
const S = {
  label: {
    fontSize: '0.625rem',
    fontWeight: 900,
    letterSpacing: '0.15em',
    textTransform: 'uppercase',
    color: 'var(--accent-cyan)',
    opacity: 0.8,
    display: 'block',
    marginBottom: 8
  },
  field: {
    background: 'rgba(0, 0, 0, 0.35)',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    borderRadius: 10,
    padding: '8px 12px',
    color: 'var(--text-primary)',
    fontSize: '0.75rem',
    fontWeight: 600,
    outline: 'none'
  },
  tile: { padding: '1.25rem 1.5rem' },
  tileLabel: {
    fontSize: '0.625rem',
    fontWeight: 900,
    letterSpacing: '0.15em',
    textTransform: 'uppercase',
    color: 'var(--text-dim)',
    marginBottom: 8
  },
  tileValue: { fontSize: '1.75rem', fontWeight: 900, lineHeight: 1.1, color: 'var(--text-primary)' },
  chip: {
    display: 'inline-block',
    background: 'rgba(255, 255, 255, 0.04)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    padding: '3px 8px',
    fontSize: '0.65rem',
    fontWeight: 600,
    color: 'var(--text-secondary)',
    whiteSpace: 'nowrap'
  },
  note: { fontSize: '0.7rem', color: 'var(--text-dim)', fontStyle: 'italic', margin: 0 }
};

const pillStyle = (active) => ({
  padding: '6px 14px',
  borderRadius: 10,
  fontSize: '0.65rem',
  fontWeight: 900,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  cursor: 'pointer',
  transition: 'all 0.25s',
  background: active ? 'var(--accent-cyan)' : 'rgba(255, 255, 255, 0.04)',
  color: active ? '#00121f' : 'var(--text-secondary)',
  border: `1px solid ${active ? 'var(--accent-cyan)' : 'rgba(255, 255, 255, 0.12)'}`
});

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
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(null);

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

  // The whole filter/group/sort pipeline lives in lib/session-allocations so the
  // spreadsheet export reproduces these numbers exactly rather than recomputing
  // them from its own copy of the rules.
  const reportOptions = useMemo(() => ({
    squadFilter, dayFilter, locationFilter, sessionFilter,
    activeOnly, includeExempt, includeUnallocated, search,
    groupBy, sortBy, sortDir
  }), [squadFilter, dayFilter, locationFilter, sessionFilter, activeOnly,
    includeExempt, includeUnallocated, search, groupBy, sortBy, sortDir]);

  const { groups, totals, showTargets, canShowUnallocated, hasRoster } = useMemo(
    () => buildAllocationReport(data, reportOptions),
    [data, reportOptions]
  );


  const toggleIn = (list, setList, value) => {
    setList(list.includes(value) ? list.filter(v => v !== value) : [...list, value]);
  };

  // The workbook is built server-side from the same options object the screen
  // renders from, so the export always matches whatever is currently on view.
  const exportExcel = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const res = await authedFetch('/api/export-session-allocations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ options: reportOptions })
      });
      if (!res.ok) {
        let detail = `Export failed (${res.status})`;
        try { detail = (await res.json()).error || detail; } catch {}
        throw new Error(detail);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `session-allocations-${new Date().toISOString().split('T')[0]}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setExportError(e.message);
    } finally {
      setExporting(false);
    }
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
      <div className="glass-card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
        <div className="animate-spin" style={{
          width: 32, height: 32, margin: '0 auto 1rem',
          borderRadius: '50%', borderTop: '2px solid var(--accent-cyan)', borderBottom: '2px solid var(--accent-cyan)'
        }}></div>
        <p style={{ fontSize: '0.7rem', fontWeight: 900, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text-secondary)', margin: 0 }}>
          Loading session allocations…
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass-card" style={{ borderColor: 'rgba(244, 63, 94, 0.35)' }}>
        <h3 style={{ fontSize: '0.9rem', fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent-rose)', margin: '0 0 8px' }}>
          Allocation load failed
        </h3>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>{error}</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {!hasRoster && (
        <div className="glass-card" style={{ borderColor: 'rgba(251, 191, 36, 0.35)' }}>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent-amber)', margin: '0 0 8px' }}>
            No athletes returned
          </h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>
            The server read back zero squad members. If the roster is populated everywhere else in the app,
            this is a server-side permissions problem rather than missing data — check that
            <code> SUPABASE_SERVICE_ROLE_KEY</code> holds the secret key and not the publishable one, since an
            anonymous client is blocked by row-level security and silently returns nothing.
          </p>
        </div>
      )}

      {/* Headline metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
        {[
          { label: 'Athletes In Scope', value: totals.swimmers },
          { label: 'Total Allocations', value: totals.allocations },
          { label: 'Avg Sessions / Athlete', value: totals.avgSessions.toFixed(1) },
          { label: 'Weekly Athlete Hours', value: fmtHours(totals.hours) },
          {
            label: 'Meeting Session Target',
            value: totals.meetingPct === null ? '—' : `${totals.meetingPct}%`,
            color: totals.meetingPct === null
              ? 'var(--text-dim)'
              : totals.meetingPct < 75 ? 'var(--accent-amber)' : 'var(--accent-emerald)'
          }
        ].map(tile => (
          <div key={tile.label} className="glass-card" style={S.tile}>
            <div style={S.tileLabel}>{tile.label}</div>
            <div style={{ ...S.tileValue, color: tile.color || 'var(--text-primary)' }}>{tile.value}</div>
          </div>
        ))}
      </div>

      {/* Filter & grouping controls */}
      <div className="glass-card no-print" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', alignItems: 'flex-end' }}>
          <div>
            <label style={S.label}>Group By</label>
            <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)} style={{ ...S.field, width: 220 }}>
              {GROUP_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div>
            <label style={S.label}>Sort Athletes By</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={{ ...S.field, width: 180 }}>
                {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <button onClick={() => setSortDir(sortDir === 'asc' ? 'desc' : 'asc')} style={pillStyle(false)}>
                {sortDir === 'asc' ? '↑ Asc' : '↓ Desc'}
              </button>
            </div>
          </div>

          <div>
            <label style={S.label}>Location</label>
            <select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)} style={{ ...S.field, width: 180 }}>
              <option value="all">All Locations</option>
              {locations.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>

          <div>
            <label style={S.label}>Session</label>
            <select value={sessionFilter} onChange={(e) => setSessionFilter(e.target.value)} style={{ ...S.field, width: 260 }}>
              <option value="all">All Sessions</option>
              {sessionPickList.map(s => <option key={s.id} value={s.id}>{s.day} — {s.name}</option>)}
            </select>
          </div>

          <div>
            <label style={S.label}>Find Athlete</label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name…"
              style={{ ...S.field, width: 190 }}
            />
          </div>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button
              onClick={exportExcel}
              disabled={exporting}
              style={{
                ...pillStyle(true),
                opacity: exporting ? 0.6 : 1,
                cursor: exporting ? 'wait' : 'pointer'
              }}
            >
              {exporting ? 'Building workbook…' : '⬇ Export to Excel'}
            </button>
            <button onClick={resetFilters} style={pillStyle(false)}>Reset Filters</button>
          </div>
        </div>

        <div>
          <label style={S.label}>Squads</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button onClick={() => setSquadFilter([])} style={pillStyle(squadFilter.length === 0)}>All Squads</button>
            {(data?.squads || []).map(sq => (
              <button key={sq.id} onClick={() => toggleIn(squadFilter, setSquadFilter, sq.id)} style={pillStyle(squadFilter.includes(sq.id))}>
                {sq.name}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label style={S.label}>Days</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button onClick={() => setDayFilter([])} style={pillStyle(dayFilter.length === 0)}>All Days</button>
            {daysPresent.map(d => (
              <button key={d} onClick={() => toggleIn(dayFilter, setDayFilter, d)} style={pillStyle(dayFilter.includes(d))}>
                {d.slice(0, 3)}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button onClick={() => setActiveOnly(!activeOnly)} style={pillStyle(activeOnly)}>Active Sessions Only</button>
          <button onClick={() => setIncludeExempt(!includeExempt)} style={pillStyle(includeExempt)}>Include Exempt Athletes</button>
          <button
            onClick={() => setIncludeUnallocated(!includeUnallocated)}
            disabled={!showTargets}
            title={showTargets ? '' : 'Only available when grouping by squad or not grouping'}
            style={{
              ...pillStyle(includeUnallocated && canShowUnallocated),
              opacity: showTargets ? 1 : 0.4,
              cursor: showTargets ? 'pointer' : 'not-allowed'
            }}
          >
            Show Unallocated Athletes
          </button>
        </div>

        {!showTargets && (
          <p style={S.note}>
            Weekly targets are hidden when grouping by {GROUP_OPTIONS.find(o => o.value === groupBy)?.label.toLowerCase()} — each row covers only part of an athlete&apos;s week.
          </p>
        )}
        {exportError && (
          <p style={{ ...S.note, color: 'var(--accent-rose)', fontStyle: 'normal', fontWeight: 700 }}>
            Excel export failed: {exportError}
          </p>
        )}
        {totals.unallocated > 0 && (
          <p style={{ ...S.note, color: 'var(--accent-amber)', fontStyle: 'normal', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {totals.unallocated} athlete{totals.unallocated === 1 ? '' : 's'} in scope with zero allocated sessions
          </p>
        )}
      </div>

      {/* Groups */}
      {groups.length === 0 && hasRoster && (
        <div className="glass-card" style={{ textAlign: 'center', padding: '3rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          No allocations match the current filters.
        </div>
      )}

      {groups.map(group => {
        const isCollapsed = !!collapsed[group.key];
        return (
          <div key={group.key} className="glass-card" style={{ padding: 0 }}>
            <div
              onClick={() => setCollapsed({ ...collapsed, [group.key]: !isCollapsed })}
              style={{
                padding: '1.5rem 2rem',
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '1rem',
                cursor: 'pointer'
              }}
            >
              <div>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-primary)', margin: 0 }}>
                  <span style={{ color: 'var(--text-dim)', marginRight: 10, fontSize: '0.7rem' }}>{isCollapsed ? '▶' : '▼'}</span>
                  {group.label}
                </h3>
                <p style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-dim)', margin: '6px 0 0' }}>
                  {group.totalSwimmers} athletes · {group.totalSessions} allocations · {fmtHours(group.totalHours)} per week
                </p>
              </div>
              <div style={{ display: 'flex', gap: '2rem', textAlign: 'right' }}>
                <div>
                  <div style={S.tileLabel}>Avg Sessions</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 900, color: 'var(--accent-cyan)' }}>{group.avgSessions.toFixed(1)}</div>
                </div>
                <div>
                  <div style={S.tileLabel}>Avg Hours</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 900, color: 'var(--text-primary)' }}>{fmtHours(group.avgHours)}</div>
                </div>
                {showTargets && group.scoredCount > 0 && (
                  <div>
                    <div style={S.tileLabel}>On Target</div>
                    <div style={{
                      fontSize: '1.15rem',
                      fontWeight: 900,
                      color: group.onTargetCount === group.scoredCount ? 'var(--accent-emerald)' : 'var(--accent-amber)'
                    }}>
                      {group.onTargetCount}/{group.scoredCount}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {!isCollapsed && (
              <div style={{ overflowX: 'auto', padding: '0.5rem 1rem 1rem' }}>
                <table className="stats-table-glass">
                  <thead>
                    <tr>
                      <th>Swimmer</th>
                      <th title="Age reached by 31 December this year — the age swimming squads and championship age groups run on">Age (EOY)</th>
                      {groupBy !== 'squad' && <th>Squad</th>}
                      <th>Sessions</th>
                      <th>Weekly Hours</th>
                      {showTargets && <th>Weekly Target</th>}
                      {showTargets && <th>Variance</th>}
                      <th style={{ textAlign: 'right' }}>Allocated Sessions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.entries.map(e => (
                      <tr key={e.swimmer.id}>
                        <td style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                          {e.swimmer.preferred_name}
                          {e.swimmer.is_exempt && (
                            <span style={{
                              marginLeft: 8, padding: '2px 6px', borderRadius: 4,
                              background: 'rgba(251, 191, 36, 0.1)', border: '1px solid rgba(251, 191, 36, 0.25)',
                              color: 'var(--accent-amber)', fontSize: '0.55rem', fontWeight: 900,
                              letterSpacing: '0.1em', textTransform: 'uppercase'
                            }}>Exempt</span>
                          )}
                        </td>
                        <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          {e.swimmer.age_end_of_year ?? <span style={{ color: 'var(--text-dim)' }}>—</span>}
                        </td>
                        {groupBy !== 'squad' && (
                          <td style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{e.swimmer.squad_name}</td>
                        )}
                        <td style={{ fontSize: '0.9rem', fontWeight: 900, color: e.count === 0 ? 'var(--accent-rose)' : 'var(--accent-cyan)' }}>
                          {e.count}
                        </td>
                        <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{fmtHours(e.hours)}</td>
                        {showTargets && (
                          <td style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                            {e.targetSessions || e.targetHours
                              ? `${e.targetSessions || '—'} / ${e.targetHours ? fmtHours(e.targetHours) : '—'}`
                              : 'Not set'}
                          </td>
                        )}
                        {showTargets && (
                          <td style={{ fontSize: '0.75rem' }}>
                            {e.sessionVariance === null && e.hourVariance === null ? (
                              <span style={{ color: 'var(--text-dim)' }}>—</span>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                {e.sessionVariance !== null && (
                                  <span style={{ fontWeight: 900, color: e.sessionVariance >= 0 ? 'var(--accent-emerald)' : 'var(--accent-rose)' }}>
                                    {fmtDelta(e.sessionVariance, '')} sessions
                                  </span>
                                )}
                                {e.hourVariance !== null && (
                                  <span style={{ fontSize: '0.65rem', opacity: 0.75, color: e.hourVariance >= 0 ? 'var(--accent-emerald)' : 'var(--accent-rose)' }}>
                                    {fmtDelta(e.hourVariance, 'h')}
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                        )}
                        <td style={{ textAlign: 'right' }}>
                          {e.sessions.length === 0 ? (
                            <span style={{ fontSize: '0.65rem', fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent-rose)', opacity: 0.8 }}>
                              No sessions allocated
                            </span>
                          ) : (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' }}>
                              {[...e.sessions]
                                .sort((a, b) => getDayOrder(a.day) - getDayOrder(b.day))
                                .map((s, i) => (
                                  <span key={`${s.id}-${i}`} style={S.chip}>
                                    {s.day.slice(0, 3)} · {s.name}
                                    <span style={{ color: 'var(--text-dim)' }}> ({fmtHours(s.durationHours)})</span>
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
