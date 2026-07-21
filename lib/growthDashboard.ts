import { getSupabaseAdmin } from "./supabaseAdmin";
import { cleanClientName } from "./legacyMaps";

const DAY_MS = 86400000;
const SALESNAV_EXPIRE_DAYS = 29;

function dayKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

// Deliberately calendar-day windows (midnight-anchored), not GAS's
// wall-clock-relative-to-page-load rolling windows — see PROJECT_HANDOFF
// notes: this is an intentional, confirmed deviation for predictability.
function periodBoundaries() {
  const now = new Date();
  return {
    today: dayKey(now),
    yesterday: dayKey(new Date(now.getTime() - DAY_MS)),
    cut7: dayKey(new Date(now.getTime() - 6 * DAY_MS)),
    cut14: dayKey(new Date(now.getTime() - 13 * DAY_MS)),
    cut28: dayKey(new Date(now.getTime() - 27 * DAY_MS))
  };
}

type PeriodCounts = { today: number; yesterday: number; last7: number; last14: number; last28: number };

function emptyPeriodCounts(): PeriodCounts {
  return { today: 0, yesterday: 0, last7: 0, last14: 0, last28: 0 };
}

function bumpPeriod(counts: PeriodCounts, dateStr: string, b: ReturnType<typeof periodBoundaries>) {
  if (!dateStr) return;
  if (dateStr === b.today) counts.today++;
  if (dateStr === b.yesterday) counts.yesterday++;
  if (dateStr >= b.cut7) counts.last7++;
  if (dateStr >= b.cut14) counts.last14++;
  if (dateStr >= b.cut28) counts.last28++;
}

function toDateKey(value: unknown): string {
  if (!value) return "";
  const str = String(value);
  return str.length >= 10 ? str.slice(0, 10) : "";
}

function normalizeRecruiterType(type: string): "BD/Inhouse" | "PH" {
  const t = String(type || "").toLowerCase();
  if (t.includes("bd") || t.includes("in")) return "BD/Inhouse";
  return "PH";
}

// Client Status bucketing — substring-sniffed cascade on the free-text
// Master Tracker "Current Status"/campaign_status column, priority order
// matters and matches GAS exactly (first match wins, no whitelist/enum).
function bucketClientStatus(status: string) {
  const s = String(status || "").toLowerCase();
  if (s.includes("fire")) return "onFire";
  if (s.includes("smok")) return "smokin";
  if (s.includes("track")) return "onTrack";
  if (s.includes("improv")) return "improving";
  if (s.includes("pause")) return "paused";
  if (s.includes("wait")) return "waitlist";
  if (s.includes("activ")) return "active";
  return "other";
}

type RosterMember = { id: string; email: string; name: string; type: "BD/Inhouse" | "PH"; workingAgeDays: number | null };

async function getRoster(): Promise<RosterMember[]> {
  const { data } = await (getSupabaseAdmin() as any)
    .from("app_users")
    .select("id,email,name,legacy_type,status,created_at")
    .eq("role", "recruiter")
    .eq("status", "approved");
  const now = Date.now();
  return (data || []).map((u: any) => ({
    id: u.id as string,
    email: String(u.email || ""),
    name: String(u.name || ""),
    type: normalizeRecruiterType(u.legacy_type),
    workingAgeDays: u.created_at ? Math.max(0, Math.floor((now - Date.parse(u.created_at)) / DAY_MS)) : null
  }));
}

