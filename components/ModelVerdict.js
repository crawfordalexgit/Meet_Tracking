import Term from './restructure/Term';

/**
 * The plain-English answer to "is this better than what we do today?".
 *
 * Sits above every other figure on the page. Four numbers, each with today's
 * value beside it, then what would change and what it costs — in sentences.
 * Everything else the planner reports stays where it is, one tab away, for when
 * a figure needs interrogating rather than reading.
 *
 * The kicker says 'calculated, not written' on purpose. The page carries three
 * pieces of prose about one plan — this, an AI-drafted briefing, and the
 * assistant's answers — and a reader has every right to know which of them was
 * computed from the figures and which was generated from them.
 *
 * No state, no dirty badge, no glossary toggle. UNSAVED belongs in the scenario
 * bar, where the Save button is; the glossary belongs at the foot of the tab,
 * where it can also print.
 */
export default function ModelVerdict({ summary }) {
  if (!summary) return null;

  return (
    <div className="glass-card mv">
      <div className="mv-kicker">WHAT THIS PLAN WOULD MEAN — CALCULATED, NOT WRITTEN</div>

      <p className="mv-headline">{summary.headline}</p>

      <div className="mv-verdict">
        {summary.verdict.map(v => (
          <div key={v.label} className="mv-fig" title={v.note}>
            <div className="mv-fig-label">
              {v.term ? <Term k={v.term}>{v.label}</Term> : v.label}
            </div>
            <div className={`mv-fig-now${v.good ? ' is-good' : ' is-bad'}`}>{v.now}</div>
            <div className="mv-fig-today">today: {v.today}</div>
          </div>
        ))}
      </div>

      <div className="mv-cols">
        <div>
          <div className="mv-sub">WHAT WOULD CHANGE</div>
          <ul className="mv-list">
            {summary.changes.map((c, i) => (
              <li key={i} className={`is-${c.kind}`}>
                {c.squad && <strong>{c.squad}: </strong>}{c.text}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="mv-sub">WHAT IT COSTS</div>
          <ul className="mv-list">
            {summary.costs.map((c, i) => <li key={i} className="is-cost">{c}</li>)}
          </ul>
        </div>
      </div>

      <style jsx>{`
        .mv { padding: 1.4rem 1.6rem; margin-bottom: 1.5rem; }
        .mv-kicker {
          display: block; margin-bottom: 0.6rem;
          font-size: 0.6rem; font-weight: 900; letter-spacing: 0.14em;
          color: var(--text-secondary);
        }
        .mv-headline {
          font-size: 1.15rem; font-weight: 800; line-height: 1.45;
          margin: 0 0 1.2rem; max-width: 68ch;
        }
        .mv-verdict {
          display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 1rem; padding-bottom: 1.2rem; margin-bottom: 1.2rem;
          border-bottom: 1px solid var(--glass-border);
        }
        .mv-fig-label {
          font-size: 0.6rem; font-weight: 800; color: var(--text-secondary);
          line-height: 1.3; margin-bottom: 0.3rem;
        }
        .mv-fig-now { font-size: 1.45rem; font-weight: 950; line-height: 1.1; }
        .mv-fig-now.is-good { color: var(--accent-emerald); }
        .mv-fig-now.is-bad { color: var(--accent-amber); }
        .mv-fig-today {
          font-size: 0.62rem; font-weight: 600; color: var(--text-secondary); margin-top: 2px;
        }
        .mv-cols {
          display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.6rem;
        }
        .mv-sub {
          font-size: 0.58rem; font-weight: 900; letter-spacing: 0.12em;
          color: var(--text-secondary); margin-bottom: 0.6rem;
        }
        .mv-list {
          margin: 0; padding-left: 1.1rem; font-size: 0.82rem; line-height: 1.65;
        }
        .mv-list li { margin-bottom: 0.3rem; }
        .mv-list li.is-new::marker { color: var(--accent-emerald); }
        .mv-list li.is-gone::marker { color: var(--accent-rose); }
        .mv-list li.is-cost::marker { color: var(--accent-amber); }
      `}</style>
    </div>
  );
}
