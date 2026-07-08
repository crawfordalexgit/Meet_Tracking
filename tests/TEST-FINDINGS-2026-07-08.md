# Test Suite Findings — 2026-07-08 (v1.0.178)

Automated suite built and run against the live app + DB. This report lists every confirmed defect, most severe first, each with the test that reproduces it.

## THE HEADLINE: why swimmers show no meets

**Symptom you reported:** after a sync, meets appear on /meets but a swimmer's page shows no meets.

**Confirmed mechanism (integrity suite + DB forensics):**
- `results` table contains **zero rows dated after December 2024** (823 rows total, all Sep–Dec 2024).
- **All 100 meets from the last 450 days have ZERO results rows.** The meets page reads the `meets` table directly (fine); the swimmer page derives its meet list from `results` (empty) — hence the discrepancy.
- 88 swimmers have current-season Swim England PBs but no results at all; 185 swimmers have PBs vs only 97 with results.
- It is NOT a matching bug today: replaying the scraper's exact parsing+matching against a live SE meet page (Kent County Champs 2025, meet 80965) matched **4/4 rows by member_id**.
- All 124 post-2025 meets carry SE meet codes, i.e. the scraper *did* run and *did* upsert meets — it just never persisted results.

**Most likely root cause:** the sync was run on the deployed (Vercel) app. `scrape-meets` takes 10–30 minutes (sequential splits fetches); a serverless function is killed long before that. The deployed code upserts the meets list early in the run, then dies mid results phase → meets without results, every time. A secondary contributor: `pages/api/scrape-meets.js:232` swallows results-insert errors silently (`if (!resultsError)` with no logging/progress message).

**Fix path (not yet applied):**
1. Run the meet scrape locally (or move it to a background job / chunked per-meet invocations that fit the serverless budget).
2. Surface results-insert errors in the SSE progress stream.
3. Re-run `npm run test:destructive` (after `npm run test:backup`) — its scrape-meets test asserts results actually land and swimmer pages show them.

## Security findings

| # | Severity | Finding | Where | Reproducing test |
|---|---|---|---|---|
| S1 | High | `/api/download-report` has **no auth** — anyone can download report PDFs (contain minors' names/performance) | pages/api/download-report.js | tests/api/auth.spec.js (marked expected-fail) |
| S2 | Medium | `/api/sync-attendance` bypasses auth whenever Host contains "localhost" — any local process can trigger SCM syncs; risky if ever run behind a proxy | pages/api/sync-attendance.js:14 | documented in tests/api/auth.spec.js comment |

## Functional bugs

| # | Severity | Finding | Where | Reproducing test |
|---|---|---|---|---|
| F1 | High | Post-scrape call to `/api/reconcile-pbs` sends **no Authorization header** → always 401 → PB reconciliation never runs after a meet sync | pages/api/scrape-meets.js:270 | destructive suite comment; auth contract confirms 401 |
| F2 | High | Results-insert errors swallowed silently during meet scrape — sync reports success while writing nothing | pages/api/scrape-meets.js:232 | destructive scrape-meets test asserts results land |
| F3 | Medium | Swimmer page meets query selects only `id, name, date` but the code reads `meet.level` / `meet.type` (lines 646–659) → every meet counted as L3/open; open-vs-internal meet counts wrong. Also capped at 500 meets (currently safe: 210 meets — integrity test guards the window) | pages/swimmer/[id].js:460 | tests/integrity (window guard) |
| F4 | Medium | `generateNameAliases` broken for "First Last" names: lastName fallback grabs the whole name → alias "Will Day" becomes "Will William Day"; alias matching never works for SCM-format names | lib/analytics-utils.js:53-54 | tests/unit/analytics-utils.spec.js (expected-fail) |
| F5 | ~~Withdrawn~~ | Duplicate meets by (name, date) are NORMAL per Alex — multi-round galas (Kent Junior League, Arena League) share a name; meet_code is the true identity. Integrity test downgraded to informational | — | tests/integrity (informational) |
| F6 | Low | `sync-scm` deletes swimmers absent from SCM; `results.swimmer_id ON DELETE CASCADE` silently destroys their history. Not the current cause of the missing-meets bug, but a standing data-loss risk | pages/api/sync-scm.js cleanup + schema.sql:122 | destructive sync-scm test guards UUID stability |
| F7 | Low | `schema.sql` drifted from live DB (live `issue_upvotes` has no `id` column; `swimmers.created_at` absent; live `results` HAS `date`/`splits` columns that schema.sql lacks) | schema.sql | discovered via test runs |
| F8 | Medium | No client-side auth guard on `/dashboard` (and likely other pages): anonymous visitors see the full dashboard shell instead of being redirected to /login. Data is blocked by RLS, but the UI should bounce | pages/dashboard.js | tests/e2e/pages-smoke.spec.js (expected-fail) |

## Suite results (safe projects)

- **unit**: 62 pass, 1 expected-fail (F4).
- **api**: 88/89 pass when run cleanly; the 1 failure is S2 (sync-attendance anonymous 200). Note: the initial 27-min combined run showed 33 flaky failures from resource contention — run projects separately or accept longer timeouts.
- **integrity**: 7 pass, 3 fail — the 3 failures are the live data defects above (100 empty meets, 88 PB-only swimmers, 12 duplicate meets). They will pass once a full scrape lands results and duplicates are consolidated.
- **e2e**: 22+ pass after selector fixes. The swimmer-meets reproduction test **auto-skips with "no results in last 450 days — run a meet sync first"** — third independent confirmation of the headline root cause. Dashboard shows **"MEET ATTENDANCE 0%"** and renders no squad intelligence cards for the same reason. One expected-fail: F8 (no login redirect).
- **destructive**: NOT run — requires you to run `npm run test:backup` first (Claude is blocked from dumping swimmer PII to disk).

## Note on side effects during testing

The anonymous-401 probe of `/api/sync-attendance` unexpectedly **started two real SCM attendance syncs** (because of the S2 localhost bypass). These are the same idempotent upserts as clicking "Sync Attendance" in Settings — no data loss, but you may see fresh `training_attendance` timestamps. The test suite has been amended so this cannot happen again.

## How to run

See tests/README.md. Quick reference: `npm run test` (safe), `npm run test:backup` then `npm run test:destructive` (syncs).
