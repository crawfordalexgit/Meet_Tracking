import Term from './Term';

/**
 * The three ways this planner shows a number.
 *
 * All three were copy-pasted into six files, in three slightly different sizes,
 * with the label styling written out inline each time. Same job, so: one file.
 *
 * Every one takes an optional `term` — a key from lib/restructure-glossary.js.
 * Passing it puts the definition one tap away from the figure itself, which is
 * where a committee member needs it, rather than in a glossary they have to go
 * and find.
 */

function Label({ term, children, className }) {
  return (
    <div className={className}>
      {term ? <Term k={term}>{children}</Term> : children}
    </div>
  );
}

/** Big, in the tile grid at the top of a tab. */
export function Kpi({ label, value, sub, term, accent }) {
  return (
    <div className="kpi-tile fig-kpi">
      <Label term={term} className="kpi-label">{label}</Label>
      <div className="kpi-value" style={accent ? { color: accent } : undefined}>{value}</div>
      {sub && <div className="fig-sub">{sub}</div>}

      <style jsx>{`
        /* The global .kpi-tile is a horizontal flex row, which puts a wrapping
           three-line label beside its number and reads as two unrelated things.
           styled-jsx's scoping attribute wins on specificity, so the tile stacks
           without touching the global class other pages rely on. */
        .fig-kpi {
          flex-direction: column;
          align-items: flex-start;
          gap: 0.3rem;
        }
        .fig-sub {
          font-size: 0.62rem;
          font-weight: 700;
          color: var(--text-secondary);
          line-height: 1.35;
        }
      `}</style>
    </div>
  );
}

/** Small, inside a card that already has a heading. */
export function Figure({ label, value, sub, term, bad, warn }) {
  return (
    <div>
      <Label term={term} className="fig-label">{label}</Label>
      <div className="fig-value">{value}</div>
      {sub && <div className="fig-sub">{sub}</div>}

      <style jsx>{`
        .fig-label {
          font-size: 0.54rem;
          font-weight: 900;
          letter-spacing: 0.09em;
          text-transform: uppercase;
          color: var(--text-secondary);
        }
        .fig-value {
          font-size: 1.05rem;
          font-weight: 900;
          color: ${bad ? 'var(--accent-rose)' : warn ? 'var(--accent-amber)' : 'inherit'};
        }
        .fig-sub {
          font-size: 0.6rem;
          font-weight: 700;
          color: var(--text-secondary);
          margin-top: 0.15rem;
          line-height: 1.35;
        }
      `}</style>
    </div>
  );
}

/** Its own card, in a row of summary figures above an editor. */
export function Stat({ label, value, sub, term, accent }) {
  return (
    <div className="glass-card stat">
      <Label term={term} className="stat-label">{label}</Label>
      <div className="stat-value" style={accent ? { color: accent } : undefined}>{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}

      <style jsx>{`
        .stat { padding: 0.9rem 1.1rem; }
        .stat-label {
          font-size: 0.6rem;
          font-weight: 900;
          letter-spacing: 0.11em;
          text-transform: uppercase;
          color: var(--text-secondary);
          margin-bottom: 0.3rem;
        }
        .stat-value { font-size: 1.6rem; font-weight: 900; line-height: 1.1; }
        .stat-sub {
          font-size: 0.62rem;
          font-weight: 700;
          color: var(--text-secondary);
          margin-top: 0.25rem;
          line-height: 1.35;
        }
      `}</style>
    </div>
  );
}
