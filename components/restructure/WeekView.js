import { useState, useMemo } from 'react';
import { DAY_NAMES_FULL, getDayOrder } from '../../lib/analytics-utils';
import { minutesToTime } from '../../lib/restructure-solver';
import { buildSegments, assignTracks } from '../../lib/timetable-layout';
import { FLAG_LABELS } from '../../lib/restructure-glossary';
import Term from './Term';

/**
 * A week of swimming, drawn once.
 *
 * This replaces four separate renderings of the same data: a session table on
 * Today, a grid and a table on Venues, and the two halves of the old timetable
 * component. It takes items from lib/restructure-week.js and does not care which
 * of the three sources produced them.
 *
 * Deleting the old Current/Proposed toggle is not tidying — it fixes a real bug.
 * That toggle defaulted to "current" whenever a baseline existed, and print has
 * no way to set React state, so every PDF ever exported showed the club's
 * existing timetable under a heading that said "Timetable" and meant the
 * proposal. Each week now lives under its own heading and renders only itself,
 * so there is no view state for print to land on the wrong side of.
 *
 * The flag chips finally have a legend. They have been shipping as bare LATE,
 * TIGHT and COACH since the beginning, with their meaning available only in a
 * hover title that never printed.
 */

const PX_PER_MINUTE = 1.15;

const SQUAD_COLOURS = [
  'var(--accent-cyan)', 'var(--accent-teal)', 'var(--accent-emerald)',
  'var(--accent-indigo)', 'var(--accent-violet)', 'var(--accent-amber)',
  'var(--accent-rose)'
];

/**
 * Colour for how full a session is.
 *
 * Carries the signal when a block is too narrow for any text — which it will be
 * on a night with six concurrent sessions, whatever the font size.
 */
function heat(pct) {
  if (pct === null || pct === undefined) return { colour: 'var(--text-secondary)', label: 'no register' };
  if (pct < 25) return { colour: 'var(--accent-rose)', label: 'barely used' };
  if (pct < 50) return { colour: 'var(--accent-amber)', label: 'under half full' };
  if (pct < 80) return { colour: 'var(--accent-teal)', label: 'reasonably used' };
  if (pct <= 105) return { colour: 'var(--accent-emerald)', label: 'full' };
  return { colour: 'var(--accent-violet)', label: 'over capacity' };
}

const SORTS = [
  { k: 'time', label: 'By day and time' },
  { k: 'usage', label: 'Least used first' },
  { k: 'waste', label: 'Most empty places first' }
];

