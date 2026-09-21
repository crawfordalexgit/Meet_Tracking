import { useState } from 'react';
import { Stat } from './restructure/Figures';
import { DAY_NAMES_FULL } from '../lib/analytics-utils';

const LEVELS = ['head', 'L2', 'L1', 'volunteer'];

/**
 * Coach roster editor.
 *
 * The club database holds only id, email and role for a coach — no name, no
 * availability, no qualification level, no lane limit. Everything below is
 * captured here and lives in the scenario, which also makes recruitment
 * what-ifs trivial: add a hypothetical coach and re-solve.
 *
 * Coaches attach to squads rather than to individual slots, so the solver rolls
 * each squad's schedule up into an hours requirement and fills it.
 */
export default function ScenarioCoachEditor({ coaches, squads, venues, coachMetrics, gaps, onChange, onLoadRoster, onSaveRoster }) {
  const [expanded, setExpanded] = useState(null);

  const update = (id, patch) => onChange(coaches.map(c => (c.id === id ? { ...c, ...patch } : c)));
  const remove = id => onChange(coaches.filter(c => c.id !== id));

  const add = () => {
    const n = coaches.length + 1;
    onChange(coaches.concat([{
      id: `co_new_${n}`, name: `New coach ${n}`, profileId: null, level: 'L2',
      maxLanes: 3, maxHoursPerWeek: null, squadIds: [], availability: [], venues: []
    }]));
  };

  const toggleSquad = (coach, squadId) => update(coach.id, {
    squadIds: coach.squadIds.includes(squadId)
      ? coach.squadIds.filter(s => s !== squadId)
      : coach.squadIds.concat([squadId])
  });

  const toggleVenue = (coach, venue) => update(coach.id, {
    venues: coach.venues.includes(venue)
      ? coach.venues.filter(v => v !== venue)
      : coach.venues.concat([venue])
  });

  const setWindow = (coach, day, field, value) => {
    const existing = coach.availability.find(w => w.day === day);
    const next = existing
      ? coach.availability.map(w => (w.day === day ? { ...w, [field]: value } : w))
      : coach.availability.concat([{ day, from: '17:00', to: '21:00', [field]: value }]);
    update(coach.id, { availability: next });
  };

  const clearDay = (coach, day) =>
    update(coach.id, { availability: coach.availability.filter(w => w.day !== day) });

  const hoursFor = id => coachMetrics?.byCoach?.find(c => c.coachId === id);

  return (
    <div>
      <div className="glass-card ce-summary">
        <div className="ce-stats">
          <Stat label="On the roster" value={coaches.length} />
          <Stat term="coachHour" label="Coach-hours needed" value={coachMetrics?.requiredCoachHours ?? '—'} />
          <Stat label="Covered" value={coachMetrics?.coveredCoachHours ?? '—'} />
          <Stat
            term="coachHoursShort" label="Coach-hours short"
            value={coachMetrics?.gapHours ?? '—'}
            accent={coachMetrics?.gapHours > 0 ? 'var(--accent-rose)' : 'var(--accent-emerald)'}
          />
          <Stat
            term="coachesAtOnce" label="Coaches needed at once"
            value={coachMetrics?.peakConcurrent ?? '—'}
            sub="on deck at the same moment"
          />
        </div>
        <div className="ce-tools">
          {onLoadRoster && (
            <button type="button" className="ce-btn" onClick={onLoadRoster}>Load club roster</button>
          )}
          {onSaveRoster && (
            <button type="button" className="ce-btn" onClick={onSaveRoster}>Save to club roster</button>
          )}
        </div>
        {coaches.length === 0 && (
          <p className="ce-empty">
            Nobody rostered yet, so coach cover is not scored — it counts as unanswered
            rather than failed. Add the people you have, or hypothetical ones, to see
            where the week falls short.
          </p>
        )}
      </div>

      {gaps?.length > 0 && (
        <div className="glass-card ce-gaps">
          <div className="ce-sub">Recruitment brief — what you would need to cover the week</div>
          <table className="stats-table-glass">
            <thead>
              <tr><th>When</th><th>Where</th><th>Squad</th><th>Short</th><th>Hours/wk</th></tr>
            </thead>
            <tbody>
              {gaps.map(g => (
                <tr key={`${g.slotId}-${g.squadId}`}>
                  <td>{g.day} {g.startTime}–{g.endTime}</td>
                  <td>{g.venue}</td>
                  <td>{g.squadName}</td>
                  <td style={{ color: 'var(--accent-rose)', fontWeight: 800 }}>
                    {g.shortfall} of {g.required}
                  </td>
                  <td>{g.hoursPerWeek}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="ce-grid">
        {coaches.map(coach => {
          const load = hoursFor(coach.id);
          const open = expanded === coach.id;
          return (
            <div key={coach.id} className="glass-card ce-card">
              <div className="ce-head">
                <input
                  className="ce-name" type="text" value={coach.name || ''}
                  onChange={e => update(coach.id, { name: e.target.value })}
                />
                <button type="button" className="ce-mini ce-mini-danger"
                  onClick={() => remove(coach.id)} title="Remove from roster">✕</button>
              </div>

              <div className="ce-row">
                <label className="ce-field">
                  <span>Level</span>
                  <select value={coach.level || 'L2'}
                    onChange={e => update(coach.id, { level: e.target.value })}>
                    {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </label>
                <label className="ce-field">
                  <span>Max lanes</span>
                  <input type="number" min="1" max="10" value={coach.maxLanes || 3}
                    onChange={e => update(coach.id, { maxLanes: Number(e.target.value) })} />
                </label>
                <label className="ce-field">
                  <span>Max hrs/wk</span>
                  <input
                    type="number" min="0" max="40" step="0.5"
                    value={coach.maxHoursPerWeek ?? ''}
                    placeholder="none"
                    onChange={e => update(coach.id, {
                      maxHoursPerWeek: e.target.value === '' ? null : Number(e.target.value)
                    })}
                  />
                </label>
              </div>

              {load && (
                <div className="ce-load">
                  <span>{load.hours}h across {load.sessions} session{load.sessions === 1 ? '' : 's'}</span>
                  {load.overCommitted && <span className="ce-chip ce-chip-rose">OVER CAP</span>}
                  {load.unused && <span className="ce-chip ce-chip-amber">UNUSED</span>}
                </div>
              )}

              <div className="ce-sub ce-sub-tight">SQUADS</div>
              <div className="ce-pills">
                {squads.map(sq => (
                  <button
                    key={sq.id} type="button"
                    className={`ce-pill${coach.squadIds.includes(sq.id) ? ' is-on' : ''}`}
                    onClick={() => toggleSquad(coach, sq.id)}
                  >{sq.name}</button>
                ))}
              </div>
              {coach.squadIds.length === 0 && (
                <p className="ce-hint">No squads selected — available to any squad.</p>
              )}

              <button type="button" className="ce-toggle"
                onClick={() => setExpanded(open ? null : coach.id)}>
                {open ? 'Hide availability' : `Availability (${coach.availability.length || 'any time'})`}
              </button>

              {open && (
                <div className="ce-avail">
                  {DAY_NAMES_FULL.map(day => {
                    const w = coach.availability.find(x => x.day === day);
                    return (
                      <div key={day} className="ce-avail-row">
                        <span className="ce-avail-day">{day.slice(0, 3)}</span>
                        <input type="time" value={w?.from || ''}
                          onChange={e => setWindow(coach, day, 'from', e.target.value)} />
                        <input type="time" value={w?.to || ''}
                          onChange={e => setWindow(coach, day, 'to', e.target.value)} />
                        {w && (
                          <button type="button" className="ce-mini"
                            onClick={() => clearDay(coach, day)} title="Clear this day">✕</button>
                        )}
                      </div>
                    );
                  })}
                  <p className="ce-hint">
                    Leave every day blank to mean &quot;available whenever&quot;. A window must cover
                    a whole session for the coach to be offered it.
                  </p>

                  {venues.length > 1 && (
                    <>
                      <div className="ce-sub ce-sub-tight">VENUES</div>
                      <div className="ce-pills">
                        {venues.map(v => (
                          <button
                            key={v} type="button"
                            className={`ce-pill${coach.venues.includes(v) ? ' is-on' : ''}`}
                            onClick={() => toggleVenue(coach, v)}
                          >{v}</button>
                        ))}
                      </div>
                      {coach.venues.length === 0 && (
                        <p className="ce-hint">No venues selected — can work at any site.</p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: '1.25rem' }}>
        <button type="button" className="btn-premium-intel" onClick={add}>
          + Add a coach (real or hypothetical)
        </button>
      </div>

      <style jsx>{`
        .ce-summary { padding: 1.15rem 1.4rem; margin-bottom: 1.5rem; }
        .ce-stats {
          display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 1rem;
        }
        .ce-tools { display: flex; gap: 0.5rem; margin-top: 1rem; flex-wrap: wrap; }
        .ce-btn {
          background: transparent; border: 1px solid var(--glass-border); border-radius: 8px;
          color: var(--text-secondary); cursor: pointer; padding: 6px 12px;
          font-size: 0.74rem; font-weight: 800;
        }
        .ce-empty {
          font-size: 0.76rem; line-height: 1.55; color: var(--text-secondary);
          margin: 1rem 0 0; padding-left: 0.7rem; border-left: 2px solid var(--accent-amber);
        }
        .ce-gaps { padding: 1.15rem 1.4rem; margin-bottom: 1.5rem; overflow-x: auto; }
        .ce-sub {
          font-size: 0.6rem; font-weight: 900; letter-spacing: 0.12em;
          color: var(--text-secondary); margin-bottom: 0.7rem;
        }
        .ce-sub-tight { margin: 0.9rem 0 0.45rem; }
        .ce-grid {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(310px, 1fr)); gap: 1.25rem;
        }
        .ce-card { padding: 1.1rem 1.2rem; }
        .ce-head { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.8rem; }
        .ce-name {
          flex: 1; background: transparent; border: none;
          border-bottom: 2px solid var(--glass-border);
          color: inherit; font-size: 1rem; font-weight: 900; padding: 3px 0;
        }
        .ce-name:focus { outline: none; border-bottom-color: var(--accent-cyan); }
        .ce-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.55rem; }
        .ce-field { display: flex; flex-direction: column; gap: 0.25rem; }
        .ce-field span {
          font-size: 0.55rem; font-weight: 900; letter-spacing: 0.08em; color: var(--text-secondary);
        }
        .ce-field input, .ce-field select {
          width: 100%; padding: 6px 8px; border-radius: 6px;
          border: 1px solid var(--glass-border); background: var(--glass-bg);
          color: inherit; font-weight: 700; font-size: 0.8rem;
        }
        .ce-load {
          display: flex; align-items: center; gap: 0.5rem; margin-top: 0.7rem;
          font-size: 0.72rem; font-weight: 700; color: var(--text-secondary);
        }
        .ce-chip {
          padding: 1px 6px; border-radius: 4px; font-size: 0.54rem;
          font-weight: 900; letter-spacing: 0.06em;
        }
        .ce-chip-rose { background: var(--accent-rose); color: #fff; }
        .ce-chip-amber { background: var(--accent-amber); color: #000; }
        .ce-pills { display: flex; flex-wrap: wrap; gap: 4px; }
        .ce-pill {
          padding: 4px 9px; border-radius: 7px; font-size: 0.66rem; font-weight: 800;
          border: 1px solid var(--glass-border); background: transparent;
          color: var(--text-secondary); cursor: pointer;
        }
        .ce-pill.is-on { background: var(--accent-teal); color: #000; border-color: var(--accent-teal); }
        .ce-hint {
          font-size: 0.63rem; color: var(--text-secondary); opacity: 0.85;
          margin: 0.45rem 0 0; line-height: 1.45;
        }
        .ce-toggle {
          margin-top: 0.9rem; background: transparent; border: 1px dashed var(--glass-border);
          border-radius: 7px; color: var(--text-secondary); cursor: pointer;
          padding: 6px 10px; font-size: 0.68rem; font-weight: 800; width: 100%;
        }
        .ce-avail { margin-top: 0.75rem; }
        .ce-avail-row {
          display: grid; grid-template-columns: 38px 1fr 1fr 28px;
          gap: 5px; align-items: center; margin-bottom: 4px;
        }
        .ce-avail-day {
          font-size: 0.6rem; font-weight: 900; color: var(--text-secondary);
        }
        .ce-avail-row :global(input) {
          padding: 4px 6px; border-radius: 5px; width: 100%;
          border: 1px solid var(--glass-border); background: var(--glass-bg);
          color: inherit; font-size: 0.72rem; font-weight: 700;
        }
        .ce-mini {
          background: transparent; border: 1px solid var(--glass-border); border-radius: 6px;
          color: var(--text-secondary); cursor: pointer; padding: 3px 7px;
          font-size: 0.72rem; font-weight: 800;
        }
        .ce-mini-danger:hover { color: var(--accent-rose); border-color: var(--accent-rose); }
      `}</style>
    </div>
  );
}

