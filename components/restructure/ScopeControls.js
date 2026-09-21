import Term from './Term';

/**
 * What the search is allowed to change, and how it should group swimmers.
 *
 * Both controls existed twice — the axis picker was even declared twice as the
 * same three tuples, once as a constant and once inline — so this is one copy of
 * each, plus the capability context that only makes sense beside them.
 */

const BAND_AXES = [
  { key: 'age', label: 'By age', blurb: 'Squads are contiguous swimming-age bands.' },
  {
    key: 'capability',
    label: 'By capability',
    blurb: 'Squads are bands of World Aquatics points, with age as a guard.'
  },
  {
    key: 'hybrid',
    label: 'Both, ranked together',
    blurb: 'Search each way and let the scores decide which suits the club.'
  }
];

/** Lock the squads that must stay exactly as they are. */
export function SquadLockPills({ squads = [], onToggleLock, onSetAllLocked }) {
  if (!squads.length) return null;
  const changeable = squads.filter(s => s.competitive !== false);
  const open = changeable.filter(s => !s.locked).length;

  return (
    <div className="sl">
      <div className="sl-head">
        Which squads may be remodelled
        <span className="sl-count">{open} of {squads.length}</span>
      </div>

      {/*
        Holding every squad is a question in its own right, not a fiddly special
        case of locking them one at a time: "keep what we have, and tell me how
        many more swimmers we could take". Doing it pill by pill across nine
        squads made an ordinary question feel like an edge case.
      */}
      {onSetAllLocked && (
        <div className="sl-all">
          <button type="button"
            className={`sl-mode${open === 0 ? ' is-on' : ''}`}
            onClick={() => onSetAllLocked(true)}>
            Keep every squad as it is
            <em>and show what room is left in each</em>
          </button>
          <button type="button"
            className={`sl-mode${open === changeable.length ? ' is-on' : ''}`}
            onClick={() => onSetAllLocked(false)}>
            Let the search re-band everything
            <em>propose new squads from scratch</em>
          </button>
        </div>
      )}

      <div className="sl-pills">
        {squads.map(sq => {
          // A non-competitive squad is always carried through untouched, so it
          // cannot be unlocked — the control says so rather than pretending.
          const held = sq.competitive === false || sq.locked;
          return (
            <button key={sq.id} type="button"
              className={`sl-pill${held ? ' is-held' : ' is-open'}`}
              onClick={() => sq.competitive !== false && onToggleLock(sq.id)}
              disabled={sq.competitive === false}
              title={sq.competitive === false
                ? 'Non-competitive, so always carried through untouched'
                : sq.locked
                  ? 'Held as it is. Click to allow the search to remodel it.'
                  : 'Open to remodelling. Click to hold it as it is.'}>
              {held ? '🔒' : '↻'} {sq.name}
              {sq.competitive === false && <em><Term k="nonCompetitive" plain /></em>}
            </button>
          );
        })}
      </div>

      <p className="sl-note">
        A locked squad keeps its swimmers, its volume and its water, and the search
        re-bands only what is left. Useful for &quot;leave the top squad alone and show
        me what changing everything below it would do&quot;.
      </p>

      <style jsx>{`
        .sl-head {
          display: flex; align-items: baseline; gap: 0.6rem; flex-wrap: wrap;
          font-size: 0.58rem; font-weight: 900; letter-spacing: 0.12em;
          text-transform: uppercase; color: var(--text-secondary); margin-bottom: 0.6rem;
        }
        .sl-count { color: var(--accent-cyan); letter-spacing: 0.04em; }
        .sl-all { display: flex; flex-wrap: wrap; gap: 0.6rem; margin-bottom: 1rem; }
        .sl-mode {
          display: flex; flex-direction: column; gap: 3px; text-align: left;
          padding: 9px 13px; border-radius: 9px; cursor: pointer;
          border: 1px solid var(--glass-border); background: transparent;
          color: inherit; font-size: 0.78rem; font-weight: 900;
        }
        .sl-mode.is-on {
          border-color: var(--accent-cyan); background: rgba(var(--accent-cyan-rgb), 0.1);
          color: var(--accent-cyan);
        }
        .sl-mode em {
          font-style: normal; font-size: 0.64rem; font-weight: 600;
          color: var(--text-secondary);
        }
        .sl-pills { display: flex; flex-wrap: wrap; gap: 6px; }
        .sl-pill {
          padding: 5px 11px; border-radius: 8px; font-size: 0.7rem; font-weight: 800;
          border: 1px solid var(--glass-border); background: transparent;
          color: inherit; cursor: pointer;
        }
        .sl-pill.is-open { border-color: var(--accent-cyan); color: var(--accent-cyan); }
        .sl-pill.is-held { color: var(--text-secondary); opacity: 0.75; cursor: default; }
        .sl-pill em {
          font-style: normal; font-size: 0.55rem; font-weight: 700;
          opacity: 0.75; margin-left: 5px;
        }
        .sl-note {
          font-size: 0.7rem; line-height: 1.55; color: var(--text-secondary);
          margin: 0.8rem 0 0; max-width: 76ch;
        }
      `}</style>
    </div>
  );
}

