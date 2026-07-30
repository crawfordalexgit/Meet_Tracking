# Pre-Launch Bug Register — 2026-07-27

Full top-to-bottom audit of the CoachesEye / Open Meet Dashboard at `v1.0.195`,
covering all 42 API routes, all 17 pages, all 26 components, all 20 `lib/`
modules, both schema files, config and the test suite.

Fixes landed in `v1.0.197`. Statuses:

- **FIXED** — changed in this pass, builds clean, covered by a test where noted.
- **OPEN — OWNER ACTION** — requires something only the account owner can do.
- **OPEN** — logged, deliberately not fixed in this pass.
- **NOT A BUG** — reported by the audit, disproved on verification.

Severity is blast radius, not effort: **CRITICAL** = data loss or unauthorised
access; **HIGH** = numbers shown to coaches are wrong, or a page crashes;
**MEDIUM** = degraded behaviour; **LOW** = cosmetic or latent.

---

## P0 · Security

| ID | Sev | Location | Issue | Status |
|---|---|---|---|---|
| S1 | CRITICAL | `_backups/pre-ai-integration/scratch/*.js:4` (7 files) | Live Supabase project URL and `service_role` key hardcoded and **committed**. 124 files remain tracked under `_backups/` despite `.gitignore:40`. `service_role` bypasses all RLS: full read/write/delete on every table, including minors' names, birth years and attendance. | **OPEN — OWNER ACTION** |
| S2 | CRITICAL | `schema.sql:234-235`, `rankings_schema.sql:32-33` | Four policies named "Allow service role …" declared `FOR ALL USING (true)` with **no `TO` clause**. A policy with no role applies to `PUBLIC`, i.e. `anon` — whose key ships in the client bundle. Anyone could DELETE all sessions, training attendance and rankings. | **FIXED** |
| S3 | CRITICAL | `schema.sql:232-233`, `rankings_schema.sql:28-29` | SELECT policies `USING (true)` with no `TO authenticated`: minors' attendance history and rankings readable with the public anon key. | **FIXED** |
| S4 | CRITICAL | `pages/api/ai/scrape-gala-url.js:34-76,132,142` | SSRF. `req.body.url` passed straight to `page.goto()`, and every discovered link re-fetched, with no scheme or host allow-list. Reaches cloud metadata (`169.254.169.254`) and internal services; scraped content is persisted to `meets.pdf_text` and returned. | **FIXED** |
| S5 | CRITICAL | `pages/api/ai/gala-engine-v2.js:39`, `pages/api/ai/scrape-gala-url.js:154` | PostgREST filter injection: `.or(\`id.eq.${'{'}id{'}'},parent_id.eq.…\`)` built from unvalidated body input, through a **service-role** client. | **FIXED** |
| S6 | CRITICAL | `pages/api/export-report.js:48-51`, `pages/api/generate-pdf.js:36-38` | Target origin built from `req.headers.host` / `x-forwarded-proto`, and the caller's Supabase session (including the refresh token) injected into whatever origin loads. `generate-pdf` also appended `PRINT_SECRET_TOKEN` to that URL. A forged Host header exfiltrates both. | **FIXED** |
| S7 | HIGH | `pages/api/generate-pdf.js:28` | Traversal guard validated `decodedPath` but built the URL from the **raw** `targetPath`, so `%252e%252e` passed the `..` check and decoded to a traversal in the browser. | **FIXED** |
| S8 | HIGH | `pages/api/sync-scm.js:10` | Only `requireAuth`, yet the route deletes every swimmer absent from the SCM response — cascading to results and attendance. | **FIXED** (admin-gated + delete-ratio safety valve) |
| S9 | HIGH | `pages/api/sync-scm.js:12` | `scmApiKey` accepted from `req.body`, overriding server config, with no admin gate. | **FIXED** (env only) |
| S10 | HIGH | `pages/api/import-join-dates.js:35` | `ilike('full_name', …)` with `%` unescaped on an **UPDATE**. Payload `{"full_name":"%"}` rewrites `squad_join_date` for every swimmer. | **FIXED** (admin-gated + wildcard escaping) |
| S11 | HIGH | `pages/api/relay-lineups.js` | Any authenticated user could PUT/DELETE any lineup through the service-role client. | **FIXED** (reads open, writes admin) |
| S12 | HIGH | `pages/api/detect-missing-sessions.js:9` | Any authenticated user could bulk-insert `club_exemptions`, rewriting club-wide attendance compliance. | **FIXED** (admin-gated) |
| S13 | HIGH | `pages/api/parse-pdf.js`, `pages/api/upload-meet-photo.js` | formidable constructed with `{}`: no `maxFileSize`, no `maxFiles`, no MIME allow-list, then the whole file read into memory. `parse-pdf` never unlinked its temp file. | **FIXED** |
| S14 | MEDIUM | `pages/api/prompts/load.js:10` | `requireAuth` while save/rollback require admin — inconsistent gating on the same resource. | **FIXED** |
| S15 | MEDIUM | `pages/api/ai/feedback.js:15-27` | Attribution taken from `req.body.coachId`, not the authenticated user: the AI training-data audit trail was forgeable. | **FIXED** |
| S16 | MEDIUM | `pages/api/ai/refine-prompt.js:48` | `${'{'}facet{'}'}.md` **written** without the `SAFE_FACET_RE` check used in save/rollback — arbitrary file write inside the deployment. | **FIXED** |
| S17 | MEDIUM | `schema.sql:36-39` | Every coach could read every other user's email and role. | **FIXED** (self + admin) |
| S18 | MEDIUM | `schema.sql:330-333,354-357` | `user_issues` / `issue_upvotes` INSERT used `WITH CHECK (true)` — rows attributable to another user. | **FIXED** |
| S19 | MEDIUM | `lib/api-auth.js:15` | `authorization.replace('Bearer ', '')` — unanchored and case-sensitive. | **FIXED** |
| S20 | MEDIUM | `lib/api-auth.js:33` | Profile-lookup error discarded, so a transient DB failure was reported as "Forbidden". | **FIXED** (503 + diagnostic) |
| S21 | MEDIUM | `pages/api/export-report.js:116` | `browser.close()` only on the success path — every failure leaked a Chromium process. | **FIXED** (`finally`) |
| S22 | MEDIUM | `lib/ai_engine.js:80,100`, `lib/ai_provider.js:110` | Coaching notes, gala PDF text and raw model responses — all containing swimmers' names — logged to the platform log. | **FIXED** (lengths only) |
| S23 | MEDIUM | `next.config.mjs` | No CSP, HSTS, X-Frame-Options or X-Content-Type-Options; `poweredByHeader` not disabled. | **OPEN** |
| S24 | MEDIUM | `pages/settings.js:200-220` | Role gating is client-side only while the page issues direct browser writes to `profiles`, `sessions` and `swimmers`. Now backed by real RLS for `sessions` (S2); `swimmers`/`profiles` still rely on their own policies. | **PARTIAL** |
| S25 | MEDIUM | `pages/squad/[id].js:462-468` and 3 others | The full Supabase session (including refresh token) is POSTed in a JSON body to the export endpoints, where it is far more likely to be logged than an `Authorization` header. | **OPEN** |
| S26 | MEDIUM | `pages/feedback.js:65-68` | Hardcoded `'local-dev-user'` privileged identity shipped to production, with the client choosing the id the API acts as. The API routes now take the id from the session (S15 pattern), so the client value is ignored — but the string should still go. | **OPEN** |
| S27 | LOW | `.gitignore:26` | Only `.env*.local` ignored; plain `.env` / `.env.production` are not. Nothing currently tracked. | **OPEN** |

