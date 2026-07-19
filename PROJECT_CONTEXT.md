# Franbooking SalesNav Extractor + Recruiter/Growth Webapp — Project Context

This file exists so a **new Claude session** can pick up this project with full context, without re-deriving everything from scratch. Keep this file in the same folder as the actual project files (`combined-extension/`, `gas-webapp/`) and paste/attach it at the start of a new session, or just tell Claude "read PROJECT_CONTEXT.md in this folder first."

## Recent updates (most recent session — read this section first)

Everything below happened after the original body of this doc was written. The original sections further down are still accurate for the fundamentals (folder structure, CONFIG, column maps, deployment model) but don't mention these features/fixes yet.

**Features added since the original doc:**
- Recruiting Pipeline (Operations.html + Code.gs): Applicant CRUD, Outreach Task tracking, Onboarding checklist. `APPLICANT_STATUSES` simplified to 6 values: `Applied, Whatsapp Message Sent, Accepted, Rejected, Onboarding, Hired`. `ONBOARDING_STATUSES = ['In Progress', 'Ready', 'Declined', 'Hired']` — Declined auto-flips the linked Applicant to Rejected.
- Finance tracking (Growth.html + Code.gs): `apiCeoGetFinanceData`, `apiCeoAddCost`, `apiCeoAddClientPayment`.
- Daily Task assignment system (Growth.html + Code.gs): internal team task tracking with Assigned To/reassignment.
- Time Log: heartbeat-based online/offline tracking, server-side auto-close after 30 min stale, session persistence across side-panel teardown/rebuild (`chrome.storage.local` in the extension, `sessionStorage` in Recruiter.html).
- CA/NY territory tracking: optional checkbox on Outreach save + bulk-backfill tool for old prospects; per-client cycle cap enforced server-side in `apiGetDailyTasks`.
- **Leave Status + Daily Feedback** (newest feature): recruiters submit next-leave-date/duration/reason and a daily Sales-Nav/response self-report from a new **Feedback tab** in the extension side panel (`sidepanel.html`/`panel.js`) and Recruiter.html. Backend: `CONFIG.FEEDBACK_SHEET_ID` (`1-pvyUCMuLVXILbWlp9QZNFNcGu9kdYmmuHUHOS428AU`), `LEAVE_COL`/`FEEDBACK_COL` maps, `getLeaveSheet_()`/`getFeedbackSheet_()` (self-healing headers via `ensureSheetHeaders_(sh, headers)`), `apiSubmitLeave`, `apiSubmitFeedback`. Growth panel reads via `apiCeoGetRecruitersOnLeave`, `apiCeoGetFeedbackSubmissions` (now filters out reviewed rows), `apiCeoMarkFeedbackReviewed` (Reviewed button removes a row from the Growth panel's Daily Feedback table).
- Calendar-link (DTC link) substitution fix: `apiGetClients`'s `name` field now runs through `cleanClientName_()` like `apiGetDailyTasks`'s `client` field does (both must match exactly since the extension keys `clientEventUrls` off one and looks it up with the other). Added a fallback: when a client's per-recruiter Daily Assignment link (Col C) is blank, `apiGetClients` now looks it up from the company-wide "Client DTC URL" tab instead.
- Nurture-tab client auto-assign: **any** contact with no client on record (not just returning/continuing-conversation contacts) now auto-assigns via the same ratio-balancing logic as the Rotation button, the moment the recruiter selects them. This matters because outreach never assigns a client — every first nurture reply used to sit unassigned until the recruiter manually clicked Rotation. Fixed in both `panel.js`'s `selectContact()` and Recruiter.html's equivalent.

**Ongoing investigation: Apps Script concurrency / "Save" reliability at scale (see below, not fully resolved)**

The user is scaling to **50+ concurrent recruiters**. Symptom: the Tasks tab's Save button (and other calls) intermittently fail with a JSON-parse error ("Unexpected token '<'..." / a generic Apps Script `<title>Error</title>` HTML page instead of JSON). Root-caused via the Apps Script Executions log: **not** a code bug — `doGet`'s try/catch already converts every JS-level error into valid JSON, so a raw HTML response means the *platform* rejected the request before it ever reached our code. The log showed a persistent ~20-25% `doGet` failure rate even on otherwise-fast (1-3s) executions — the signature of hitting Apps Script's per-project concurrent-execution ceiling, not a slow/broken call, a network problem, or a Google-login auth wall (ruled out — the raw error text was Apps Script's own generic error page, not a sign-in page).

