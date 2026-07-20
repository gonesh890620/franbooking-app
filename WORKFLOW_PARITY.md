# Franbooking Workflow Parity

This file tracks the GAS-to-Vercel/Supabase panel migration.

## Login
- Supabase-first Access Control login.
- Google Sheet fallback remains during transition.
- Role routing: Growth, Operations, Agent, Client, Admin, Recruiter.

## Recruiter
- Tasks from Supabase FU contacts, Sheet fallback during transition.
- Outreach save writes recruiter Sheet and Supabase contacts/outreach logs.
- Nurture save writes recruiter Sheet and Supabase contacts.
- Duplicate LinkedIn check.
- Outreach/nurture templates.
- Target Area lookup.
- Client list and client ratio source from Supabase.
- Stats from Supabase Leads Ledger.
- Daily feedback and leave request submission.
- Extension-compatible `/api/extension` endpoints for migrated recruiter APIs.

## Operations
- Appointment review list and process/recall actions.
- Sales Nav inventory list/add.
- Applicant pipeline list/add/assign agent/status.
- Client tracker list/status update.

## Growth
- Company metrics from Supabase.
- Recruiter oversight list.
- Client tracker.
- Finance costs/client payments.
- Team tasks.
- Reports summary.
- Recent feedback and appointments.

## Agent
- Assigned applicant list.
- Applicant LinkedIn profile update.
- Onboarding checklist save.
- Call outcome/notes.
- Mark hired.

## Client
- Client dashboard stats.
- Recent growth by date.
- State breakdown.
- Lead list search.
- CSV export.

## Admin
- Supabase Access Control list.
- Add/update user.
- Top up credits.
- Reset password.
- Remove/restore access.
- Database count view.

## Still To Verify Against GAS
- Exact Growth drill-down reports and CEO brainstorm/report AI.
- Exact Operations appointment Sheet sync behavior for every Calendly edge case.
- Exact Agent bilingual scripts and every onboarding field.
- Automatic creation/sharing of new recruiter Google Sheets from Admin.
- Chrome extension config cutover to Vercel endpoints after webapp verification.
