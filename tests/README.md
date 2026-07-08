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

These tests FAIL until the underlying bug is fixed — they are the bug report:

1. `tests/api/auth.spec.js` → `GET /api/download-report` — route has **no auth**; anyone can download report PDFs.
2. `tests/unit/analytics-utils.spec.js` → `generateNameAliases` — for "First Last" names the lastName fallback grabs the whole name (lib/analytics-utils.js:53), so alias matching never works.
3. `tests/integrity/db-invariants.spec.js` — whichever invariants are currently violated in the live DB (e.g. swimmers with PBs but zero results = the missing-meets symptom).
4. `pages/api/scrape-meets.js:270` — post-scrape `reconcile-pbs` call sends no auth header → always 401. Covered by the destructive suite's reconcile test comment.
5. `pages/swimmer/[id].js:460` — meets query omits `level`/`type` columns, so open-vs-internal meet counts are wrong; `.limit(500)` window checked by integrity test.
