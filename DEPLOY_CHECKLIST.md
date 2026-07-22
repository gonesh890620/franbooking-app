# Deploy Checklist — GitHub / Vercel / Supabase

Work top to bottom. Each step says how to confirm it worked.

Local `.env.local` is already populated, so `npm run dev` works immediately.
Everything below is about **live**.

---

## Latest round of Growth/panel fixes (uncommitted — needs push)

Files changed: `components/{GrowthConsole,OperationsConsole,AgentConsole,ClientPortal,ui}.tsx`,
`lib/{growthDashboard,clientTracker,legacyRecruiter}.ts`.

1. **Logout on every panel.** Was only on Admin and Recruiter. Added a shared
   `LogoutButton` in `components/ui.tsx`, dropped into Growth, Operations,
   Agent and Client headers.
2. **BD/Inhouse · PH sub-notes were reading ~0.** The by-type split under the
   Sends / New Nurture / FU tiles only counted the *active recruiter roster*,
   but sends/nurtures come from everyone (including reassigned or
   status-changed users). Now resolves each sender's type from all
   `app_users`, not just the roster (`getTypeById` in `growthDashboard.ts`).
3. **BD/PH sub-notes were missing entirely** from the New Nurture Sent and FU
   Sent tiles — added, matching the Sends tile.
4. **Finance forms rendered edge-to-edge** (placeholders acting as labels).
   Add Cost / Add Client Payment now use GAS's `.fin-form-grid` with a real
   labelled `.form-row` per field.
5. **Filter button rows wrapped badly.** Daily Appointment and Daily Feedback
   date+quick-range rows now use GAS's `.gr-lb-daterow`/`.gr-lb-field` flex
   layout instead of a grid.
6. **Client Tracker: added "Last 7 Days Appts" column** right after Total
   Appts (`last7Appts`, computed from `leads_ledger.date_created` in
   `clientTracker.ts`).
7. **Outreach sends now stamp `created_at` explicitly** so new sends land in
   the correct day window on the Sends tiles.

Not built (waiting on you): **Client Report** (3rd Reports sub-tab). Its
Calendly-funnel columns need GA4 access — see "GA4 access — step by step"
at the bottom of this file. Once that's set up, it gets built fully.

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

`app/styles.css` has three sections:

1. **`gas-webapp/CSS.html`, verbatim** — the shared design system.
2. **App-only additions** in the same visual language (modals, banners, width
   variants).
3. **Per-panel styles**, ported from each GAS panel's *own* `<style>` block.

Section 3 was the missing piece that made Growth render as jammed inline text
(`On Fire0` instead of a stat tile). Each GAS panel carried page-specific CSS
on top of `CSS.html` — 188 lines for Growth, 132 for Operations, plus Client,
Agent, Admin and Recruiter. Only `CSS.html` was ported initially, so every
panel-specific class (`.gr-stat-tile`, `.tile`, `.dt-task-card`, `.fin-chart`,
`.vm-health`, `.ag-step`, `.sni-card`, `.appt-card` …) had no styles at all.

**There is no compatibility/alias layer** — every panel uses real GAS class
names. Verified by diffing every `className` in the JSX against every selector
in the stylesheet: zero unresolved classes.

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

## GA4 access — step by step (unlocks Link Open vs Booking + Client Report funnel)

Two GA4-dependent features are deferred until the service account can read
Analytics: the **Link Open vs Booking** section and the funnel columns of the
**Client Report**. Both use GA4 property **`543445631`** ("FranBooking
Calendly") and these three Calendly events: `invitee_event_type_page` (Views),
`invitee_select_time` (Select Time), `invitee_meeting_scheduled` (Booked).

The Next.js app authenticates to Google with the **same service account** it
already uses for Sheets — the JSON at
`…\OneDrive\00 Franchise Booking\API\claude-automation-497715-6a3f3ee75144.json`,
GCP project `claude-automation-497715`. Its email is the `client_email` field
inside that JSON (open it in Notepad to copy the exact address — it looks like
`something@claude-automation-497715.iam.gserviceaccount.com`).

Do these two things, then tell me they're done:

**A. Grant the service account read access to the GA4 property**
1. Go to https://analytics.google.com → **Admin** (gear, bottom-left).
2. Top of the Admin page, make sure the **Property** column shows *FranBooking
   Calendly* (property ID `543445631`). Switch to it if not.
3. In the Property column click **Property Access Management**.
4. Click the **+** (top right) → **Add users**.
5. Paste the service account's `client_email` address.
6. Role: **Viewer** is enough. Untick "Notify new users by email" (a service
   account has no inbox).
7. Click **Add**.

**B. Enable the Analytics Data API on the service account's project**
1. Go to https://console.cloud.google.com/apis/library/analyticsdata.googleapis.com
2. At the very top, confirm the project selector says **claude-automation-497715**
   (switch to it if not).
3. Click **Enable**. (If it already says "Manage", it's on — nothing to do.)

That's it — no new key, no new env var. It reuses the Sheets credentials you
already have in Vercel. Once you confirm A and B are done, I'll build the GA4
report code and the Client Report funnel columns.

> Why the service account and not your own Google login: GAS used the Apps
> Script owner's personal Google auth via the Advanced "Analytics Data API"
> service. A Vercel app has no interactive user to log in as, so it must use
> the service account — which is why it needs to be granted Viewer explicitly.

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