function computeSalesNavDaysLeft(dateAdded: string | null) {
  if (!dateAdded) return null;
  const start = new Date(`${String(dateAdded).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return null;
  const expire = start.getTime() + SALESNAV_EXPIRE_DAYS * DAY_MS;
  const today = new Date(`${dayKey(new Date())}T00:00:00Z`).getTime();
  return Math.ceil((expire - today) / DAY_MS);
}

export async function getGrowthDashboard() {
  const supabase = getSupabaseAdmin() as any;
  const b = periodBoundaries();
  const roster = await getRoster();
  const rosterById = new Map(roster.map((r) => [r.id, r]));

  const [campaignsRes, waitListRes, salesNavRes, allUsersRes] = await Promise.all([
    supabase.from("campaigns").select("campaign_name,campaign_status"),
    supabase.from("wait_list").select("id", { count: "exact", head: true }),
    supabase.from("sales_nav_inventory").select("date_added"),
    // Broader than the active-recruiter roster — used only as a name
    // fallback for sends attributed to a user who no longer qualifies as an
    // active recruiter (status changed, reassigned, etc.), so the drilldown
    // shows their real name instead of "Unknown".
    supabase.from("app_users").select("id,name")
  ]);
  const allUsersById = new Map((allUsersRes.data || []).map((u: any) => [u.id, u.name as string]));

  // --- Client Status ---
  const clients = { onFire: 0, smokin: 0, onTrack: 0, improving: 0, paused: 0, waitlist: 0, active: 0, other: 0, total: 0 };
  const byBucket: Record<string, string[]> = { onFire: [], smokin: [], onTrack: [], improving: [], paused: [], waitlist: [], active: [], other: [] };
  (campaignsRes.data || []).forEach((row: any) => {
    const name = cleanClientName(row.campaign_name || "");
    if (!name) return;
    clients.total++;
    const bucket = bucketClientStatus(row.campaign_status) as keyof typeof clients;
    clients[bucket]++;
    byBucket[bucket].push(name);
  });
  Object.values(byBucket).forEach((list) => list.sort((a, c) => a.localeCompare(c)));
  const activeClients = clients.onFire + clients.smokin + clients.onTrack + clients.improving;
  const waitlistTabCount = waitListRes.count || 0;

  // --- Appointments (Leads Ledger), excluding cancelled campaigns ---
  const apptsCutoff = b.cut28;
  const [leadsWindowRes, leadsTotalRes] = await Promise.all([
    supabase.from("leads_ledger").select("campaign_name,date_created,recruiter_id").gte("date_created", `${apptsCutoff}T00:00:00Z`).limit(5000),
    supabase.from("leads_ledger").select("id", { count: "exact", head: true }).not("campaign_name", "ilike", "%canc%")
  ]);
  const appts = emptyPeriodCounts();
  const apptsByRecruiter14 = new Map<string, number>();
  const apptsByType = { "BD/Inhouse": emptyPeriodCounts(), PH: emptyPeriodCounts() };
  (leadsWindowRes.data || []).forEach((row: any) => {
    const campaignLower = String(row.campaign_name || "").toLowerCase();
    if (!campaignLower || campaignLower.includes("canc")) return;
    const dateStr = toDateKey(row.date_created);
    bumpPeriod(appts, dateStr, b);
    if (dateStr >= b.cut14 && row.recruiter_id) {
      apptsByRecruiter14.set(row.recruiter_id, (apptsByRecruiter14.get(row.recruiter_id) || 0) + 1);
    }
    const recruiter = row.recruiter_id ? rosterById.get(row.recruiter_id) : null;
    if (recruiter) bumpPeriod(apptsByType[recruiter.type], dateStr, b);
  });
  const apptsTotal = leadsTotalRes.count || 0;

  // --- Sends (outreach_logs / Master DB) ---
  const [sendsWindowRes] = await Promise.all([
    supabase.from("outreach_logs").select("recruiter_id,created_at").gte("created_at", `${apptsCutoff}T00:00:00Z`).limit(20000)
  ]);
  const sends = emptyPeriodCounts();
  const sendsByRecruiter14 = new Map<string, number>();
  const sendsByRecruiterPeriod = new Map<string, PeriodCounts>();
  const sendsByType = { "BD/Inhouse": emptyPeriodCounts(), PH: emptyPeriodCounts() };
  (sendsWindowRes.data || []).forEach((row: any) => {
    const dateStr = toDateKey(row.created_at);
    bumpPeriod(sends, dateStr, b);
    if (row.recruiter_id) {
      if (dateStr >= b.cut14) sendsByRecruiter14.set(row.recruiter_id, (sendsByRecruiter14.get(row.recruiter_id) || 0) + 1);
      if (!sendsByRecruiterPeriod.has(row.recruiter_id)) sendsByRecruiterPeriod.set(row.recruiter_id, emptyPeriodCounts());
      bumpPeriod(sendsByRecruiterPeriod.get(row.recruiter_id)!, dateStr, b);
    }
    const recruiter = row.recruiter_id ? rosterById.get(row.recruiter_id) : null;
    if (recruiter) bumpPeriod(sendsByType[recruiter.type], dateStr, b);
  });
  const sendsByRecruiterList = (period: keyof PeriodCounts) =>
    Array.from(sendsByRecruiterPeriod.entries())
      .map(([id, counts]) => ({ name: rosterById.get(id)?.name || allUsersById.get(id) || "Unknown", type: rosterById.get(id)?.type || "", count: counts[period] }))
      .filter((r) => r.count > 0)
      .sort((a, b2) => b2.count - a.count);

  // --- All Appointments master sheet (appointments table) + recall reasons ---
  const [allApptWindowRes, allApptTotalRes] = await Promise.all([
    supabase.from("appointments").select("event_created_at,canceled,responses").gte("event_created_at", `${apptsCutoff}T00:00:00Z`).limit(5000),
    supabase.from("appointments").select("canceled,responses")
  ]);
  const allAppt = { received: emptyPeriodCounts(), process: emptyPeriodCounts(), recall: emptyPeriodCounts() };
  (allApptWindowRes.data || []).forEach((row: any) => {
    const dateStr = toDateKey(row.event_created_at);
    bumpPeriod(allAppt.received, dateStr, b);
    const isCanceled = String(row.canceled || "").trim() !== "";
    bumpPeriod(isCanceled ? allAppt.recall : allAppt.process, dateStr, b);
  });
  const recallReasons = { lookingForJob: 0, vendor: 0, other: 0 };
  (allApptTotalRes.data || []).forEach((row: any) => {
    const isCanceled = String(row.canceled || "").trim() !== "";
    if (!isCanceled) return;
    const responses = String(row.responses || "").toLowerCase();
    if (responses.includes("looking for") && responses.includes("job")) recallReasons.lookingForJob++;
    else if (responses.includes("vendor")) recallReasons.vendor++;
    else recallReasons.other++;
  });

  // --- Active Sales Nav ---
  const activeSalesNav = (salesNavRes.data || []).filter((row: any) => {
    const daysLeft = computeSalesNavDaysLeft(row.date_added);
    return daysLeft !== null && daysLeft >= 0;
  }).length;

  // --- S2A by type (aggregate volume, not averaged per-recruiter) ---
  const periodKeys: Array<keyof PeriodCounts> = ["today", "yesterday", "last7", "last14", "last28"];
  const s2aByType = { "BD/Inhouse": {} as Record<string, { s2a: number; sendsPerAppt: number | null; appts: number; sends: number }>, PH: {} as Record<string, { s2a: number; sendsPerAppt: number | null; appts: number; sends: number }> };
  (["BD/Inhouse", "PH"] as const).forEach((type) => {
    periodKeys.forEach((period) => {
      const a = apptsByType[type][period];
      const s = sendsByType[type][period];
      // "Sends per appointment" (GAS's S2A-by-type tile) is deliberately
      // sends/appts, distinct from the appts/sends S2A% used elsewhere.
      // null (rendered "—") when there were no sends at all — a real "no
      // activity yet" state, not a meaningful zero ratio.
      const sendsPerAppt = s === 0 ? null : a > 0 ? Math.round(s / a) : s;
      s2aByType[type][period] = { appts: a, sends: s, s2a: s > 0 ? Math.round((a / s) * 100) : 0, sendsPerAppt };
    });
  });

  // --- Top 5 by appointments / Non-Productive (14-day window) ---
  const s2aByRecruiter = roster.map((r) => {
    const rAppts = apptsByRecruiter14.get(r.id) || 0;
    const rSends = sendsByRecruiter14.get(r.id) || 0;
    return { name: r.name, email: r.email, type: r.type, workingAgeDays: r.workingAgeDays, appts14: rAppts, sends14: rSends, s2a: rSends > 0 ? Math.round((rAppts / rSends) * 100) : 0 };
  });
  const top5ByAppts = [...s2aByRecruiter].sort((a, c) => (c.appts14 - a.appts14) || (c.sends14 - a.sends14)).slice(0, 5);
  const nonProductive = s2aByRecruiter.filter((r) => r.appts14 === 0).map((r) => ({ name: r.name, email: r.email, workingAgeDays: r.workingAgeDays }));

  const bdInhouseCount = roster.filter((r) => r.type === "BD/Inhouse").length;
  const phCount = roster.filter((r) => r.type === "PH").length;

  return {
    clients: { ...clients, activeClients, waitlistTabCount, byBucket },
    appts: { ...appts, total: apptsTotal },
    allAppt: { ...allAppt, recallReasons },
    sends: { ...sends, byType: s2aByType, sendsByRecruiterList: Object.fromEntries(periodKeys.map((p) => [p, sendsByRecruiterList(p)])) },
    recruiters: { active: roster.length, bdInhouseCount, phCount, activeSalesNav, top5ByAppts, nonProductive, s2aByRecruiter },
    s2aByType
  };
}

export async function getRecruiterOnlineStatus() {
  const roster = await getRoster();
  const { data: logs } = await (getSupabaseAdmin() as any)
    .from("time_logs")
    .select("user_id,started_at,ended_at,last_activity_at")
    .in("user_id", roster.map((r) => r.id))
    .order("started_at", { ascending: false })
    .limit(5000);

  const today = dayKey(new Date());
  const fiveDaysMs = 5 * DAY_MS;
  const now = Date.now();
  const byUser = new Map<string, { hasRowToday: boolean; openToday: boolean; lastSeenMs: number }>();
  roster.forEach((r) => byUser.set(r.id, { hasRowToday: false, openToday: false, lastSeenMs: 0 }));
  (logs || []).forEach((row: any) => {
    const entry = byUser.get(row.user_id);
    if (!entry) return;
    const startedDate = toDateKey(row.started_at);
    const seenMs = row.last_activity_at ? Date.parse(row.last_activity_at) : row.started_at ? Date.parse(row.started_at) : 0;
    if (seenMs > entry.lastSeenMs) entry.lastSeenMs = seenMs;
    if (startedDate === today) {
      entry.hasRowToday = true;
      if (!row.ended_at) entry.openToday = true;
    }
  });

  const buckets = { online: [] as any[], offline: [] as any[], notStarted: [] as any[], inactive5d: [] as any[] };
  roster.forEach((r) => {
    const entry = byUser.get(r.id)!;
    const lastSeen = entry.lastSeenMs ? new Date(entry.lastSeenMs).toISOString() : null;
    const row = { name: r.name, type: r.type, lastSeen };
    if (entry.openToday) buckets.online.push(row);
    else if (entry.hasRowToday) buckets.offline.push(row);
    else buckets.notStarted.push(row);
    if (!entry.lastSeenMs || now - entry.lastSeenMs > fiveDaysMs) buckets.inactive5d.push(row);
  });
  (Object.keys(buckets) as Array<keyof typeof buckets>).forEach((key) => buckets[key].sort((a, b2) => a.name.localeCompare(b2.name)));

  // Per-bucket BD/Inhouse vs PH breakdown, shown as each tile's sub-note.
  const counts: Record<string, { bdInhouse: number; ph: number }> = {};
  (Object.keys(buckets) as Array<keyof typeof buckets>).forEach((key) => {
    counts[key] = {
      bdInhouse: buckets[key].filter((row: any) => row.type === "BD/Inhouse").length,
      ph: buckets[key].filter((row: any) => row.type === "PH").length
    };
  });

  return { ...buckets, counts };
}

async function recruitersOnLeaveForDate(dateStr: string) {
  const { data } = await (getSupabaseAdmin() as any)
    .from("leave_requests")
    .select("name,email,leave_date,duration_days,reason");
  return (data || [])
    .map((row: any) => {
      const leaveDate = String(row.leave_date || "").slice(0, 10);
      const duration = Number(row.duration_days || 0);
      if (!leaveDate || !duration) return null;
      const endDate = dayKey(new Date(Date.parse(`${leaveDate}T12:00:00Z`) + (duration - 1) * DAY_MS));
      if (dateStr < leaveDate || dateStr > endDate) return null;
      return { name: row.name, email: row.email, leaveDate, endDate, reason: row.reason || "" };
    })
    .filter(Boolean);
}

export async function getRecruitersOnLeave() {
  return recruitersOnLeaveForDate(dayKey(new Date()));
}

// Daily Feedback table — matches GAS apiCeoGetFeedbackSubmissions(email,
// dateStr): submissions for one specific date, unreviewed only.
export async function getFeedbackForDate(dateStr: string) {
  const targetDate = dateStr || dayKey(new Date());
  const { data } = await (getSupabaseAdmin() as any)
    .from("daily_feedback")
    .select("*")
    .eq("submitted_date", targetDate)
    .eq("reviewed", false)
    .order("created_at", { ascending: false });
  return { rows: data || [] };
}

// Wait List tile drilldown — matches GAS apiCeoGetWaitList. This is the
// literal Wait List sheet tab (prospective clients not yet launched),
// distinct from the Master-Tracker-status-cascade "waitlist" bucket in
// clients.byBucket, which is a different thing entirely (a client whose
// Current Status text happens to contain "wait").
export async function getWaitList() {
  const { data } = await (getSupabaseAdmin() as any)
    .from("wait_list")
    .select("client_name,contact_email,eta_launch,notes")
    .order("entry_date", { ascending: false });
  return (data || []).map((row: any) => ({
    name: row.client_name || "",
    sub: [row.eta_launch ? `ETA: ${row.eta_launch}` : "", row.contact_email || ""].filter(Boolean).join(" · ")
  }));
}

export async function getRecruitersOnLeaveTomorrow() {
  return recruitersOnLeaveForDate(dayKey(new Date(Date.now() + DAY_MS)));
}

// New Nurture Sent / FU Sent — read from the Supabase `contacts` mirror
// (date_j/k/l/m columns), refreshed by scripts/migrate-sheets.ts. GAS itself
// live-scans every recruiter's FU Tracker sheet for this, but that means ~50
// Sheets-API round trips per load (slow, and hits Sheets' per-minute quota
// with this many recruiters). Per explicit direction, Growth's reporting
// reads only from Supabase — the recruiter action path (save/read in the
// Recruiter panel) is still Sheets-only; this is a reporting-only read of a
// periodically-refreshed mirror, not a live operational read/write.
export async function getNurtureFuStats() {
  const roster = await getRoster();
  const rosterById = new Map(roster.map((r) => [r.id, r]));
  const b = periodBoundaries();
  const newNurture = emptyPeriodCounts();
  const fuSent = emptyPeriodCounts();
  const fuByStage = { fu1: 0, fu2: 0, fu3: 0 };
  const newNurtureByType = { "BD/Inhouse": emptyPeriodCounts(), PH: emptyPeriodCounts() };
  const fuByType = { "BD/Inhouse": emptyPeriodCounts(), PH: emptyPeriodCounts() };

  const { data } = await (getSupabaseAdmin() as any)
    .from("contacts")
    .select("recruiter_id,date_j,date_k,date_l,date_m")
    .limit(20000);

  (data || []).forEach((row: any) => {
    const recruiter = row.recruiter_id ? rosterById.get(row.recruiter_id) : null;
    const dJ = toDateKey(row.date_j);
    const dK = toDateKey(row.date_k);
    const dL = toDateKey(row.date_l);
    const dM = toDateKey(row.date_m);
    if (dJ) {
      bumpPeriod(newNurture, dJ, b);
      if (recruiter) bumpPeriod(newNurtureByType[recruiter.type], dJ, b);
    }
    if (dK) { bumpPeriod(fuSent, dK, b); if (recruiter) bumpPeriod(fuByType[recruiter.type], dK, b); fuByStage.fu1++; }
    if (dL) { bumpPeriod(fuSent, dL, b); if (recruiter) bumpPeriod(fuByType[recruiter.type], dL, b); fuByStage.fu2++; }
    if (dM) { bumpPeriod(fuSent, dM, b); if (recruiter) bumpPeriod(fuByType[recruiter.type], dM, b); fuByStage.fu3++; }
  });

  return { newNurture: { ...newNurture, byType: newNurtureByType }, fuSent: { ...fuSent, byType: fuByType, byStage: fuByStage } };
}

export async function getS2AByRecruiterRange(startDate: string, endDate: string) {
  const roster = await getRoster();
  const rosterById = new Map(roster.map((r) => [r.id, r]));
  const supabase = getSupabaseAdmin() as any;
  const [leadsRes, sendsRes] = await Promise.all([
    supabase.from("leads_ledger").select("campaign_name,date_created,recruiter_id").gte("date_created", `${startDate}T00:00:00Z`).lte("date_created", `${endDate}T23:59:59Z`).limit(10000),
    supabase.from("outreach_logs").select("recruiter_id,created_at").gte("created_at", `${startDate}T00:00:00Z`).lte("created_at", `${endDate}T23:59:59Z`).limit(20000)
  ]);
  const apptsById = new Map<string, number>();
  (leadsRes.data || []).forEach((row: any) => {
    const campaignLower = String(row.campaign_name || "").toLowerCase();
    if (!campaignLower || campaignLower.includes("canc") || !row.recruiter_id) return;
    apptsById.set(row.recruiter_id, (apptsById.get(row.recruiter_id) || 0) + 1);
  });
  const sendsById = new Map<string, number>();
  (sendsRes.data || []).forEach((row: any) => {
    if (!row.recruiter_id) return;
    sendsById.set(row.recruiter_id, (sendsById.get(row.recruiter_id) || 0) + 1);
  });
  const rows = roster.map((r) => {
    const rAppts = apptsById.get(r.id) || 0;
    const rSends = sendsById.get(r.id) || 0;
    return { name: r.name, type: r.type, workingAgeDays: r.workingAgeDays, appts: rAppts, sends: rSends, s2a: rSends > 0 ? Math.round((rAppts / rSends) * 100) : 0 };
  }).sort((a, c) => (c.appts - a.appts) || (c.s2a - a.s2a));

  const byType = { "BD/Inhouse": { appts: 0, sends: 0 }, PH: { appts: 0, sends: 0 } };
  rows.forEach((r) => { byType[r.type as "BD/Inhouse" | "PH"].appts += r.appts; byType[r.type as "BD/Inhouse" | "PH"].sends += r.sends; });
  const s2aOf = (t: { appts: number; sends: number }) => (t.sends > 0 ? Math.round((t.appts / t.sends) * 100) : 0);

  return {
    rows,
    byType: {
      "BD/Inhouse": { ...byType["BD/Inhouse"], s2a: s2aOf(byType["BD/Inhouse"]) },
      PH: { ...byType.PH, s2a: s2aOf(byType.PH) }
    }
  };
}

// Reports tab — Recruiter Directory, matching GAS apiCeoGetRecruiterDirectory
// but entirely Supabase-sourced (all-time appts/sends + Sales Nav seat
// counts), no per-recruiter Sheets reach-in.
export async function getRecruiterDirectory() {
  const roster = await getRoster();
  const rosterByEmail = new Map(roster.map((r) => [r.email.toLowerCase(), r]));
  const supabase = getSupabaseAdmin() as any;
  const b = periodBoundaries();

  const [leadsRes, sendsRes, salesNavRes] = await Promise.all([
    supabase.from("leads_ledger").select("campaign_name,recruiter_id"),
    supabase.from("outreach_logs").select("recruiter_id,created_at"),
    supabase.from("sales_nav_inventory").select("recruiter_email,date_added")
  ]);

  const apptsTotal = new Map<string, number>();
  (leadsRes.data || []).forEach((row: any) => {
    const campaignLower = String(row.campaign_name || "").toLowerCase();
    if (!campaignLower || campaignLower.includes("canc") || !row.recruiter_id) return;
    apptsTotal.set(row.recruiter_id, (apptsTotal.get(row.recruiter_id) || 0) + 1);
  });

  const sendsTotal = new Map<string, number>();
  const sendsYesterday = new Map<string, number>();
  (sendsRes.data || []).forEach((row: any) => {
    if (!row.recruiter_id) return;
    sendsTotal.set(row.recruiter_id, (sendsTotal.get(row.recruiter_id) || 0) + 1);
    if (toDateKey(row.created_at) === b.yesterday) sendsYesterday.set(row.recruiter_id, (sendsYesterday.get(row.recruiter_id) || 0) + 1);
  });

  const salesNavTotal = new Map<string, number>();
  const salesNavActive = new Map<string, number>();
  (salesNavRes.data || []).forEach((row: any) => {
    const recruiter = rosterByEmail.get(String(row.recruiter_email || "").toLowerCase());
    if (!recruiter) return;
    salesNavTotal.set(recruiter.id, (salesNavTotal.get(recruiter.id) || 0) + 1);
    const daysLeft = computeSalesNavDaysLeft(row.date_added);
    if (daysLeft !== null && daysLeft >= 0) salesNavActive.set(recruiter.id, (salesNavActive.get(recruiter.id) || 0) + 1);
  });

  const rows = roster.map((r) => ({
    name: r.name,
    email: r.email,
    type: r.type,
    workingAgeDays: r.workingAgeDays,
    salesNavActive: salesNavActive.get(r.id) || 0,
    salesNavTotal: salesNavTotal.get(r.id) || 0,
    apptsTotal: apptsTotal.get(r.id) || 0,
    sendsTotal: sendsTotal.get(r.id) || 0,
    sendsYesterday: sendsYesterday.get(r.id) || 0
  })).sort((a, c) => (c.apptsTotal - a.apptsTotal) || (c.sendsTotal - a.sendsTotal));

  return { rows };
}