### S1 — what the owner must do

The key is **live**. Deleting the files does not invalidate it, and it is in git
history regardless.

1. Supabase dashboard → Project Settings → API → **roll the `service_role` key**.
2. Update `SUPABASE_SERVICE_ROLE_KEY` in the Vercel environment (all environments)
   and any local `.env.local`.
3. Redeploy.
4. Only then decide whether to purge the files/history — that is cleanup, not
   remediation.

---

## P1 · Data correctness

| ID | Sev | Location | Issue | Status |
|---|---|---|---|---|
| D1 | HIGH | `lib/analytics-utils.js:1173` | `finalConfig = results;` assigned the results **array** as the config object, so every `health_weight_*` read returned `undefined`. | **FIXED** + test |
| D2 | HIGH | `lib/analytics-utils.js:1275` | `calculateSquadHealth(statsObj, squad)` against a signature of `(input, attendance, sessions, results, period, config)`. Combined with D1, **per-squad health weights configured in Settings had never had any effect** — every squad was scored on the hardcoded 20/30/40/10. | **FIXED** + test |
| D3 | HIGH | `lib/analytics-utils.js:647` | `squadName.includes(squadName)` — a tautology, so every session in the club counted as relevant to every swimmer in the legacy credit fallback, inflating reliability. | **FIXED** |
| D4 | HIGH | `lib/analytics-utils.js:851-853` | Weekly targets looked up with `toLocalISO()` ("2026-07-20") against a map keyed by `getWeekKey()` ("W-2026-07-20"). Always missed, so `targetSess`/`targetHrs`/`appliedRule` silently fell back to squad base targets and age-based weekly criteria never reached the UI. | **FIXED** + test |
| D5 | HIGH | `lib/analytics-utils.js:617` | `allExemptions` resolved to the outer list, which force-mapped every exemption to `type:'exempt'`, making the `'credit'` branch unreachable. The Shutdown Credits feature documented in `AttendanceLogic.readme:58` was dead. | **FIXED** |
| D6 | HIGH | `lib/analytics-utils.js:827-829` | Returned `100` when `swimmableWeeks === 0`: a swimmer we knew nothing about rendered as fully compliant, and passed every `>= target` check. | **FIXED** (`null` + `hasReliabilityData`) + test |
| D7 | HIGH | `lib/reconcile-pbs.js:7-10` | Unpaginated select against a table well past PostgREST's 1000-row cap, so most rows were never examined and `is_pb` was wrong for the majority of the table. Every PB-derived metric inherited it. | **FIXED** + test |
| D8 | HIGH | `pages/api/reports.js:508` | `parseTimeToSeconds` returned `0` for missing/malformed times, and `0` beats every benchmark — so every swimmer with a bad time counted as a County **and** Regional **and** National qualifier. | **FIXED** (`null` + excluded) |
| D9 | HIGH | `pages/meet/[id]/index.js:568-571` | With no `swimmer_pbs` baseline, `isPb` was set `true` unconditionally: every first-ever swim was reported as a personal best, inflating the meet's headline PB count and conversion rate. | **FIXED** |
| D10 | HIGH | `lib/scm-scraper.js:161,206` | UK DD/MM/YYYY read with bare `new Date()`, which parses month-first: days 1-12 silently transposed, days 13-31 silently dropped by the `isNaN` guard. Corrupted every reliability, volume and consistency figure. | **FIXED** + test |
| D11 | HIGH | `pages/api/export/relay-forms.js:35` | `counts[key]++` on an uninitialised key → `undefined++` → `NaN`, propagating into the sub-totals and fee on the **official Kent Relays entry form**. | **FIXED** (rejects unknown teams) |
| D12 | HIGH | 14 sites | Unpaginated selects hitting the 1000-row cap: `sync-scm` (twice), `squad-stats` rankings, `meet-word` results, `sync-attendance`, `sync-pbs`, `import-attendance`, `gala-engine-v2`, `scrape-gala-url`, `predictor`, `swimmers`, `relays`, `capacity`, `settings`, meet-page squad baselines. | **FIXED** |
| D13 | HIGH | `lib/paginate.js:27` | Swallowed the Supabase error and returned a partial array indistinguishable from a complete one. | **FIXED** (throws) + test |
| D14 | MEDIUM | `lib/paginate.js:24` | `.order('id')` applied before the caller's filter, demoting a caller-supplied sort to a tiebreaker — so `getSwimmerDNA`'s "most recent first" assumption did not hold. | **FIXED** + test |
| D15 | MEDIUM | `pages/api/reports.js:26,74` | Two hand-rolled paginators called `.range()` with **no `.order()`**: rows could duplicate or drop across page boundaries under concurrent load. | **FIXED** (shared paginator) |
| D16 | MEDIUM | `pages/api/reports.js:89-99` | Unvalidated `startDate`/`period` produced an Invalid Date whose `.toISOString()` throws, turning bad input into a 500. | **FIXED** (400) |
| D17 | MEDIUM | `lib/reconcile-pbs.js:40` | PB key used the raw event string, so "50m Freestyle" and "50 Free" each got their own PB and inflated counts. | **FIXED** (`normalizeEvent`) + test |
| D18 | MEDIUM | `lib/analytics-utils.js:1140` | A single null `wa_pts` made the whole squad's health score `NaN`. | **FIXED** + test |
| D19 | MEDIUM | `lib/analytics-utils.js:1131` | `input.memberships` read off an Array in raw mode — always `undefined`, so reliability was computed with no session memberships. | **FIXED** |
| D20 | MEDIUM | `lib/analytics-utils.js:600` | Week credits clamped against the squad **base** target rather than the week's dynamic target. | **FIXED** |
| D21 | MEDIUM | `pages/meet/[id]/index.js:204-208` | Embedded-relation filter without `!inner`, so non-matching rows returned `swimmers: null` and were bucketed under the key `undefined`, skewing squad season baselines. | **FIXED** |
| D22 | MEDIUM | `lib/scm-scraper.js:14,50` | `set-cookie` split on `','` / `', '`, which shreds any cookie carrying `Expires=Wed, 01 Jan 2027`. The two lines also disagreed on the delimiter. | **FIXED** + test |
| D23 | MEDIUM | `lib/scm-scraper.js:88` | ASP.NET hidden fields appended without a null check, posting the literal string `"undefined"` and surfacing as a generic "Login failed". | **FIXED** (names the missing field) |
| D24 | MEDIUM | `pages/api/scrape-meets.js:252` | Delete-then-insert with no transaction and 4 concurrent workers: a failed insert left the meet with zero results and only logged. | **FIXED** (snapshot + restore) |
| D25 | MEDIUM | `pages/api/scrape-rankings.js:121` | The day's snapshot was deleted **before** a multi-minute scrape that reliably times out, leaving rankings permanently empty or partial. | **FIXED** (upsert-then-prune) |
| D26 | MEDIUM | `pages/api/sync-session-memberships.js:60` | Delete-then-insert per swimmer; a failure left zero memberships, which downstream reliability reads as 100% attendance. | **FIXED** (snapshot + restore) |
| D27 | MEDIUM | `lib/ai-context.js:325` | `meetName.includes('lc')` mislabels "Falcon", "Welcome", "Falconwood" as long course, flipping `course` and corrupting drop-off ratios and PB grouping. | **OPEN** |
| D28 | MEDIUM | `lib/analytics-utils.js:1516` | `calculateDropOffRatio` filters by stroke and distance but never by course, mixing a short-course 50 with a long-course 100. | **OPEN** |
| D29 | MEDIUM | `lib/ai-context.js:108,142` | `wa_pts` summed without `|| 0` (one null → `NaN` → `null` in the prompt); `midSplit` falls back to the whole array rather than null. | **OPEN** |
| D30 | MEDIUM | `lib/relays/relay-optimizer.js:147-152` | Each medley leg truncated to its top 8 **before** the 2M2F composition filter, so a legal mixed team can be reported as impossible. | **OPEN** |
| D31 | MEDIUM | `lib/qualifying-times.js:3602` | Fallback chain uses age keys `2,4,5,6,7,1,3` where `STANDARDS` is keyed `"11"`–`"17"` — dead fallback, so events missing the exact age are silently skipped from the averaged category benchmark. | **OPEN** |
| D32 | LOW | `lib/analytics-utils.js:620-621` | `shouldApplyExempt` and `shouldApplyCredit` are character-identical, so one of the two filter switches does nothing it is named for. | **OPEN** |
| D33 | LOW | `lib/analytics-utils.js:684` | `if (w || …)` where `w` was just unconditionally created — always true, making the holiday branch at `:757` unreachable dead code. | **OPEN** |
| D34 | LOW | `pages/settings.js:148-152` | CSV parsed with `split(',')`: quoted fields containing commas shift every column, and `indexOf` returning -1 yields `undefined` dates imported silently. | **OPEN** |
| D35 | LOW | `pages/api/upvote-issue.js:44-58` | Read-modify-write of `upvotes` — concurrent votes overwrite each other. | **OPEN** |

