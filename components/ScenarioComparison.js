import { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { diffScenarios, HEADLINE_ROW_KEYS } from '../lib/restructure-solver';
import { TERMS } from '../lib/restructure-glossary';
import Term from './restructure/Term';

// These are sub-scores out of 100, not the percentages of the same name. The
// chart legend used to say 'Utilisation' for subScores.utilisation while the
// table said 'Pool utilisation %' for utilisationPct — two different numbers,
// one word. Named from the glossary now, and marked as scores.
const SUB_SCORES = [
  { key: 'ltad', term: 'volumeFit', colour: 'var(--accent-cyan)' },
  { key: 'utilisation', term: 'waterUsed', colour: 'var(--accent-teal)' },
  { key: 'served', term: 'swimmersCovered', colour: 'var(--accent-emerald)' },
  { key: 'coachCover', term: 'coachHour', label: 'Coaching covered', colour: 'var(--accent-indigo)' },
  { key: 'timetableQuality', term: 'timetableQuality', colour: 'var(--accent-violet)' },
  { key: 'continuity', term: 'sessionsThatStayPut', colour: 'var(--accent-amber)' }
].map(s => ({ ...s, label: s.label || TERMS[s.term].term }));

/**
 * Side-by-side comparison of solved scenarios.
 *
 * Every sub-score is shown separately rather than rolled into one number. A
 * single figure invites an argument about the weighting; six figures invite a
 * decision about the trade-off.
 */
export default function ScenarioComparison({
  entries, selectedIds, onToggle, available, printAll = false
}) {
  const diff = useMemo(() => diffScenarios(entries), [entries]);

  // The four measures the verdict at the top of the page has been showing all
  // session, so comparing plans does not mean learning a second vocabulary.
  // Everything else is real and stays, one click away and open in print.
  const headline = useMemo(
    () => HEADLINE_ROW_KEYS.map(k => diff.rows.find(r => r.key === k)).filter(Boolean),
    [diff]);
  const rest = useMemo(
    () => diff.rows.filter(r => !HEADLINE_ROW_KEYS.includes(r.key)),
    [diff]);

  const renderRow = row => (
    <tr key={row.key}>
      <td style={{ fontWeight: 700 }}>
        {row.term ? <Term k={row.term}>{row.label}</Term> : row.label}
      </td>
      {row.values.map((v, i) => (
        <td key={i}
          style={{
            fontWeight: i === row.bestIndex ? 900 : 600,
            color: i === row.bestIndex ? 'var(--accent-emerald)' : 'inherit'
          }}>
          {v === null || v === undefined ? '—' : v}
        </td>
      ))}
    </tr>
  );

  const scoreData = useMemo(() => SUB_SCORES.map(s => {
    const row = { name: s.label };
    entries.forEach(e => {
      const v = e.metrics?.subScores?.[s.key];
      row[e.name] = v === undefined ? null : v;
    });
    return row;
  }), [entries]);


  return (
    <div>
      <div className="glass-card cmp-picker">
        <div className="cmp-sub">Plans to compare</div>
        <div className="cmp-pills">
          {available.map(s => (
            <button
              key={s.id} type="button"
              className={`cmp-pill${selectedIds.includes(s.id) ? ' is-on' : ''}`}
              onClick={() => onToggle(s.id)}
              title={s.summary ? `Score ${s.summary.total}` : 'Not solved yet — open and solve it once'}
            >
              {s.name}
              {!s.summary && <span className="cmp-unsolved">unsolved</span>}
            </button>
          ))}
        </div>
        {available.length === 0 && (
          <p className="cmp-empty">
            No saved scenarios yet. Save the one you are working on, then build a second
            to compare it against.
          </p>
        )}
        {entries.length === 1 && (
          <p className="cmp-empty">
            Pick at least one more scenario. A single column tells you what a plan does;
            two tell you whether it is worth doing.
          </p>
        )}
      </div>

      {entries.length >= 1 && (
        <>
          <div className="glass-card cmp-table-wrap">
            <div className="cmp-sub">The four that decide it</div>
            <table className="stats-table-glass">
              <thead>
                <tr>
                  <th style={{ minWidth: '220px' }}>Measure</th>
                  {diff.names.map(n => <th key={n}>{n}</th>)}
                </tr>
              </thead>
              <tbody>{headline.map(row => renderRow(row))}</tbody>
            </table>
            <p className="cmp-foot">
              The same four figures as the verdict at the top of every plan. Green marks
              the better one on that row.
            </p>
          </div>

          <details className="glass-card cmp-more" open={printAll}>
            <summary>Every other measure</summary>
            <div className="cmp-more-body">
              <table className="stats-table-glass">
                <thead>
                  <tr>
                    <th style={{ minWidth: '220px' }}>Measure</th>
                    {diff.names.map(n => <th key={n}>{n}</th>)}
                  </tr>
                </thead>
                <tbody>{rest.map(row => renderRow(row))}</tbody>
              </table>
              <p className="cmp-foot">
                Rows with no direction — the number of squads, for one — are left
                unmarked, because more is not automatically better.
              </p>

              {entries.length >= 2 && (
                <div className="cmp-chart">
                  <div className="cmp-sub">How each plan scores against your goals (0–100)</div>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={scoreData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      {entries.map((e, i) => (
                        <Bar key={e.name} dataKey={e.name} fill={barColour(i)} radius={[3, 3, 0, 0]} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </details>

          {diff.squadDeltas.length > 0 && entries.length >= 2 && (
            <div className="glass-card cmp-table-wrap">
              <div className="cmp-sub">
                Squad by squad — {diff.names[0]} against {diff.names[1]}
              </div>
              <table className="stats-table-glass">
                <thead>
                  <tr>
                    <th>Squad</th><th>Size</th><th>Sessions</th>
                    <th>Hours/wk</th><th>Covered</th><th>Volume fit</th>
                  </tr>
                </thead>
                <tbody>
                  {diff.squadDeltas.map(d => (
                    <tr key={d.name}>
                      <td style={{ fontWeight: 800 }}>
                        {d.name}
                        {!d.inA && <span className="cmp-tag cmp-tag-new">NEW</span>}
                        {!d.inB && <span className="cmp-tag cmp-tag-gone">GONE</span>}
                      </td>
                      <td>{pair(d.sizeA, d.sizeB)}</td>
                      <td>{pair(d.sessionsA, d.sessionsB)}</td>
                      <td>{pair(d.hoursA, d.hoursB)}</td>
                      <td>{pair(d.servedA, d.servedB)}</td>
                      <td>{pair(d.ltadA, d.ltadB)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <style jsx>{`
        .cmp-more { padding: 1.1rem 1.4rem; margin-top: 1.5rem; }
        .cmp-more > summary {
          cursor: pointer; font-size: 0.8rem; font-weight: 900; list-style: none;
        }
        .cmp-more > summary::-webkit-details-marker { display: none; }
        .cmp-more > summary::before { content: '▸ '; color: var(--accent-cyan); }
        .cmp-more[open] > summary::before { content: '▾ '; }
        .cmp-more-body { margin-top: 1.1rem; overflow-x: auto; }
        .cmp-picker { padding: 1.15rem 1.4rem; margin-bottom: 1.5rem; }
        .cmp-sub {
          font-size: 0.6rem; font-weight: 900; letter-spacing: 0.12em;
          color: var(--text-secondary); margin-bottom: 0.7rem;
        }
        .cmp-pills { display: flex; flex-wrap: wrap; gap: 6px; }
        .cmp-pill {
          padding: 6px 12px; border-radius: 8px; font-size: 0.74rem; font-weight: 800;
          border: 1px solid var(--glass-border); background: transparent;
          color: var(--text-secondary); cursor: pointer;
          display: inline-flex; align-items: center; gap: 6px;
        }
        .cmp-pill.is-on { background: var(--accent-cyan); color: #000; border-color: var(--accent-cyan); }
        .cmp-unsolved {
          font-size: 0.52rem; font-weight: 900; letter-spacing: 0.05em;
          padding: 1px 4px; border-radius: 3px;
          background: var(--accent-amber); color: #000;
        }
        .cmp-empty {
          font-size: 0.75rem; line-height: 1.55; color: var(--text-secondary);
          margin: 0.9rem 0 0; padding-left: 0.65rem; border-left: 2px solid var(--glass-border);
        }
        .cmp-table-wrap { padding: 1.15rem 1.4rem; margin-bottom: 1.5rem; overflow-x: auto; }
        .cmp-foot {
          font-size: 0.66rem; color: var(--text-secondary); line-height: 1.5;
          margin: 0.9rem 0 0;
        }
        .cmp-charts {
          display: grid; grid-template-columns: repeat(auto-fit, minmax(380px, 1fr));
          gap: 1.25rem; margin-bottom: 1.5rem;
        }
        .cmp-chart { padding: 1.15rem 1.3rem; }
        .cmp-tag {
          margin-left: 6px; padding: 1px 5px; border-radius: 4px;
          font-size: 0.52rem; font-weight: 900; letter-spacing: 0.05em;
        }
        .cmp-tag-new { background: var(--accent-emerald); color: #000; }
        .cmp-tag-gone { background: var(--accent-rose); color: #fff; }
      `}</style>
    </div>
  );
}

function pair(a, b) {
  if (a === null && b === null) return '—';
  if (a === null) return `— → ${b}`;
  if (b === null) return `${a} → —`;
  if (a === b) return a;
  return `${a} → ${b}`;
}

function barColour(i) {
  const palette = [
    'var(--accent-cyan)', 'var(--accent-amber)', 'var(--accent-emerald)',
    'var(--accent-violet)', 'var(--accent-rose)'
  ];
  return palette[i % palette.length];
}
