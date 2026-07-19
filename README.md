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
- `APP_SECRET`
- `ACCESS_SHEET_ID`
- `MASTER_DB_ID`

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
