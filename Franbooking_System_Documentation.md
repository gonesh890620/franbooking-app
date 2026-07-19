
# Franbooking Webapp — System Documentation

**System name:** SalesNav Lead Extractor + Recruiter Dashboard ("Franbooking Webapp")
**Purpose:** End-to-end tooling for franchise-recruiting outreach, nurture, appointment booking, and internal team operations — spanning a Chrome extension (lead sourcing on LinkedIn Sales Navigator + a recruiter side-panel dashboard) and a Google Apps Script webapp (role-specific dashboards for Recruiters, Operations, Growth/CEO, Agents, Clients, and Admins), all backed by a set of Google Sheets acting as the database.

---

## 1. System Overview

The system supports two parallel client surfaces that talk to one shared backend:

1. **Chrome Extension** ("SalesNav Lead Extractor + Recruiter Dashboard", MV3, currently v1.8) — installed by recruiters. It injects lead-scoring tools directly into LinkedIn Sales Navigator, and provides a full side-panel dashboard (Tasks / Outreach / Nurture / Stats / Feedback) that recruiters can use for their entire day-to-day workflow without leaving the browser.
2. **Google Apps Script Webapp** ("Franbooking Webapp") — a set of server-rendered HTML pages, one per role: `Login`, `Recruiter`, `Operations`, `Growth`, `Client`, `Agent`, `Admin`. This is the same functionality the extension's side panel offers to recruiters, plus everything for the other five roles (appointment triage, applicant/agent onboarding pipeline, company-wide CEO dashboard, client-facing reporting portal, and user administration).

Both surfaces are backed by a single Apps Script project (`Code.gs`, ~8,500 lines, 111 `api*` functions) which reads/writes a collection of Google Sheets that function as the system's database — there is no separate SQL/NoSQL datastore.

---

## 2. System Architecture

### 2.1 Components

```
┌─────────────────────────────┐        ┌──────────────────────────────┐
│   Chrome Extension (MV3)     │        │   Google Apps Script Webapp   │
│                               │        │                                │
│  content.js  (LinkedIn page)  │        │  Login.html                   │
│    - injects Copy Name/LI     │        │  Recruiter.html                │
│    - injects Profile Selection│        │  Operations.html               │
│      button on lead cards     │        │  Growth.html                   │
│                               │        │  Agent.html                    │
│  background.js (service worker)       │  Client.html                   │
│    - direct Claude API calls  │        │  Admin.html                    │
│    - credit gate + cost log   │        │  CSS.html (shared partial)     │
│      via 2 GAS endpoints      │        │                                │
│                               │        │  doGet() router:                │
│  sidepanel.html + panel.js    │◄──────►│    - page= → serves HTML       │
│    - full recruiter dashboard │  fetch │    - api=  → JSON dispatcher   │
│      (Tasks/Outreach/Nurture/ │  (GET) │      (extension only)          │
│       Stats/Feedback)         │        │    - google.script.run          │
│    - talks to GAS directly,   │        │      (webapp pages only)        │
│      NOT via background.js    │        │                                │
└───────────────┬───────────────┘        └───────────────┬────────────────┘
                │                                          │
                │            Code.gs (single Apps Script)  │
                │        111 api* functions, all auth-gated │
                └──────────────────────┬───────────────────┘
                                       │
                     ┌─────────────────┴──────────────────┐
                     │      Google Sheets (the database)    │
                     │  Access Control · Applicants/Agent Log
                     │  Per-recruiter FU Trackers · Template
                     │  Master DB (LI Outreach) · Master/Campaign
                     │  Tracker · Leads Ledger · Time Log
                     │  Leave/Feedback · Daily Task · Sales Nav
                     │  Inventory · All Appt · Cost/Payments
                     └───────────────────────────────────────┘
```

Two independent client-to-backend paths exist for AI calls:
- **Profile Selection** (extension only): `content.js` → `background.js` → directly to `api.anthropic.com` (Claude), with only credit-check and cost-logging round trips to the GAS backend (`api=checkProfileCredit`, `api=logProfileSelection`).
- **Outreach/Nurture AI generation** (both extension and webapp): routed entirely through the GAS backend (`api=aiOutreach`, `api=aiNurture`, etc.) — the Apps Script server itself calls Anthropic (`callAnthropic_`), not the client.

### 2.2 Data flow summary

