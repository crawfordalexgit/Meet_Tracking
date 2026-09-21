/**
 * How hard one session is worked, shown one way.
 *
 * Five components each divided attendance by roster themselves and labelled the
 * result differently — "occupancy", "% of capacity", "turn-up", "actual",
 * "allocated". Two of the five rounded differently, so the same session could
 * read 46% on one tab and 45% on another.
 *
 * The baseline already computes every one of these figures server-side, where
 * they are unit-tested. So the rule here, and the reason this file exists: this
 * component renders the fields it is handed and never does arithmetic.
 *
 * Booked and attending are both shown on purpose. At this club roughly twice as
 * many swimmers are booked into a session as turn up to it, so a session can be
 * full on paper and half empty in the water, and which of the two you were
 * looking at changes the decision.
 */

/** Empty, busy, or somewhere between — for colour only, never for a number. */
function heat(pct) {
  if (pct === null || pct === undefined) return '';
  if (pct >= 70) return ' is-full';
  if (pct >= 40) return ' is-mid';
  return ' is-empty';
}

export default function SessionUse({ use, layout = 'stacked' }) {
  if (!use || !use.places) {
    // Inline, not styled-jsx: this branch returns before the <style> block, so a
    // class here would never be given any rules.
    return <span style={{ color: 'var(--text-secondary)', opacity: 0.5 }}>—</span>;
  }

  const { places, booked, bookedPctOfPlaces, averageAttending, attendingPctOfPlaces, registers } = use;

  // A session nobody has ever taken a register for has no attendance figure.
  // Showing 0% would rank it alongside water that genuinely stands empty, which
  // is a different — and much more actionable — thing.
  const noRegister = attendingPctOfPlaces === null || attendingPctOfPlaces === undefined;

  const title = noRegister
    ? `${booked} of ${places} places booked. No register has been taken for this session, so how many attend is unknown.`
    : `${booked} of ${places} places booked, ${averageAttending} attending on average across ${registers} register${registers === 1 ? '' : 's'}.`;

  return (
    <span className={`su su-${layout}${heat(attendingPctOfPlaces)}`} title={title}>
      <strong>{noRegister ? 'no register' : `${attendingPctOfPlaces}%`}</strong>
      <em>{bookedPctOfPlaces === null || bookedPctOfPlaces === undefined
        ? `${booked} booked`
        : `${bookedPctOfPlaces}% booked`}</em>

      <style jsx>{`
        .su { display: flex; line-height: 1.25; }
        .su-stacked { flex-direction: column; }
        .su-inline { flex-direction: row; align-items: baseline; gap: 6px; }
        .su strong { font-size: 0.8rem; font-weight: 900; }
        .su.is-full strong { color: var(--accent-emerald); }
        .su.is-mid strong { color: var(--accent-amber); }
        .su.is-empty strong { color: var(--accent-rose); }
        .su em {
          font-style: normal;
          font-size: 0.58rem;
          font-weight: 700;
          color: var(--text-secondary);
          white-space: nowrap;
        }
      `}</style>
    </span>
  );
}
