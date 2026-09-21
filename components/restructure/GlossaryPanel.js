import { GLOSSARY, TERMS } from '../../lib/restructure-glossary';

/**
 * Every term on the planner, in one place.
 *
 * Two renderings of one list, exported from one file so the screen and the
 * printed pack cannot drift: a disclosure at the foot of the Plan tab for
 * someone reading on screen, and an appendix for the PDF, where the hover cards
 * do not exist and a committee member has nothing else to look the words up in.
 *
 * This replaces a glossary that lived collapsed behind a toggle inside the
 * verdict card, covered five of the twenty-odd terms in use, and never printed.
 */

function Entries({ compact }) {
  return GLOSSARY.map(group => (
    <div key={group.group} className="gl-group">
      <h4 className="gl-group-title">{group.group}</h4>
      <dl className="gl-list">
        {group.keys.map(key => {
          const e = TERMS[key];
          return (
            <div key={key} className="gl-item">
              <dt>
                {e.term}
                {e.unit && <span className="gl-unit">{e.unit}</span>}
              </dt>
              <dd>
                {e.short}
                {!compact && e.long && <span className="gl-long">{e.long}</span>}
              </dd>
            </div>
          );
        })}
      </dl>

      <style jsx>{`
        .gl-group { margin-bottom: 1.5rem; break-inside: avoid; }
        .gl-group-title {
          font-size: 0.58rem;
          font-weight: 900;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--accent-cyan);
          margin: 0 0 0.6rem;
        }
        .gl-list {
          margin: 0;
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 0.75rem 1.6rem;
        }
        .gl-item { break-inside: avoid; }
        dt {
          font-size: 0.76rem;
          font-weight: 900;
          margin-bottom: 2px;
          display: flex;
          align-items: baseline;
          gap: 0.5rem;
          flex-wrap: wrap;
        }
        .gl-unit {
          font-size: 0.52rem;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--text-secondary);
        }
        dd {
          margin: 0;
          font-size: 0.72rem;
          font-weight: 600;
          line-height: 1.5;
          color: var(--text-secondary);
        }
        .gl-long { display: block; margin-top: 3px; font-weight: 500; opacity: 0.85; }
      `}</style>
    </div>
  ));
}

/** On-screen: closed by default, because it is a reference, not a finding. */
export function GlossaryPanel() {
  return (
    <details className="glass-card gl">
      <summary>What these words mean</summary>
      <div className="gl-body">
        <p className="gl-intro">
          The planner counts water, swimmers and coaching in a few specific units.
          Each one is defined once here, and every figure on the page that uses one
          carries the same definition on a dotted underline you can tap.
        </p>
        <Entries />
      </div>

      <style jsx>{`
        .gl { padding: 1.1rem 1.4rem; }
        summary {
          cursor: pointer;
          font-size: 0.8rem;
          font-weight: 900;
          list-style: none;
        }
        summary::-webkit-details-marker { display: none; }
        summary::before { content: '▸ '; color: var(--accent-cyan); }
        details[open] summary::before { content: '▾ '; }
        .gl-body { margin-top: 1.1rem; }
        .gl-intro {
          font-size: 0.76rem;
          line-height: 1.6;
          color: var(--text-secondary);
          margin: 0 0 1.3rem;
          max-width: 74ch;
        }
      `}</style>
    </details>
  );
}

/**
 * In print: always open, on its own page, at the back of the pack.
 *
 * The hover cards cannot travel into a PDF, so without this the printed report
 * would carry every term and define none of them.
 */
export function GlossaryAppendix() {
  return (
    <section className="gl-appendix">
      <h2 className="section-title">What these words mean</h2>
      <p className="gl-intro">
        Every unit used in this report, defined once.
      </p>
      <Entries compact />

      <style jsx>{`
        .gl-appendix { page-break-before: always; margin-top: 2.5rem; }
        .gl-intro {
          font-size: 0.78rem;
          line-height: 1.6;
          color: var(--text-secondary);
          margin: 0 0 1.4rem;
        }
      `}</style>
    </section>
  );
}
