# Deploy Checklist — GitHub / Vercel / Supabase

Written after the design-system port + Recruiter rebuild session.
Work top to bottom. Each step says how to confirm it worked.

Local `.env.local` is already updated with all three missing vars, so
`npm run dev` works immediately. Everything below is about **live**.

---

## 0. Before anything — run the build locally

The sandbox used for the code changes couldn't run this project's
`node_modules` (they're Windows-built native binaries), so `npm run build` was
never executed. A fast typecheck passed clean, but that is not the same thing.

```powershell
npm.cmd run build
```

If this fails, stop and fix it before pushing — Vercel will fail the same way.

---

## 1. GitHub — push the commit

One commit is staged locally and ready. It contains no secrets (verified:
no API key, no admin password, no admin username; `gas-webapp/` and
`combined-extension/` remain untracked via `.gitignore`).

```powershell
git log --oneline -1     # should show: Port GAS design system verbatim...
git push origin main     # or your branch name
```

Confirm: the commit appears at
`https://github.com/gonesh890620/franbooking-app`.

---

## 2. Vercel — add three environment variables

Vercel does not read `.env.local`. These must be set in the dashboard.

**Project → Settings → Environment Variables.** Add each to *all* environments
(Production, Preview, Development):

| Name | Value |
|---|---|
| `ANTHROPIC_API_KEY` | the `sk-ant-...` value from `gas-webapp/Code.gs` line 8 |
| `ADMIN_USERNAME` | see `.env.local` (not written here — do not commit credentials) |
| `ADMIN_PASSWORD` | see `.env.local` (not written here — do not commit credentials) |

Copy the values out of `.env.local` (already populated) or `Code.gs` — they
are deliberately not written into this file.

⚠️ **If you use the Vercel CLI instead of the dashboard, quote the password.**
If it ends in a special character like `$`, it will be eaten by PowerShell/bash
otherwise: `vercel env add ADMIN_PASSWORD` then paste the value at the prompt
inside single quotes. In `.env.local` it's fine as-is — a trailing `$` there
is not expanded.

Also confirm these are already set (from earlier sessions):
`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `APP_SECRET`,
`GOOGLE_SERVICE_ACCOUNT_JSON`, and every `*_SHEET_ID` in `.env.local`.

> Note: locally the service account is `GOOGLE_SERVICE_ACCOUNT_FILE` (a path).
> On Vercel there is no filesystem to point at — it must be
> `GOOGLE_SERVICE_ACCOUNT_JSON` containing the file's **contents**. Check this
> is set, or every Sheets read fails in production.

**Redeploy after adding vars** — Vercel only picks up env changes on a new
deployment. Deployments → ⋯ → Redeploy.

Confirm:
- `/admin` accepts the credentials from `.env.local` (and rejects anything else)
- Recruiter → Outreach → Custom → 🤖 Rewrite returns text rather than
  "ANTHROPIC_API_KEY is not configured"

---

## 3. Supabase — run outstanding migrations

Supabase SQL Editor → New query → paste → Run. In order, skipping any you've
already run.

| File | What it does | Safe to re-run? |
|---|---|---|
| `supabase/004_admin_login_parity.sql` | Adds `approved_at`, `expires_at`, `referred_by`, `remove_date`, `remove_reason` to `app_users` | Yes — all `if not exists` |
| `supabase/005_growth_dashboard_support.sql` | Growth dashboard columns | Yes |
| `supabase/006_drop_unused_tables.sql` | **Destructive.** Drops 4 never-populated tables + 1 view | Yes, but see below |

**On 006:** it drops `legacy_sources`, `legacy_row_links`, `client_accounts`,
`recruiter_payments` and the `fu_tracker_master` view. A grep audit confirmed
these are never read or written by `app/` or `lib/`, and were never populated —
so there is no data to lose. Still, this is irreversible schema destruction.
Only run it if you're comfortable; nothing breaks if you skip it.

A second tier — `recruiter_client_assignments`, `client_dtc_links`,
`recruiter_target_areas`, `recruiter_necessary_things`, `recurring_team_tasks`
— **does** hold real synced data and is deliberately left alone. Don't drop
these.

Quick check that 004 applied:

```sql
select column_name from information_schema.columns
where table_name = 'app_users' and column_name in ('expires_at','referred_by');
```

Two rows back = applied.

---

## 4. Chrome extension — reload it

The extension was already cut over to `app.franbooking.com/api/extension` in a
previous session, but three of its calls were reading response keys the API
wasn't sending. That's fixed in this commit, so the extension needs the new
**deployment**, not a new extension build — the fixes are server-side.

No reload strictly required. But if anything looks stale:
`chrome://extensions` → Franbooking → Reload.

Then smoke-test in the side panel:

- **Login** — loads tasks, credits show real numbers (not `— N` or `ERR N`)
- **LI duplicate check** — paste a LinkedIn URL you know was already
  outreached; it must say "⚠ Duplicate", not "✓ Not a duplicate".
  *This is the one most worth checking — it was silently broken.*
- **Nurture → ratio bar** — shows contacts/percent, was previously empty
- **Rotation** — suggests a client rather than nothing
- **Target Area lookup** — rows populate with profile/SN ID/ZIP
- **Outreach save** and **Nurture save** — land in the FU Tracker sheet
- **Time Log** — a session opens on login and closes on logout

---

## 5. Security follow-ups (recommended, not blocking)

1. **Rotate the Anthropic key.** It has been sitting in plaintext in
   `Code.gs`. Anyone who has ever had edit access to that Apps Script project
   has it. Generate a new one at console.anthropic.com, update Vercel, then
   revoke the old one.

2. **Reconsider the admin password.** The current `ADMIN_PASSWORD` now guards a
   publicly-reachable `/admin` on the open internet, not a Google-account-gated
   Apps Script. It's a single shared credential with no rate limiting and no
   second factor. At minimum make it long and random; it only ever gets pasted,
   never typed from memory.

3. **Don't port GAS's `serveSetLimitPage_` pattern.** `Code.gs` line ~2580
   builds a credit-limit email link with the admin password in the query
   string (`&secret=` + password). URLs get written to server logs, proxy logs,
   browser history and `Referer` headers. The Next.js port has **not**
   replicated this — keep it that way. If you want that email-link workflow,
   use a signed single-use token instead.

---

## What is not done

- **Growth panel** is unchanged apart from inheriting the ported design system.
  `Growth.html` is 5,456 lines: 8 sections, ~60 endpoints, ~25 modal types.
  Stage 1 (pinned block + Recruiters) exists from an earlier session. Client
  Tracker, Reports, Finance + Recruiter Payments, Daily Task + Recurring,
  Vendor Management and the GA4 "Link Open vs Booking" section remain.
- **Operations / Admin / Agent / Client** still use the temporary
  compatibility CSS aliases rather than real GAS class names and DOM
  structure. They now look close; they are not structurally ported.
- **GA4 access** for "Link Open vs Booking" is still blocked pending: grant
  `claude@claude-automation-497715.iam.gserviceaccount.com` Viewer on GA4
  property `543445631`, and enable the Google Analytics Data API on project
  `claude-automation-497715`.
