import { useState, useRef, useId, useCallback } from 'react';
import { TERMS } from '../../lib/restructure-glossary';

/**
 * A word on the page, with its meaning one tap away.
 *
 * The planner is being handed to a club committee member who has never met
 * "lane-hour" or "swimmer-session". Explaining them in prose under every figure
 * would double the length of a page already described as too busy; leaving them
 * bare is what made it unreadable in the first place.
 *
 * Three decisions worth keeping:
 *
 * The trigger is a real <button>. A div with a hover handler cannot be reached
 * by Tab, is not announced, and — the part that actually matters here — does
 * nothing at all on a tablet, which is exactly what a committee member will open
 * this on. Click always toggles, so touch never depends on hover.
 *
 * The card is hidden in print rather than expanded. The printed pack carries a
 * full glossary appendix instead, so nothing is lost and the tables stay
 * readable.
 *
 * `plain` exists because a Term often sits inside another button — a goal
 * toggle, a squad pill. Nested buttons are invalid HTML and React warns, so
 * those callers render the label as text and let the surrounding control keep
 * the interaction.
 */
export default function Term({ k, children, plain = false, as: Tag = 'span' }) {
  const entry = TERMS[k];
  const [open, setOpen] = useState(false);
  const [flip, setFlip] = useState(false);
  const wrapRef = useRef(null);
  const id = useId();

  // Declared before any early return: `plain` and an unknown key must not change
  // how many hooks this component calls.
  const show = useCallback(() => {
    // Flip toward the middle when the card would run off the right-hand edge.
    // One measurement on open is enough; no positioning library for one tooltip.
    const box = wrapRef.current?.getBoundingClientRect();
    if (box) setFlip(box.left + 320 > window.innerWidth);
    setOpen(true);
  }, []);

  // A mistyped key would otherwise render an empty label and look like missing
  // data rather than a bug.
  if (!entry) {
    if (process.env.NODE_ENV !== 'production') {
      throw new Error(`<Term k="${k}"> — no such term in lib/restructure-glossary.js`);
    }
    return <Tag>{children || k}</Tag>;
  }

  const text = children || entry.term;
  if (plain) return <Tag>{text}</Tag>;

  return (
    <Tag className="term-wrap" ref={wrapRef}
      onMouseEnter={show} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        className="term"
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onFocus={show}
        onBlur={() => setOpen(false)}
        // Always opens, never toggles. A click is preceded by a hover on a
        // desktop, so a toggle would open the card on the way in and shut it
        // again on the click — which reads as the tooltip refusing to appear.
        // Closing is mouseleave, blur, or Escape, all of which fire on touch too.
        onClick={e => { e.stopPropagation(); show(); }}
        onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}
      >{text}</button>

      {open && (
        <span className={`term-card${flip ? ' is-flipped' : ''}`} id={id} role="tooltip">
          <strong>{entry.term}</strong>
          {entry.unit && <em>{entry.unit}</em>}
          <span className="term-short">{entry.short}</span>
          {entry.long && <span className="term-long">{entry.long}</span>}
        </span>
      )}

      <style jsx>{`
        .term-wrap { position: relative; display: inline; }
        .term {
          background: none;
          border: none;
          padding: 0;
          margin: 0;
          font: inherit;
          color: inherit;
          letter-spacing: inherit;
          text-transform: inherit;
          text-align: inherit;
          cursor: help;
          border-bottom: 1px dotted var(--accent-cyan);
        }
        .term:focus-visible { outline: 2px solid var(--accent-cyan); outline-offset: 2px; }
        .term-card {
          position: absolute;
          top: calc(100% + 7px);
          left: 0;
          z-index: 30;
          display: flex;
          flex-direction: column;
          gap: 5px;
          width: max-content;
          max-width: 34ch;
          padding: 0.7rem 0.85rem;
          border-radius: 10px;
          border: 1px solid var(--glass-border);
          background: var(--glass-bg);
          backdrop-filter: blur(18px);
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
          text-align: left;
          text-transform: none;
          letter-spacing: normal;
          white-space: normal;
          cursor: auto;
        }
        .term-card.is-flipped { left: auto; right: 0; }
        .term-card strong {
          font-size: 0.72rem;
          font-weight: 900;
          color: var(--accent-cyan);
          line-height: 1.2;
        }
        .term-card em {
          font-style: normal;
          font-size: 0.55rem;
          font-weight: 800;
          letter-spacing: 0.09em;
          text-transform: uppercase;
          color: var(--text-secondary);
        }
        .term-short {
          font-size: 0.74rem;
          font-weight: 600;
          line-height: 1.5;
          color: var(--text-primary, inherit);
        }
        .term-long {
          font-size: 0.68rem;
          font-weight: 500;
          line-height: 1.5;
          color: var(--text-secondary);
        }
        @media print {
          .term { border-bottom: none; cursor: auto; }
          .term-card { display: none !important; }
        }
      `}</style>
    </Tag>
  );
}
