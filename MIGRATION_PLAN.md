# Franbooking Migration Plan

This repo now contains the first Vercel/Next.js migration shell. The legacy
Google Apps Script and Chrome extension folders remain untouched:

- `gas-webapp/`
- `combined-extension/`

## Do Not Deploy From Vercel Yet

If Vercel is showing an import screen while the GitHub repo is empty, do not
click Deploy yet. First push this code to GitHub, then import/deploy.

## Security Rules

Do not commit secrets. Use Vercel Environment Variables for:

- `GOOGLE_SERVICE_ACCOUNT_JSON`
- `SUPABASE_SECRET_KEY`
- `DATABASE_URL`
- `ANTHROPIC_API_KEY`
- `APP_SECRET`

The service account key, Supabase secret, and database password already pasted
in chat should be rotated before production rollout.

## First Migration Scope

The first build is recruiter-only:

- Login against the existing Access Control sheet
- Recruiter dashboard
- Daily Tasks from the existing FU Tracker
- Outreach Save to FU Tracker + Master DB
- Nurture Save to FU Tracker
- Terminal task actions
- Server-side paused-client guard

Current GAS stays live. This app reads/writes Sheets directly through the
Google Sheets API for testing.

## Scaling Direction

Keeping FU Trackers as live Google Sheets is the fastest migration path, but it
cannot guarantee no delay at 100+ recruiters. The included Supabase schema in
`supabase/001_initial_schema.sql` is the intended fast operational database.

Recommended staged path:

1. Test this Vercel app against copied sheets.
2. Pilot with 1-2 recruiters.
3. Import active recruiter contact/task data into Supabase.
4. Make Supabase the hot-path database for recruiter actions.
5. Sync/export back to Google Sheets for reporting or manual review.

## Vercel Environment Variables

Use the `.env.example` names exactly.

For `GOOGLE_SERVICE_ACCOUNT_JSON`, paste the full JSON as one Vercel env var.
The app handles escaped newlines in the private key.

## Vercel Settings

- Framework preset: Next.js
- Root directory: `.`
- Build command: `npm run build`
- Output directory: leave default

## Later Extension Cutover

Only after the Vercel app is tested should the extension stop calling the old
Apps Script URL. At that point, add a configurable API base URL and point it to
the Vercel deployment.
