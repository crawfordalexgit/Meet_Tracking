import { GOALS } from '../../lib/restructure-goals';

/**
 * What this plan is for.
 *
 * Existed twice — once on the models screen, once inside the wizard — with
 * different markup and the same behaviour, so a change to one silently left the
 * other behind. One copy now, used wherever the question is asked.
 *
 * A chosen goal reports whether the finished plan actually delivered it, so
 * picking several and watching one fail is the point rather than a fault.
 */
export default function GoalPicker({ goals = [], goalResults = [], onToggleGoal }) {
  return (
    <div>

      <div className="gp-list">
        {GOALS.map(g => {
          const on = goals.includes(g.key);
          const result = goalResults.find(r => r.key === g.key);
          return (
            <button key={g.key} type="button"
              className={`gp-goal${on ? ' is-on' : ''}`}
              aria-pressed={on}
              onClick={() => onToggleGoal(g.key)}>
              <span className="gp-top">
                <span className="gp-label">{g.label}</span>
                {on && result && (
                  <span className={`gp-badge${result.met ? ' is-met' : ''}`}>
                    {result.met ? 'MET' : 'NOT MET'}
                  </span>
                )}
              </span>
              <span className="gp-blurb">{on && result ? result.detail : g.blurb}</span>
            </button>
          );
        })}
      </div>

      {goals.length === 0 && (
        <p className="gp-hint">
          Nothing chosen, so the search uses a balanced default and no proposal is
          judged against a purpose.
        </p>
      )}

      <style jsx>{`
        .gp-list {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 0.6rem;
        }
        .gp-goal {
          display: flex; flex-direction: column; gap: 4px; text-align: left;
          padding: 9px 12px; border-radius: 9px; cursor: pointer;
          border: 1px solid var(--glass-border); background: transparent; color: inherit;
        }
        .gp-goal.is-on {
          border-color: var(--accent-cyan); background: rgba(var(--accent-cyan-rgb), 0.1);
        }
        .gp-top {
          display: flex; justify-content: space-between; gap: 0.5rem; align-items: baseline;
        }
        .gp-label { font-size: 0.76rem; font-weight: 900; line-height: 1.2; }
        .gp-badge {
          font-size: 0.5rem; font-weight: 900; white-space: nowrap;
          padding: 1px 5px; border-radius: 4px;
          background: var(--accent-rose); color: #fff;
        }
        .gp-badge.is-met { background: var(--accent-emerald); color: #000; }
        .gp-blurb {
          font-size: 0.64rem; font-weight: 600; color: var(--text-secondary); line-height: 1.4;
        }
        .gp-hint {
          font-size: 0.7rem; color: var(--text-secondary); margin: 0.9rem 0 0; line-height: 1.5;
        }
      `}</style>
    </div>
  );
}