export default function WeekView({
  items = [],
  /** true for the club's real week (it has registers), false for a proposal. */
  showAttendance = false,
  venues = null,
  venue = null,
  onVenueChange = null,
  laneStrips = false,
  note = null,
  emptyMessage = 'Nothing to draw yet.'
}) {
  const [asList, setAsList] = useState(false);
  const [sortBy, setSortBy] = useState('time');

  const model = useMemo(() => {
    if (!items.length) return null;

    const layout = buildSegments(
      items.map(i => ({ start: i.startMin, end: i.endMin })),
      { pxPerMinute: PX_PER_MINUTE });

    const days = DAY_NAMES_FULL.filter(d => items.some(i => i.day === d));

    const colours = {};
    Array.from(new Set(items.filter(i => !i.isUnused).map(i => i.colourKey)))
      .forEach((k, i) => { colours[k] = SQUAD_COLOURS[i % SQUAD_COLOURS.length]; });

    const byDay = {};
    days.forEach(day => {
      // Unused bookings share the track system, so an empty slot can never be
      // drawn on top of a real one.
      const dayItems = items
        .filter(i => i.day === day)
        .sort((a, b) => a.startMin - b.startMin
          || (a.isUnused ? 1 : 0) - (b.isUnused ? 1 : 0)
          || String(a.title).localeCompare(String(b.title)));
      byDay[day] = { items: dayItems, trackCount: assignTracks(dayItems) };
    });

    return { layout, days, byDay, colours };
  }, [items]);

  const venuePills = venues && venues.length > 1 && onVenueChange ? (
    <div className="wv-venues no-print">
      <span className="wv-venues-label">Venue</span>
      <button type="button" className={`wv-pill${!venue ? ' is-on' : ''}`}
        onClick={() => onVenueChange(null)}>All</button>
      {venues.map(v => (
        <button key={v} type="button" className={`wv-pill${venue === v ? ' is-on' : ''}`}
          onClick={() => onVenueChange(v)}>{v}</button>
      ))}
    </div>
  ) : null;

  if (!model) {
    return (
      <div>
        {venuePills}
        <div className="glass-card" style={{ padding: '3rem', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-secondary)', fontWeight: 700, letterSpacing: '0.05em' }}>
            {emptyMessage}
          </p>
        </div>
        <style jsx>{`
          .wv-venues { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; margin-bottom: 1rem; }
          .wv-venues-label {
            font-size: 0.58rem; font-weight: 900; letter-spacing: 0.1em;
            color: var(--text-secondary); margin-right: 3px; text-transform: uppercase;
          }
          .wv-pill {
            padding: 4px 11px; border-radius: 7px; font-size: 0.68rem; font-weight: 800;
            border: 1px solid var(--glass-border); background: transparent;
            color: var(--text-secondary); cursor: pointer;
          }
          .wv-pill.is-on { background: var(--accent-cyan); color: #000; border-color: var(--accent-cyan); }
        `}</style>
      </div>
    );
  }

  const { layout, days, byDay, colours } = model;
  const real = items.filter(i => !i.isUnused);

  return (
    <div>
      <div className="wv-bar">
        {venuePills}
        <button type="button" className="wv-toggle no-print" onClick={() => setAsList(!asList)}>
          {asList ? 'Show grid' : 'Show as list'}
        </button>
        {note && <span className="wv-note">{note}</span>}
      </div>

      {asList ? (
        <div className="glass-card wv-list-wrap">
          {showAttendance && (
            <div className="wv-sortbar no-print">
              <span>Sort</span>
              {SORTS.map(o => (
                <button key={o.k} type="button"
                  className={`wv-sort${sortBy === o.k ? ' is-on' : ''}`}
                  onClick={() => setSortBy(o.k)}>{o.label}</button>
              ))}
            </div>
          )}
          <table className="stats-table-glass" style={{ minWidth: '820px' }}>
            <thead>
              <tr>
                <th>Day</th><th>Time</th>
                <th>{showAttendance ? 'Session' : 'Squad'}</th>
                <th>Venue</th><th>Lanes</th>
                <th><Term k="place">Places</Term></th>
                {showAttendance ? (
                  <>
                    <th><Term k="booked" /></th>
                    <th><Term k="attending" /></th>
                    <th><Term k="placesFilled">Places filled</Term></th>
                    <th>Empty places</th>
                  </>
                ) : (
                  <><th>Expected</th><th>Coaches</th></>
                )}
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {real.slice().sort((a, b) => {
                if (showAttendance && sortBy === 'usage') {
                  // A session nobody has taken a register for is unknown, not
                  // empty, so it sorts to the end rather than to the top of a
                  // list titled "least used".
                  const av = a.placesFilledPct === null ? 999 : a.placesFilledPct;
                  const bv = b.placesFilledPct === null ? 999 : b.placesFilledPct;
                  return av - bv || String(a.title).localeCompare(String(b.title));
                }
                if (showAttendance && sortBy === 'waste') {
                  const aw = a.attending === null ? -1 : a.places - a.attending;
                  const bw = b.attending === null ? -1 : b.places - b.attending;
                  return bw - aw || String(a.title).localeCompare(String(b.title));
                }
                return getDayOrder(a.day) - getDayOrder(b.day)
                  || a.startMin - b.startMin
                  || String(a.title).localeCompare(String(b.title));
              }).map((i, idx, arr) => {
                const grouped = showAttendance && sortBy !== 'time';
                const newDay = !grouped && (idx === 0 || arr[idx - 1].day !== i.day);
                const h = heat(i.placesFilledPct);
                return (
                  <tr key={i.key} className={newDay ? 'is-daystart' : ''}>
                    <td style={{ fontWeight: 800 }}>{grouped ? i.day : (newDay ? i.day : '')}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{i.startTime}–{i.endTime}</td>
                    <td style={{ fontWeight: 700 }}>
                      {i.title}
                      {i.subtitle && <div className="wv-sub">in {i.subtitle}</div>}
                    </td>
                    <td>{i.venue}</td>
                    <td>{i.lanes}</td>
                    <td>{i.places ?? '—'}</td>
                    {showAttendance ? (
                      <>
                        <td>{i.booked ?? '—'}</td>
                        <td>{i.attending === null ? '—' : i.attending}</td>
                        <td style={{ fontWeight: 900, color: h.colour, whiteSpace: 'nowrap' }}>
                          {i.placesFilledPct === null ? 'no register' : `${Math.round(i.placesFilledPct)}%`}
                        </td>
                        <td style={{ color: i.attending !== null && (i.places - i.attending) > 10
                          ? 'var(--accent-rose)' : 'inherit' }}>
                          {i.attending === null ? '—' : Math.round(i.places - i.attending)}
                        </td>
                      </>
                    ) : (
                      <>
                        <td>{i.booked ?? '—'}</td>
                        <td>{i.coaches?.length ? i.coaches.join(', ') : '—'}</td>
                      </>
                    )}
                    <td className="wv-sub">
                      {showAttendance && i.registers === 0
                        ? 'no register in 13 weeks'
                        : (i.flags || []).map(f => f.message).join(' ')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="wv-wrap custom-scrollbar">
          <div className="wv-grid" style={{ gridTemplateColumns: `58px repeat(${days.length}, minmax(150px, 1fr))` }}>
            <div className="wv-axis-head" />
            {days.map(day => (
              <div key={day} className="wv-day-head">
                {day.slice(0, 3).toUpperCase()}
                <em>{byDay[day].items.filter(i => !i.isUnused).length}</em>
              </div>
            ))}

            <div className="wv-axis" style={{ height: layout.totalHeight }}>
              {layout.ticks.map(t => (
                <div key={`${t.segment}-${t.minute}`} className="wv-hour" style={{ top: t.top }}>
                  {minutesToTime(t.minute)}
                </div>
              ))}
            </div>

            {days.map(day => {
              const { items: dayItems, trackCount } = byDay[day];
              return (
                <div key={day} className="wv-col" style={{ height: layout.totalHeight }}>
                  {layout.segments.map(s => (
                    <div key={s.index} className="wv-band" style={{ top: s.top, height: s.height }} />
                  ))}
                  {layout.ticks.map(t => (
                    <div key={`${t.segment}-${t.minute}`} className="wv-rule" style={{ top: t.top }} />
                  ))}

                  {dayItems.map(item => {
                    const width = 100 / trackCount;
                    const top = layout.offsetOf(item.startMin);
                    const height = Math.max(34, layout.offsetOf(item.endMin) - top);
                    const types = new Set((item.flags || []).map(f => f.type));

                    const style = {
                      top, height,
                      left: `calc(${item.track * width}% + 2px)`,
                      width: `calc(${width}% - 4px)`
                    };
                    if (!item.isUnused) {
                      style.borderLeftColor = showAttendance
                        ? heat(item.placesFilledPct).colour
                        : colours[item.colourKey];
                      if (showAttendance) style.borderLeftWidth = '6px';
                    }

                    return (
                      <div
                        key={item.key}
                        className={[
                          'wv-block',
                          item.isUnused ? 'is-unused' : '',
                          types.has('CURFEW') ? 'is-curfew' : '',
                          types.has('UNDER_CAPACITY') ? 'is-tight' : ''
                        ].filter(Boolean).join(' ')}
                        style={style}
                        title={[
                          item.title,
                          item.subtitle,
                          `${item.startTime}–${item.endTime} · ${item.lanes} lanes · ${item.venue}`,
                          item.places ? `${item.lanes} lanes · ${item.places} places` : null,
                          showAttendance && item.booked !== null ? `${item.booked} booked` : null,
                          showAttendance && item.attending !== null ? `${item.attending} attending on average` : null,
                          item.coaches?.length ? `Coaches: ${item.coaches.join(', ')}` : null,
                          ...(item.flags || []).map(f => f.message)
                        ].filter(Boolean).join('\n')}
                      >
                        {!item.isUnused && showAttendance && (
                          <div className="wv-pct" style={{ color: heat(item.placesFilledPct).colour }}>
                            {item.placesFilledPct === null ? '—' : `${Math.round(item.placesFilledPct)}%`}
                          </div>
                        )}
                        {laneStrips && !item.isUnused && (
                          <div className="wv-lanes" aria-hidden="true">
                            {Array.from({ length: Math.min(item.lanes || 0, 10) }).map((_, n) => (
                              <span key={n} className="wv-lane" />
                            ))}
                          </div>
                        )}
                        <div className="wv-name">{item.title}</div>
                        <div className="wv-time">{item.startTime}–{item.endTime}</div>
                        {item.subtitle && <div className="wv-sub-line">in {item.subtitle}</div>}
                        {item.places != null && (
                          <div className="wv-stats">{item.lanes}L · {item.places} places</div>
                        )}
                        {item.isUnused && <div className="wv-stats">{item.lanes} lanes, nobody in</div>}
                        {types.size > 0 && (
                          <div className="wv-chips">
                            {Object.entries(FLAG_LABELS).filter(([t]) => types.has(t)).map(([t, f]) => (
                              <span key={t}
                                className={`wv-chip ${t === 'CURFEW' ? 'wv-chip-amber' : 'wv-chip-rose'}`}>
                                {f.chip}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* A legend, at last. These chips have shipped bare since the beginning. */}
      <div className="wv-legend">
        {Object.entries(FLAG_LABELS).map(([t, f]) => (
          <span key={t} className="wv-legend-item">
            <span className={`wv-chip ${t === 'CURFEW' ? 'wv-chip-amber' : 'wv-chip-rose'}`}>{f.chip}</span>
            {f.meaning}
          </span>
        ))}
        {!asList && (
          <span className="wv-legend-note">
            Quiet hours are collapsed, so a gap between bands is time with nothing booked.
            Sessions running at the same time sit side by side.
          </span>
        )}
      </div>

      <style jsx>{`
        .wv-bar { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 1rem; }
        .wv-venues { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
        .wv-venues-label {
          font-size: 0.58rem; font-weight: 900; letter-spacing: 0.1em;
          color: var(--text-secondary); margin-right: 3px; text-transform: uppercase;
        }
        .wv-pill, .wv-toggle, .wv-sort {
          padding: 4px 11px; border-radius: 7px; font-size: 0.68rem; font-weight: 800;
          border: 1px solid var(--glass-border); background: transparent;
          color: var(--text-secondary); cursor: pointer;
        }
        .wv-pill.is-on, .wv-sort.is-on {
          background: var(--accent-cyan); color: #000; border-color: var(--accent-cyan);
        }
        .wv-note { font-size: 0.66rem; color: var(--text-secondary); }
        .wv-wrap { overflow-x: auto; padding-bottom: 0.5rem; }
        .wv-grid { display: grid; min-width: 700px; gap: 0 5px; }
        .wv-axis-head { height: 32px; }
        .wv-day-head {
          height: 32px; display: flex; align-items: center; justify-content: center; gap: 5px;
          font-weight: 900; font-size: 0.7rem; letter-spacing: 0.1em;
          color: var(--text-secondary); border-bottom: 2px solid var(--glass-border);
        }
        .wv-day-head em { font-style: normal; font-size: 0.58rem; font-weight: 700; opacity: 0.7; }
        .wv-axis { position: relative; }
        .wv-hour {
          position: absolute; right: 7px; transform: translateY(-50%);
          font-size: 0.63rem; font-weight: 700; color: var(--text-secondary); opacity: 0.8;
        }
        .wv-col { position: relative; }
        .wv-band {
          position: absolute; left: 0; right: 0;
          border-left: 1px solid var(--glass-border);
          background: rgba(var(--accent-cyan-rgb), 0.03);
        }
        .wv-rule {
          position: absolute; left: 0; right: 0; height: 1px;
          background: var(--glass-border); opacity: 0.35;
        }
        .wv-block {
          position: absolute; border-radius: 7px; padding: 3px 6px; overflow: hidden;
          border: 1px solid var(--glass-border); border-left-width: 4px; border-left-style: solid;
          background: var(--glass-bg);
        }
        .wv-block.is-unused {
          border-style: dashed; border-left-width: 1px; background: transparent; opacity: 0.5;
        }
        .wv-block.is-curfew { border-color: var(--accent-amber); }
        .wv-block.is-tight { border-color: var(--accent-rose); }
        .wv-lanes { display: flex; gap: 1px; margin-bottom: 2px; }
        .wv-lane {
          flex: 1; height: 3px; border-radius: 2px;
          background: rgba(var(--accent-cyan-rgb), 0.5);
        }
        .wv-name {
          font-weight: 900; font-size: 0.66rem; line-height: 1.12;
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
        }
        .wv-time { font-size: 0.6rem; font-weight: 700; color: var(--text-secondary); white-space: nowrap; }
        .wv-sub-line, .wv-stats {
          font-size: 0.56rem; font-weight: 600; color: var(--text-secondary);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; opacity: 0.9;
        }
        .wv-chips { display: flex; gap: 3px; margin-top: 2px; flex-wrap: wrap; }
        .wv-chip { padding: 0 4px; border-radius: 3px; font-size: 0.5rem; font-weight: 900; }
        .wv-chip-amber { background: var(--accent-amber); color: #000; }
        .wv-chip-rose { background: var(--accent-rose); color: #fff; }
        .wv-legend {
          display: flex; flex-wrap: wrap; gap: 0.4rem 1.4rem; margin-top: 0.9rem;
          font-size: 0.64rem; color: var(--text-secondary); line-height: 1.5;
        }
        .wv-legend-item { display: flex; align-items: center; gap: 5px; }
        .wv-legend-note { flex: 1 1 100%; }
        .wv-list-wrap { padding: 0.5rem; overflow-x: auto; }
        .wv-sortbar {
          display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
          padding: 0.6rem 0.75rem 0.9rem;
        }
        .wv-sortbar span {
          font-size: 0.58rem; font-weight: 900; letter-spacing: 0.1em;
          color: var(--text-secondary); margin-right: 2px;
        }
        .wv-pct { float: right; font-size: 0.72rem; font-weight: 950; line-height: 1; margin-left: 3px; }
        .wv-sub { font-size: 0.64rem; color: var(--text-secondary); }
        .is-daystart :global(td) { border-top: 2px solid var(--glass-border); }
      `}</style>
    </div>
  );
}
