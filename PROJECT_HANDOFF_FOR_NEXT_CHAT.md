# Franbooking Vercel/Supabase Migration Handoff

## Current Goal
Move the existing Google Apps Script webapp and combined recruiter extension workflow into a Vercel/Next.js webapp backed by Supabase, while keeping the current GAS deployment untouched until the new system is verified.

## Repo / Deployment
- GitHub repo: `gonesh890620/franbooking-app`
- Vercel custom domain: `app.franbooking.com`
- Source folders copied for reference:
  - `gas-webapp/`
  - `combined-extension/`
- Do not commit secrets from copied GAS/extension folders.

## Required Runtime Env
Vercel must have:
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY`
- `APP_SECRET`
- `GOOGLE_SERVICE_ACCOUNT_JSON`
- Google Sheet IDs used by migration/sheet fallback

If Admin shows zero users/counts, the usual cause is the Supabase server key missing/invalid in Vercel.

## Database
SQL files already created:
- `supabase/001_initial_schema.sql`
- `supabase/002_full_legacy_mapping.sql`
- `supabase/003_operational_fu_tracker.sql`

After SQL changes, run:
```powershell
npm.cmd run migrate:sheets
```

## Access Model
- Public homepage should only show:
  - `Login`
  - `Admin`
- `/login` is for normal users and routes by Supabase/Access Control role.
- `/admin` has its own login form and accepts only Growth/Admin accounts.
- Growth/Admin can access all panels for verification and management.
- Normal users should only access their role panel.

## Supabase Source Of Truth
Target behavior:
- Supabase is the source for webapp and extension reads/calculations.
- Recruiter-owned Google Sheets remain maintained during transition.
- Recruiter save actions dual-write:
  - Own recruiter FU Tracker Sheet
  - Supabase `contacts` and `outreach_logs`
- Future extension cutover should call `/api/extension` on Vercel instead of GAS.

## Implemented Panels

### Login
- Supabase-first login.
- Sheet fallback during transition.
- Role routing for Recruiter, Growth, Operations, Agent, Client, Admin.

### Recruiter
Current web panel has:
- Tasks
- Outreach
- Nurture
- Stats
- Feedback
- Leave
- Credit pills
- Get More Credit button
- Template loading
- Duplicate LinkedIn check
- Target Area lookup
- Contact search
- Supabase-first reads with Sheet fallback for some FU actions
- Dual-write save for outreach/nurture

Still needs exact visual/function parity with GAS/extension:
- AI rewrite/generate behavior
- Client rotation UI polish
- Unsure criteria selection UI
- Bulk CA/NY UI polish
- Exact billing/referral report layout

### Admin
Current web panel has:
- Admin login on `/admin`
- Logout
- User list
- Add/update user
- Top up credits
- Reset password
- Remove/restore access
- Database counts

Known important dependency:
- Create/update requires valid Supabase server key in Vercel.

Still needs:
- Automatic Google Sheet creation/sharing for new recruiters.
- Exact welcome email and copy-credential workflow from GAS.

### Operations
Current web panel has:
- Appointment review
- Process/recall actions
- Sales Nav inventory list/add
- Applicant pipeline list/add
- Assign agent
- Client tracker status update

Still needs exact GAS parity for:
- Calendly edge cases
- Find-client fallback
- Sales Nav vendor/payment edge flows
- Wait List and Ledger CSV email copy polish

### Agent
Current web panel has:
- Assigned applicant list
- LinkedIn profile update
- Onboarding checklist
- Call outcome/notes
- Mark hired

Still needs exact GAS parity for:
- Full bilingual scripts
- Every checklist/date field from `Agent.html`
- Ownership checks by assigned agent email if names differ.

### Client
Current web panel has:
- Dashboard stats
- Growth by date
- State breakdown
- Lead search
- CSV export

Still needs:
- Exact chart visuals from GAS.
- Exact campaign cycle filtering parity.

### Growth
Current web panel has:
- Dashboard metrics
- Recruiter list
- Client tracker
- Finance add cost/payment
- Team tasks
- Reports summary
- Recent feedback/appointments

Still needs exact GAS parity for:
- All Growth drilldown popups/reports
- CEO brainstorm/report AI
- Link open vs booking
- Recruiter payment reports and Wise account workflows
- Vendor profile/order/issue system

## Main GAS Files To Compare
- `gas-webapp/Code.gs`
- `gas-webapp/Recruiter.html`
- `gas-webapp/Admin.html`
- `gas-webapp/Operations.html`
- `gas-webapp/Agent.html`
- `gas-webapp/Client.html`
- `gas-webapp/Growth.html`
- `gas-webapp/Login.html`

## Current User-Reported Problems To Verify
- Recruiter Stats was blank/zero.
- Get More Credit button was missing.
- Admin should have its own login and logout.
- Public homepage should only show Admin/Login.
- Admin Create/Update User was not working.
- Growth page showed “Unable to Open.”
- Design needs to be closer to the existing GAS workflow, not placeholder dashboards.

## Latest Fixes Made In This Session
- Supabase admin helper now accepts `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SERVICE_KEY`, or `SUPABASE_SECRET`.
- Admin no longer silently converts Supabase errors into all-zero dashboards.
- Homepage reduced to Admin/Login.
- `/admin` now has its own login form.
- Admin console has logout.
- Recruiter Get More Credit restored.
- Recruiter stats now includes appointments, FU contacts, and outreach saves.

## Data Architecture Cutover — Phase 1 (this session)

Full plan at `C:\Users\gones\.claude\plans\cosmic-tumbling-sprout.md`. Target architecture, confirmed with the user:

| Domain | Source of truth |
|---|---|
| Recruiter FU Tracker, Target Area, Daily Assignment | **Google Sheets only** |
| Master Tracker (client roster/status) | **Dual write**: Supabase `campaigns` + Master Tracker sheet |
| Leads Ledger, everything else (agent/recruiter logs, feedback, leave, templates, credits, applicants, Sales Nav inventory) | **Supabase only** |

Phase 1 (data-architecture correctness) is done:
- `lib/legacyRecruiter.ts`: `getDailyTasks`, `getContacts`, `checkLiDuplicate`, `getClients`, `getTargetArea`, `getClientRatio` are now Sheets-only (previously several of these read/wrote a Supabase `contacts`/`recruiter_target_areas`/`recruiter_client_assignments` mirror instead of, or ahead of, the recruiter's actual Google Sheet). `saveNurture`, `markStatus`, `saveOutreach`, `bulkSetCany` no longer dual-write into Supabase `contacts` — Sheets is the only write target for FU Tracker data now. Deleted the now-dead `upsertSupabaseContact`/`findOrCreateSupabaseClient`/`getSupabaseDailyTasks`/`deriveTaskFromContact` helpers.
- Added `setFuStatusOnly` (single-cell FU Tracker status write) and `bootstrapRecruiter` now also returns `clientRatio`.
- New `lib/masterTracker.ts`: `updateMasterTrackerClientStatus(clientName, currentStatus, pausedReason)` writes the Master Tracker Google Sheet's Current Status / Paused Reason columns.
- `app/api/operations/route.ts`: `updateClientStatus` now dual-writes Supabase `campaigns` + the Master Tracker sheet. `recallAppointment` no longer touches the now-Sheets-only `contacts` table — it writes the recruiter's FU Tracker sheet status cell instead (via `setFuStatusOnly`) and now sets the full GAS-equivalent field set on the Supabase `appointments` row (`identity_check`, `canceled`, `cancellation_reason`, `canceled_by`, `on_leads_ledger`, `sent_to_client`) — also now requires a reason, matching GAS.
- `lib/sheets.ts`: added `listSheetTitles`/`findSheetTitleExact` helpers.
- `npm run build` passes. **Not yet manually verified against live Sheets/Supabase** — no automated test suite exists for these paths; next session (or the user) should smoke-test: Outreach/Nurture save writing to the real FU Tracker sheet with no `contacts` row created, Target Area / Daily Assignment reading real sheet data, and an Operations client-status change/appointment-recall updating both Sheet and Supabase.
- **Known follow-up, not fixed yet:** `lib/growthData.ts`'s Growth dashboard still reads the Supabase `contacts` table for a "sends last 7 days" stat. Since `contacts` no longer gets new rows, this stat will go stale going forward — repointing it belongs to Phase 5 (Growth parity) below, not this data-architecture pass.
- **Scope note vs. the original plan:** GAS's `apiCeoAddClient`/`apiCeoUpdateClient`/`apiCeoArchiveClient`/`apiCeoMarkLedgerSent` (adding/archiving a client, marking a ledger cycle sent — 4-sheet writes across Accounts/Master Tracker/Customer_Roles/Client DTC URL, with auto-numbered Account/Campaign IDs) were **not** built in this pass. They're net-new Growth features with no existing Next.js UI or route today, not fixes to an existing wrong-data-source bug, so they've been moved to Phase 5 (Growth parity) where they belong thematically.

## Phase 2 — Admin + Login parity (done this session)

- **New env vars required in Vercel:** `ADMIN_USERNAME`, `ADMIN_PASSWORD` (shared Admin console credential, separate from any recruiter/Growth account — matches GAS's `CONFIG.ADMIN_USERNAME`/`ADMIN_PASSWORD`). Falls back to a dev-only placeholder if unset — **set real values in Vercel before relying on this in production.** Optional: `ACCESS_DAYS` (default 30), `DEFAULT_N_LIMIT`/`DEFAULT_O_LIMIT`/`DEFAULT_P_LIMIT` (default 200/10/500), all matching GAS defaults.
- **Run `supabase/004_admin_login_parity.sql` against Supabase** — adds `approved_at`, `expires_at`, `referred_by`, `remove_date`, `remove_reason` to `app_users`.
- `/admin` now requires the shared Admin credential (`components/AdminLogin.tsx` → `/api/auth/admin-login`), not a Growth-typed account's email/password — this matches GAS, where Admin.html (user management) and Growth.html (CEO dashboard) are two separate logins. A Growth account can no longer open `/admin`; it still opens `/growth` normally. Gating uses the new `isSuperAdmin()` in `lib/roles.ts` (session `type === "superadmin"`), checked in `app/admin/page.tsx` and `app/api/admin/users/route.ts`.
- `/api/admin/users` actions rewritten: `create` now auto-generates a password when left blank and accepts `referredBy`; new `approve` action (pending → approved, sets `expires_at`, matches GAS `apiAdminApprove`); new `remove` action requires a reason (matches GAS `apiAdminRemove`); new `restore` action refreshes the expiry window; `resetPassword` now auto-generates instead of taking a typed password; `topup` fixed to match GAS `apiAdminSetLimit` semantics (limit is overwritten per type, balance is additive, blank fields are left untouched — previously it force-added to balance and used `Math.max` on the limit for all three types every time); new `staffReport` and `activityLog` actions (reads `app_users` and `app_audit_log`/`ai_cost_logs`).
- `lib/legacyRecruiter.ts`'s `loginSupabaseUser` now auto-flips `status` to `expired` when `expires_at` has passed, matching GAS `apiLogin`'s expiry check — previously there was no expiry concept at all.
- `components/AccessLogin.tsx` now shows distinct messaging for pending/removed/expired/not-found login attempts instead of one generic error.
- `components/AdminConsole.tsx` rewritten with tabs (Users / Add User / Staff Report / Activity Log, reusing the existing `.tabs`/`.tab` CSS already used by `RecruiterDashboard.tsx`), an Approve button on pending rows, a required-reason prompt on Remove, and a credential display/copy box after Create or Reset Password.
- `npm run build` passes. **Not yet manually verified** — needs the SQL migration run and `ADMIN_USERNAME`/`ADMIN_PASSWORD` set in Vercel before it's testable end-to-end.

## Phase 3 — Recruiter parity (done this session)

- **New env var:** `ANTHROPIC_API_KEY` — required for AI Generate/Rewrite to work (already listed in `MIGRATION_PLAN.md`'s required Vercel env vars, but now actually wired up). Optional model note: GAS used `claude-sonnet-4-6` for Nurture AI; ported to `claude-sonnet-5` (current model) since the old ID may not be callable anymore. Outreach AI still uses `claude-haiku-4-5-20251001`, unchanged from GAS.
- New `lib/ai.ts` (Anthropic call + GAS's exact prompt text for Outreach InMail/DM/Invite generate, Outreach rewrite, Nurture generate per nurture-type, Nurture rewrite, plus `COPY_QUALITY_RULES`), `lib/credits.ts` (credit check/decrement/refund against Supabase `recruiter_credits`, matching GAS `checkAndDecrementCredit_` — this didn't exist before; credits were previously only ever added, never spent), `app/api/recruiter/ai/route.ts`.
- Recruiter Outreach and Nurture tabs now have **AI Generate** and **AI Rewrite** buttons, spending outreach/nurture credits respectively (refunded automatically on API failure, matching GAS).
- **Rotation button** added next to the Nurture Client selector — picks the least-loaded non-paused client using `boot.clientRatio` (now returned by bootstrap, see Phase 1) and the Daily Assignment paused-status list.
- **Dynamic Unsure-criteria panel** — selecting nurture type "Unsure" now loads and displays the server-driven criteria list (`getUnsureCriteria`, already existed in `lib/legacyRecruiter.ts` but was unused by the UI).
- **Paused-client guard** on the Nurture tab: an amber banner appears and Save is disabled when the selected client is paused, matching GAS's Tasks-tab guard (which already existed) now also on Nurture.
- **Time Log heartbeat**: new `lib/legacyRecruiter.ts` `timeLogStart`/`timeLogPing`/`timeLogEnd` (Supabase `time_logs` table, already existed in schema but was unused) + `app/api/recruiter/timelog/route.ts`. `RecruiterDashboard.tsx` starts a session on login, pings every ~4 min (jittered), ends on logout/unmount.
- **Not done / deliberately skipped:** the LI Screening reference card (static reference text/checklist from the extension) — purely informational, no functional impact, lowest priority of the Phase 3 list. Can be added later if wanted.
- `npm run build` passes. **Not yet manually verified** — needs `ANTHROPIC_API_KEY` set in Vercel and a real recruiter session to test AI Generate/Rewrite, Rotation, and the Time Log heartbeat end-to-end.

## Phase 4 — Operations parity (done this session)

- `lib/operationsData.ts`: Sales Nav rows now get a computed `salesNavSummary` (`stats.totalUsed/activeNow/expiredSoFar`, `expiringByVendor` grouped and sorted, `vendorsDue` grouped and sorted) using GAS's exact expiry math (29-day expiry, 3-day notify window).
- `components/OperationsConsole.tsx` Sales Nav tab rewritten: stat tiles, a Vendor Payments Due panel, and a collapsible Expiring-Soon-by-vendor panel (click a vendor to expand), replacing the old flat all-rows dump.
- Recruiting Pipeline tab: applicant status is now the real 6-value GAS list (`Applied, Whatsapp Message Sent, Accepted, Rejected, Onboarding, Hired`) instead of free text, and each row has an **Edit** button for a full-field edit (name/email/phone/LI/position/notes) via a new `updateApplicant` action in `app/api/operations/route.ts`.
- New merged **Contact Search** on the Appointments tab — searches the Master DB sends log AND every approved recruiter's own FU Tracker sheet (`lib/opsSearch.ts`, `app/api/operations/search/route.ts`), matching GAS `apiSearchContacts`. Capped at 40 results / 60 recruiters scanned to keep it fast; this hits the Sheets API per recruiter so it's on-demand (2+ characters), not loaded automatically.
- Appointment Recall now requires a typed reason (prompt), matching GAS/Phase 1's `recallAppointment` requirement.
- `npm run build` passes. **Not yet manually verified** — needs a real Ops session with populated `sales_nav_inventory`/`applicants` data and at least one recruiter with a real FU Tracker sheet to test search against.

## Phase 5 — Growth parity (done this session, partial)

- **Client Tracker can now write**, not just read: `updateClientStatus` added to `app/api/growth/route.ts`, reusing the same dual-write (Supabase `campaigns` + Master Tracker sheet) built in Phase 1/4 for Operations.
- **Feedback "mark reviewed"**: dashboard now only shows unreviewed feedback with a Reviewed button (`daily_feedback.reviewed`, matching GAS `apiCeoMarkFeedbackReviewed`).
- **CEO Brainstorm AI**: floating chat FAB + panel, `lib/ai.ts` `brainstormWithCeo` + `brainstorm` action in the growth route. Simplified vs. GAS: only the free-form chat mode was ported, not the "report" mode that pulls an exhaustive per-recruiter 14-day S2A/Top-5/Non-Productive/All-Appt snapshot — this port's Growth payload doesn't compute that breakdown yet (see "still missing" below), so the chat is grounded in the simpler stats already on the dashboard instead.
- **Impersonation**: "Operations Panel →" / "Recruiter Panel →" buttons open a picker (`listOpsUsers`/`listRecruiters` actions), then `impersonate` swaps the session to that user while stashing the Growth identity (`SessionUser.impersonatorEmail/Name`, new fields in `lib/auth.ts`). Both `RecruiterDashboard.tsx` and `OperationsConsole.tsx` show a "Viewing as X — Return to Growth" banner (new `/api/auth/return-impersonation` route) when impersonating. Note: this app's session is a signed cookie, not GAS's `sessionStorage` — same end-user behavior, different mechanism.
- **Team task reassignment**: `reassignTask` action + a Reassign button (prompts for email/name) on each task.
- **Fixed the stale "Sends Last 7 Days" stat** flagged in the Phase 1 handoff notes: `lib/growthData.ts` now counts from `outreach_logs` (still live-written, Supabase-only per the architecture) instead of the now-Sheets-only `contacts` table, which had gone stale after Phase 1.
- **Not done — still missing, larger lower-priority items:** recruiter oversight breakdowns (S2A by type, online status, leave lists, directory/billing reports), full Reports section, appointment review/recall directly inside Growth (Operations already has it), drilldown popups (client detail, recruiter detail), recurring tasks, Vendor Management section, and GAS's `apiCeoAddClient`/`apiCeoUpdateClient`/`apiCeoArchiveClient`/`apiCeoMarkLedgerSent` (net-new 4-sheet client onboarding flow, deferred from Phase 1 — still not built).
- `npm run build` passes. **Not yet manually verified** — needs a real Growth session to test Brainstorm, impersonation round-trip, and feedback review.

## Phase 6 — Agent/Client polish (done this session)

- **Agent**: `AgentConsole.tsx` rewritten as GAS's real 6-step gated flow (Create Group → Thank You/Schedule → Run the Call → Pre-Screening → Outcome → Onboarding), with the full bilingual (EN/PH) call scripts ported verbatim into `lib/agentScripts.ts` and a language toggle. Step 6 (Onboarding) only appears once Call Outcome = Interested; within it, the SOP/credentials/Zoom/sends-verification fields only unlock once the LI Profile Check = Passed (Failed shows a disqualified notice and stops), matching GAS exactly. Mark Hired only appears once Sends Verified is checked. All step fields are stored flat in `agent_logs.answers` (the old 9-item flat `checklist` column is no longer written — the step flow superseded it).
- **Client**: `lib/clientPortalData.ts` now derives a `cycle` tag per lead (from the `-N` campaign-name suffix convention) and returns the distinct cycle list; `ClientPortal.tsx` gained a Cycle filter dropdown, a From/To date-range filter, Feedback/Recall tag badges per lead row (from `leads_ledger.client_feedback`/`recall`, already in the schema but unused until now), and a simple dependency-free bar chart (`BarChart` component, proportional-width bars) replacing the plain Growth/States lists — not Chart.js line/pie parity, but a real visual instead of a text list.
- `npm run build` passes. **Not yet manually verified** — needs a real Agent session with an assigned applicant, and a Client session with real `leads_ledger` rows (including some with a `-N` cycle suffix and feedback/recall values) to check visually.

This closes out all 6 phases of the original plan. See the "Not done" notes under Phases 3 and 5 above for the handful of deliberately-deferred lower-priority items (LI Screening reference card, full recruiter oversight breakdowns/reports, drilldown popups, Vendor Management, recurring tasks, and the 4-sheet Add/Update/Archive Client + Mark Ledger Sent flow).

## Growth Panel Rebuild — Stage 1 (this session, in progress)

The user asked for a full redesign of the Growth panel to match GAS's real `Growth.html` design/workflow exactly, not the simplified version built in Phase 5. Two research passes (full `Growth.html` read + full `apiCeoGetDashboard`/related Code.gs logic read) confirmed the real GAS Growth panel is roughly the size of everything else built this session combined: 8 sections (Dashboard/pinned block, Recruiters, Client Tracker, Reports w/ 3 sub-tabs, Link Open vs Booking via Google Analytics, Finance+Recruiter Payments, Daily Task+Recurring, Vendor Management), ~60 backend endpoints, ~25 modal types.

**Agreed build order with the user:** Stage 1 = pinned block + Recruiters section (done). GA4-backed "Link Open vs Booking" was requested to be built eventually too (not skipped) — needs the user's GA4 property ID + confirmation the Google service account has Analytics Data API access before that can start; not begun yet. Client Tracker (full Add/Update/Archive Client + Mark Ledger Sent, slot-check/vacation-check badges), Reports, Finance+Recruiter Payments, Daily Task+Recurring, Vendor Management are separate future stages.

**Key data-architecture decisions made (confirm with user if revisited):**
- Calendar-day windows (midnight-anchored) for Today/Yesterday/Last7/14/28, NOT GAS's wall-clock-relative-to-page-load rolling windows — a deliberate, confirmed deviation for predictability.
- Client Status bucketing replicates GAS's exact substring-cascade priority (fire > smok > track > improv > pause > wait > activ > other) against `campaigns.campaign_status`, not an enum.
- "Sales Nav active" standardized on the computed-29-day-expiry definition (matches Phase 4's Operations Sales Nav logic) — GAS itself has two disagreeing definitions across different panels; this port picked one.
- New Nurture Sent / FU Sent stats are read LIVE from each recruiter's actual FU Tracker Google Sheet (`lib/growthDashboard.ts`'s `getNurtureFuStats`), NOT from the Supabase `contacts` mirror — consistent with the FU-Tracker-is-Sheets-only architecture rule; this is the slowest panel (scans every recruiter's sheet) so it's lazy-loaded only when the Recruiters tab is first opened, matching GAS's own perf-driven split.
- S2A/Top5/Non-Productive/Sends-by-recruiter are joined by `recruiter_id` (a real FK), not by lowercased display Name like GAS does — a deliberate data-quality improvement over GAS's fragile name-matching, made possible because `migrate-sheets.ts` already resolves names to IDs at import time.

**Bugs found and fixed in `scripts/migrate-sheets.ts` while building this** (pre-existing, not introduced this session):
1. Time Log import set `last_activity_at` to the import's own run-time for every row instead of the sheet's actual "Last Activity" column — this would have made "Inactive 5+ Days" always show nobody, no matter how stale someone really was. Fixed with a new `parseTimeLogTimestamp` helper that combines the row's Date column with its Start/End/Last-Activity time cells.
2. `appointments` never captured the "Responses" column (needed for recall-reason categorization: Looking for Job / Vendor / Other) — added `responses` to the `appointments` table and import.
3. The "Wait List" tab (prospective clients not yet launched) was never imported at all — added a `wait_list` table + `migrateWaitList`.

**New files:** `lib/growthDashboard.ts` (all Stage-1 computations), `supabase/005_growth_dashboard_support.sql` (run this before the real data reset). **Changed:** `scripts/migrate-sheets.ts` (bug fixes above), `app/api/growth/route.ts` (+`onlineStatus`/`leaveToday`/`leaveTomorrow`/`nurtureFuStats`/`s2aRange` actions), `app/growth/page.tsx`, `components/GrowthConsole.tsx` (pinned block + full Recruiters section with lazy-loaded sub-panels and click-a-number drilldown modals), `app/styles.css` (`.metric.clickable`).

**Status update — the real reset ran, found and fixed 2 more bugs, and the user gave a second round of feedback:**

The real `--reset` was run. First attempt **crashed and left production partially wiped**: `migrateDtcLinks` threw an uncaught exception (a `clients` upsert with a missing NOT NULL `name` — root cause not fully pinned down, worked around instead — see below), and since `main()` had no per-step error isolation, every migration step after that point (leads ledger, outreach logs, appointments, time logs, sales nav, applicants, tasks, costs, payments) silently never ran, leaving those tables empty. Also found: the `contacts` table DELETE was timing out (too large for one statement), which is what caused `clients`' DELETE to fail on an FK constraint in the first place.

**Fixed in `scripts/migrate-sheets.ts`:**
- `resetImportedTables` now paginates deletes in batches of 500 instead of one giant DELETE per table (avoids the statement timeout).
- `main()` now wraps every migration step in a `runStep()` helper that catches and logs instead of throwing — one step failing can never again silently skip everything after it.

Re-ran successfully: all tables populated (leads_ledger 434, outreach_logs 39,912, appointments 515, time_logs 1,390, sales_nav_inventory 320, etc.), no failed steps.

**Second round of user feedback, addressed this session:**
- Client-side bug: the 4 lazy Recruiters-tab loads (`onlineStatus`/`leaveToday`/`leaveTomorrow`/`nurtureFuStats`) were bundled behind one `Promise.all` in `GrowthConsole.tsx` — the old live-Sheet nurture/FU scan being slow meant NONE of the 4 panels rendered until all 4 resolved. Fixed: each now sets its own state independently as soon as its own request resolves.
- **Explicit direction: Growth's reporting reads should always come from Supabase, never live Google Sheets.** `getNurtureFuStats` in `lib/growthDashboard.ts` was rewritten to read the Supabase `contacts` mirror (date_j/k/l/m columns) instead of live-scanning every recruiter's FU Tracker sheet. This overrides what Phase 1 originally did for this one read path — the FU Tracker *operational* read/write (Recruiter panel itself) is still Sheets-only; only this Growth-reporting aggregate moved to Supabase.
- **Explicit direction: every Growth panel write action dual-writes Supabase first, then the matching Google Sheet.** New `lib/growthSheets.ts` adds Sheet-write-through for Add Cost (→ COST_SHEET_ID "Purchase" tab), Add Client Payment (→ CAMPAIGN_SHEET_ID "Client Payment" tab), and Add/Update/Reassign Task (→ DAILY_TASK_SHEET_ID "Tasks" tab, matched by a `legacy_id` — freshly-created tasks get a generated `wa-<timestamp>` id so later status/reassign edits can find the right Sheet row). Sheet writes are best-effort (wrapped in try/catch, logged, non-blocking) so a Sheets hiccup never breaks the Supabase write.
- **Design polish**: tab labels changed from lowercase to Title Case with icons (📊 Dashboard, 👥 Recruiters, 🏢 Client Tracker, 💰 Finance, 📋 Daily Task, 📈 Reports), section headers got icons throughout, and the Tasks tab's status values were fixed to match GAS's actual vocabulary (`Completed`, not `Done` — this matters now that the Sheet is shared).
- **Reports tab rebuilt**: replaced the 4 meaningless stat tiles with a real, sortable **Recruiter Directory** table (Recruiter/Type/Age/Sales Nav Active/Sales Nav Total/Appts Total/Sends Total/Sends Yesterday — click a column header to sort), entirely Supabase-sourced, matching GAS's `apiCeoGetRecruiterDirectory` structure. New `getRecruiterDirectory()` in `lib/growthDashboard.ts`, new `recruiterDirectory` action.
- **User also asked to delete unnecessary Supabase tables.** An Explore-agent audit of actual `.from("table")` usage across `app/`+`lib/` (excluding the migrate script) is in progress/complete by the time you read this — check for a follow-up note or ask the user whether the drop list was ever confirmed and executed. Dropping tables is irreversible schema destruction, not just a data wipe — do not run any `DROP TABLE` without an explicit, itemized confirmation from the user first.

**GA4 (Link Open vs Booking) status:** user wants it built (not skipped). Found GAS's exact setup: property ID `543445631` ("FranBooking Calendly"), uses Apps Script's Advanced "Analytics Data API" Service (owner's own Google auth, not a service account) with events `invitee_event_type_page`/`invitee_select_time`/`invitee_meeting_scheduled`. For the Next.js port, told the user to (1) grant the existing Sheets-reading service account (`claude@claude-automation-497715.iam.gserviceaccount.com`) Viewer access in GA4 Admin → Property Access Management, and (2) enable the "Google Analytics Data API" for that service account's GCP project (`claude-automation-497715`). Not yet started building this — waiting on that access grant.

**`npm run build` passes** after all of the above. Not yet manually click-tested in a browser by Claude (no browser tool available in this environment) — the user is testing live and reporting back issues per this note's trail.

## Third round: architecture reversal (Recruiter Supabase-primary) + extension cutover

The user gave explicit new direction that reverses part of Phase 1: Outreach save, Nurture save, status changes, and CA/NY flagging should write **Supabase first** (fast, primary — the recruiter never waits on Sheets), then the recruiter's own FU Tracker sheet **second, best-effort** (a Sheets hiccup never blocks/fails the save). Reads (Daily Tasks, Contacts, LI duplicate check, Client Ratio) are Supabase-primary with a Sheets fallback for recruiters with no Supabase data yet. **Target Area and Daily Assignment are explicitly unchanged — still Sheets-only** (confirmed with the user). The Master LI outreach log (`outreach_logs`) is now Supabase-only — the old `MASTER_DB_ID` Google Sheet append was removed.

Implemented in `lib/legacyRecruiter.ts` by restoring the pre-Phase-1 Supabase-write helpers (`upsertSupabaseContact`, `findOrCreateSupabaseClient`, `getSupabaseDailyTasks`/`deriveTaskFromContact`, recovered from git history at commit `8ea4f0f^`) and reordering every write to Supabase-first/Sheets-second-non-blocking.

**Extension cutover (also done, confirmed explicitly by the user):** the Chrome extension (`combined-extension/`) previously called the GAS web app URL directly — this was deliberately deferred until now. Cut over:
- `combined-extension/panel.js` and `background.js`: `GAS`/`GAS_URL` constants now point to `https://app.franbooking.com/api/extension` (confirm this matches the actual deployed domain — pulled from `middleware.ts`'s `PRODUCTION_HOST` constant). The wire protocol (`?api=xxx&email=...` query string) was already identical, since `app/api/extension/route.ts` was built to match GAS's param names from the start — most calls needed zero changes.
- Time Log calls (`timeLogStart`/`Ping`/`End`) were on GAS's row-number/tab-name scheme; switched to a `sessionId`-based contract instead (matches this app's `time_logs` table, which uses a UUID primary key, not a sheet row). Added an `alreadyClosed` signal to `timeLogPing` (checks if the update actually matched a row) so the extension's heartbeat correctly stops when a session was auto-closed server-side — this parity behavior would otherwise have been silently lost.
- Filled in the remaining endpoints `app/api/extension/route.ts` was missing per `EXTENSION_CUTOVER.md`'s required list: `loginBootstrap` (combined login+bootstrap+timeLogStart), `saveStatus`, `aiOutreach`/`aiRewriteOutreach`/`aiNurture`/`aiRewriteNurture` (reuses `lib/ai.ts` + `lib/credits.ts`, same credit-spend/refund-on-failure behavior as the webapp), `checkProfileCredit`/`logProfileSelection` (Profile Selection feature — credit-metered, not AI-cost, logs to `app_audit_log`).
- `manifest.json` bumped to 1.9, `host_permissions` updated (dropped `script.google.com`/`script.googleusercontent.com`, added `app.franbooking.com`).
- All extension `.js`/`.json` files pass `node --check` / `JSON.parse`. **Not yet tested in a real browser** — per this project's established deployment model (see `PROJECT_CONTEXT.md`), the user must manually reload the unpacked extension in `chrome://extensions` to test; Claude has no access to the live deployed extension.

**If picking this up fresh:** re-verify the `app.franbooking.com` domain assumption is correct before telling the user to reload the extension, and manually smoke-test at minimum: login (loginBootstrap), Outreach save, Nurture save, LI duplicate check, and the Time Log heartbeat (confirm a session starts, pings, and ends correctly, and that reopening the side panel resumes the same session same-day).

**Unused-table cleanup resolved:** an Explore-agent audit grepped every `.from("table")` call across `app/`+`lib/` against all 34 tables + the `fu_tracker_master` view from `supabase/001` through `005`. Confirmed zero-risk (never populated, never used) candidates: `legacy_sources`, `legacy_row_links`, `client_accounts`, `recruiter_payments`, and the view `fu_tracker_master`. A second tier — `recruiter_client_assignments`, `client_dtc_links`, `recruiter_target_areas`, `recruiter_necessary_things`, `recurring_team_tasks` — holds real synced data but is never read by the app; the user chose to leave those alone for now (recommended "zero-risk only" option). `supabase/006_drop_unused_tables.sql` drops the 4 tables + view (child-before-parent order for the `legacy_row_links`→`legacy_sources` FK) — **run this in the Supabase SQL editor**, nothing else needed on the app side since nothing references these.
