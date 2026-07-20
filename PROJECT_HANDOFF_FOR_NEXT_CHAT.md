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

## Roadmap (not started yet — check in before each)
- **Phase 5 — Growth parity:** the add/update/archive-client + mark-ledger-sent actions noted above, recruiter oversight breakdowns, reports, feedback "mark reviewed" + appointment review/recall in Growth, CEO Brainstorm AI, impersonation, drilldown popups, team task reassignment/recurring tasks, Vendor Management.
- **Phase 6 — Agent/Client polish:** Agent's full 6-step bilingual onboarding with gated Call Outcome select; Client's cycle/date-range filters, feedback/recall tags, charts.
