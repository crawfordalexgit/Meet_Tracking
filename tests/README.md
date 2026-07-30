# Test Suite

Full-coverage automated tests: Playwright drives both the browser (headless — it never touches your mouse) and direct API calls, against the live Supabase DB.

## One-time setup

```bash
npm install                     # @playwright/test is a devDependency
npx playwright install chromium
npm run test:setup-users        # creates test-admin / test-coach users (idempotent)
```

Requires `.env.local` (same one `next dev` uses) plus the four `TEST_*` variables it now contains.

## Everyday commands

| Command | What it does | DB risk |
|---|---|---|
| `npm run test` | unit + API + integrity + e2e (the "safe" suite) | tiny fixture writes, self-cleaning |
| `npm run test:unit` | pure lib function tests | none |
| `npm run test:api` | all 39 API routes: 401/405/403 contracts + happy paths | tiny fixture writes, self-cleaning |
| `npm run test:integrity` | cross-table DB invariants — **diagnoses the "swimmer shows no meets" class of bug** | read-only |
| `npm run test:e2e` | every page in a real browser, incl. the swimmer-meets reproduction | read-only |
| `npm run test:backup` | dump all mutable tables to `tests/.backups/` | read-only |
| `npm run test:destructive` | live sync tests (SCM, Swim England scrape, PBs) then re-runs integrity | **mutates DB** — refuses to run without a <24h backup |
| `npm run test:restore` | restore newest backup (or pass a file path) | **overwrites DB** |

Env switches:
- `RUN_HEAVY=1` — also test Gemini AI + PDF/Word export routes (costs quota, slow).
- `RUN_FULL_SYNC=1` — inside destructive run, also run full rankings/attendance/membership syncs (very slow).

The dev server starts automatically (`webServer` in playwright.config.js); if one is already running on :3000 it is reused.

## Known expected failures (encoded in the suite on purpose)

These tests FAIL until the underlying bug is fixed — they are the bug report.

**Refreshed 2026-07-28.** Four of the five entries previously listed here were
already fixed and had been left in place, which made the list read as five open
bugs when only one was real. Current state:

1. `tests/integrity/db-invariants.spec.js` — **OPEN.** Whichever invariants are
   currently violated in the live DB. The standing one is F12: swimmers with
   Swim England PBs but zero results, because the meet scraper matches on exact
   `member_id`/name and never calls `generateNameAliases`.

Fixed and removed from this list:

- `GET /api/download-report` auth — the route now requires auth.
- `generateNameAliases` for "First Last" names — surname extraction handles both
  orders (pinned by `tests/unit/analytics-utils.spec.js`).
- `scrape-meets` → `reconcile-pbs` 401 — the PDF upload path now calls
  `reconcilePbs()` in-process instead of making an unauthenticated self-request
  (`pages/api/parse-pdf.js`).
- `pages/swimmer/[id].js` meets query columns — `level`/`type` are selected.

Full triage of everything found in the 2026-07-27 pre-launch audit, including
what is fixed and what is still open, is in `BUG-REGISTER-2026-07-27.md`.

## Running the unit suite without a database

`npm run test:unit` uses `playwright.unit.config.js`, which has no `globalSetup`
and no `webServer`, so the pure unit specs run without `TEST_USER_EMAIL` or a
live database. The other projects still need both.