Important nuance the user flagged: Tasks-tab Save and Nurture-tab Save call the **exact same** `apiSaveNurture` backend function — there is no code-level difference between them. The reason Tasks tab shows the error far more than Nurture/Outreach is **usage volume**, not a different code path: the side panel's `showApp()` fires on every login **and every time Chrome discards/recreates the side panel** (tab switches, memory pressure — this happens constantly per-recruiter, all day), and it used to fire 3-4 separate concurrent requests every time (usage, clients+clientRatio, tasks). Tasks is the default-visible tab, so it's the one most exposed to that self-inflicted burst, especially multiplied across 50+ recruiters.

**Mitigations implemented so far (extension bumped to v1.6):**
1. `panel.js`'s `api()` now reads the raw response body and classifies failures (Google sign-in wall vs Apps Script platform error vs generic) instead of a generic "check your connection" message, and retries with **jittered** backoff (was fixed 700/1400/2800ms, now has randomized jitter added) so many recruiters' retries don't collide in lockstep.
2. Time Log heartbeat interval widened from a flat 2 min (synchronized across everyone who logged in around the same time) to 4 min + per-recruiter random jitter — still well inside the 30-min stale-close window.
3. **Biggest lever:** new combined endpoints in `Code.gs` — `apiBootstrap(email)` (usage+clients+clientRatio+tasks in ONE execution) and `apiLoginBootstrap(email, password)` (login+timeLogStart+bootstrap in ONE execution). Rewired both `panel.js` (`doLogin()`/`showApp()`) and `Recruiter.html` (`init()`) to call these single endpoints instead of firing 3-6 separate round trips every login and every panel rebuild. This is a **request-volume reduction**, not a quota increase — it lowers how often 50+ people's panel loads collide against the ceiling, it does not raise the ceiling itself.
4. Pattern used throughout: any function whose data is needed both standalone (e.g. `loadUsage()`) AND as part of a bundled response (`applyBootstrapData()`) is split into a `loadX()` (fires the HTTP call) + `renderXData(data)`/`applyXData(data)` (pure render, no network) pair, so the bundled bootstrap payload can feed the same render logic without a duplicate round trip. See `renderUsageData`, `renderClientsData`, `renderClientRatioData`, `applyTasksData`, `applyBootstrapData` in both `panel.js` and `Recruiter.html`.

User confirmed they redeployed Code.gs *after* the bootstrap consolidation and the failure rate was unchanged — ruling out stale-deploy as the explanation. Bumped extension retry window from 3→5 attempts (jittered, capped at 6s/attempt) as a further cushion (v1.7). At this point the working theory was "hard concurrency ceiling, needs Workspace upgrade or sharding" — **this theory turned out to be wrong.**

**ACTUAL ROOT CAUSE (found by the user, confirmed correct):** it's not a shared platform quota at all. The tell the user caught: **some recruiters never see the error, others see it every time** — a random shared quota would hit everyone roughly equally, not the same people consistently. The real trigger: **the task's assigned client is currently Paused.** Clicking Tpl/AI Generate/Custom (or force-saving) on a Tasks-tab item whose client status is "Paused" was producing the flaky-looking error; the identical action on an active client's task always worked. This also explains the earlier "calendar link not substituting" reports — paused clients legitimately have no DTC/calendar link to send, so `{{Calendar Link}}` staying unfilled for those was actually *correct* behavior, not a bug.