---

## P1 · Crashes and silent failures

| ID | Sev | Location | Issue | Status |
|---|---|---|---|---|
| C1 | CRITICAL | `components/WeeklyWorkloadModal.js:10` | Early return sat **above** two `useMemo` calls in a component mounted unconditionally by `pages/swimmer/[id].js:3985`. Clicking a training week took the hook count 0→2 → "Rendered more hooks than during the previous render" → the whole athlete profile unmounted. | **FIXED** |
| C2 | HIGH | `pages/meet/[id]/index.js:1437` | `insight.summary.split()` unguarded — any stored report without a string summary crashed the meet page on load. | **FIXED** |
| C3 | HIGH | `pages/meet/[id]/index.js:1929` | `r.swimmers.squads?.name` — optional chain one level too late; one orphaned result row crashed the results table. | **FIXED** |
| C4 | HIGH | `pages/swimmers.js:150` | `s.full_name.toLowerCase()` unguarded — one null name and the registry threw on the first keystroke. | **FIXED** |
| C5 | HIGH | `components/SquadIntelligenceCard.js:20-24` | Query filtered on `squad_id` only, so a `type:'talent'` report could load into the squad card and its different shape crashed the render. | **FIXED** (filters on `type`) |
| C6 | HIGH | `SquadIntelligenceCard`, `AiInsightCard`, `ForesightTimeline` | Unguarded `insight.summary.assessment`, `.analysis.split`, `.summary.swot.*`, `.recommendations.map`, `.full_report.foresight` — one missing field took down a whole page instead of one panel. | **FIXED** |
| C7 | HIGH | `pages/dashboard.js:270` | `Math.max(...v.pts)` spread over every club-wide WA-points value → `RangeError: Maximum call stack size exceeded`. | **FIXED** (reduce) |
| C8 | HIGH | `components/CoachesEyeDeepDive.js` | `results.length`, `attendance.length`, `swimmer.full_name` with no prop defaults. | **FIXED** |
| C9 | HIGH | `lib/qualifying-times.js:3532` | `ageData.autoSC` with no null guard, unlike the sibling `getBenchmarks`. | **FIXED** |
| C10 | HIGH | `pages/reports.js:223,786,951` | Unguarded `.toFixed()` on `info.x/y`, `sw.efficiency`, `sw.teiDelta` — the tooltip one fired on mere hover. | **FIXED** |
| C11 | HIGH | `pages/swimmer/[id].js:1028` | `parseFloat(...)` → `NaN` seeded `lifetimeBestMap`, after which every `seconds < NaN` was false and no further PB in that event was ever counted. | **FIXED** |
| C12 | HIGH | `pages/_app.js:47-63` | `checkProfile` defined but never called, so `isPending` could never be true and the "Account Pending" gate was unreachable — a coach with no squad assignments got full access. | **FIXED** |
| C13 | HIGH | `pages/login.js:33` | `setMessage(error.message)` as a string while the renderer reads `message.text`/`.type` — a failed Google sign-in rendered an empty **green success** box. | **FIXED** |
| C14 | HIGH | `pages/dashboard.js:150-182` | Errors swallowed into `console.error`, leaving `data` empty: the cockpit rendered complete-looking at 0% health, 0 PBs, 0 qualifiers — indistinguishable from a club with no data. | **FIXED** (error banner) |
| C15 | HIGH | `pages/capacity.js`, `pages/predictor.js`, `pages/relays.js` | No `try/catch` around the `Promise.all`, so a rejected query skipped `setLoading(false)` and the page hung on its loading state forever. | **FIXED** |
| C16 | HIGH | `pages/reports.js:85-91` | `fetchReport()` ran mount-only: changing squad or reporting period updated the controls but kept showing the original payload. | **FIXED** |
| C17 | MEDIUM | `pages/feedback.js:52-56` | Fetch failure rendered the "No Submissions Found" empty state — a backend outage read as "nothing here". | **FIXED** |
| C18 | MEDIUM | `pages/api/export/meet-word.js:225-593` | Entire handler had no `try/catch`; a rejection wrote no response and the request hung until the platform timeout. | **FIXED** |
| C19 | MEDIUM | `pages/relays.js:359` | `window.open()` result used with no null check — Print threw under a popup blocker. | **FIXED** |
| C20 | MEDIUM | `pages/meet/[id]/index.js:287` | `response.body.getReader()` with no `response.ok` check. | **OPEN** |
| C21 | MEDIUM | `components/AggregateBlockTracker.js:38`, `components/TrainingBlockTracker.js:50`, `components/CapacityReportModal.js:10` | Effects unconditionally reset the user's selection whenever the parent re-supplies its data arrays. | **OPEN** |
| C22 | MEDIUM | `components/AiInsightCard.js:27,82` | `insight` is both `useState(initialInsight)` and reset by an effect on `[initialInsight]`, so a fresh object literal from the parent wipes a fetched insight. | **OPEN** |
| C23 | MEDIUM | `pages/meets.js:31` | Raw search text interpolated into a PostgREST `.or()` filter — a `,` or `)` corrupts the expression. | **OPEN** |

