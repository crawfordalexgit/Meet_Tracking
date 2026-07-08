// Source-level integrity checks on the dashboard: catch fake/placeholder
// numbers that render as if they were real data. These are deterministic
// (they read pages/dashboard.js) and pinpoint the offending lines.
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'pages', 'dashboard.js'), 'utf8');
const lines = SRC.split('\n');

test('no `|| <number>` fallbacks on qualifier displays (a real 0 must show as 0)', () => {
  // `{qualifiers?.county || 27}` renders 27 whenever the true value is 0,
  // because 0 is falsy — so an empty pipeline shows fake predictor numbers.
  const offenders = [];
  lines.forEach((line, i) => {
    // `|| 0` is a legitimate default; only a NON-ZERO fallback fakes data.
    if (/qualifiers\?\.\w+\s*\|\|\s*[1-9]\d*/.test(line)) {
      offenders.push(`L${i + 1}: ${line.trim().slice(0, 100)}`);
    }
  });
  expect(offenders, `falsy-fallback placeholders mask real zeros:\n${offenders.join('\n')}`).toHaveLength(0);
});

test('ranking cohort numbers (Regional Top 30 / County Top 10) are data-driven, not hardcoded', () => {
  // The value span sits a few lines above its label; assert it contains a JSX
  // expression `{...}` rather than a bare integer literal.
  const offenders = [];
  for (const label of ['Regional Top 30', 'County Top 10', 'National Top 40']) {
    const labelIdx = lines.findIndex(l => l.includes(label));
    if (labelIdx === -1) continue;
    // search the 12 lines above the label for the numeric value span
    const window = lines.slice(Math.max(0, labelIdx - 12), labelIdx).join('\n');
    const valueSpan = window.match(/<span[^>]*>\s*([^<]+?)\s*<\/span>/g) || [];
    const last = valueSpan[valueSpan.length - 1] || '';
    const inner = last.replace(/<[^>]+>/g, '').trim();
    // a hardcoded literal is just digits with no braces
    if (/^\d+$/.test(inner)) {
      offenders.push(`"${label}" renders hardcoded literal ${inner} (span: ${last.slice(0, 60)})`);
    }
  }
  expect(offenders, `hardcoded ranking numbers unrelated to DB:\n${offenders.join('\n')}`).toHaveLength(0);
});

test('WA-growth narrative is guarded for zero/negative velocity', () => {
  // The template always says "highly resilient ... strong +{velocity} pt".
  // With velocity 0 that renders "strong +0 pt acceleration" — nonsense.
  const badPhrases = [];
  if (/strong\s*<strong[^>]*>\+\{/.test(SRC.replace(/\s+/g, ' '))) {
    badPhrases.push('"strong +{velocity} pt" has no zero/negative guard (renders "strong +0 pt")');
  }
  if (/remains highly resilient/.test(SRC)) {
    badPhrases.push('"remains highly resilient" is hardcoded regardless of actual metrics');
  }
  expect(badPhrases, badPhrases.join('\n')).toHaveLength(0);
});
