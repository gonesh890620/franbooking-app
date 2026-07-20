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
