import { useState } from 'react';
import { DAY_NAMES_FULL } from '../../lib/analytics-utils';

/**
 * Add pool time you are considering taking, on one or several days at once.
 *
 * This existed twice, and the two copies did not agree about how a slot gets
 * created: the slot editor invented its own ids and skipped validation, while
 * the wizard went through the `add_slots` operation in lib/restructure-patch.js.
 * One of those two paths was tested and the other was not.
 *
 * This form emits the operation and nothing else, so every route into the
 * scenario — this, the assistant, the wizard steps — goes through the same
 * validated code. It cannot, for instance, create a slot that ends before it
 * starts, which the editor's own path could.
 */
export default function WeeklyBlockForm({ venues = [], onAdd, defaultVenue = null }) {
  const [block, setBlock] = useState({
    days: ['Tuesday', 'Thursday'],
    startTime: '19:00',
    endTime: '20:30',
    lanes: 6,
    venue: defaultVenue || venues[0] || 'New pool'
  });

  const toggleDay = d => setBlock(b => ({
    ...b,
    days: b.days.includes(d) ? b.days.filter(x => x !== d) : b.days.concat([d])
  }));

  return (
    <div className="wb">
      <div>
        <div className="wb-label">Add pool time</div>
        <div className="wb-days">
          {DAY_NAMES_FULL.map(d => (
            <button key={d} type="button" onClick={() => toggleDay(d)}
              aria-pressed={block.days.includes(d)}
              className={`wb-day${block.days.includes(d) ? ' is-on' : ''}`}
            >{d.slice(0, 3)}</button>
          ))}
        </div>
      </div>

      <label className="wb-field"><span>From</span>
        <input type="time" value={block.startTime}
          onChange={e => setBlock({ ...block, startTime: e.target.value })} /></label>
      <label className="wb-field"><span>To</span>
        <input type="time" value={block.endTime}
          onChange={e => setBlock({ ...block, endTime: e.target.value })} /></label>
      <label className="wb-field"><span>Lanes</span>
        <input type="number" min="1" max="12" value={block.lanes}
          onChange={e => setBlock({ ...block, lanes: e.target.value })} /></label>
      <label className="wb-field wb-field-wide"><span>Venue</span>
        <input type="text" value={block.venue} list="wb-venues"
          onChange={e => setBlock({ ...block, venue: e.target.value })} />
        <datalist id="wb-venues">
          {venues.map(v => <option key={v} value={v} />)}
        </datalist>
      </label>

      <button type="button" className="btn-premium-action"
        disabled={!block.days.length}
        onClick={() => onAdd({ op: 'add_slots', ...block, lanes: Number(block.lanes) })}>
        Add {block.days.length} session{block.days.length === 1 ? '' : 's'}
      </button>

      <style jsx>{`
        .wb { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 0.8rem; }
        .wb-label {
          font-size: 0.58rem; font-weight: 900; letter-spacing: 0.11em;
          text-transform: uppercase; color: var(--text-secondary); margin-bottom: 0.35rem;
        }
        .wb-days { display: flex; gap: 4px; flex-wrap: wrap; }
        .wb-day {
          padding: 6px 10px; border-radius: 8px; font-size: 0.7rem; font-weight: 800;
          border: 1px solid var(--glass-border); background: transparent;
          color: var(--text-secondary); cursor: pointer;
        }
        .wb-day.is-on { background: var(--accent-cyan); color: #000; border-color: var(--accent-cyan); }
        .wb-field { display: flex; flex-direction: column; gap: 0.3rem; }
        .wb-field span {
          font-size: 0.58rem; font-weight: 900; letter-spacing: 0.09em;
          text-transform: uppercase; color: var(--text-secondary);
        }
        .wb-field input {
          padding: 7px 10px; border-radius: 8px; width: 110px;
          border: 1px solid var(--glass-border); background: var(--glass-bg);
          color: inherit; font-weight: 700; font-size: 0.82rem;
        }
        .wb-field input:focus { outline: none; border-color: var(--accent-cyan); }
        .wb-field-wide input { width: 190px; }
      `}</style>
    </div>
  );
}