/** Age, capability, or search both and compare. */
export function BandAxisPicker({ bandBy, onBandByChange, capability }) {
  return (
    <div className="ba">
      <div className="ba-head">How should swimmers be grouped into squads?</div>

      <div className="ba-list">
        {BAND_AXES.map(axis => (
          <button key={axis.key} type="button"
            className={`ba-btn${bandBy === axis.key ? ' is-on' : ''}`}
            aria-pressed={bandBy === axis.key}
            onClick={() => onBandByChange(axis.key)}>
            <span className="ba-name">{axis.label}</span>
            <span className="ba-blurb">{axis.blurb}</span>
          </button>
        ))}
      </div>

      {bandBy !== 'age' && capability && (
        <div className="ba-cap">
          <div className="ba-cap-head">
            Where the squads sit today on peak World Aquatics points
            <span className="ba-cap-cover">
              {capability.withData} with data · {capability.withoutData} without
            </span>
          </div>
          <div className="ba-cap-rows">
            {(capability.bySquad || []).map(sq => (
              <div key={sq.name} className="ba-cap-row">
                <span className="ba-cap-name">{sq.name}</span>
                <span className="ba-cap-range">{sq.p10}–{sq.p90}</span>
                <span className="ba-cap-median">median {sq.median}</span>
              </div>
            ))}
          </div>
          <p className="ba-cap-note">
            Capability bands are calibrated against these rather than invented.
            Overlapping ranges are the argument for grouping on ability: two squads
            sitting on the same points are training apart for reasons other than how
            they swim.
            {capability.withoutData > 0
              && ' Swimmers with no times in the last year keep their age band, and are counted above.'}
          </p>
        </div>
      )}

      <style jsx>{`
        .ba-head {
          font-size: 0.58rem; font-weight: 900; letter-spacing: 0.12em;
          text-transform: uppercase; color: var(--text-secondary); margin-bottom: 0.6rem;
        }
        .ba-list {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 0.6rem;
        }
        .ba-btn {
          display: flex; flex-direction: column; gap: 4px; text-align: left;
          padding: 9px 12px; border-radius: 9px; cursor: pointer;
          border: 1px solid var(--glass-border); background: transparent; color: inherit;
        }
        .ba-btn.is-on {
          border-color: var(--accent-cyan); background: rgba(var(--accent-cyan-rgb), 0.1);
        }
        .ba-name { font-size: 0.76rem; font-weight: 900; }
        .ba-blurb {
          font-size: 0.64rem; font-weight: 600; color: var(--text-secondary); line-height: 1.4;
        }
        .ba-cap {
          margin-top: 1.1rem; padding: 0.85rem 1rem;
          border: 1px solid var(--glass-border); border-radius: 10px;
        }
        .ba-cap-head {
          display: flex; justify-content: space-between; gap: 0.8rem; flex-wrap: wrap;
          font-size: 0.55rem; font-weight: 900; letter-spacing: 0.1em;
          text-transform: uppercase; color: var(--text-secondary); margin-bottom: 0.55rem;
        }
        .ba-cap-cover { color: var(--accent-cyan); letter-spacing: 0.04em; }
        .ba-cap-rows { display: flex; flex-direction: column; gap: 2px; }
        .ba-cap-row {
          display: grid; grid-template-columns: 1fr auto auto; gap: 0.8rem;
          font-size: 0.68rem; font-weight: 700;
        }
        .ba-cap-name { font-weight: 800; }
        .ba-cap-range { color: var(--accent-teal); }
        .ba-cap-median { color: var(--text-secondary); font-weight: 600; }
        .ba-cap-note {
          font-size: 0.66rem; line-height: 1.5; color: var(--text-secondary);
          margin: 0.7rem 0 0;
        }
      `}</style>
    </div>
  );
}

export { BAND_AXES };
