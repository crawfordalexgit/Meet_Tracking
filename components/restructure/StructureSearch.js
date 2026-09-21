import { useState, useEffect } from 'react';
import { Figure } from './Figures';
import Term from './Term';

/**
 * Every way of cutting the club into squads, enumerated and scored.
 *
 * The button, the wait, and the results existed in two places with different
 * field sets, so the wizard and the models screen could show different summaries
 * of the same candidate. One copy now.
 *
 * The elapsed counter is not decoration. The search greedily timetables every
 * candidate and fully solves the best of them, which takes about ten seconds on
 * the club's real data — and a button that has said "Searching…" for ten seconds
 * with nothing else moving reads as a hung page. It was reported as one.
 */
export default function StructureSearch({
  suggestions, suggesting, onSuggest, onApplySuggestion
}) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!suggesting) { setElapsed(0); return undefined; }
    const started = Date.now();
    const id = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 500);
    return () => clearInterval(id);
  }, [suggesting]);

  return (
    <div>
      <div className="ss-run">
        <button type="button" className="btn-premium-action"
          onClick={() => onSuggest()} disabled={suggesting}>
          {suggesting ? 'Searching…' : 'Propose structures'}
        </button>
        {suggesting && (
          <span className="ss-elapsed">
            {elapsed}s — every way of banding the club is being timetabled.
            This usually takes about ten seconds.
          </span>
        )}
      </div>

      {/* Say what was searched and what was not. A capped sweep presented as an
          exhaustive one is the kind of quiet dishonesty that costs trust. */}
      {suggestions?.candidatesConsidered > 0 && !suggesting && (
        <p className="ss-searched">
          {suggestions.candidatesConsidered} structures enumerated,
          {' '}{suggestions.candidatesSolved ?? suggestions.suggestions?.length} timetabled in full.
          {suggestions.truncated && ' The enumeration hit its cap, so this is not the whole space.'}
        </p>
      )}

      {suggestions?.suggestions?.length > 0 && (
        <div className="ss-grid">
          {suggestions.suggestions.map(s => (
            <SuggestionCard key={s.key} suggestion={s} onApply={() => onApplySuggestion(s)} />
          ))}
        </div>
      )}

      {suggestions && suggestions.suggestions?.length === 0 && (
        <p className="ss-empty">
          {suggestions.reason
            || 'No structure fits those bounds. Try allowing smaller squads, or widening the squad count under Assumptions.'}
        </p>
      )}

      <style jsx>{`
        .ss-run { display: flex; align-items: center; gap: 0.9rem; flex-wrap: wrap; }
        .ss-elapsed {
          font-size: 0.72rem; font-weight: 700; color: var(--text-secondary);
          line-height: 1.5; max-width: 46ch;
        }
        .ss-searched {
          font-size: 0.66rem; font-weight: 700; color: var(--text-secondary);
          margin: 0.9rem 0 0;
        }
        .ss-grid {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 1rem; margin-top: 1.2rem;
        }
        .ss-empty {
          font-size: 0.76rem; line-height: 1.55; color: var(--accent-amber);
          margin: 1.1rem 0 0; padding-left: 0.7rem; border-left: 2px solid var(--accent-amber);
        }
      `}</style>
    </div>
  );
}

/** One candidate structure, and what it would do. */
export function SuggestionCard({ suggestion: s, onApply }) {
  const allMet = s.squadsMeetingRequirement === s.squadCount;
  return (
    <div className="glass-card sc">
      <div className="sc-head">
        <div>
          <div className="sc-count">{s.squadCount} squads</div>
          <div className={`sc-axis${s.bandBy === 'capability' ? ' is-cap' : ''}`}>
            grouped by {s.bandBy === 'capability' ? 'capability' : 'age'}
          </div>
        </div>
        <div className="sc-score" title="Fit score out of 100">{s.total}<em>/100</em></div>
      </div>

      <div className={`sc-verdict${allMet ? ' is-good' : ''}`}>
        {s.squadsMeetingRequirement} of {s.squadCount} squads get their{' '}
        <Term k="fullTrainingWeek" plain>full training week</Term>
      </div>

      <table className="sc-table">
        <tbody>
          {s.bands.map(b => (
            <tr key={b.name} className={b.competitive ? '' : 'is-offramp'}>
              <td className="sc-ages">
                {b.minWaPoints !== null && b.minWaPoints !== undefined
                  ? <>{b.minWaPoints}–{b.maxWaPoints}<span className="sc-unit">pts</span></>
                  : <>{b.minAge}–{b.maxAge}</>}
              </td>
              <td className="sc-size">{b.targetSize}</td>
              <td className="sc-vol">
                {b.minWaPoints !== null && b.minWaPoints !== undefined && (
                  <span className="sc-unit"
                    title="Ages of the swimmers who currently fall in this capability band">
                    ages {b.minAge}–{b.maxAge} ·{' '}
                  </span>
                )}
                {b.sessions}/wk · {b.hours}h
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="sc-figures">
        <Figure term="swimmersCovered" label="Covered" value={s.swimmersServed}
          sub={s.unservedDemand > 0 ? `${s.unservedDemand} not covered` : 'all placed'}
          bad={s.unservedDemand > 0} />
        <Figure term="waterUsed" label="Water used" value={`${s.utilisationPct}%`} />
      </div>

      <button type="button" className="btn-premium-intel sc-apply" onClick={onApply}>
        Use this structure
      </button>

      <style jsx>{`
        .sc { padding: 1.1rem 1.25rem; }
        .sc-head {
          display: flex; justify-content: space-between; align-items: baseline;
          margin-bottom: 0.7rem;
        }
        .sc-count { font-size: 0.95rem; font-weight: 900; }
        .sc-axis {
          font-size: 0.58rem; font-weight: 800; letter-spacing: 0.05em;
          color: var(--text-secondary); margin-top: 1px;
        }
        .sc-axis.is-cap { color: var(--accent-teal); }
        .sc-unit { font-size: 0.56rem; font-weight: 700; opacity: 0.75; margin-left: 2px; }
        .sc-score {
          font-size: 1.35rem; font-weight: 950; color: var(--accent-cyan); white-space: nowrap;
        }
        .sc-score em {
          font-style: normal; font-size: 0.6rem; font-weight: 800; opacity: 0.6; margin-left: 1px;
        }
        .sc-verdict {
          font-size: 0.68rem; font-weight: 800; line-height: 1.4;
          padding: 0.5rem 0.7rem; border-radius: 8px; margin-bottom: 0.8rem;
          background: rgba(var(--accent-amber-rgb), 0.1);
          border-left: 3px solid var(--accent-amber);
        }
        .sc-verdict.is-good {
          background: rgba(var(--accent-emerald-rgb), 0.1);
          border-left-color: var(--accent-emerald);
        }
        .sc-table { width: 100%; border-collapse: collapse; margin-bottom: 0.8rem; }
        .sc-table td {
          padding: 3px 0; font-size: 0.68rem; font-weight: 700;
          border-bottom: 1px solid var(--glass-border);
        }
        .sc-table tr.is-offramp { opacity: 0.6; }
        .sc-ages { width: 4.5rem; }
        .sc-size { width: 2.5rem; color: var(--text-secondary); }
        .sc-vol { text-align: right; color: var(--text-secondary); font-weight: 600; }
        .sc-figures { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.7rem; }
        .sc-apply { width: 100%; margin-top: 0.9rem; }
      `}</style>
    </div>
  );
}