**Fix (v1.8, no further platform/concurrency work needed):** added `isClientPaused_(name)` (looks up the client's Status from the already-loaded `clients` array) to both `combined-extension/panel.js` and `gas-webapp/Recruiter.html`. Tasks-tab changes:
- A persistent amber banner on any task card whose client is paused: "⏸ [Client] is currently paused. Wait for it to reactivate, or use Client Rotation on the Nurture tab instead."
- `qTemplate`/`qAI`/`qCustom` now short-circuit with that same message (via `showPausedClientNotice_(i, task)`) *before* making any network call, instead of attempting to generate/save copy for a paused client and surfacing a confusing error partway through.
- `saveTask()` itself was left unguarded — blocking at the copy-generation step already prevents recruiters from ever reaching Save with paused-client content through the normal flow.

**Diagnostic logging added earlier this same investigation (still in place, harmless to leave in)** in `Code.gs`: `doGet` logs `api + email + ms` per call, `apiSaveNurture` logs FU Tracker row count + lookup time, `apiGetClients` logs Daily Assignment row count + DTC-fallback failures + how many clients still lack a calendar link — all visible in the Apps Script Executions log's Logs tab. These were investigating the wrong theory (per-recruiter sheet size) but are useful general-purpose diagnostics going forward, no need to remove them.

**Bottom line for whoever picks this up:** the Save/calendar-link saga across this whole session is now believed fully resolved via the Paused-client guard, not via any of the concurrency/quota mitigations (bootstrap consolidation, jittered retry, heartbeat interval) — those were still worthwhile defensive improvements (they reduce unnecessary request volume regardless) but were not actually fixing the reported symptom. If a *different* flaky-error pattern shows up later that doesn't correlate with paused clients, revisit the concurrency-quota diagnosis using the logging above.

**Files touched across this whole investigation:** `gas-webapp/Code.gs` (apiBootstrap/apiLoginBootstrap, apiCeoMarkFeedbackReviewed, filtered apiCeoGetFeedbackSubmissions, doGet/apiSaveNurture/apiGetClients diagnostic logging), `gas-webapp/Growth.html` (Reviewed button/column in Daily Feedback table), `gas-webapp/Recruiter.html` (bootstrap consolidation, client auto-assign fix, paused-client guard), `combined-extension/panel.js` (bootstrap consolidation, jittered retry, heartbeat interval, client auto-assign fix, paused-client guard), `combined-extension/manifest.json` (version 1.8).

## What this project is

A franchise-recruiting outreach/nurture tool for Gonesh Roy's recruiting team, built as two connected pieces:

1. **`combined-extension/`** — a Chrome extension ("SalesNav Lead Extractor" + "Recruiter Dashboard"). Runs on LinkedIn Sales Navigator pages (screens/scores leads via `content.js`) and provides a side panel (`sidepanel.html` + `panel.js`) recruiters use all day for outreach, follow-ups, and stats.
2. **`gas-webapp/`** — a Google Apps Script web app (`Code.gs` backend + several `.html` frontends) that's the shared backend for everything, AND provides browser-based pages for Admin, Operations, Recruiter (mobile-friendly), Client, and Growth/CEO dashboard use.

Both pieces talk to the **same Google Sheets** and the **same backend `apiXxx` functions** in `Code.gs` — the extension calls them via a `doGet(e)` JSON API router (`fetch(GAS_URL + '?api=...')`), while every `.html` page in `gas-webapp/` calls them **directly** via `google.script.run.apiXxx(...)`. This means any new backend feature is usually just one new `apiXxx` function, reusable from both the extension and any webapp page.

## Folder structure

```
salesnav-v2/
  combined-extension/       ← Chrome extension (load unpacked in chrome://extensions)
    manifest.json
    content.js               LinkedIn page scraping, Profile Selection buttons
    background.js
    popup.html / popup.js
    sidepanel.html            Recruiter Dashboard side panel UI
    panel.js                  ~1500 lines, all side panel logic (Tasks/Outreach/Nurture/Stats)
  gas-webapp/                ← paste these into a Google Apps Script project
    Code.gs                  ~3000 lines, THE backend — all apiXxx functions, CONFIG, column maps
    CSS.html                 shared stylesheet include, used by every .html page
    Login.html               shared login page for ALL user types (recruiter/ops/client/growth)
    Admin.html                admin console: create/approve users, credits, referrals
    Operations.html           Ops dashboard: appointment review, Sales Nav inventory, Recalled button
    Recruiter.html             mobile-friendly recruiter dashboard (mirrors the extension's panel.js flow)
    Client.html                client-facing dashboard
    Growth.html               NEW: CEO/company-growth dashboard (see below)
    DEPLOY.txt                 deployment notes
  Recruiter_Guide.docx, Recruiter_SOP_v2.docx, SalesNav_Workflow_Guide.docx  ← user-facing docs already produced
  *.zip / loose copies of extension files at the folder root (older, superseded by combined-extension/)
```

## Deployment model — READ THIS FIRST

**I (Claude) do NOT have access to the live deployed Apps Script project or the live Chrome extension.** All edits happen on the local source files in `gas-webapp/` and `combined-extension/` on the user's OneDrive-synced folder. For any change to take effect, the user must manually:

- **Webapp (`Code.gs` + any `.html` file changed):** open the Apps Script editor at script.google.com, paste in the updated file contents, then **Deploy → Manage deployments → Edit → New version → Deploy**.
- **Extension (`combined-extension/*`):** reload the unpacked extension in `chrome://extensions`.

There is no CI/CD here — always end a work session by telling the user exactly which files changed and that they need to redeploy.

## CONFIG — every Google Sheet this project touches

All in the top of `Code.gs`:

| Config key | Sheet ID | What it holds |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Claude API key, used by `callAnthropic_()` for every AI Generate/Rewrite call AND the Growth dashboard's Brainstorm chat |
| `ACCESS_SHEET_ID` | `11f1JoawE4n5YLhDuT8HRx2CaciCpNUi0uDxCerf_w4A` | "Recruiters" tab — login credentials, credit balances, user Type (PH/Inhouse/Ops/Client/Growth), Registered/join date |
| `CAMPAIGN_SHEET_ID` | `1iVmXVT65j7HiUIp3ef6OvMuV1FdgFgg_B1YT-eM0r6c` | Holds BOTH the "Leads Ledger" tab (appointment records, one row per booked appt) and the "Master Tracker" tab (one row per client, status/quota/cycle info) |
| `TEMPLATE_SHEET_ID` | `1W8pG1SWl_dMIGziSSGRC2HUkqcsGZSl3mb8mymqJG_k` | Outreach/Nurture copy templates, rotated round-robin |
| `MASTER_DB_ID` | `1Vf6UDslylUn8z0pcG7FQdIhc9sWckO7wRyrmyRx4idQ` | "Sheet1" — every outreach send ever logged (the sends log) |
| `APPT_SHEET_ID` | `1z3RBPj-J8Ro_wbnRUDLnKuZ-M-jaQ8GMkCUBy7mEHBg` | "All Appt" tab — Ops' appointment review/recall workflow |
| `SALESNAV_INV_SHEET_ID` | `1zxzS4TSZUnQOqmkegX3P1Kx356vMyibOtcr1QSnobX4` | Multi-tab spreadsheet: `"Sales Nav Inventory"` tab (seat tracking/expiry) AND `"All Recruiters"` tab (recruiter roster: Type/Status/Name/LI Email/etc — this is the authoritative source for Growth dashboard recruiter breakdowns) |
| `TIME_LOG_ID` | `11MLXf1-eieikzbnTMq8xZKtj4tBXd6DNkooZAVHDhG8` | recruiter time-in-app logging |

Each recruiter also has their **own personal FU Tracker spreadsheet** (ID stored in `RC.SHEET_ID` in Access Control) with tabs "FU Tracker" (contact/status pipeline), "Target Area" (zip/city lookup), and a "Daily Assignment" tab (their assigned clients + calendar links).

## Key column maps (all 0-indexed, per `getRange().getValues()`)

```js
// Access Control "Recruiters" tab
RC = { EMAIL:0, NAME:1, STATUS:2, REGISTERED:3, APPROVED:4, EXPIRES:5, SHEET_ID:6,
       N_LIMIT:7, O_LIMIT:8, N_BAL:9, O_BAL:10, LAST_UPD:11, TYPE:12, PASSWORD:13,
       P_LIMIT:14, P_BAL:15, USED_TODAY:16, USED_ALLTIME:17, REFERRED_BY:18 }
// TYPE is free text, no enum. Known values: PH, Inhouse, Ops/Operations, Client, Growth

// Each recruiter's own FU Tracker spreadsheet, "FU Tracker" tab
FU = { DATE:0, NAME:1, LI:2, CLIENT:3, CALENDAR:4, STATUS:5, NEXT_ACTION:6, CONVO:7,
       REPLY:8, DATE_J:9, DATE_K:10, DATE_L:11, DATE_M:12, SOURCE:13, NOTES:14, CODE:15, TAG:16 }

// Sales Nav Inventory tab (within SALESNAV_INV_SHEET_ID)
SNI = { DATE:0, VENDOR:1, RECRUITER:2, EMAIL:3, PRICE:4, STATUS:5, PAYMENT_STATUS:6,
        TO_BE_EXPIRE:7, DAYS_LEFT:8, SALESNAV_ID:9, EXPIRE_STATUS:10, NOTES:11 }

// "All Recruiters" tab (within SALESNAV_INV_SHEET_ID) — Growth dashboard roster source
ARS = { TYPE:0, STATUS:1, NAME:2, LI_EMAIL:3, WHATSAPP:4, LI_PROFILE:5, WA_GROUP:6,
        WORKING_SHEET:7, PAYMENT_LINK:8, NO_SALES_NAV:9, SN_CONNECTED_DATE:10,
        PROFILE_STANDARD:11, ENGAGED_OTHER:12, USING_LI_OTHER:13, WORK_WEEKENDS:14, NOTES:15 }

// Leads Ledger tab (within CAMPAIGN_SHEET_ID) — appointment records
// 0=Campaign, 3=Name, 4=Email, 8=Company, 9=Title, 10=LinkedIn, 11=Location, 12=State,
// 13=Date Created, 17=Recruiter Name, 28=Client Feedback, 29=Recall
// Campaign naming convention: base name = current cycle, "-1"/"-2" suffix = past cycles
// of the SAME client, "-canc" anywhere = cancelled/excluded entirely.

// Master Tracker tab (within CAMPAIGN_SHEET_ID) — one row per client
// 0=Client/Campaign, 1=Campaign ID, 2=Quota, 3=# Results-Total, 4=Total Results Remaining,
// 5=% Quota Complete, 6=Leads-Last 7 days, 7=Target avg Leads/day,
// 8=Campaign Status (THE status field — Active/Improving/Paused/Wait List/On Track/Smokin/On Fire),
// 9=Last time charged, 10=Action Taken, 11=Cycle, 12=Charge Amt, 13=Payment,
// 14=Cycle Commitment, 15=Current Cycle Start, 16=Payment Notes, 17=Quota Notes,
// 18=Account ID, 19=Account Name, 20=Vertical, 21=Package type, 22=Launch Date

// Master DB "Sheet1" — sends log
// 0=Date, 1=Name, 2=LI Profile, 6=Recruiter Name (D/E/F blank at send time)
```

## The doGet JSON API (extension's only way in)

`Code.gs`'s `doGet(e)`: if `p.api` is set, routes to one `apiXxx` function (full list of ~25 endpoints — login, tasks, clients, contacts, outreach/nurture templates + AI generate/rewrite, save actions, billing/referral stats, credits, etc). If `p.page` is set instead, serves an HTML template — `var map = { login:'Login', recruiter:'Recruiter', admin:'Admin', ops:'Operations', client:'Client', growth:'Growth' }`.

`apiLogin(email, password)` decides which page to redirect to based on `RC.TYPE`: `ops`→Operations, `Client`→Client, `growth`→Growth, else→Recruiter.

## Feature inventory (what's been built, high level)

**Extension (`content.js` + `panel.js`/`sidepanel.html`):**
- Profile Selection (LinkedIn page screening, Reach Out/Skip/Unclear scoring) — content.js only, requires being physically on a Sales Navigator page, **cannot be ported to any webapp page**.
- Outreach tab: auto-loaded rotating templates by type (InMail/Invite/DM), Custom + AI Rewrite, LI duplicate-check, Target Area lookup, LI Screening Process reference guide.
- Nurture tab: contact search, auto-assigned client (with Rotation — CA/NY-aware candidate filtering, excludes paused/no-DTC-link clients), Response Type toggle (Interested/Unsure/Client Rotation/Not Interested), dynamic Unsure-criteria panel (server-driven, not hardcoded), continuing-conversation auto-detect mode (skips reclassification for contacts already mid-conversation), AI Generate/Custom+Rewrite.
- Tasks tab: daily follow-up list, Template/AI/Custom per task, Done/Not Interested/SN Remove/Profile Restricted actions.
- Stats/Billing tab: billing-cycle appointment count ($40/appt), Referral Program (refer another recruiter, earn $5/appt they book for 60 days) with per-referral Active/Closed status.
- Credit system: weekly admin-managed balances for Nurture/Outreach/Profile Selection, no auto-refill, unified "+ Get More" request (one email covers all three).

**Webapp pages:**
- `Login.html` — shared login for every user type, redirects based on `apiLogin`'s `page` field.
- `Admin.html` — create/approve users (incl. Growth type), set credit limits, referral assignment, view all recruiters table.
- `Operations.html` — dashboard tiles (Appointment Review w/ merged Contact Search, Sales Nav Inventory, Daily Tasks placeholder). Appointment Review has a **Recalled button**: writes 6 fields on the SAME "All Appt" row (Identity check, Canceled=Yes, Cancellation reason, Canceled By=FranBooking, On leads ledger as Appointment=No, Sent to Client=N/a) + sets the recruiter's FU Tracker status to "Recalled". Sales Nav Inventory: stats, vendor-grouped expiring-soon, add-new form, search-only history (20s client-side timeout safety net).
- `Recruiter.html` — **full rewrite this project** to match the extension's current Tasks/Outreach/Nurture/Stats flow exactly (everything except Profile Selection), so recruiters can work from a mobile browser. Uses the same `apiXxx` functions via `google.script.run` (a local `api(params, cb)` wrapper dispatches to the right positional-arg call — see the `switch` block near the top of its `<script>`).
- `Client.html` — client-facing dashboard.
- `Growth.html` — **new CEO/company-growth dashboard**, see below.

## Growth.html — CEO dashboard (built this project, actively evolving)

Gated by `RC.TYPE === 'Growth'` (case-insensitive) on every backend call. Admin creates a Growth user the same way as any other (Admin.html → Add User → Type: Growth).

**Backend functions (`Code.gs`):**
- `apiCeoGetDashboard(email)` — the one big aggregation call. Returns:
  - `clients: { onFire, smokin, onTrack, active, improving, paused, waitlist, other, total, names[] }` (Master Tracker Col I status text, longest-specific-match-first)
  - `recruiters: { active, s2aByType: {BD,Inhouse,PH each {appts,sends,s2a}}, top5ByAppts[], nonProductive[] }` — roster sourced from the `ARS` "All Recruiters" tab; `top5ByAppts`/`nonProductive` entries carry `workingAgeDays` (today − Access Control's Registered date, matched by email)
  - `salesNav: { active }`, `appts`/`sends: { today, yesterday, last7, last14, last28 }`, `cany: { overallPct, cyclePct, ... }`, `s2aByRecruiter[]` (full table)
- `apiCeoGetClientDetail(email, clientName)` — drill-down: totalAppts, canyPct, last7/14/28, `trackerInfo` (from `getMasterTrackerInfo_`: cycleNumber, startDate, status, resultsRemaining). No per-recruiter breakdown (removed per user request).
- `apiCeoListOpsUsers(email)` / `apiCeoListRecruiters(email)` — name+email lists sourced from **Access Control** (not the ARS sheet — must be a real login-capable identity), used by the impersonation picker.
- `apiCeoBrainstorm(email, question, history)` — free-form chat, reuses `callAnthropic_()`. `history` is an array of `{role,text}` passed straight through by `google.script.run`.
- Helpers: `isCurrentCycleCampaign_`, `normalizeRecruiterType_` (BD/Inhouse/PH bucketing, checks 'bd' before the broader 'in' substring), `isActiveRecruiterStatus_` (blank status defaults to active; inactive/paused/removed/left = not active).

**Frontend (`Growth.html`):**
- Stat tiles for everything above; bottom-of-page collapsible Top-5/Non-Productive lists (click a button to reveal, data already fetched — no extra round trip).
- Client Lookup dropdown + Get Info.
- **Brainstorm with AI**: floating FAB → right-docked NON-blocking panel (no backdrop — user can still click the rest of the dashboard while it's open). In-memory chat history only, resets on close/navigate/reload.
- **Impersonate Ops/Recruiter by name**: clicking "Operations Panel →" or "Recruiter Panel →" opens a picker modal (dropdown from `apiCeoListOpsUsers`/`apiCeoListRecruiters`), then swaps `sessionStorage.fo_email/fo_name` to the picked person and navigates to `?page=ops`/`?page=recruiter` — no separate password needed. The Growth user's own identity is stashed in `sessionStorage.fo_impersonator_email/name` first.
- **`Operations.html` and `Recruiter.html` both have a matching "👁 Viewing as X — Return to Growth" banner** (shown whenever `fo_impersonator_email` is set) that restores the Growth identity and navigates back to `?page=growth`. Both also clear the impersonator keys on normal logout.

## Environment quirks worth knowing before you start editing

1. **The `mcp__workspace__bash` mount of the OneDrive-synced folder lags behind the real file state** — sometimes by minutes, sometimes it never catches up within a session. `cat`/`wc -l`/`node --check` run against the bash-mounted path can show STALE content even right after a successful `Write`/`Edit`. **The `Read` and `Grep` tools are authoritative** (they read the real file); trust those over bash for verifying `.gs`/`.html` files in `gas-webapp/`. If you need `node --check`, extract the script content via `Read`, then `Write` it into the outputs scratch folder (not the OneDrive path) and run node there.
2. **A lone `\` appearing in `Read` tool output where `//` (or even a single `/`) should be is a display artifact of the Read tool, not real file content.** Always confirm via `Grep` before assuming corruption.
3. **The `Edit`/`Write` tools occasionally append stray NUL bytes (`\x00`) to files in the outputs scratch folder**, breaking `node --check` with confusing EOF errors. Fix: `content.replace(chr(0),'').rstrip()+chr(10)` before checking. If corruption is severe (mid-content truncation), abandon incremental `Edit` and rewrite the whole file fresh via `Write`.
4. **docx-js (the `docx` npm package) violates OOXML's `w:pBdr` schema order if you give a paragraph border all 4 sides** (top/bottom/left/right) — it always emits `top,bottom,left,right` regardless of input key order, but the schema requires `top,left,bottom,right`. Stick to 2-side (top+bottom) borders only.
5. `Recruiter_SOP.docx` in the workspace root is **permission-locked** (overwrite/delete both fail) — the user explicitly declined the delete-permission prompt once already. The current version lives at `Recruiter_SOP_v2.docx`; don't re-request delete permission for the old one without new instruction.
6. Google Sheets values from `getRange().getValues()` are 0-indexed arrays; `sh.getRange(row, col)` calls are 1-indexed. Easy to mix up when adding a new column read.
7. Verification pattern used throughout this project: for any new pure-logic function (ratio calcs, bucketing, date math), write an isolated Node.js script with hand-built fake data + `assert`-style checks in the outputs scratch folder, run it, confirm all pass, **before** trusting the Apps Script version.

## If you're picking this up fresh

1. Read this file, then skim `Code.gs`'s `CONFIG` block and the column maps above — that's 90% of the domain knowledge you need.
2. Everything is additive so far — no breaking changes to existing sheets/columns, only new tabs (`All Recruiters`) and new columns appended at the end where needed.
3. Before touching `Code.gs`, `Grep` for the function you're about to change first — the file is ~3000 lines and growing.
4. Any new feature almost always needs: (a) a new/changed `apiXxx` function in `Code.gs`, (b) frontend wiring in the relevant `.html` page(s), (c) an isolated Node test for any non-trivial logic, (d) a reminder to the user to redeploy.
5. The extension (`combined-extension/`) and the webapp's `Recruiter.html` are intentionally kept in close parity (same tabs, same logic, same `apiXxx` calls) — if you add a Recruiter-facing feature to one, add it to the other too, unless it's LinkedIn-page-dependent (Profile Selection) or Ops-only (Recalled button).
