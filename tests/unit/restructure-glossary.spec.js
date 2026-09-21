import { test, expect } from '@playwright/test';
import {
  TERMS, GLOSSARY, label, definition,
  LTAD_VERDICT_LABELS, FLAG_LABELS, SLOT_SOURCE_LABELS
} from '../../lib/restructure-glossary.js';
import { COMPARISON_ROWS, HEADLINE_ROW_KEYS, ltadScore } from '../../lib/restructure-solver.js';

const entries = () => Object.entries(TERMS);

/** Whole-word, case-insensitive: "place" must not match "replace". */
function mentions(text, term) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(text);
}

test.describe('the planner vocabulary', () => {
  test('every entry is complete enough to render', () => {
    entries().forEach(([key, e]) => {
      expect(e.term, `${key} has no term`).toBeTruthy();
      expect(e.short, `${key} has no definition`).toBeTruthy();
      expect(Array.isArray(e.alsoKnownAs), `${key}.alsoKnownAs`).toBe(true);
      expect(Array.isArray(e.uses), `${key}.uses`).toBe(true);
    });
  });

  test('a definition fits in a hover card', () => {
    // Anything longer stops being a definition and starts being an essay, which
    // is exactly what a committee member will not read.
    entries().forEach(([key, e]) => {
      expect(e.short.length, `${key} definition is ${e.short.length} chars`).toBeLessThanOrEqual(200);
    });
  });

  test('no two concepts share a name', () => {
    const seen = new Map();
    entries().forEach(([key, e]) => {
      const norm = e.term.toLowerCase();
      expect(seen.has(norm), `"${e.term}" is the name of both ${seen.get(norm)} and ${key}`).toBe(false);
      seen.set(norm, key);
    });
  });

  test('retired names stay retired', () => {
    // The whole point of the file. "Utilisation" named two different numbers
    // before this existed; it must not come back as the canonical name of
    // anything.
    const canonical = new Set(entries().map(([, e]) => e.term.toLowerCase()));
    entries().forEach(([key, e]) => {
      e.alsoKnownAs.forEach(old => {
        expect(canonical.has(old.toLowerCase()),
          `${key} retires "${old}", but that is still some concept's canonical name`).toBe(false);
      });
    });
  });

  test('a retired name belongs to only one concept', () => {
    const claimed = new Map();
    entries().forEach(([key, e]) => {
      e.alsoKnownAs.forEach(old => {
        const norm = old.toLowerCase();
        expect(claimed.has(norm),
          `"${old}" is claimed by both ${claimed.get(norm)} and ${key}`).toBe(false);
        claimed.set(norm, key);
      });
    });
  });

  test('no definition explains jargon with more jargon', () => {
    // A definition may lean on another term, but it has to say so — which forces
    // whoever adds one to notice they are doing it, and lets the hover card link
    // onward rather than leaving the reader stuck.
    entries().forEach(([key, e]) => {
      entries().forEach(([otherKey, other]) => {
        if (otherKey === key) return;
        if (!mentions(e.short, other.term)) return;
        expect(e.uses,
          `${key}'s definition uses the term "${other.term}" without declaring uses: ['${otherKey}']`
        ).toContain(otherKey);
      });
    });
  });

  test('everything declared in uses is actually used', () => {
    entries().forEach(([key, e]) => {
      e.uses.forEach(used => {
        expect(TERMS[used], `${key} declares uses: ['${used}'], which is not a term`).toBeTruthy();
        expect(mentions(e.short, TERMS[used].term),
          `${key} declares it uses "${TERMS[used].term}" but its definition does not`).toBe(true);
      });
    });
  });

  test('the display order covers every term exactly once', () => {
    const listed = GLOSSARY.flatMap(g => g.keys);
    expect(new Set(listed).size, 'a key appears in two groups').toBe(listed.length);
    expect(listed.slice().sort()).toEqual(Object.keys(TERMS).sort());
  });

  test('every comparison row is anchored to a glossary term', () => {
    // The comparison table is where a committee member meets the most figures at
    // once, so it is where the vocabulary would split first. A row may word its
    // label naturally, but it has to name the concept it belongs to.
    COMPARISON_ROWS.forEach(row => {
      expect(row.term, `comparison row "${row.key}" has no term`).toBeTruthy();
      expect(TERMS[row.term],
        `comparison row "${row.key}" points at "${row.term}", which is not a glossary term`).toBeTruthy();
      expect(row.label, `comparison row "${row.key}" has no label`).toBeTruthy();
    });
  });

  test('the headline rows a committee reads first all exist', () => {
    HEADLINE_ROW_KEYS.forEach(key => {
      const row = COMPARISON_ROWS.find(r => r.key === key);
      expect(row, `headline row "${key}" is not in COMPARISON_ROWS`).toBeTruthy();
      // "Higher is better" has to be decided for the four that get a green mark.
      expect(row.higherIsBetter, `headline row "${key}" has no direction`).toBe(true);
    });
  });

  test('no comparison row label reuses a retired name', () => {
    const retired = new Map();
    entries().forEach(([key, e]) => e.alsoKnownAs.forEach(old => retired.set(old.toLowerCase(), key)));
    COMPARISON_ROWS.forEach(row => {
      retired.forEach((owner, old) => {
        expect(mentions(row.label, old),
          `row "${row.key}" is labelled "${row.label}", reviving the retired name "${old}"`).toBe(false);
      });
    });
  });

  test('every verdict the solver can return has a plain-English label', () => {
    const band = { min: 8, max: 12, stageCount: 1, stageNames: ['Train to Train'] };
    const produced = new Set([
      ltadScore(10, band).verdict,
      ltadScore(4, band).verdict,
      ltadScore(20, band).verdict,
      ltadScore(10, { min: 0, max: 0, stageCount: 0, stageNames: [] }).verdict
    ]);
    produced.forEach(v => {
      expect(LTAD_VERDICT_LABELS[v], `no label for the verdict "${v}"`).toBeTruthy();
    });
    expect(Object.keys(LTAD_VERDICT_LABELS).sort())
      .toEqual(['OPTIMAL', 'OVERLOAD', 'UNDERLOAD', 'UNKNOWN']);
  });

  test('every flag a timetable block can carry has a legend', () => {
    // These chips shipped with no legend anywhere in the app.
    expect(Object.keys(FLAG_LABELS).sort()).toEqual(['CURFEW', 'NO_COACH', 'UNDER_CAPACITY']);
    Object.entries(FLAG_LABELS).forEach(([key, f]) => {
      expect(f.chip, `${key} has no chip text`).toBeTruthy();
      expect(f.meaning, `${key} has no meaning`).toBeTruthy();
    });
  });

  test('slot sources read as words, not as shouted constants', () => {
    expect(SLOT_SOURCE_LABELS.existing.term).toBe(TERMS.alreadyBooked.term);
    expect(SLOT_SOURCE_LABELS.candidate.term).toBe(TERMS.beingConsidered.term);
  });

  test('label and definition refuse an unknown key rather than rendering a blank', () => {
    expect(label('laneHour')).toBe('Lane-hour');
    expect(definition('laneHour').short).toContain('One lane of a pool');
    expect(() => label('nosuchterm')).toThrow(/no term/);
    expect(() => definition('nosuchterm')).toThrow(/no term/);
  });
});
