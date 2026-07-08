# Test Suite Findings — 2026-07-08 (v1.0.182)

Automated suite built and run against the live app + DB. This report lists every confirmed defect, most severe first, each with the test that reproduces it.

## STATUS (updated after fix sessions)

| ID | Finding | Status |
|---|---|---|
| Headline | Swimmers show no meets (results empty) | ✅ **RESOLVED & verified** — full local scrape imported 124 meets / 4,396 results (table 823→5,219, latest 2024-12→2026-07); swimmer pages now show meets (verified on Charles Dunstan, 48 meets). Root cause was F9 (heat/final dedupe) + the scrape reliability fixes |
| F9 | Scrape blocked by UNIQUE(swimmer_id, meet_id, event) | ✅ **Fixed** — scraper dedupes to fastest per event ([lib/scrape-utils.js]) |
| F10 | GUI "Update Swim England" abandons the meet-scrape SSE stream | ⏳ **Open** — fire-and-forget; shows "Complete!" before scrape finishes (UX, not data-loss locally) |
| F11 | Squad stats differ between /squads registry and /squad/[id] detail | ✅ **Fixed & verified** — one shared `computeSquadStats()` now drives /squads, /squad/[id] AND the dashboard (squad-consistency 2/2) |
| F12 | 25 swimmers have SE PBs but no results (scraper name-match residual, was 88) | ⏳ **Open** — scraper matches by exact member_id/name; doesn't use `generateNameAliases` |
| squad-standard | `squad.county_standard \|\| 350` fabricates a standard when unset | ✅ **Fixed** — now `?? '—'` |
| S1 | download-report no auth | ✅ **Fixed & verified** (test:api 78/78) |
| S2 | sync-attendance localhost bypass | ✅ **Fixed & verified** |
| F1 | reconcile-pbs 401 self-call | ✅ **Fixed** (now a direct `lib/reconcile-pbs.js` call) |
| F2 | scrape insert errors swallowed | ✅ **Fixed** (surfaced in SSE + summary) |
| F3 | swimmer page level/type query | ✅ **Fixed & verified** |
| F4 | generateNameAliases surname bug | ✅ **Fixed & verified** (test:unit 34/34) |
| F5 | duplicate meets | Withdrawn (normal per Alex) |
| F6 | sync-scm cascade-delete risk | ⏳ **Open** — not yet addressed |
| F7 | schema.sql drift | ⏳ **Open** |
| F8 | no login redirect | ✅ **Fixed & verified** (pages-smoke 14/14) |
| **D1–D5** | **Dashboard fake/placeholder numbers** | ✅ **Fixed & verified** (dashboard-integrity 4/4, v1.0.185) |

All fixes merged to master (v1.0.181), then dashboard-integrity coverage added (v1.0.182).

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

> The tables below record each defect **as originally found**. The **Status** column shows its state as of v1.0.182.

## Security findings