1. A recruiter finds a prospect on LinkedIn Sales Navigator (extension `content.js` injects scoring/copy buttons on each lead card).
2. "Profile Selection" runs a free duplicate check against the Master DB sheet first, then (if not a dup) an AI fit-check via `background.js` → Claude, gated by a Profile Selection credit.
3. Good-fit prospects are worked through **Outreach** (InMail/Invite/DM copy, logged to the recruiter's own FU Tracker sheet + the cross-recruiter Master DB).
4. Replies are worked through **Nurture** (staged follow-up cadence — Interested/Unsure/Not Interested/Client Rotation — each transition stamps date columns and updates status in the recruiter's FU Tracker).
5. A booked call lands in the **All Appt** master sheet (via Calendly), which **Operations** triages in Appointment Review — assigning/confirming the recruiter and syncing status back into that recruiter's FU Tracker (`Booked`/`Recalled`).
6. **Growth/CEO** rolls all of this up into company-wide dashboards (client health, recruiter activity, billing, finance) sourced from the same sheets.
7. Separately, **Operations** also runs a parallel recruiting pipeline for hiring new *recruiters themselves* (sourced from job boards like OnlineJobs.ph), assigning each applicant to an **Agent** who runs a scripted intro-call + onboarding checklist until the new recruiter is ready to be approved into the Access Control roster (at which point they become a normal PH/Inhouse recruiter).
8. **Admin** manages the Access Control roster directly (approvals, credit limits, password resets, referral bonus program).
9. **Client** users get a read-only reporting portal scoped to their own campaign's leads/appointments.

### 2.3 Data model (Google Sheets)

All persistent state lives in the following spreadsheets/tabs. Column layouts are enforced in code via named index maps (e.g. `RC`, `APPL`, `AGENTLOG`, `FU`) and several sheets self-heal their header row if it drifts from the expected schema.

| Spreadsheet | Tab(s) | Purpose | Key columns |
|---|---|---|---|
| **Access Control** | Recruiters | Master user/roster table for every role | Email, Name, Status, Registered, Approved, Expires, SheetId (per-recruiter FU Tracker), NurtureLimit/Balance, OutreachLimit/Balance, ProfileLimit/Balance, LastBalanceUpdate, Type, Password, UsedToday, UsedAllTime, ReferredBy |
| | Activity | Append-only audit + AI cost log | Timestamp, Email, Action, Details, Cost ($) — pruned after 60 days |
| | DailyUsage | Per-day per-recruiter Nurture/Outreach/Profile counts | Date, Email, NurtureCount, OutreachCount, ProfileCount |
| | AI Cost | Auto-generated nightly rollup of Activity cost | — |
| | Profile Selection | Cost log for the extension's Profile Selection AI calls | Date, Recruiter, Cost |
| **Per-recruiter FU Tracker** (own spreadsheet per recruiter, ID in Access Control `SheetId`) | FU Tracker / Tracker / Sheet1 | The recruiter's real outreach & nurture ledger — one row per prospect | Date, Name, LI URL, Client, Calendar, Status/Response, Next Action (live formula), Convo, Reply, First-Nurture Date, FU1/FU2/FU3 Dates, Source, Sales Nav ID, Code, Tag, CA/NY flag |
| | Daily Assignment | Recruiter's assigned client roster | Client Name, Status, DTC Event Link, Nurture %, CA+NY Appts, Flag Notes |
| | Target Area | Sales Nav search-territory lookup | Assign Date, ZIP, City, State, Sales Nav ID, Profile Name, Best Call Time |
| **Template** | Copy / Nurture Copy / Unsure Template / TemplateIndex | Rotating outreach & nurture copy library + per-recruiter round-robin index | — |
| **Master DB** | Sheet1 / LI Outreach | Cross-recruiter, write-once outreach log — dup-check + Ops search source | Date, Recruiter Name/Email, Prospect Name, LinkedIn URL, Type, Subject/Code, Message |
| **Campaign Tracker** | Master Tracker | Central client-health record | Client, Campaign ID, Quota, Results Total/Remaining, % Quota Complete, Leads Last 7 Days, Target Avg/Day, Campaign Status, Paused Reason, Action Taken, Cycle, Charge Amt, Payment, Current Status, Cycle Start, Payment/Quota Notes, Account ID/Name, Vertical, Package Type, Launch Date, Current-Cycle CA/NY count |
| | Archive Client | Same shape as Master Tracker + Archive Date/Reason/By | — |
| | Accounts / Customer_Roles / Client DTC URL | Supporting client contact/account records | Account name, connect date, calendar/CRM contacts, DTC event URL & login |
| | Leads Ledger | Appointment/lead ledger (source of most billing/appointment stats) | Client, Source, Type, Name/Email/Phone, Company, Title, LinkedIn URL, Location, Date Created, Recruiter (From_Profile), Campaign ID, Account |
| | Wait List | Clients waiting to launch | Date, Client Name, Contact Email, ETA Launch, Notes |
| | Client Payment | Finance "earning" side | Date Issue/Paid, Client, Invoice Ref, Cycle #, Total Billed, Status, Charged By |
| | Client Feedback | Client-submitted feedback, auto-categorized | positive / no-show / negative |
| **Cost** | Purchase | Finance "cost" side | Date, Amount, Description, Notes, Use Method, Comments |
| **Time Log** | Recruiters / Operations | Login/heartbeat session tracking (drives online/offline status) | Date, Type, Name, Start/End Time, Last Activity, Auto Closed |
| **Feedback** | Leave Status | Time-off requests | ID, Email, Name, Leave Date, Duration Days, Reason, Submitted Date |
| | Feedback | Daily self-reported recruiter feedback | ID, Email, Name, Date, All-Sales-Nav?, No-Count, No-Reason, Unusual, Responses Today, Comments, Reviewed |
| **Applicant/Recruiting Pipeline** | Applicants | New-recruiter job applicants (hiring pipeline) | ID, Date Applied, Platform, Name, Email, Phone, LI Profile, Position, Status, Assigned Agent, Notes, Created/Updated Date |
| | Agent Log | Per-applicant onboarding checklist run by an Agent | Applicant/Agent identity, milestone checkboxes + auto-stamped dates (Group Created, Thank You Sent, Availability Asked, Call Mode/Scheduled At, Call Completed, LI Restriction Concern, Connections Count, Profile Updated, Work Type, Best Working Time, Call Outcome, Notified Gonesh, LI Check Result/Date, SOP Sent, Onboard LI Email, Zoom Done, InMail/Invite/Nurture Sends, Sends Verified) |
| | Log | Append-only applicant event audit trail | — |
| **Daily Task** | Tasks | Growth-team personal/shared task tracker | ID, Title, Description, Topic, Priority, ETA, Status, Created/Completed Date, Source, Assigned Email/Name |
| | Recurring Tasks | Templates that auto-materialize into Tasks | ID, Title, Description, Topic, Priority, Days of Month, Active, Last Generated, Assigned Email/Name |
| | Task Log | Audit trail | — |
| **Sales Nav Inventory** | Sales Nav Inventory | Seat inventory & expiry tracking | Date, Vendor, Recruiter, Email, Price, Status, Payment Status, Expire Date, Days Left, Sales Nav ID, Expire Status, Notes |
| **All Appt** | All Appt | Raw Calendly-booking landing sheet Ops triages | Client/Invitee Name/Email, LI URL, Location, Timezone, Responses, Event Created Date, Start/End Date-Time, Identity Check, Canceled/Reason/By, On-Ledger flag, Processing Sheet URL, Sent-to-Client flag |

### 2.4 User roles & authentication

Every account lives in the Access Control "Recruiters" sheet (despite the name, it holds every role). `RC.TYPE` is free text, normalized by two helpers:

- **Page routing** (`apiLogin`): type prefix `op` → Operations page; prefix `agent` → Agent page; exactly `Client` → Client page; exactly `growth` (case-insensitive) → Growth page; anything else (PH, Inhouse, BD) → Recruiter page.
- **Reporting bucket** (`roleForType_`): `Operation` / `Agent` / `Growth` / `Client` / `Recruiter`.
- **Billing-type split** (`normalizeRecruiterType_`, Growth dashboard only): contains "bd" or "in" → `BD/Inhouse`, else → `PH`.

**Login flow**: `apiLogin(email, password)` → row lookup by email → reject unless `Status = approved` → password check only if a password is stored → expiry check against `Expires` (auto-flips to `expired` if past) → returns balances/limits + a `page` value the client redirects to.

**Admin** is a wholly separate hardcoded username/password gate (`apiAdminLogin`/`validateAdmin_`), independent of the Access Control roster — used only for the Admin panel.

**Per-call authorization**: nearly every `api*` function re-derives the caller's role from `findRecruiterRow_(email)` and checks a type prefix/value inline (e.g. `type.indexOf('op') === 0`, `type === 'growth'`, `type.indexOf('agent') === 0`). Agent-facing functions additionally scope every read/write to rows where `assignedEmail` matches the caller (ownership check) — an Agent can never see another Agent's applicants.

### 2.5 Chrome extension architecture

- **manifest.json** — MV3, permissions: `clipboardWrite`, `storage`, `sidePanel`; host permissions: `linkedin.com`, `docs.google.com`, `api.anthropic.com`, `script.google.com`/`script.googleusercontent.com`. Content script injected only on `linkedin.com/sales/*` at `document_start`. Toolbar icon opens `popup.html`; side panel default path is `sidepanel.html`.
- **content.js** — monkey-patches `fetch`/`XMLHttpRequest` to passively harvest LinkedIn's own API responses for each lead's canonical public profile URL (primary strategy), with DOM-scan and click-to-open-panel fallbacks. Injects "Copy Name" / "Copy LI" / "Profile Selection" buttons onto every lead card via a debounced `MutationObserver`. Profile Selection first does a **free** dedup check against a cached CSV export of the Master DB sheet, then — only for non-duplicates — scrapes and cleans the lead's profile-panel text and messages it to `background.js` for the paid AI check.
- **background.js** — the *only* place the extension talks directly to `api.anthropic.com`. Requires the recruiter to already be logged into the side panel (`fo_email` in `chrome.storage.local`) so AI spend is always attributable and creditable. Calls a GAS credit-check endpoint before the Anthropic request (fails open on network error, fails closed only on a real zero-balance response), truncates profile text to 4000 chars, sends a large hardcoded franchise-recruiting screening system prompt (prompt-cached for cost efficiency) to Claude, parses a strict `{decision, confidence, reason}` JSON response, and fire-and-forgets a real-dollar cost log back to the GAS backend.
- **sidepanel.html + panel.js** — a full recruiter dashboard SPA (Tasks / Outreach / Nurture / Stats / Feedback tabs) that talks **directly** to the same GAS backend as the webapp's `Recruiter.html`, over `fetch()` with an `api=<name>` query dispatch and jittered exponential-backoff retries (up to 5 retries) to survive Apps Script's concurrent-execution ceiling under load from many simultaneous recruiters. Runs its own Time Log heartbeat (pings every ~4 min ± jitter, 30-min local inactivity auto-close) independent of `background.js`.
- The extension is a **full parallel UI** to the webapp's Recruiter panel — not a thin client that hands off to it. Both surfaces are maintained to functional parity against the same backend API. There is no cross-surface deep link into the separate webapp dashboards.

---

## 3. Operational Workflows

### 3.1 Recruiter workflow (PH / Inhouse / BD)

Recruiters work from either the Chrome extension's side panel or the webapp's `Recruiter.html` — both offer the same five areas: Tasks, Outreach, Nurture, Stats, Feedback (extension), or Tasks, Outreach, Nurture, Stats (webapp; Feedback/Leave live under a Feedback tab on the webapp too).

1. **Source & screen leads.** On LinkedIn Sales Navigator, the recruiter runs "Profile Selection" on candidate leads. The system free-checks for a prior duplicate contact, then (if new) runs an AI fit check and shows a color-coded Reach-Out/Skip/Unclear verdict with a reason. If Profile Selection credits run out, the recruiter can fall back to a manual scoring rubric (the "LI Screening Process" reference card) to keep working without AI spend.
2. **Send outreach.** In the Outreach tab/panel, the recruiter enters the prospect's name/LinkedIn URL (with a live duplicate check), optionally flags CA/NY territory, and picks InMail/Invite/DM — a pre-written template auto-loads at no AI cost, or the recruiter writes a custom message and optionally has AI rewrite it. Saving logs the outreach to the recruiter's own FU Tracker sheet and the cross-recruiter Master DB.
3. **Work the daily task queue.** The Tasks tab surfaces every contact due for a follow-up today (computed from the FU Tracker's status + date-stamp columns), plus a separate "Review Due" list (contacts whose 3rd follow-up has already gone out and now need manual review). For each task, the recruiter sends a template, an AI-generated, or a custom nurture message; or dismisses it as Not Interested / Sales-Nav-Access-Lost / Profile-Restricted.
4. **Nurture replies through to booking.** When a prospect replies, the recruiter classifies the response (Interested / Unsure / Not Interested / Client Rotation) in the Nurture tab, optionally lets AI draft the reply, and saves — this stamps the correct follow-up-due date and advances the contact's stage (SDFU → FU1 → FU2 → FU3 → Review Due) until either a call is booked (handled by Calendly + Operations) or the thread goes terminal.
5. **Client Rotation.** If a prospect stalls or hits a CA/NY cap on their currently assigned client, the recruiter can toggle Rotation, pick a reason, and the system auto-selects the least-saturated eligible client and generates rotation-specific copy — enforcing fair distribution via a live send-ratio indicator.
6. **Track pay & referrals.** The Stats tab shows the current billing-cycle appointment count and dollar total (own appointments × a flat rate), plus, if the recruiter has referred other recruiters in, a referral-program breakdown (referred recruiters' own appointment counts × a smaller referral rate, active only within a 60-day window from each referred recruiter's registration date).
7. **Time & availability.** A background heartbeat auto-tracks online/offline status (visible to Growth); a Feedback tab lets the recruiter submit leave requests and a daily self-report on Sales Navigator access/issues.

### 3.2 Agent workflow (new-recruiter onboarding)

Agents run the "make the new hire ready" process for applicants sourced from job boards (handled separately from the customer-facing recruiting funnel above — this is *hiring recruiters*, not *recruiting franchise candidates*).

1. Operations assigns a job-board applicant to an available Agent (status flips `Applied → Assigned`).
2. The Agent opens the applicant in **My Applicants**, filtered/sorted by status or by an upcoming **Scheduled** call.
3. The Agent works a 6-step scripted checklist (bilingual English/Filipino toggle) during onboarding:
   - Create a WhatsApp group.
   - Send a thank-you message and schedule (or start instantly) the intro call.
   - Run the call — company pitch, pay terms, trust-building, LinkedIn-restriction concern check, connections count, profile-update instruction, work-type/availability questions.
   - Record pre-screening answers (LI restriction risk, connections, profile updated, availability/work type).
   - Record the outcome: Pending / Interested / Not Interested.
4. Checking any milestone box while status is still `Assigned` auto-advances it to `In Progress`. An `Interested` outcome jumps straight to `Ready for Onboarding` (skipping an intermediate "Interested" status).
5. If Interested, the checklist unlocks an **Onboarding** step: the LI profile/banner update must be verified Passed/Failed — a Failed result auto-disqualifies the applicant (terminal). A Passed result unlocks sending the SOP, collecting the new recruiter's LI-linked email, having them notified (credentials handoff) by the admin, inviting them to a Zoom tool walkthrough, and confirming their actual InMail/Invite/Nurture sends went through.
6. Every field autosaves — there is no explicit Save button anywhere in this checklist.
7. Final `Hired`/`Rejected` disposition is set manually by Operations, not auto-derived — this is also the point at which a hired applicant would be separately set up as a normal PH/Inhouse recruiter account in Access Control.

### 3.3 Operations workflow

Operations runs from a dashboard-tile home screen with five areas: Appointment Review, Sales Nav Inventory, Recruiting Pipeline, Client Tracker, and Daily Tasks (placeholder).

1. **Appointment Review.** Calendly bookings land in the "All Appt" master sheet. Ops reviews each pending row (client, invitee, responses, recruiter-on-file, a duplicate-email flag), assigns/confirms the correct recruiter, and marks it processed — which also syncs the matching contact's status to `Booked` in that recruiter's own FU Tracker. A "Recalled" action (with a reason) does the mirror-image sync to `Recalled`. A built-in contact search (against the Master DB) includes a "Find Client" fallback that reads a named recruiter's own FU Tracker directly when the Master DB's Client/Status columns are still blank.
2. **Sales Nav Inventory.** Ops tracks every purchased Sales Navigator seat (vendor, recruiter, price, expiry), sees what's expiring within 3 days grouped by vendor, adds new seats, and marks vendor invoices paid in bulk.
3. **Recruiting Pipeline.** Ops logs new job-board applicants, assigns them to an Agent, and monitors progress across four views: the full Applicant Log (status-filterable), a read-only mirror of every Agent's onboarding checklist progress, a live per-Agent workload/status roster, and a date-range activity report (groups created, calls completed, interested/disqualified/onboarded/hired counts).
4. **Client Tracker.** Shared with Growth (same backend, broadened auth) — Ops can add/update/archive clients, mark a cycle's leads as "sent" (auto-labeling the next N unlabeled ledger rows), export a ledger CSV once a client's quota hits 100%, add clients to a Wait List, and respond to "Not Enough Slots"/vacation badges by logging a check outcome that can reactivate a paused client.

### 3.4 Growth / CEO workflow

Growth is the company-wide management dashboard — a pinned always-visible summary (client status buckets, appointment counts across date ranges, all-appointment master-sheet stats) sits above six drill-down sections: Daily Task, Recruiters (Recruiter Activity), Client Tracker, Link Open vs Booking, Finance, and Reports.

1. **Morning health check.** The pinned section gives a one-screen read: how many clients are On Fire/Smokin'/On Track/Improving/Paused, plus today/yesterday/7/14/28-day/total appointment counts — before drilling into anything.
2. **Recruiter oversight.** The Recruiters section shows who's online/offline/not-started/inactive right now (from Time Log), who's on leave today or tomorrow, active-recruiter and active-Sales-Nav counts, sends-to-appointment ratios by recruiter type, top performers vs. non-productive recruiters, and a recruiter-submitted daily feedback table (Sales Nav access issues, unusual activity, response counts).
3. **Client health management.** In Client Tracker, color-coded status and quota-completion cells flag at-risk clients at a glance; clicking a 🔔 or 🏖️ badge opens a Slot-Check or Vacation-Check modal to log whether a paused client is ready to reactivate.
4. **Finance.** Company-age, total cost, total earning, and net tiles, plus a monthly cost-vs-earning chart, with Add Cost / Add Client Payment actions and full transaction tables.
5. **Reporting.** Billing-cycle-by-recruiter, recruiter directory, and a combined client report joining internal send stats with the external GA4 booking-funnel data (link views → time-select → booking, drop-off rates).
6. **Team task management.** A personal/shared Daily Task list (with recurring-task templates that auto-materialize daily) for tracking Growth-team to-dos, filterable to "my tasks" vs. the whole team's.
7. **Impersonation.** Growth can open the Operations, Recruiter, or Agent panel *as* a specific named user (no password needed) directly from a picker — useful for troubleshooting or hands-on help — and return to their own Growth session via a banner at any time.
8. **AI Brainstorm.** A persistent floating chat panel offers free-form business discussion or a data-grounded "Ask a Report" mode that pulls real dashboard/performance numbers into the prompt for grounded Q&A, without leaving whatever section is currently open.

### 3.5 Admin workflow

Admin is a separate, hardcoded-credential panel focused purely on Access Control roster management: approving pending signups (setting weekly Nurture/Outreach/Profile-Selection credit limits, recruiter type, and an optional referrer), creating users directly, topping up credits, resetting passwords, removing accounts, and reviewing a staff/activity report.

### 3.6 Client workflow

Client-type users get a read-only reporting portal: a dashboard of cycle-based appointment stats and charts (growth trend, state breakdown) plus a searchable/exportable full lead list scoped to their own campaign — no data-entry actions.

---

## 4. Feature Requirements

### 4.1 Lead sourcing & Profile Selection (AI screening)
- Inject actionable buttons directly onto LinkedIn Sales Navigator lead cards without disrupting the page.
- Resolve each lead's canonical public LinkedIn URL reliably even though Sales Navigator's UI doesn't expose it directly (three-tier fallback: network-traffic scan → DOM scan → open-panel-and-observe).
- Run a **free** duplicate check (against the shared Master DB) before ever spending on an AI call.
- Run a paid AI fit-check only for non-duplicate leads, gated by a per-recruiter Profile Selection credit balance that must be checked and decremented server-side before the Claude call fires.
- Screening criteria must weigh title/decision authority, career stability, entrepreneurial signals, About-section quality, profile completeness, and use only explicit tenure numbers for age-plausibility — never infer age from a photo or name.
- Every AI call's real dollar cost (computed from actual token usage × model pricing) must be logged against the recruiter who triggered it.
- When credits are exhausted, the recruiter must still be able to continue screening manually via a documented scoring rubric, with a visible in-app caution banner.

### 4.2 Outreach
- Rotating template library per outreach type (InMail/Invite/DM) with per-recruiter round-robin so the same recruiter doesn't repeat a template back-to-back.
- Live duplicate check against the cross-recruiter Master DB before sending.
- Optional CA/NY territory flag captured at send time (with a bulk backfill tool for prospects created before the flag existed).
- AI-assisted rewrite of a custom draft, credit-gated.
- Every send must be logged to both the recruiter's own FU Tracker (source of truth for that recruiter's pipeline) and the shared Master DB (source of truth for cross-recruiter dedup/search).

### 4.3 Nurture & follow-up cadence
- A defined, date-stamped follow-up cadence: Interested → SDFU → FU1 → FU2 → FU3 → Review Due, each stage due the next business day by default.
- Distinct terminal/side paths: Not Interested (terminal), Unsure (with a documented objection-handling criteria panel), Client Rotation / CA/NY Territory Change (re-routes to a different client, same cadence), Sales-Nav-Access-Lost reconnect (falls into the FU3 cadence via a different message).
- "Continuing conversation" detection so an active thread doesn't force the recruiter to re-pick a response type unnecessarily.
- A live send-ratio tool to keep prospect distribution fair across a recruiter's assigned clients.
- Manual status override capability with the same date-stamping rules as the automatic path.
- A "Next Action" label must always be derivable live from the stored status + date columns (implemented as a spreadsheet formula, not a static value, so it never goes stale).

### 4.4 Task queue
- Daily task list computed purely from FU Tracker status + date-stamp columns (no separate "queue" table to keep in sync).
- Separate "Review Due" bucket for contacts whose cadence has run out without a fresh reply.
- CA/NY per-client cap warnings and paused-client warnings surfaced inline on each task.
- One-click terminal actions (Not Interested, Profile Restricted) that require no message composition.

### 4.5 Credit system
- Three independently tracked weekly credit types per recruiter: Nurture, Outreach, Profile Selection.
- Admin-managed weekly limits, no automatic refill — balances only change via admin top-up or actual usage.
- A single unified "+Get More" request that emails the admin about whichever of the three types are low/exhausted, instead of three separate requests.
- AI-consuming actions (AI Outreach/Nurture generate & rewrite, Profile Selection) must decrement the matching credit before the paid call and refund it if the call fails.
- Visible balance badges with an "urgent" (low-balance) visual state in both the extension and webapp.

### 4.6 Referral program
- Every recruiter earns a flat rate per appointment they personally book.
- A recruiter who referred another recruiter in additionally earns a smaller flat rate per appointment the referred recruiter books, for a fixed 60-day window.
- **The 60-day window starts from the referred recruiter's Registered date** (not their later Approval date) — this was corrected from an earlier implementation that used the Approval date.
- Window status (Active/Closed) and days-remaining must be computed purely from real dates — a known prior bug where a Sheets-auto-converted Date object was mis-stringified (dropping the year and silently defaulting to year 2001) must not recur; all date reads for this feature must go through a Date-object-safe normalizer, never a raw `String(cell).substring(0,10)`.
- Referred-by can be entered as either the referrer's email or their display name and must resolve to the same person.

### 4.7 Recruiting Pipeline (hiring new recruiters) & Agent onboarding
- Central applicant list sourced from external job boards (e.g. OnlineJobs.ph), independently trackable by status.
- Assignable to a specific Agent, who owns that applicant end-to-end; Agents can only ever see/edit their own assigned applicants.
- A structured, bilingual (English/Filipino), checklist-driven onboarding call script covering group creation, scheduling, the live call itself, pre-screening answers, and outcome capture.
- Automatic status progression driven by checklist actions and outcome, with two explicit "jump" rules (Interested → Ready for Onboarding directly; a failed LI check → Disqualified even from a later stage) and two rules that are always manual (Hired, Rejected).
- A gated Onboarding sub-flow (SOP send → credential handoff → tool walkthrough → verified sends) that only unlocks once the LI profile/banner check has explicitly passed.
- Manager-facing rollups: per-applicant progress mirror, per-Agent workload/status, and a date-range activity report.
- A way for an Agent to see their own upcoming scheduled calls sorted soonest-first, discoverable even when currently empty.

### 4.8 Appointment Review (Operations)
- A single triage queue of newly booked (and not-yet-processed) appointments, with duplicate-booking detection by invitee email.
- One action to confirm/assign the recruiter and mark processed, syncing that recruiter's own tracker to Booked.
- One action to recall a booking with a reason, syncing that recruiter's own tracker to Recalled.
- A contact search that falls back to reading a named recruiter's own tracker directly when the shared master record hasn't been filled in yet, so Ops is never blocked by a data-entry lag elsewhere in the system.

### 4.9 Client Tracker / Client health
- A single client record spanning quota, cycle, billing, contact/account info, and a rolling CA/NY count for the current cycle.
- Status must be visually distinguishable at a glance (color-coded active/paused/at-risk states, quota-completion coloring).
- Explicit reasons required when pausing a client (constrained to a fixed set of reasons), with paused-reason auto-clearing the moment status returns to Active.
- A logged, timestamped "check" action (slots available / vacation ended) that can reactivate a paused client, visible to both Ops and Growth.
- Cycle-based lead-sending workflow: label the next N (quota-sized) unlabeled leads as sent for the current cycle, gate a CSV export behind 100% quota completion, and support archiving a client (true move to an archive sheet, not a soft-delete flag) with a required reason.
- Wait List as a distinct pre-launch state, separate from active/paused/archived.

### 4.10 Finance
- Track cost and client-payment transactions as two independent ledgers, each with free-text notes.
- Roll up into company-age-anchored all-time and period-filtered (month/year) cost, earning, and net figures, with a trend chart.

### 4.11 Reports
- Billing-cycle-by-recruiter, filterable and exportable.
- Recruiter directory (all-time activity summary).
- A combined client report joining internal send activity with the external GA4 Calendly-funnel data (view → select-time → booked, with drop-off and conversion rates), so link-performance and booking outcomes can be read side by side.

### 4.12 Time tracking & staffing visibility
- Automatic session tracking (start/heartbeat/auto-close) requiring no manual clock-in/out from the recruiter.
- Heartbeats must be resilient to normal browser/tab lifecycle events (side-panel discard/recreate, page reload) without creating duplicate sessions, and must be jittered across recruiters to avoid synchronized load spikes on the backend.
- Server-side auto-close of stale sessions (staff shouldn't need to remember to log out).
- Company-wide online/offline/not-started/inactive classification derived purely from these session logs.
- Leave requests and daily self-reported feedback (Sales Nav access issues, unusual activity, response volume) submittable by any recruiter, reviewable by Growth, with "on leave today" and "on leave tomorrow" visibility.

### 4.13 Team task management (Growth)
- A shared task list with topic, priority, ETA, and an explicit assignee (not just a personal to-do list).
- Recurring task templates that auto-materialize into the live list on a schedule, plus a manual "run now" trigger.
- A personal vs. team-wide view toggle.

### 4.14 AI Brainstorm (Growth)
- Persistent, non-blocking chat panel available while navigating the rest of the dashboard.
- Two modes: free-form discussion, and a data-grounded mode that injects real current performance numbers into the prompt so answers are accurate rather than generic.

### 4.15 Administration
- Two-tier account lifecycle: self-serve/admin-created signup → pending → admin approval (which sets role, credit limits, and optional referrer) → active, with explicit expiry and manual removal states.
- Direct user creation (bypassing the pending state) with auto-generated or custom passwords depending on role.
- Per-recruiter credit top-ups and password resets without needing the recruiter to re-register.
- Company-wide staff and activity reporting (ever-approved vs. currently-active counts per role, full action/cost audit log).

---

## 5. Status enums & state machines

**Applicant status** (Recruiting Pipeline): `Applied → Assigned → In Progress → Interested → (Not Interested | Disqualified) → Ready for Onboarding → (Hired | Rejected)`
- `Applied → Assigned`: on Agent assignment.
- `Assigned → In Progress`: on the first Agent Log milestone checked.
- `→ Ready for Onboarding`: directly on call outcome = Interested (skips a separate "Interested" status).
- `→ Not Interested`: directly on call outcome = Not Interested (terminal).
- `→ Disqualified`: on a Failed LI check during Onboarding (terminal; can cut in even from Ready for Onboarding).
- `Hired` / `Rejected`: manual-only, set by Operations.

**Agent call fields**: Call Mode = `Scheduled | Instant`; Call Outcome = `Pending | Interested | Not Interested`; Work Type = `Full Time | Part Time`; LI Check Result = `Pending | Passed | Failed`.

**Agent Log milestones** (checkbox + auto-stamped date, first-flip-only): Group Created, Thank You Sent, Availability Asked, Call Completed, Profile Updated, Notified Gonesh, SOP Sent, Extension Sent (currently dormant/unused pending rework), Zoom Done, Sends Verified.

**FU Tracker contact status** (recruiter pipeline): `Interested`, `SDFU Sent`, `Unsure`, `Unsure SRFU`, `FU1 Sent`, `INT-FU1 Sent`, `FU2 Sent`, `INT-FU2 Sent`, `FU3 Sent`, `Not Interested`, `Booked`, `Recalled`, `Closed`, plus auto/derived values: `Awaiting Response`, `Profile Restricted`, `Client Rotation Sent`, `CA/NY Territory Change Sent`, `DM-SN Expire`. Terminal/"done" statuses excluded from active task lists: Booked, Closed, Not Interested, Recalled, Profile Restricted.

**Recruiter account status**: `pending → approved → (expired | removed)`.

**Master Tracker client status**: free-text `Current Status` (conventionally Active/Paused, with Paused Reason auto-clearing on return to Active); `Campaign Status` (rolling 7-day performance) buckets into On Fire / Smokin' / On Track / Improving / Paused / Waitlist / Active / Other.

**Referral window status**: `Active` while days-remaining > 0 within the 60-day window from the referred recruiter's Registered date, else `Closed`.

**Client Feedback category**: auto-classified into `positive` / `noShow` / `negative` from the feedback's category text.

---

## 6. API reference (by area)

All functions are Apps Script server functions in `Code.gs`, invoked either via `google.script.run` (webapp pages) or the `?api=<name>` JSON dispatcher (extension only, a deliberately smaller subset). Every function re-validates the caller's role server-side regardless of which client called it.

- **Auth / Bootstrap:** `apiLogin`, `apiLoginBootstrap`, `apiBootstrap`, `apiRegister`, `apiAdminLogin`.
- **Recruiter — Credits:** `apiGetUsage`, `apiCheckProfileCredit`, `apiRequestMoreCredits`, `apiRequestCredits`, `apiLogProfileSelection`.
- **Recruiter — Outreach:** `apiGetOutreachTemplate`, `apiGenerateOutreach`, `apiRewriteOutreach`, `apiCheckLiDuplicate`, `apiSaveOutreach`, `apiGetTargetArea`, `apiGetUnsureCriteria`, `apiBulkSetCanyFlags`.
- **Recruiter — Nurture:** `apiGetNurtureTemplate`, `apiGenerateNurture`, `apiRewriteNurture`, `apiSaveNurture`, `apiSaveStatus`, `apiMarkNotInterested`, `apiMarkProfileRestricted`.
- **Recruiter — Tasks/Contacts/Clients:** `apiGetContacts`, `apiGetDailyTasks`, `apiGetClients`, `apiGetClientRatio`, `apiSearchContacts`.
- **Recruiter — Time Log:** `apiTimeLogStart`, `apiTimeLogEnd`, `apiTimeLogPing`.
- **Recruiter — Stats/Referral/Leave/Feedback:** `apiBillingStats`, `apiGetReferralStats`, `apiSubmitLeave`, `apiSubmitFeedback`.
- **Admin:** `apiAdminGetRecruiters`, `apiAdminApprove`, `apiAdminRemove`, `apiAdminSetPassword`, `apiAdminResetPassword`, `apiAdminSetLimit`, `apiAdminGetReport`, `apiAdminGetStaffReport`, `apiAdminGetActivity`, `apiAdminCreateUser`.
- **Ops — Appointment Review:** `apiGetPendingAppts`, `apiProcessAppt`, `apiOpsRecallAppt`, `apiOpsGetRecruiterList`, `apiOpsSearchContacts`, `apiOpsLookupContactClient`.
- **Ops — Sales Nav Inventory:** `apiOpsGetSalesNavInventory`, `apiOpsSearchSalesNav`, `apiOpsAddSalesNav`, `apiOpsNotifySalesNav`, `apiOpsMarkVendorPaid`.
- **Ops — Recruiting Pipeline:** `apiOpsGetApplicants`, `apiOpsAddApplicant`, `apiOpsUpdateApplicant`, `apiOpsAssignAgent`, `apiOpsGetAgentLogAll`, `apiOpsGetAgentStatus`, `apiOpsGetAgentReport`.
- **Agent:** `apiAgentGetMyApplicants`, `apiAgentUpdateApplicantLink`, `apiAgentGetAgentLog`, `apiAgentUpdateAgentLog`.
- **Client:** `apiGetClientDashboard`.
- **Growth — Dashboard/Recruiters:** `apiCeoGetDashboard`, `apiCeoGetNurtureFuStats`, `apiCeoGetRecruiterOnlineStatus`, `apiCeoGetS2AByRecruiter`, `apiCeoGetRecruiterBillingReport`, `apiCeoGetRecruiterDirectory`, `apiCeoGetRecruitersOnLeave`, `apiCeoGetRecruitersOnLeaveTomorrow`, `apiCeoGetFeedbackSubmissions`, `apiCeoMarkFeedbackReviewed`, `apiCeoBrainstorm`, `apiCeoListOpsUsers`, `apiCeoListRecruiters`, `apiCeoListAgents`, `apiCeoGetGrowthUsers`.
- **Growth/Ops shared — Client Tracker/Finance/Reports:** `apiCeoGetClientDetail`, `apiCeoGetAllClientTracker`, `apiCeoAddClient`, `apiCeoUpdateClient`, `apiCeoLogSlotCheck`, `apiCeoLogVacationCheck`, `apiCeoArchiveClient`, `apiCeoMarkLedgerSent`, `apiCeoGetClientEmail`, `apiCeoGetLedgerCsvRows`, `apiCeoAddWaitList`, `apiCeoGetWaitList`, `apiCeoGetLinkOpenBooking`, `apiCeoGetClientReport`, `apiCeoGetFinanceData`, `apiCeoAddCost`, `apiCeoAddClientPayment`.
- **Growth — Daily Task:** `apiCeoGetTasks`, `apiCeoAddTask`, `apiCeoReassignTask`, `apiCeoUpdateTaskStatus`, `apiCeoMarkTaskComplete`, `apiCeoGetRecurringTasks`, `apiCeoAddRecurringTask`, `apiCeoToggleRecurringTask`, `apiCeoRunRecurringCheck`.

**doGet routing:** `?page=login|recruiter|admin|ops|client|growth|agent` serves the matching HTML template (defaults to Login). `?api=<name>` is a JSON dispatcher used only by the Chrome extension, covering a smaller subset of the above (login/bootstrap, tasks, outreach/nurture read+write+AI, dup-check, time log, credits, referral/billing stats, leave/feedback submission). `?action=setLimit` and `?api=creditApproval|addCredits` serve standalone HTML forms used by email-based admin approval links.

---

## 7. Deployment & maintenance notes

- **No CI/CD.** Every `Code.gs` change requires a manual redeploy: Apps Script editor → Deploy → Manage deployments → edit existing deployment → "New version" → Deploy. Saving alone does not update what's served.
- **Extension changes** (manifest.json/content.js/background.js/panel.js/sidepanel.html) require the user to reload the unpacked extension in `chrome://extensions`.
- **Installed triggers:** `runTimeLogAutoClose` (every 5 min — closes stale open Time Log sessions after 30 min of inactivity), `runDailyTaskAutoGeneration` (daily — materializes due Recurring Tasks), plus AI Cost rollup and 60-day Activity-log pruning. All are idempotent — setup helpers check for an existing trigger before creating a duplicate.
- **Performance:** per-execution in-memory caches avoid re-opening the same spreadsheet multiple times within a single API call (reset every request, not a persistent cache). High-traffic client calls (login, panel bootstrap) are consolidated into single combined round trips specifically to stay under Apps Script's concurrent-execution ceiling with 50+ simultaneous recruiters.
- **Known recurring pitfall:** Google Sheets silently auto-converts date-looking cell values into real `Date` objects. Reading them back with a raw `String(cell).substring(0,10)` produces a broken, yearless date string that JavaScript will silently misparse (defaulting to year 2001) — this exact bug previously broke the referral-window "Expires" display. All date-cell reads should go through the shared `normalizeDateCell_` helper, never a raw string truncation.
- **Roster source of truth:** the Access Control "Recruiters" sheet is authoritative for user Type/Status across the whole system; a legacy "All Recruiters" tab in the Sales Nav Inventory spreadsheet is deprecated/vestigial and should not be used for new roster logic.
