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

### Roadmap (not started yet — check in before each)
- **Phase 2 — Admin + Login parity:** GAS-style shared admin login (single env-var username/password, separate from recruiter accounts), expiry/access-window check + pending/expired/removed UI states, Admin's Approve-pending-signup flow, auto-generated password + credential display/copy, required reason on Remove Access, referral assignment, Staff Report tab, Activity Log tab, tabbed layout with modals. Needs new Supabase columns (`referred_by`, `remove_reason`, `remove_date`, `expires`/`approved_at`).
- **Phase 3 — Recruiter parity:** Rotation button + CA/NY-aware filtering, AI Generate/Custom+Rewrite, LI Screening reference card, dynamic Unsure-criteria panel, Time Log heartbeat, paused-client guard banner.
- **Phase 4 — Operations parity:** vendor-grouped Sales Nav inventory, onboarding checklist/status pipeline, merged contact search, full applicant edit.
- **Phase 5 — Growth parity:** the add/update/archive-client + mark-ledger-sent actions noted above, recruiter oversight breakdowns, reports, feedback "mark reviewed" + appointment review/recall in Growth, CEO Brainstorm AI, impersonation, drilldown popups, team task reassignment/recurring tasks, Vendor Management.
- **Phase 6 — Agent/Client polish:** Agent's full 6-step bilingual onboarding with gated Call Outcome select; Client's cycle/date-range filters, feedback/recall tags, charts.
