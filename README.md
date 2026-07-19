# Franbooking App

New Vercel/Next.js migration app for Franbooking.

The existing Apps Script source and Chrome extension are preserved in this repo
for reference and rollback:

- `gas-webapp/`
- `combined-extension/`

## Current Status

This is the first migration scaffold. It does not replace the live GAS app yet.

Built so far:

- Next.js app structure for Vercel
- Recruiter login against the existing Access Control sheet
- Sheet-backed recruiter bootstrap
- Daily Tasks read
- Outreach Save
- Nurture Save
- Not Interested / Profile Restricted actions
- Server-side paused-client guard
- Supabase schema for the future fast operational database

## Local Environment

Copy `.env.example` to `.env.local` and fill in secrets. Never commit
`.env.local`.

Required for Sheets-backed testing:

- `GOOGLE_SERVICE_ACCOUNT_JSON`
- `GOOGLE_SERVICE_ACCOUNT_FILE` for local imports if you do not want to paste
  the JSON into `.env.local`
- `APP_SECRET`
- `ACCESS_SHEET_ID`
- `MASTER_DB_ID`
- `CAMPAIGN_SHEET_ID`
- `TEMPLATE_SHEET_ID`
- `TIME_LOG_ID`
- `APPT_SHEET_ID`
- `SALESNAV_INV_SHEET_ID`
- `FEEDBACK_SHEET_ID`
- `APPLICANT_SHEET_ID`
- `DAILY_TASK_SHEET_ID`
- `COST_SHEET_ID`

Required later for Supabase hot-path migration:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `DATABASE_URL`

## Vercel Import

Use these settings:

- Framework Preset: `Next.js`
- Root Directory: `.`
- Build Command: `npm run build`
- Install Command: default
- Output Directory: default

Add the environment variables from `.env.example` in Vercel before deploying.

## Production Safety

Rotate the Google service account key, Supabase secret key, database password,
and Anthropic key before rollout if any were pasted into chat or committed
elsewhere.

## Scale Plan

For 100+ recruiters, do not keep Google Sheets as the live write path forever.
The intended final design is:

```text
Recruiter webapp / extension
  -> Vercel API
  -> Supabase operational tables
  -> background sync jobs
  -> Google Sheets for reporting/familiar review
```

This keeps recruiter actions fast while preserving Sheets visibility.

## Importing Existing Google Sheets Data

1. Run `supabase/001_initial_schema.sql` in Supabase SQL Editor.
2. Run `supabase/002_full_legacy_mapping.sql` in Supabase SQL Editor.
3. Put all env vars from `.env.example` into `.env.local`.
   For local use, prefer:

```env
GOOGLE_SERVICE_ACCOUNT_FILE=C:\Users\gones\OneDrive\00 Franchise Booking\API\claude-automation-497715-6a3f3ee75144.json
```

   In Vercel, use `GOOGLE_SERVICE_ACCOUNT_JSON` instead because Vercel cannot
   read your local Windows file.
4. Install dependencies locally with `npm install`.
5. Test read access without writing:

```bash
npm run migrate:sheets:dry
```

6. Import data:

```bash
npm run migrate:sheets
```

7. If you need to clear imported rows and re-import:

```bash
npm run migrate:sheets -- --reset
```

The importer reads:

- Access Control / Recruiters
- Campaign Tracker / Master Tracker
- Client DTC URL
- Leads Ledger
- Template sheets
- Master DB
- All Appt
- Time Log
- Feedback / Leave
- Sales Nav Inventory
- Applicants / Agent Log
- Daily Task
- Cost / Client Payment
- Each recruiter-owned `FU Tracker`, `Daily Assignment`, `Target Area`, and
  `Necessary Things` tab from the Sheet ID in Access Control.