---

## P1 · Fabricated numbers

| ID | Sev | Location | Issue | Status |
|---|---|---|---|---|
| F1 | HIGH | `pages/dashboard.js:1326-1329` | "Critical Audit Findings" hardcoded a *"12-14 age band"* deficit and an *"8.4% month-over-month"* volume drop — neither derived from any data, rendered with the same authority as the real KPIs beside them. | **FIXED** (reports only computed figures) |
| F2 | HIGH | `pages/dashboard.js:1378` | "42% gap in Top-40 penetration" — same class, same panel family. | **FIXED** |
| F3 | HIGH | `pages/reports.js:238-239` | "Total races" invented as `pbCount + round(totalHours / 12)` and used as the denominator of a displayed **PB Conversion Rate** on a leaderboard. | **FIXED** (real `raceCount` from the API) |
| F4 | MEDIUM | `pages/predictor.js:445`, `pages/reports.js:44`, `components/VorontsovLTADModule.js:7,17`, `pages/squad/[id].js:289,366`, `pages/meet/[id]/index.js:1934` | Missing demographics silently default (gender→`'M'`, age→`15`/`13`/`12`/`17`), and LTAD windows and qualifying-time targets are then computed against invented values and shown as fact. | **OPEN** |
| F5 | MEDIUM | `pages/swimmers.js` | Reliability rendered as `0%` for athletes with no swimmable week. | **FIXED** ('—') |