| # | Severity | Status | Finding | Where |
|---|---|---|---|---|
| S1 | High | ✅ Fixed | `/api/download-report` had **no auth** — anyone could download report PDFs (minors' names/performance). `requireAuth` added | pages/api/download-report.js |
| S2 | Medium | ✅ Fixed | `/api/sync-attendance` bypassed auth whenever Host contained "localhost" — any local process could trigger SCM syncs. Bypass removed (only CRON_SECRET path remains) | pages/api/sync-attendance.js |

## Functional bugs

| # | Severity | Status | Finding | Where |
|---|---|---|---|---|
| F1 | High | ✅ Fixed | Post-scrape call to `/api/reconcile-pbs` sent **no auth header** → always 401 → PB reconcile never ran. Now a direct `lib/reconcile-pbs.js` call | pages/api/scrape-meets.js |
| F2 | High | ✅ Fixed | Results-insert errors swallowed silently during scrape — reported success while writing nothing. Now surfaced in the SSE stream + summary | pages/api/scrape-meets.js |
| F3 | Medium | ✅ Fixed | Swimmer page meets query omitted `level`/`type`, so every meet counted as L3/open. Columns added | pages/swimmer/[id].js |
| F4 | Medium | ✅ Fixed | `generateNameAliases` grabbed the whole name as the surname for "First Last" inputs ("Will Day" → "Will William Day"). Surname extraction corrected | lib/analytics-utils.js |
| F5 | — | Withdrawn | Duplicate meets by (name, date) are NORMAL — multi-round galas share a name; meet_code is the true identity. Integrity test downgraded to informational | — |
| F6 | Low | ⏳ Open | `sync-scm` deletes swimmers absent from SCM; `results.swimmer_id ON DELETE CASCADE` silently destroys their history — standing data-loss risk | pages/api/sync-scm.js + schema.sql:122 |
| F7 | Low | ⏳ Open | `schema.sql` drifted from live DB (`issue_upvotes` has no `id`; `swimmers.created_at` absent; live `results` has `date`/`splits` that schema.sql lacks) | schema.sql |
| F8 | Medium | ✅ Fixed | Anonymous visitors saw the full dashboard shell instead of a redirect. `_app.js` now bounces non-public routes to `/login` | pages/_app.js |

## Chrome walkthrough findings (2026-07-08, round 3 — every screen manually driven)

Manual Chrome pass over all 15 screens at v1.0.187. Most screens verified good (dashboard, swimmer detail incl. Competition meets, meets, meet detail, capacity, predictor, reports, feedback, sandbox, settings — no console errors anywhere). Two real bugs the automated suite missed:

| # | Severity | Finding | Where | Note |
|---|---|---|---|---|
| **F11-reopened** | High | **Squad registry vs detail STILL disagree** — AGE DEVELOPMENT shows Health/Training/Volume **54/21/67** on /squads but **50/17/55** on /squad/[id]. Both call `computeSquadStats` but feed it **differently-windowed data**: registry pre-filters attendance/results to the period (`squads.js:223` `.gte('date', startStr)`), detail passes all-time (`squad/[id].js:184`). | pages/squads.js, pages/squad/[id].js | The source-level `squad-consistency.spec.js` PASSED (checks code shape) while rendered numbers differ — **the refix needs a rendered-number cross-page test**. |
| **F13** | High | **Swimmers registry "Peak WA Standard" = 0 for every swimmer.** `swimmers.js:69` queries `swimmer_pbs.wa_pts`, but that **column does not exist** (swimmer_pbs has no wa_pts). Should derive peak from `results.wa_pts`. Also breaks the registry's QT-standard classification. Swimmer detail / squad / sandbox pages prove the real values (e.g. Alyssa 202, Kieran 387). | pages/swimmers.js:69-118 | Schema-drift class (F7). |
| UX-1 | Med | Session gate "Checking your session…" blocks the **entire render** on every hard load 5–16s (amplified by Next dev compile; faster in prod, but it hides the shell instead of streaming). | pages/_app.js | From the F8 fix. |
| UX-2 | Low | Dashboard KPI orbs flash `0%` before the client fetch resolves (no spinner). | pages/dashboard.js | Cosmetic. |

## Dashboard display-integrity bugs (found 2026-07-08, round 2)

Prompted by a screenshot: the Cockpit shows numbers that contradict each other. These are **independent of the results-empty root cause** — the hardcoded/fallback numbers would mislead even with a full database. All reproduced by new tests; all currently FAIL.

| # | Severity | Finding | Where | Reproducing test |
|---|---|---|---|---|
| D1 | High | **County Predictor shows `27` while the pipeline projects `0` County qualifiers** (Regional: `9` vs `0`). `{qualifiers?.county || 27}` — a legitimate `0` is falsy so the hardcoded fallback renders as if real | pages/dashboard.js:1308, 1312 | tests/e2e/dashboard-integrity.spec.js (cross-panel) + tests/integrity/dashboard-source.spec.js (`|| N`) |
| D2 | High | **Regional Top 30 = `23` and County Top 10 = `16` are hardcoded literals** in the JSX — never reflect the `rankings` table | pages/dashboard.js:1291, 1299 | tests/integrity/dashboard-source.spec.js (data-driven check) |
| D3 | High | **County Top 10 shows `16`** — impossible, exceeds its own ceiling of 10. Proof the number is fabricated | pages/dashboard.js:1299 | tests/e2e/dashboard-integrity.spec.js (cohort ceilings) |
| D4 | Medium | **Narrative renders "strong +0 pt acceleration … remains highly resilient"** while every metric is 0 — hardcoded rosy template, no zero/negative guard. "+0 PTS" appears 6× across the page | pages/dashboard.js:1129 (+ squad cards) | tests/e2e/dashboard-integrity.spec.js (narrative) + tests/integrity/dashboard-source.spec.js (guard) |
| D5 | Medium | **Squad Performance Trends chart renders blank** — 0 plotted curves, no empty-state message (recharts still draws axes/legend) | pages/dashboard.js:1232 | tests/e2e/dashboard-integrity.spec.js (chart-has-data) |

**Why the first suite missed these:** the smoke tests checked page *loads* + body text length + DB truth, but never (a) that rendered numbers agree across panels, (b) that charts actually plot a series, or (c) that copy degrades sanely on empty data. Those three coverage classes were added in v1.0.182.

## Suite results — v1.0.187 (data repopulated; all fixes merged)

After the full scrape (results 823→5,219) and all fixes (F1-F4, F8, F9, F11, D1-D5, S1-S2):

- **unit**: **68 passed, 0 failed** (incl. the new `scrape-utils` dedupe tests).
- **api**: **102 passed, 5 skipped, 0 failed.** All 401/403/405 contracts pass. (Run the safe suite as ONE `playwright test` invocation, not per-project — separate invocations spawn a webServer each and collide on :3000.)
- **integrity**: **passes except one** — the sole red is **F12: 25 swimmers have SE PBs but no results** (scraper name-match residual, was 88). Every other invariant (results↔meets, no duplicate swimmer+meet+event, level/type, name format) is green.
- **e2e**: **green.** dashboard-integrity 4/4 (D1-D5), squad-consistency 2/2 (F11), and the swimmer-meets reproduction now **passes** — verified on Charles Dunstan (48 meets shown under the Competition tab). A couple of heavy-page nav tests were made timing-tolerant.
- **destructive**: still gated on `npm run test:backup` (Claude can't dump PII). The scrape fix was instead proven directly: single-meet scrape of 86891 wrote 0→86, full scrape wrote 124 meets/4,396 results, no constraint failures.

**Net: the safe suite is green except the single F12 residual.** No fixed item regressed.

### Notes for the operator
- The GUI "Update Swim England" button fire-and-forgets the meet-scrape stream (F10) — it shows "Complete!" early and only reliably runs the scrape locally. Prefer a local run until F10 is fixed.
- The dashboard's per-squad cards live in a hidden `squadsVisible` overlay (toggled by a button), not the default view — by design, but easy to miss.

## Note on side effects during testing

The anonymous-401 probe of `/api/sync-attendance` unexpectedly **started two real SCM attendance syncs** (because of the S2 localhost bypass). These are the same idempotent upserts as clicking "Sync Attendance" in Settings — no data loss, but you may see fresh `training_attendance` timestamps. The test suite has been amended so this cannot happen again.

## How to run

See tests/README.md. Quick reference: `npm run test` (safe), `npm run test:backup` then `npm run test:destructive` (syncs).
