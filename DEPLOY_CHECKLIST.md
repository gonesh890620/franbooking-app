# Deploy Checklist — GitHub / Vercel / Supabase

Work top to bottom. Each step says how to confirm it worked.

Local `.env.local` is already populated, so `npm run dev` works immediately.
Everything below is about **live**.

---

## Folder layout (changed)

The root now contains only the running application. Everything else moved to
`Archive/`:

```
app/  components/  lib/  scripts/  supabase/     ← the app
package.json  tsconfig*.json  next.config.mjs  middleware.ts
README.md  DEPLOY_CHECKLIST.md                   ← active docs
Archive/                                         ← local only, git-ignored
  ├── CREDENTIALS.md            ← every secret, consolidated
  ├── gas-webapp/               ← GAS reference source (Code.gs + panels)
  ├── combined-extension/       ← Chrome extension source
  └── *.md                      ← handoff / context / planning notes
```

**`Archive/` is ignored wholesale in `.gitignore` and that is deliberate** —
`Archive/gas-webapp/Code.gs` and `Archive/CREDENTIALS.md` both contain live
secrets. Do not narrow that rule to specific subfolders, and don't rely on
git to back Archive up; it lives in OneDrive only.

> Housekeeping: if you see `.fuse_hidden*` files in `app/` or `components/`,
> they're stale artifacts from editing over the OneDrive mount. They're
> git-ignored and safe to delete from Explorer.

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
| `ANTHROPIC_API_KEY` | see `Archive/CREDENTIALS.md` |
| `ADMIN_USERNAME` | see `Archive/CREDENTIALS.md` |
| `ADMIN_PASSWORD` | see `Archive/CREDENTIALS.md` |

Values are deliberately not written into this file, because this file **is**
committed. `Archive/CREDENTIALS.md` (git-ignored) holds all of them in one
place, and `.env.local` already has them populated for local dev.

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

## Design system — now applied to every panel

`app/styles.css` is `gas-webapp/CSS.html` ported verbatim (section 1), plus
app-only additions written in the same visual language (section 2). **There is
no longer a compatibility/alias layer** — every panel was converted to real GAS
class names, so the aliases were deleted.

Converted this session: Admin, Operations, Agent, Client, Growth, both login
screens, the home page, the error page, RoleGate and WorkspaceDashboard.
Recruiter was rebuilt in the previous session.

Shared primitives live in `components/ui.tsx` (`AppHeader`, `Card`, `StatGrid`,
`Tabs`, `Msg`, `Badge`, `DataTable`, `Modal`, `Field`, `BarChart`,
`Collapsible`). **Compose these rather than inventing new class names** — that
divergence is exactly what made the app stop looking like GAS the first time.

Layout is applied per route via `components/BodyClass.tsx`, replacing GAS's
hardcoded `<body class="full-page">`:

| Panel | Body class | Width |
|---|---|---|
| Growth, Operations, Admin, Client | `full-page wide-page` | 1320px |
| Recruiter, Agent | `full-page narrow-page` | 760px, single column |

Recruiter and Agent stay narrow because in GAS they rendered in the ~400px
extension side panel — their workflow is a vertical column, and stretching it
into a wide dashboard would change how the work actually flows.

Verify after deploying: every panel should be `#6c2eb9` purple on `#f5f5f7`,
system font, with the sticky white `.app-header` and underline-style tabs —
not the old Arial / `#5b21b6` / bordered-pill look.

---

## What is not done

- **Growth panel functionality.** Its *styling* is now GAS-accurate, and
  coverage is partial. `Growth.html` is 5,456 lines: 8 sections, ~60
  endpoints, ~25 modal types.

  | Section | State |
  |---|---|
  | Pinned block (Client Status + Appointments) | done |
  | Recruiters (+ drilldowns, online/leave, nurture-FU stats) | done |
  | Client Tracker (Add/Update/Archive, Mark Ledger Sent, Ledger CSV, Wait List, slot/vacation checks) | done |
  | Reports | partial — Recruiter Directory only; the 3 GAS sub-tabs are missing |
  | Finance | partial — Add Cost / Add Client Payment only; **Recruiter Payments + Wise workflow missing** |
  | Daily Task | partial — add/status/reassign only; **recurring tasks missing** |
  | Vendor Management | **not started** — profiles, vendors, orders, issues, comms, feedback, replace/renew (9 modals) |
  | Link Open vs Booking (GA4) | **not started** — blocked on access, see below |
- **Operations / Admin / Agent / Client** are visually ported and use the real
  GAS design vocabulary, but they were not re-derived section-by-section
  against their GAS source the way Recruiter was. Expect missing edge-case
  flows rather than missing styling.
- **GA4 access** for "Link Open vs Booking" is still blocked pending: grant
  `claude@claude-automation-497715.iam.gserviceaccount.com` Viewer on GA4
  property `543445631`, and enable the Google Analytics Data API on project
  `claude-automation-497715`.