---

## P2 · Deployment and configuration

| ID | Sev | Location | Issue | Status |
|---|---|---|---|---|
| P1 | HIGH | `package.json:47`, `lib/ai-knowledge.js:27` | `pdf.js-extract` was a **devDependency** but `require`d at runtime on every AI analysis. `npm ci --omit=dev` cannot resolve it, and the failure was swallowed. | **FIXED** (moved to dependencies) |
| P2 | HIGH | `lib/ai-knowledge.js:10` + `.gitignore:51` | `AiTraining/` is gitignored, so on Vercel the directory is absent, `readdirSync` throws and the loader returns `""` — **production AI output has no Club Ground Truth** and differs from local with no signal. | **PARTIAL** — now logs a loud error instead of failing silently. Shipping the directory is an owner decision. |
| P3 | HIGH | `vercel.json` | No `functions.maxDuration` anywhere, so every long-running route inherited the short default. This is the same serverless-timeout mechanism `TEST-FINDINGS-2026-07-08.md:40` blames for the original empty-results outage. | **FIXED** |
| P4 | HIGH | `pages/api/sync-attendance.js:13` | If `CRON_SECRET` is unset, the nightly cron 401s forever with no alert. | **FIXED** (loud log on a cron-stamped request with no secret) |
| P5 | HIGH | `schema.sql`, `rankings_schema.sql` | **Zero indexes** in either file, while every hot query filters on `results(swimmer_id/meet_id/date)`, `training_attendance(swimmer_id,date)`, `swimmers(squad_id)` etc. | **FIXED** (`migrations/2026-07-27_indexes.sql`) |
| P6 | HIGH | `pages/swimmers.js` | Downloaded ~21k attendance and ~5k result rows to the browser and computed reliability client-side — the cause of the ~40s load and the timed-out `swimmers-peak-wa` guard. | **FIXED** (`/api/swimmer-stats`) |
| P7 | MEDIUM | `lib/ai_provider.js:14` | `GEMINI_MODEL` defaulted to `gemini-3.1-flash-lite` while `GEMINI_REFINE_MODEL` had already been corrected to `gemini-1.5-flash`, so the two code paths ran different model families. | **FIXED** (both default to the same id; override via env) |
| P8 | MEDIUM | `lib/ai_provider.js:19` | AI client constructed with no key-presence check, so a missing key surfaced as an opaque SDK error. | **FIXED** |
| P9 | MEDIUM | `lib/ai_provider.js:114-131` | A non-retryable error was retried twice more before reporting the same failure, and the loop had no post-loop return. | **FIXED** |
| P10 | MEDIUM | `pages/api/ai/feedback.js:4`, `pages/api/sync-join-dates.js:5` | Module-scope `createClient()` with the service-role key — throws at import time when env vars are missing, breaking the route at boot. | **FIXED** (lazy `getServiceSupabase()`) |
| P11 | MEDIUM | `package.json:37-38` | Both full `puppeteer` (bundles Chromium) and `puppeteer-core` + `@sparticuz/chromium-min` are production dependencies; the pairing shows the intent was `puppeteer-core` only, and full Puppeteer pushes the bundle toward Vercel's size limit. | **OPEN** |
| P12 | MEDIUM | `prompts/save.js`, `prompts/rollback.js`, `ai/refine-prompt.js`, `reports.js:465`, `download-report.js` | Filesystem writes/reads outside `/tmp`. The serverless filesystem is read-only, so prompt save/rollback/refine throw `EROFS` and the saved-reports directory is always empty in production. | **OPEN** |
| P13 | MEDIUM | `ai/gala-engine-v2.js:566`, `ai/sandbox.js:71` | Debug `writeFileSync` of full athlete DNA left in production code paths, swallowed by empty `catch {}`. | **OPEN** |
| P14 | HIGH | `pages/api/scrape-rankings.js:133-269` | ≈6,800 sequential HTTP fetches in one request — cannot complete inside any function limit even with `maxDuration`. Needs chunking or moving off the request path. | **OPEN** (design change) |
| P15 | MEDIUM | `.gitignore:54-57` | Root-level `/*.json`, `/*.txt`, `/*.html`, `/*.log` ignored wholesale, so a new `tsconfig.json` or `.eslintrc.json` would be silently untracked. | **OPEN** |
| P16 | LOW | repo root | `open_meet_notebooklm_context.zip` (16 MB) and 103 tracked files under `open_meet_notebooklm_context_extracted/` are a stale duplicate of the codebase, including a `schema.sql` that disagrees with the live one. Greps and refactors will match dead code. | **OPEN** |

