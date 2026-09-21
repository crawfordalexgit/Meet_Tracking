import { useMemo } from 'react';
import { DAY_NAMES_FULL, getDayOrder } from '../lib/analytics-utils';
import { timeToMinutes, slotDurationHours } from '../lib/restructure-solver';
import { SLOT_SOURCE_LABELS } from '../lib/restructure-glossary';
import WeeklyBlockForm from './restructure/WeeklyBlockForm';
import SessionUse from './restructure/SessionUse';
import { Stat } from './restructure/Figures';
import Term from './restructure/Term';

/**
 * Editor for the pool slots a scenario is allowed to use.
 *
 * Slots seeded from the live timetable are marked "existing"; anything added
 * here is a "candidate". The distinction drives the continuity score, so keeping
 * it visible matters — a plan that rewrites the whole week is far harder to
 * adopt than one that adds to it.
 */

export default function ScenarioSlotEditor({
  slots, venues, baselineLaneHours, onChange, onAddBlock,
  solvedLaneHours = null, stale = true
}) {

  const totals = useMemo(() => {
    const enabled = slots.filter(s => s.enabled !== false);
    const laneHours = enabled.reduce((sum, s) => {
      const start = timeToMinutes(s.startTime);
      const end = timeToMinutes(s.endTime);
      if (start == null || end == null || end <= start) return sum;
      return sum + (Number(s.lanes) || 0) * slotDurationHours(s);
    }, 0);
    return {
      count: enabled.length,
      laneHours: +laneHours.toFixed(1),
      gained: +(laneHours - (baselineLaneHours || 0)).toFixed(1),
      candidates: enabled.filter(s => s.source !== 'existing').length
    };
  }, [slots, baselineLaneHours]);

  const update = (id, patch) => onChange(slots.map(s => (s.id === id ? { ...s, ...patch } : s)));
  const remove = id => onChange(slots.filter(s => s.id !== id));

  const duplicate = id => {
    const src = slots.find(s => s.id === id);
    if (!src) return;
    onChange(slots.concat([{ ...src, id: nextId(slots), source: 'candidate', existingSessionId: null }]));
  };

  const addOne = () => onChange(slots.concat([{
    id: nextId(slots), label: 'New slot', venue: venues[0] || 'Main Pool',
    day: 'Monday', startTime: '18:00', endTime: '19:30', lanes: 6,
    source: 'candidate', existingSessionId: null, enabled: true
  }]));

  const sorted = [...slots].sort((a, b) =>
    getDayOrder(a.day) - getDayOrder(b.day)
    || String(a.startTime).localeCompare(String(b.startTime))
    || String(a.venue).localeCompare(String(b.venue)));

  return (
    <div>
      <div className="glass-card" style={{ padding: '1.25rem 1.5rem', marginBottom: '1.5rem' }}>
        <WeeklyBlockForm venues={venues} onAdd={onAddBlock} />
      </div>

      {/*
        While the plan is unsolved this counts the slots in front of you; once it
        is solved it shows the figure the solver used. Two numbers claiming to be
        the same thing while quietly disagreeing is how this used to contradict
        the verdict at the top of the page.
      */}
      <div className="se-totals">
        <Stat label="Sessions switched on" value={totals.count} />
        <Stat
          term={stale ? undefined : 'poolTimeOnOffer'}
          label={stale ? 'Pool time in these slots' : 'Pool time this plan can use'}
          value={stale ? totals.laneHours : solvedLaneHours ?? totals.laneHours}
          sub={stale ? 'not yet solved' : 'lane-hours a week'}
        />
        <Stat
          label="Change against today"
          value={`${totals.gained >= 0 ? '+' : ''}${totals.gained}`}
          sub="lane-hours a week"
          accent={totals.gained > 0 ? 'var(--accent-emerald)' : totals.gained < 0 ? 'var(--accent-rose)' : null}
        />
        <Stat term="beingConsidered" label="Being considered" value={totals.candidates} />
      </div>

      <div className="glass-card" style={{ padding: '0.5rem', overflowX: 'auto' }}>
        <table className="stats-table-glass" style={{ minWidth: '860px' }}>
          <thead>
            <tr>
              <th style={{ width: '46px' }}>On</th>
              <th>Label</th>
              <th style={{ width: '120px' }}>Venue</th>
              <th style={{ width: '118px' }}>Day</th>
              <th style={{ width: '96px' }}>Start</th>
              <th style={{ width: '96px' }}>End</th>
              <th style={{ width: '74px' }}>Lanes</th>
              <th style={{ width: '132px' }}><Term k="placesFilled">Used today</Term></th>
              <th style={{ width: '116px' }}>Status</th>
              <th style={{ width: '96px' }}></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(slot => {
              const start = timeToMinutes(slot.startTime);
              const end = timeToMinutes(slot.endTime);
              const bad = start == null || end == null || end <= start;
              return (
                <tr key={slot.id} style={{ opacity: slot.enabled === false ? 0.45 : 1 }}>
                  <td>
                    <input type="checkbox" checked={slot.enabled !== false}
                      onChange={e => update(slot.id, { enabled: e.target.checked })} />
                  </td>
                  <td>
                    <input className="se-cell" type="text" value={slot.label || ''}
                      onChange={e => update(slot.id, { label: e.target.value })} />
                  </td>
                  <td>
                    <input className="se-cell" type="text" value={slot.venue || ''} list="se-venues"
                      onChange={e => update(slot.id, { venue: e.target.value })} />
                  </td>
                  <td>
                    <select className="se-cell" value={slot.day}
                      onChange={e => update(slot.id, { day: e.target.value })}>
                      {DAY_NAMES_FULL.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </td>
                  <td>
                    <input className="se-cell" type="time" value={slot.startTime || ''}
                      onChange={e => update(slot.id, { startTime: e.target.value })} />
                  </td>
                  <td>
                    <input
                      className={`se-cell${bad ? ' is-bad' : ''}`}
                      type="time" value={slot.endTime || ''}
                      onChange={e => update(slot.id, { endTime: e.target.value })}
                      title={bad ? 'End time must be after the start time' : ''}
                    />
                  </td>
                  <td>
                    <input className="se-cell" type="number" min="1" max="12" value={slot.lanes}
                      onChange={e => update(slot.id, { lanes: Number(e.target.value) })} />
                  </td>
                  <td>{slot.source === 'existing' ? <SessionUse use={slot.currentUse} /> : <span style={{ color: 'var(--text-secondary)', opacity: 0.5 }}>—</span>}</td>
                  <td>
                    <span className={`se-tag ${slot.source === 'existing' ? 'is-existing' : 'is-candidate'}`}>
                      {SLOT_SOURCE_LABELS[slot.source === 'existing' ? 'existing' : 'candidate'].term}
                    </span>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button type="button" className="se-mini" onClick={() => duplicate(slot.id)} title="Duplicate">⧉</button>
                    <button type="button" className="se-mini se-mini-danger" onClick={() => remove(slot.id)} title="Delete">✕</button>
                  </td>
                </tr>
              );
            })}
            {!sorted.length && (
              <tr><td colSpan={10} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                No slots yet. Add a weekly block above, or re-seed from live data.
              </td></tr>
            )}
          </tbody>
        </table>
        <div style={{ padding: '0.75rem 1rem' }}>
          <button type="button" className="btn-premium-intel" onClick={addOne}>+ Add a single slot</button>
        </div>
      </div>

      <style jsx>{`
        .se-totals {
          display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 1rem; margin-bottom: 1.5rem;
        }
        .se-cell {
          width: 100%; padding: 5px 7px; border-radius: 6px;
          border: 1px solid var(--glass-border); background: var(--glass-bg);
          color: inherit; font-weight: 600; font-size: 0.8rem;
        }
        .se-cell.is-bad { border-color: var(--accent-rose); }
        .se-tag { white-space: nowrap;
          padding: 2px 7px; border-radius: 5px; font-size: 0.58rem;
          font-weight: 900; letter-spacing: 0.06em;
        }
        .se-tag.is-existing { background: rgba(var(--accent-teal-rgb), 0.18); color: var(--accent-teal); }
        .se-tag.is-candidate { background: rgba(var(--accent-amber-rgb), 0.18); color: var(--accent-amber); }
        .se-mini {
          background: transparent; border: 1px solid var(--glass-border); border-radius: 6px;
          color: var(--text-secondary); cursor: pointer; padding: 3px 8px; margin-right: 4px;
          font-size: 0.8rem; font-weight: 800;
        }
        .se-mini-danger:hover { color: var(--accent-rose); border-color: var(--accent-rose); }
      `}</style>
    </div>
  );
}


/** Ids must be unique and stable; the solver keys lane accounting off them. */
function nextId(slots, offset = 0) {
  let n = slots.length + 1 + offset;
  const taken = new Set(slots.map(s => s.id));
  while (taken.has(`slot_new_${n}`)) n++;
  return `slot_new_${n}`;
}