---

## P2 · Schema drift

Carried forward from F7 in `TEST-FINDINGS-2026-07-08.md`; the gap is larger than
that note recorded. All **OPEN**.

| ID | Sev | Issue |
|---|---|---|
| X1 | HIGH | `session_memberships` — the table threaded through `calculateReliability` as the source of truth for scheduled days — **does not exist in either schema file**. |
| X2 | HIGH | `results` is missing `UNIQUE(swimmer_id, meet_id, event)` (which `lib/scrape-utils.js` exists solely to satisfy), and the `date` and `splits` columns that lib code reads. |
| X3 | MEDIUM | `schema.sql:122` — `results.swimmer_id … ON DELETE CASCADE` and nullable. This is F6: removing a swimmer from SCM destroys their entire competition history. `ON DELETE RESTRICT` or a soft-delete flag is the safe shape. Mitigated for now by the S8 delete-ratio safety valve. |
| X4 | MEDIUM | `schema.sql:221` — recreating a session with a new `scm_guid` cascades away every historical attendance row attached to the old one. |
| X5 | MEDIUM | `ai_reports.meet_id` still absent (`SESSION_HANDOVER.md:15`), so meet reports cannot be persisted; `ai_reports.squad_id … ON DELETE CASCADE` also means deleting one squad deletes club-level reports. |
| X6 | LOW | Columns read by lib code but undocumented: `swimmers.known_as`, `.legal_first_name`, `.is_active`, `.holiday_allowance`; `squads.age_based_criteria`, `.health_weight_*`, `.county_standard`, `.holiday_allowance`. |
| X7 | LOW | `swimmers.squad_join_date DATE DEFAULT '2025-09-01'` — a hardcoded season start that silently widens the analysis window for anyone created later. |

---

## P3 · Time bombs, dead features, accessibility

All **OPEN**.

| ID | Sev | Location | Issue |
|---|---|---|---|
| T1 | MEDIUM | `lib/analytics-utils.js:217-251`, `pages/api/detect-missing-sessions.js:80-85` | UK bank holidays hardcoded for 2025 and 2026 only. From January 2027 every bank holiday counts as a missed training day (and is auto-inserted as a cancellation exemption), skewing every consistency figure. **~5 months of runway.** |
| T2 | MEDIUM | `components/BenchmarkModal.js:32,96,172` | `.eq('year', 2026)` and "2026 Standards" labels hardcoded — the table silently empties when the 2027 standards land. |
| T3 | LOW | `lib/wa-points.js:96-104` | `getNormalizedWA` inflates boys 12-14 by 1.10 while the doc comment describes only a girls' correction. **Note:** `tests/unit/wa-points.spec.js:45` asserts this behaviour deliberately, so it is intended, not a bug — the doc comment is what is wrong. |
| T4 | MEDIUM | `pages/dashboard.js:1669-1748` | The rankings drill-down overlay renders on `drilldownCategory`, but nothing ever sets one — an entire built feature is unreachable. |
| T5 | MEDIUM | `pages/meets.js:140` | `onClick={handleMerge}` references a function that does not exist; masked only because `setSelectedMeets` is never called, so the whole selection/merge feature is dead code. |
| T6 | MEDIUM | `components/ConsolidationModal.js:165` | The row badge labels the first selected meet "★ Master Target", but `handleMerge` picks the existing master or the earliest by date — the UI names a different meet than the one that absorbs the others. |
| T7 | LOW | `components/ForesightTimeline.js:9-17,99` | `checkAchievement` always returns null and is never called; "● ON TRACK" is hardcoded on every archived insight. |
| T8 | LOW | `components/Layout.js:36-51,64` | Two nav entries point at `/capacity` (both highlight as active), and a help section id has no matching content block (clicking renders an empty panel). |
| T9 | MEDIUM | `pages/dashboard.js:1400-1463`, `components/SquadQualificationPredictor.js:157,262,674` | O(swimmers × results) filters run inline in JSX on every render; the predictor's `categories` object literal is recreated each render and is a `useMemo` dependency, so the memo never holds. |
| T10 | MEDIUM | `pages/capacity.js:242-274` | `ghostAllocations` is O(memberships × attendance) and recomputes on any filter change. |
| T11 | MEDIUM | `pages/swimmers.js:222`, `pages/squads.js:14`, `pages/squad/[id].js:980`, `pages/dashboard.js:24` | Primary navigation is `onClick` on `<tr>`/`<div>` with no `role`, `tabIndex` or key handler — the athlete registry, squad registry and squad roster are unnavigable by keyboard. |
| T12 | MEDIUM | `components/ReportConfigModal.js:164`, `components/CapacityReportModal.js:164` | Report-section checkboxes have `onChange={() => {}}` inside a `<div onClick>` — keyboard and screen-reader users cannot toggle them at all. |
| T13 | LOW | `lib/ThemeContext.js:13-22` | Theme defaults to MIDNIGHT and reads localStorage only after mount, so Solar/Nordic users get a flash of the dark theme on every load. |
| T14 | LOW | `pages/index.js:70` | Hero `fontSize: '4.5rem'` with no responsive override — the public landing page overflows horizontally on phones. |

---

## NOT A BUG — audit claims disproved on verification

| Claim | Finding |
|---|---|
| `pages/swimmer/[id].js:345` — `printToken` allows anonymous access to any child's dossier | **False.** `pages/_app.js:88` blocks rendering of any non-public route without a session, so the effect never runs for a logged-out visitor. The real defects are smaller: the client compares against `NEXT_PUBLIC_PRINT_SECRET_TOKEN` while the server sends `PRINT_SECRET_TOKEN` (`generate-pdf.js:39`) — two different variables, so the branch is **dead** — and a secret-shaped value is named `NEXT_PUBLIC_*`, which would inline it into the client bundle if ever set. Logged as **OPEN**, low severity. |
| `pages/api/generate-pdf.js` leaks a Chromium process on error | **False.** It already had a `finally { if (browser) await browser.close(); }`. The leak was real in `export-report.js` (S21), which did not. |
| `lib/ai_provider.js` retry loops return `undefined` | **Overstated.** Both loops did always return or throw. The real defects were that non-retryable errors were retried twice more before failing, and that neither function had a post-loop return as a backstop. Both fixed (P9). |
| `pages/api/log-issue.js` / `upvote-issue.js` accept a client-supplied user id | **Already fixed** before this audit — both take the id from `requireAuth`. |
| `lib/wa-points.js` boys 12-14 inflation is a bug | **Intended.** `tests/unit/wa-points.spec.js:45` pins it deliberately. The doc comment is inaccurate, not the code (T3). |

---

## Verification performed

- `npx next build --webpack` — clean after every stage.
  (Plain `npm run build` fails in this worktree with a Turbopack
  `path length … exceeds max length of filesystem` panic — a Windows MAX_PATH
  limit from the long OneDrive worktree path, not a code fault.)
- `npm run test:unit` — **115 passed**, including 40 new specs pinning D1, D2,
  D4, D6, D7, D10, D13, D14, D17, D18, D22.
- `npm run test:api`, `test:integrity`, `test:e2e` — **not run here.** They need
  `TEST_USER_EMAIL`/`TEST_USER_PASSWORD` and a live database, which are not
  configured in this worktree. `tests/api/rls.spec.js` is new and is the check
  that `migrations/2026-07-27_rls-hardening.sql` has actually been applied.

## Still to do before launch

1. **Rotate the `service_role` key** (S1) — nothing else in this register matters as much.
2. Apply `migrations/2026-07-27_rls-hardening.sql` and `migrations/2026-07-27_indexes.sql` to the live database.
3. Run the full suite with credentials, including the new `tests/api/rls.spec.js`.
4. Confirm `squad-consistency-rendered.spec.js` and `swimmers-peak-wa.spec.js` now pass inside their timeout.
5. Decide how `AiTraining/` ships to production (P2).
