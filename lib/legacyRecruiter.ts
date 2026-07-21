import { CONFIG } from "./config";
import { clearSession, setSession } from "./auth";
import { appendValues, colName, findSheetTitle, findSheetTitleExact, getValues, listSheetTitles, quoteSheetName, updateValues } from "./sheets";
import { cleanClientName, FU, normalizeDateCell, normalizeLi, RC, SheetRow, todayIso } from "./legacyMaps";
import { getSupabaseAdmin } from "./supabaseAdmin";
import { cached, invalidate } from "./ttlCache";

const ACCESS_TAB = "Recruiters";

/**
 * Drops this recruiter's memoized Sheets reads. Call after any write that
 * changes their Access Control row (credits) or Daily Assignment tab, so the
 * next read reflects it immediately instead of waiting out the TTL.
 */
function invalidateRecruiterCache(email: string) {
  const key = String(email || "").toLowerCase().trim();
  invalidate(`recruiter:${key}`);
  invalidate(`clients:${key}`);
}

export type RecruiterRecord = {
  rowNumber: number;
  email: string;
  name: string;
  status: string;
  type: string;
  sheetId: string;
  password: string;
  nBal: number;
  oBal: number;
  pBal: number;
  nLimit: number;
  oLimit: number;
  pLimit: number;
  raw: SheetRow;
};

export type ClientAssignment = {
  name: string;
  status: string;
  eventUrl: string;
  nurturePct: string;
  canyAppts: string;
  flagNotes: string;
};

export type DailyTask = {
  name: string;
  li: string;
  client: string;
  stage: string;
  nurtureType: string;
  row: number;
  status: string;
  notes: string;
  canyFlag: string;
  daysWaiting?: number | null;
  paused?: boolean;
};

async function findSupabaseUser(email: string): Promise<{ id: string; email: string; name: string } | null> {
  try {
    const { data } = await (getSupabaseAdmin() as any)
      .from("app_users")
      .select("id,email,name")
      .eq("email", String(email || "").toLowerCase().trim())
      .maybeSingle();
    return data || null;
  } catch {
    return null;
  }
}

async function findOrCreateSupabaseClient(name: string): Promise<string | null> {
  const cleaned = cleanClientName(name);
  if (!cleaned) return null;
  try {
    const supabase = getSupabaseAdmin() as any;
    const { data: existing } = await supabase
      .from("clients")
      .select("id")
      .eq("name", cleaned)
      .maybeSingle();
    const existingClient = existing as { id?: string } | null;
    if (existingClient?.id) return existingClient.id;

    const { data: inserted } = await supabase
      .from("clients")
      .insert({ name: cleaned })
      .select("id")
      .single();
    const insertedClient = inserted as { id?: string } | null;
    return insertedClient?.id || null;
  } catch {
    return null;
  }
}

// Primary write target for FU Tracker actions (Outreach/Nurture save, status
// changes, CA/NY flag) — Supabase is written FIRST so the recruiter never
// waits on the Sheets API, then the recruiter's own FU Tracker sheet is
// updated second, best-effort. recruiter_name/email are stored directly on
// the row so Growth/Ops can identify the owner without a join.
async function upsertSupabaseContact(email: string, data: {
  name?: string;
  li: string;
  clientName?: string;
  status?: string;
  nextAction?: string;
  conversation?: string;
  reply?: string;
  source?: string;
  salesNavId?: string;
  code?: string;
  tag?: string;
  cany?: boolean;
  outreachType?: string;
  legacyRow?: number;
  lastNurtureType?: string;
  dateJ?: string;
  dateK?: string;
  dateL?: string;
  dateM?: string;
}) {
  const user = await findSupabaseUser(email);
  const normalized = normalizeLi(data.li);
  if (!user || !normalized) return;

  const clientId = await findOrCreateSupabaseClient(data.clientName || "");
  try {
    await (getSupabaseAdmin() as any)
      .from("contacts")
      .upsert({
        recruiter_id: user.id,
        recruiter_name: user.name,
        recruiter_email: user.email,
        name: data.name || "",
        linkedin_url: data.li,
        normalized_linkedin_url: normalized,
        client_id: clientId,
        status: data.status || "",
        next_action: data.nextAction || "",
        conversation: data.conversation || "",
        reply: data.reply || "",
        date_j: data.dateJ || null,
        date_k: data.dateK || null,
        date_l: data.dateL || null,
        date_m: data.dateM || null,
        source: data.source || "",
        sales_nav_id: data.salesNavId || "",
        code: data.code || "",
        tag: data.tag || "",
        cany: Boolean(data.cany),
        outreach_type: data.outreachType || "",
        legacy_row: data.legacyRow || null,
        last_nurture_type: data.lastNurtureType || "",
        last_synced_to_sheet_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, { onConflict: "recruiter_id,normalized_linkedin_url" });
  } catch (e) {
    console.error("upsertSupabaseContact failed:", e);
  }
}

async function insertSupabaseOutreach(email: string, data: {
  name: string;
  li: string;
  outreachType: string;
  subject: string;
  message: string;
}) {
  const user = await findSupabaseUser(email);
  if (!user) return;
  try {
    const { data: contact } = await (getSupabaseAdmin() as any)
      .from("contacts")
      .select("id")
      .eq("recruiter_id", user.id)
      .eq("normalized_linkedin_url", normalizeLi(data.li))
      .maybeSingle();
    await (getSupabaseAdmin() as any).from("outreach_logs").insert({
      recruiter_id: user.id,
      contact_id: contact?.id || null,
      prospect_name: data.name,
      linkedin_url: data.li,
      outreach_type: data.outreachType,
      subject: data.subject,
      message: data.message
    });
  } catch {
    // Non-blocking during transition.
  }
}

/**
 * Resolves a recruiter's Access Control row.
 *
 * Memoized: this reads the whole Access Control sheet, and it sits behind
 * getFuSheet / getDailyAssignmentSheet / getTargetAreaSheet / getUsage, so a
 * single bootstrap used to trigger it about six times. See lib/ttlCache.ts.
 */
export async function findRecruiter(email: string): Promise<RecruiterRecord | null> {
  return cached(`recruiter:${String(email || "").toLowerCase().trim()}`, 30_000, () =>
    findRecruiterUncached(email)
  );
}

async function findRecruiterUncached(email: string): Promise<RecruiterRecord | null> {
  const values = await getValues(CONFIG.accessSheetId, `${quoteSheetName(ACCESS_TAB)}!A2:T`);
  const target = String(email || "").toLowerCase().trim();
  for (let i = 0; i < values.length; i++) {
    const row = values[i] as SheetRow;
    if (String(row[RC.EMAIL] || "").toLowerCase().trim() !== target) continue;
    return {
      rowNumber: i + 2,
      email: String(row[RC.EMAIL] || "").toLowerCase().trim(),
      name: String(row[RC.NAME] || "").trim(),
      status: String(row[RC.STATUS] || "").trim(),
      type: String(row[RC.TYPE] || "PH").trim(),
      sheetId: String(row[RC.SHEET_ID] || "").trim(),
      password: String(row[RC.PASSWORD] || "").trim(),
      nBal: Number(row[RC.N_BAL] || 0),
      oBal: Number(row[RC.O_BAL] || 0),
      pBal: Number(row[RC.P_BAL] || 0),
      nLimit: Number(row[RC.N_LIMIT] || 0),
      oLimit: Number(row[RC.O_LIMIT] || 0),
      pLimit: Number(row[RC.P_LIMIT] || 0),
      raw: row
    };
  }
  return null;
}

export function roleForLegacyType(type: string) {
  const low = String(type || "").toLowerCase().trim();
  if (low.startsWith("op")) return "operations";
  if (low.startsWith("agent")) return "agent";
  if (low === "growth") return "growth";
  if (low === "client") return "client";
  if (low === "admin") return "admin";
  return "recruiter";
}

export function pageForRole(role: string) {
  if (role === "operations") return "/operations";
  if (role === "agent") return "/agent";
  if (role === "growth") return "/growth";
  if (role === "client") return "/client";
  if (role === "admin") return "/admin";
  return "/recruiter";
}

export async function loginAccessUser(email: string, password: string) {
  const supabaseLogin = await loginSupabaseUser(email, password);
  if (supabaseLogin) return supabaseLogin;

  const rec = await findRecruiter(email);
  if (!rec) return { ok: false, status: "not_found" };
  const status = rec.status.toLowerCase();
  if (status !== "approved") return { ok: false, status };
  if (rec.password && rec.password !== String(password || "").trim()) {
    return { ok: false, error: "Invalid password." };
  }
  const role = roleForLegacyType(rec.type);
  setSession({ email: rec.email, name: rec.name, type: rec.type });
  return {
    ok: true,
    name: rec.name,
    email: rec.email,
    type: rec.type,
    role,
    page: pageForRole(role),
    nurtureBalance: rec.nBal,
    outreachBalance: rec.oBal,
    profileBalance: rec.pBal,
    nurtureLimit: rec.nLimit,
    outreachLimit: rec.oLimit,
    profileLimit: rec.pLimit
  };
}

export const loginRecruiter = loginAccessUser;

async function loginSupabaseUser(email: string, password: string) {
  try {
    const { data: rec } = await (getSupabaseAdmin() as any)
      .from("app_users")
      .select("email,name,status,role,legacy_type,password_hash,legacy_sheet_id,expires_at")
      .eq("email", String(email || "").toLowerCase().trim())
      .maybeSingle();
    if (!rec) return null;
    let status = String(rec.status || "").toLowerCase();
    // Access-window expiry — auto-flip to 'expired' on login, matching GAS
    // apiLogin, rather than requiring an admin to notice and remove access.
    if (status === "approved" && rec.expires_at) {
      const expDate = new Date(`${rec.expires_at}T00:00:00Z`);
      if (!Number.isNaN(expDate.getTime()) && expDate.getTime() < Date.now()) {
        status = "expired";
        await (getSupabaseAdmin() as any).from("app_users").update({ status: "expired" }).eq("email", rec.email);
      }
    }
    if (status !== "approved") return { ok: false, status };
    const storedPassword = String(rec.password_hash || "").trim();
    if (storedPassword && storedPassword !== String(password || "").trim()) {
      return { ok: false, error: "Invalid password." };
    }
    const type = String(rec.legacy_type || rec.role || "PH");
    const role = roleForLegacyType(type);
    setSession({ email: rec.email, name: rec.name, type });
    const usage = await getUsage(rec.email);
    return {
      ok: true,
      name: rec.name,
      email: rec.email,
      type,
      role,
      page: pageForRole(role),
      ...(usage || {})
    };
  } catch {
    return null;
  }
}

export function logoutRecruiter(email = "") {
  // Drop this recruiter's memoized Sheets reads on the way out, so a later
  // login (or a Growth impersonation of the same person) starts from fresh
  // Access Control / Daily Assignment data rather than a warm entry.
  if (email) invalidateRecruiterCache(email);
  clearSession();
}

/**
 * Public cache-buster for callers that change a recruiter's Access Control row
 * or Daily Assignment tab (e.g. admin tooling), so the change is visible
 * immediately instead of after the TTL.
 */
export function forgetRecruiterCache(email: string) {
  invalidateRecruiterCache(email);
}

// Time Log — online/offline heartbeat tracking (Supabase-only, matches GAS's
// TIME_LOG_ID sheet). Starting a session auto-closes any session left open
// by a stale panel teardown, matching GAS's 30-min-stale auto-close intent.
export async function timeLogStart(email: string) {
  const user = await findSupabaseUser(email);
  if (!user) return { error: "Unauthorized" };
  const supabase = getSupabaseAdmin() as any;
  await supabase.from("time_logs")
    .update({ ended_at: new Date().toISOString(), auto_closed: true })
    .eq("user_id", user.id)
    .is("ended_at", null);
  const { data } = await supabase.from("time_logs").insert({ user_id: user.id }).select("id").single();
  return { ok: true, sessionId: data?.id };
}

export async function timeLogPing(email: string, sessionId: string) {
  const user = await findSupabaseUser(email);
  if (!user || !sessionId) return { error: "Unauthorized" };
  const { data } = await (getSupabaseAdmin() as any).from("time_logs")
    .update({ last_activity_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .is("ended_at", null)
    .select("id");
  // No row matched (ended_at already set) — the session was closed
  // server-side (auto-close swept it, etc.). Signal the caller so it stops
  // pinging a dead row instead of doing so forever.
  if (!data || !data.length) return { ok: true, alreadyClosed: true };
  return { ok: true };
}

export async function timeLogEnd(email: string, sessionId: string) {
  const user = await findSupabaseUser(email);
  if (!user || !sessionId) return { error: "Unauthorized" };
  await (getSupabaseAdmin() as any).from("time_logs")
    .update({ ended_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("user_id", user.id);
  return { ok: true };
}

async function getFuSheet(email: string) {
  const rec = await findRecruiter(email);
  if (!rec || !rec.sheetId) return null;
  const title = await findSheetTitle(rec.sheetId, ["FU Tracker", "FU tracker", "Tracker", "Sheet1"]);
  return { spreadsheetId: rec.sheetId, title, rec };
}

async function getDailyAssignmentSheet(email: string) {
  const rec = await findRecruiter(email);
  if (!rec || !rec.sheetId) return null;
  const title = await findSheetTitle(rec.sheetId, ["Daily Assignment", "daily assignment", "Daily assignment"]);
  return { spreadsheetId: rec.sheetId, title, rec };
}

async function getTargetAreaSheet(email: string) {
  const rec = await findRecruiter(email);
  if (!rec || !rec.sheetId) return null;
  const title = await findSheetTitle(rec.sheetId, ["Target Area", "target area", "Target area"]);
  return { spreadsheetId: rec.sheetId, title, rec };
}

export async function getUsage(email: string) {
  const rec = await findRecruiter(email);
  if (!rec) return { error: "Unauthorized" };
  const supabaseUser = await findSupabaseUser(email);
  if (supabaseUser) {
    const { data } = await (getSupabaseAdmin() as any)
      .from("recruiter_credits")
      .select("nurture_balance,outreach_balance,profile_balance,nurture_limit,outreach_limit,profile_limit")
      .eq("user_id", supabaseUser.id)
      .maybeSingle();
    if (data) {
      return {
        nurtureBalance: Number(data.nurture_balance || 0),
        outreachBalance: Number(data.outreach_balance || 0),
        profileBalance: Number(data.profile_balance || 0),
        nurtureLimit: Number(data.nurture_limit || 0),
        outreachLimit: Number(data.outreach_limit || 0),
        profileLimit: Number(data.profile_limit || 0)
      };
    }
  }
  return {
    nurtureBalance: rec.nBal,
    outreachBalance: rec.oBal,
    profileBalance: rec.pBal,
    nurtureLimit: rec.nLimit,
    outreachLimit: rec.oLimit,
    profileLimit: rec.pLimit
  };
}

/**
 * The recruiter's Daily Assignment tab (client roster, statuses, DTC links).
 *
 * Memoized: getDailyTasks, getClientRatio and getNurtureTemplate each need
 * this, so one bootstrap previously read the same tab three times. Sheets-only
 * by design -- this stays the recruiter's own operational source of truth.
 * See lib/ttlCache.ts.
 */
export async function getClients(email: string) {
  return cached(`clients:${String(email || "").toLowerCase().trim()}`, 20_000, () =>
    getClientsUncached(email)
  );
}

async function getClientsUncached(email: string) {
  const sheet = await getDailyAssignmentSheet(email);
  if (!sheet) return { clients: [], error: "Daily Assignment tab not found" };
  const rows = await getValues(sheet.spreadsheetId, `${quoteSheetName(sheet.title)}!A2:F`);
  const clients: ClientAssignment[] = rows
    .map((row) => ({
      name: cleanClientName(String(row[0] || "")),
      status: String(row[1] || "").trim(),
      eventUrl: String(row[2] || "").trim(),
      nurturePct: String(row[3] || "").trim(),
      canyAppts: String(row[4] || "").trim(),
      flagNotes: String(row[5] || "").trim()
    }))
    .filter((c) => c.name);
  return { clients };
}

export async function getClientStatus(email: string, clientName: string) {
  const result = await getClients(email);
  const clients: ClientAssignment[] = "clients" in result ? result.clients : [];
  return clients.find((c) => c.name === cleanClientName(clientName))?.status || "";
}

export async function isClientPaused(email: string, clientName: string) {
  const status = await getClientStatus(email, clientName);
  return /paused/i.test(status);
}

export async function getFuContactName(email: string, li: string) {
  const found = await findFuRowByLi(email, li);
  return found ? String(found.row[FU.NAME] || "").trim() : "";
}

export async function findFuRowByLi(email: string, li: string) {
  const sheet = await getFuSheet(email);
  if (!sheet) return null;
  const rows = await getValues(sheet.spreadsheetId, `${quoteSheetName(sheet.title)}!A2:R`);
  const target = normalizeLi(li);
  const idx = rows.findIndex((row) => normalizeLi(String(row[FU.LI] || "")) === target);
  if (idx < 0) return null;
  return { ...sheet, rows, row: rows[idx] as SheetRow, rowNumber: idx + 2 };
}

function deriveTaskFromRow(row: SheetRow, rowNumber: number, today: string): { todayTask?: DailyTask; reviewTask?: DailyTask } {
  const name = String(row[FU.NAME] || "").trim();
  const li = String(row[FU.LI] || "").trim();
  if (!name && !li) return {};
  const status = String(row[FU.REPLY] || row[FU.STATUS] || "").trim();
  const sl = status.toLowerCase();
  if (["booked", "closed", "not interested", "recalled", "done", "profile restricted"].includes(sl)) return {};

  const dJ = normalizeDateCell(row[FU.DATE_J]);
  const dK = normalizeDateCell(row[FU.DATE_K]);
  const dL = normalizeDateCell(row[FU.DATE_L]);
  const dM = normalizeDateCell(row[FU.DATE_M]);
  const addDays = (date: string, days: number) => {
    if (!date) return "";
    const d = new Date(`${date}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };
  const due = (date: string) => Boolean(date && date <= today);

  let isDue = false;
  let stage = "";
  let nurtureType = "";
  if (sl === "interested") {
    isDue = due(dJ);
    stage = "SDFU Due";
    nurtureType = "SDFU";
  } else if (sl === "sdfu sent" || sl === "unsure" || sl === "unsure srfu") {
    isDue = due(addDays(dJ, 1));
    stage = "FU1 Due";
    nurtureType = "FU1";
  } else if (sl.includes("fu1") || sl === "int fu1 sent") {
    isDue = due(addDays(dK || dJ, 1));
    stage = "FU2 Due";
    nurtureType = "FU2";
  } else if (sl.includes("fu2") || sl === "int fu2 sent") {
    isDue = due(addDays(dL || dK, 1));
    stage = "FU3 Due";
    nurtureType = "FU3";
  } else if (sl === "dm-sn expire") {
    isDue = due(addDays(dL, 1));
    stage = "FU3 Due";
    nurtureType = "FU3";
  }

  const base = {
    name,
    li,
    client: cleanClientName(String(row[FU.CLIENT] || "")),
    row: rowNumber,
    status,
    notes: String(row[FU.SALES_NAV] || row[FU.CODE] || "").trim(),
    canyFlag: String(row[FU.CANY] || "").trim()
  };

  const result: { todayTask?: DailyTask; reviewTask?: DailyTask } = {};
  if (isDue && stage !== "Review Due") {
    result.todayTask = { ...base, stage, nurtureType };
  }
  if (sl.includes("fu3")) {
    const anchor = dM || dL;
    const daysWaiting = anchor ? Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${anchor}T00:00:00Z`)) / 86400000) : null;
    result.reviewTask = { ...base, stage: "Review Due", nurtureType: "", daysWaiting };
  }
  return result;
}

function deriveTaskFromContact(row: any, today: string): { todayTask?: DailyTask; reviewTask?: DailyTask } {
  const name = String(row.name || "").trim();
  const li = String(row.linkedin_url || "").trim();
  if (!name && !li) return {};
  const status = String(row.reply || row.status || "").trim();
  const sl = status.toLowerCase();
  if (["booked", "closed", "not interested", "recalled", "done", "profile restricted"].includes(sl)) return {};

  const addDays = (date: string, days: number) => {
    if (!date) return "";
    const d = new Date(`${date}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };
  const due = (date: string) => Boolean(date && date <= today);
  const dJ = normalizeDateCell(row.date_j);
  const dK = normalizeDateCell(row.date_k);
  const dL = normalizeDateCell(row.date_l);
  const dM = normalizeDateCell(row.date_m);

  let isDue = false;
  let stage = "";
  let nurtureType = "";
  if (sl === "interested") {
    isDue = due(dJ);
    stage = "SDFU Due";
    nurtureType = "SDFU";
  } else if (sl === "sdfu sent" || sl === "unsure" || sl === "unsure srfu") {
    isDue = due(addDays(dJ, 1));
    stage = "FU1 Due";
    nurtureType = "FU1";
  } else if (sl.includes("fu1") || sl === "int fu1 sent") {
    isDue = due(addDays(dK || dJ, 1));
    stage = "FU2 Due";
    nurtureType = "FU2";
  } else if (sl.includes("fu2") || sl === "int fu2 sent") {
    isDue = due(addDays(dL || dK, 1));
    stage = "FU3 Due";
    nurtureType = "FU3";
  } else if (sl === "dm-sn expire") {
    isDue = due(addDays(dL, 1));
    stage = "FU3 Due";
    nurtureType = "FU3";
  }

  const base = {
    name,
    li,
    client: cleanClientName(row.clients?.name || ""),
    row: Number(row.legacy_row || 0),
    status,
    notes: String(row.sales_nav_id || row.code || "").trim(),
    canyFlag: row.cany ? "Yes" : ""
  };

  const result: { todayTask?: DailyTask; reviewTask?: DailyTask } = {};
  if (isDue && stage !== "Review Due") result.todayTask = { ...base, stage, nurtureType };
  if (sl.includes("fu3")) {
    const anchor = dM || dL;
    const daysWaiting = anchor ? Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${anchor}T00:00:00Z`)) / 86400000) : null;
    result.reviewTask = { ...base, stage: "Review Due", nurtureType: "", daysWaiting };
  }
  return result;
}

async function getSupabaseDailyTasks(email: string) {
  const user = await findSupabaseUser(email);
  if (!user) return null;
  try {
    const { data, error } = await (getSupabaseAdmin() as any)
      .from("contacts")
      .select("name,linkedin_url,status,reply,date_j,date_k,date_l,date_m,sales_nav_id,code,cany,legacy_row,clients(name)")
      .eq("recruiter_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(5000);
    if (error || !data) return null;
    const today = todayIso();
    const tasks: DailyTask[] = [];
    const reviewTasks: DailyTask[] = [];
    data.forEach((row: any) => {
      const parsed = deriveTaskFromContact(row, today);
      if (parsed.todayTask) tasks.push(parsed.todayTask);
      if (parsed.reviewTask) reviewTasks.push(parsed.reviewTask);
    });
    return { tasks, reviewTasks };
  } catch {
    return null;
  }
}

async function getSheetDailyTasks(email: string) {
  const sheet = await getFuSheet(email);
  if (!sheet) return { tasks: [] as DailyTask[], reviewTasks: [] as DailyTask[] };
  const rows = await getValues(sheet.spreadsheetId, `${quoteSheetName(sheet.title)}!A2:R`);
  const today = todayIso();
  const tasks: DailyTask[] = [];
  const reviewTasks: DailyTask[] = [];
  for (let i = 0; i < rows.length; i++) {
    const parsed = deriveTaskFromRow(rows[i] as SheetRow, i + 2, today);
    if (parsed.todayTask) tasks.push(parsed.todayTask);
    if (parsed.reviewTask) reviewTasks.push(parsed.reviewTask);
  }
  return { tasks, reviewTasks };
}

// FU Tracker (Outreach/Nurture pipeline) reads Supabase first — recruiter
// actions write there immediately, so it's the fresher source — falling
// back to the recruiter's own Sheet only if Supabase has nothing yet (e.g.
// brand new recruiter). Daily Assignment (client list/paused status) stays
// Sheets-only per the agreed data architecture, so the paused-flag lookup
// below is unaffected by this switch.
export async function getDailyTasks(email: string) {
  const result = (await getSupabaseDailyTasks(email)) || (await getSheetDailyTasks(email));
  const clients: ClientAssignment[] = (await getClients(email)).clients || [];
  const paused = new Set(clients.filter((c) => /paused/i.test(c.status)).map((c) => c.name));
  result.tasks.forEach((t) => (t.paused = paused.has(t.client)));
  result.reviewTasks.forEach((t) => (t.paused = paused.has(t.client)));
  result.reviewTasks.sort((a, b) => (b.daysWaiting ?? -1) - (a.daysWaiting ?? -1));
  return { tasks: result.tasks, reviewTasks: result.reviewTasks, canyMax: CONFIG.canyMax };
}

export async function getContacts(email: string, q: string) {
  const supabaseUser = await findSupabaseUser(email);
  if (supabaseUser) {
    let query = (getSupabaseAdmin() as any)
      .from("contacts")
      .select("name,linkedin_url,status,legacy_row,cany,clients(name)")
      .eq("recruiter_id", supabaseUser.id)
      .order("updated_at", { ascending: false })
      .limit(80);
    const search = String(q || "").toLowerCase().trim();
    if (search) query = query.or(`name.ilike.%${search}%,linkedin_url.ilike.%${search}%`);
    const { data } = await query;
    if (data && data.length) {
      return {
        contacts: data.map((row: any) => ({
          name: String(row.name || "").trim(),
          li: String(row.linkedin_url || "").trim(),
          status: String(row.status || "").trim(),
          client: cleanClientName(row.clients?.name || ""),
          canyFlag: row.cany ? "Yes" : "",
          row: Number(row.legacy_row || 0)
        }))
      };
    }
  }

  const sheet = await getFuSheet(email);
  if (!sheet) return { contacts: [] };
  const rows = await getValues(sheet.spreadsheetId, `${quoteSheetName(sheet.title)}!A2:R`);
  const query = String(q || "").toLowerCase().trim();
  const contacts = rows
    .map((row, idx) => {
      const status = String(row[FU.REPLY] || row[FU.STATUS] || "").trim();
      return {
        name: String(row[FU.NAME] || "").trim(),
        li: String(row[FU.LI] || "").trim(),
        status,
        client: cleanClientName(String(row[FU.CLIENT] || "")),
        canyFlag: String(row[FU.CANY] || "").trim(),
        row: idx + 2
      };
    })
    .filter((c) => c.name || c.li)
    .filter((c) => !["booked", "closed", "not interested", "recalled", "profile restricted"].includes(c.status.toLowerCase()))
    .filter((c) => !query || c.name.toLowerCase().includes(query) || c.li.toLowerCase().includes(query))
    .slice(0, 80);
  return { contacts };
}

// Response shape note: GAS's apiCheckLiDuplicate returned
// { isDuplicate, recruiter, date } and both the Chrome extension
// (panel.js checkLiDuplicate) and the Recruiter panel read those exact
// keys. This function previously returned only { duplicate, matches },
// so every duplicate check silently rendered as "not a duplicate".
// Emits both shapes: `isDuplicate`/`recruiter`/`date` for GAS parity,
// `duplicate`/`matches` for the richer webapp display.
export async function checkLiDuplicate(email: string, li: string) {
  const normalized = normalizeLi(li);
  if (!normalized) return { duplicate: false, isDuplicate: false, matches: [], recruiter: "", date: "" };

  // Supabase-primary, org-wide (not scoped to this recruiter) — this is the
  // live, immediately-fresh source since Outreach/Nurture saves write here
  // first. Falls back to the Sheets-based Master DB scan only if Supabase
  // has no match (e.g. before the first Supabase-era save for this contact).
  const { data: supabaseMatches } = await (getSupabaseAdmin() as any)
    .from("contacts")
    .select("name,status,linkedin_url,clients(name)")
    .eq("normalized_linkedin_url", normalized)
    .limit(5);
  if (supabaseMatches && supabaseMatches.length) {
    const matches = supabaseMatches.map((row: any) => ({
      name: row.name || "",
      status: row.status || "",
      li: row.linkedin_url || "",
      client: cleanClientName(row.clients?.name || ""),
      recruiter: row.name || ""
    }));
    return {
      duplicate: true,
      isDuplicate: true,
      matches,
      recruiter: matches[0].client || matches[0].name || "",
      date: ""
    };
  }

  const matches: Array<{ name: string; status: string; li: string; recruiter?: string }> = [];
  const outreachTitle = await findSheetTitleExact(CONFIG.masterDbId, ["LI Outreach", "Outreach"]);
  if (outreachTitle) {
    const rows = await getValues(CONFIG.masterDbId, `${quoteSheetName(outreachTitle)}!A2:H`);
    for (const row of rows) {
      if (normalizeLi(String(row[4] || "")) === normalized) {
        matches.push({ name: String(row[1] || "").trim(), status: "", li, recruiter: String(row[1] || "").trim() });
        break;
      }
    }
  }
  if (!matches.length) {
    const titles = await listSheetTitles(CONFIG.masterDbId);
    const firstTitle = titles[0];
    if (firstTitle) {
      const rows = await getValues(CONFIG.masterDbId, `${quoteSheetName(firstTitle)}!A2:G`);
      for (const row of rows) {
        if (normalizeLi(String(row[2] || "")) === normalized) {
          matches.push({ name: "", status: "", li, recruiter: String(row[6] || "").trim() });
          break;
        }
      }
    }
  }
  return {
    duplicate: matches.length > 0,
    isDuplicate: matches.length > 0,
    matches,
    recruiter: matches.length ? matches[0].recruiter || matches[0].name || "" : "",
    date: ""
  };
}

export async function getTargetArea(email: string, q: string) {
  const sheet = await getTargetAreaSheet(email);
  if (!sheet) return { rows: [] };
  const rows = await getValues(sheet.spreadsheetId, `${quoteSheetName(sheet.title)}!A2:G`);
  const search = String(q || "").trim().toLowerCase();
  const results: Array<Record<string, string>> = [];
  for (const row of rows) {
    const zip = String(row[1] || "").trim();
    const city = String(row[2] || "").trim();
    const state = String(row[3] || "").trim();
    const salesNavId = String(row[4] || "").trim();
    const profileName = String(row[5] || "").trim();
    const bestTime = String(row[6] || "").trim();
    if (!zip && !city && !salesNavId && !profileName) continue;
    if (search) {
      const hay = `${salesNavId} ${profileName} ${zip} ${city} ${state}`.toLowerCase();
      if (!hay.includes(search)) continue;
    }
    // Both key styles are emitted: camelCase is what GAS's apiGetTargetArea
    // returned and what the Chrome extension's panel.js loadTargetArea reads
    // (r.profileName / r.salesNavId / r.zip / r.bestTime); the snake_case keys
    // are kept for existing webapp callers. Dropping either breaks a client.
    results.push({
      assign_date: normalizeDateCell(row[0]) || String(row[0] || "").trim(),
      assignDate: normalizeDateCell(row[0]) || String(row[0] || "").trim(),
      zip_code: zip,
      zip,
      city,
      state,
      sales_nav_id: salesNavId,
      salesNavId,
      profile_name: profileName,
      profileName,
      best_cst_time: bestTime,
      bestTime
    });
    if (results.length >= 150) break;
  }
  return { rows: results };
}

export async function getUnsureCriteria() {
  const { data } = await (getSupabaseAdmin() as any)
    .from("unsure_criteria")
    .select("code,criteria,response")
    .eq("active", true)
    .order("legacy_row", { ascending: true });
  return { rows: data || [] };
}

async function getNextTemplate(email: string, area: string, type: string) {
  const user = await findSupabaseUser(email);
  const key = `${area}:${type}`;
  const supabase = getSupabaseAdmin() as any;
  const { data: templates } = await supabase
    .from("templates")
    .select("subject,body,code")
    .eq("template_area", area)
    .eq("template_type", type)
    .eq("active", true)
    .order("legacy_row", { ascending: true });
  const list = templates || [];
  if (!list.length) return { subject: "", body: "", code: "", text: "" };
  let nextIndex = 0;
  if (user) {
    const { data: state } = await supabase
      .from("template_rotation_state")
      .select("next_index")
      .eq("user_id", user.id)
      .eq("template_key", key)
      .maybeSingle();
    nextIndex = Number(state?.next_index || 0);
  }
  const selected = list[nextIndex % list.length];
  if (user) {
    await supabase.from("template_rotation_state").upsert({
      user_id: user.id,
      template_key: key,
      next_index: (nextIndex + 1) % list.length,
      last_used_date: todayIso()
    }, { onConflict: "user_id,template_key" });
  }
  return { ...selected, text: selected.body || "" };
}

export async function getOutreachTemplate(email: string, outType: string) {
  return getNextTemplate(email, "outreach", outType || "InMail");
}

export async function getNurtureTemplate(email: string, nurtureType: string, clientName = "") {
  const tpl = await getNextTemplate(email, "nurture", nurtureType || "Interested");
  const clients = (await getClients(email)).clients || [];
  const client = clients.find((c: ClientAssignment) => c.name === cleanClientName(clientName));
  const body = String(tpl.body || tpl.text || "")
    .replace(/\{\{Calendar Link\}\}/gi, client?.eventUrl || "")
    .replace(/\{Calendar Link\}/gi, client?.eventUrl || "");
  return { ...tpl, body, text: body };
}

type RatioRow = {
  client: string;
  count: number;
  pct: number;
  todayCount: number;
  canyBlocked: boolean;
};

function buildRatioResult(
  allCounts: Map<string, number>,
  todayCounts: Map<string, number>,
  canyBlockedSet: Set<string>
) {
  // pct is share-of-total, matching GAS apiGetClientRatio. (A previous
  // version used count/max, which produced a different number and made the
  // "least loaded client" suggestion pick the wrong client.)
  const total = Array.from(allCounts.values()).reduce((sum, n) => sum + n, 0);
  const ratio: RatioRow[] = [];
  let minPct = Number.POSITIVE_INFINITY;
  let suggested = "";

  allCounts.forEach((count, client) => {
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    const blocked = canyBlockedSet.has(client);
    ratio.push({ client, count, pct, todayCount: todayCounts.get(client) || 0, canyBlocked: blocked });
    if (!blocked && pct < minPct) {
      minPct = pct;
      suggested = client;
    }
  });

  ratio.sort((a, b) => b.count - a.count);

  return {
    ratio,
    suggested,
    canyBlocked: Array.from(canyBlockedSet),
    // Retained for existing webapp callers that read `.rows`.
    rows: ratio
  };
}

// Per-client contact distribution used by the Nurture tab's ratio bar and by
// Rotation's "least loaded client" pick.
//
// Response shape matches GAS apiGetClientRatio -- { ratio, suggested,
// canyBlocked } -- because the Chrome extension's panel.js reads
// `data.ratio` and `data.suggested` directly. This previously returned only
// { rows }, so after the extension cutover the ratio bar stayed empty and
// rotation had no suggestion to work from.
//
// Dead leads (Not Interested / Profile Restricted) are excluded so they
// don't skew rotation fairness, matching GAS.
//
// canyBlocked is derived from the recruiter's Daily Assignment "CA+NY Appts"
// column against CONFIG.canyMax. GAS read a live formula in Master Tracker
// Col X for this; Daily Assignment carries the same per-client figure and is
// already loaded here, so this avoids a second cross-spreadsheet read.
export async function getClientRatio(email: string) {
  const today = new Date().toISOString().slice(0, 10);
  const clients = (await getClients(email)).clients || [];
  const canyBlockedSet = new Set<string>(
    clients
      .filter((c: ClientAssignment) => {
        const appts = Number(String(c.canyAppts || "").replace(/[^0-9.-]/g, ""));
        return Number.isFinite(appts) && appts >= CONFIG.canyMax;
      })
      .map((c: ClientAssignment) => c.name)
  );

  const user = await findSupabaseUser(email);
  if (user) {
    const { data: contacts } = await (getSupabaseAdmin() as any)
      .from("contacts")
      .select("status,date_j,clients(name)")
      .eq("recruiter_id", user.id);
    if (contacts && contacts.length) {
      const allCounts = new Map<string, number>();
      const todayCounts = new Map<string, number>();
      contacts.forEach((row: any) => {
        const status = String(row.status || "").trim().toLowerCase();
        if (status === "not interested" || status === "profile restricted") return;
        const client = cleanClientName(row.clients?.name || "");
        if (!client) return;
        allCounts.set(client, (allCounts.get(client) || 0) + 1);
        const dateJ = String(row.date_j || "").slice(0, 10);
        if (dateJ === today) todayCounts.set(client, (todayCounts.get(client) || 0) + 1);
      });
      return buildRatioResult(allCounts, todayCounts, canyBlockedSet);
    }
  }

  const sheet = await getFuSheet(email);
  if (!sheet) return { ratio: [], suggested: "", canyBlocked: [], rows: [] };
  const rows = await getValues(sheet.spreadsheetId, `${quoteSheetName(sheet.title)}!A2:R`);
  const allCounts = new Map<string, number>();
  const todayCounts = new Map<string, number>();
  for (const row of rows) {
    const status = String(row[FU.STATUS] || "").trim().toLowerCase();
    if (status === "not interested" || status === "profile restricted") continue;
    const client = cleanClientName(String(row[FU.CLIENT] || ""));
    if (!client) continue;
    allCounts.set(client, (allCounts.get(client) || 0) + 1);
    const dateJ = normalizeDateCell(row[FU.DATE_J]) || String(row[FU.DATE_J] || "").slice(0, 10);
    if (dateJ === today) todayCounts.set(client, (todayCounts.get(client) || 0) + 1);
  }
  return buildRatioResult(allCounts, todayCounts, canyBlockedSet);
}

export async function bulkSetCany(email: string, lis: string[]) {
  const user = await findSupabaseUser(email);
  const normalized = lis.map(normalizeLi).filter(Boolean);
  if (user && normalized.length) {
    try {
      await (getSupabaseAdmin() as any)
        .from("contacts")
        .update({ cany: true, updated_at: new Date().toISOString() })
        .eq("recruiter_id", user.id)
        .in("normalized_linkedin_url", normalized);
    } catch (e) {
      console.error("bulkSetCany Supabase write failed:", e);
    }
  }
  let updated = 0;
  for (const li of lis) {
    const found = await findFuRowByLi(email, li);
    if (!found) continue;
    try {
      await updateValues(found.spreadsheetId, `${quoteSheetName(found.title)}!R${found.rowNumber}:R${found.rowNumber}`, [["Yes"]]);
      updated++;
    } catch (e) {
      console.error("bulkSetCany sheet write failed:", e);
    }
  }
  return { ok: true, updated };
}

export async function getBillingStats(email: string, startDate = "", endDate = "") {
  const user = await findSupabaseUser(email);
  if (!user) return { period: "", total: 0, byDate: [] };
  const supabase = getSupabaseAdmin() as any;
  let ledgerQuery = supabase
    .from("leads_ledger")
    .select("date_created")
    .or(`recruiter_id.eq.${user.id},recruiter_name.ilike.%${user.name}%,recruiter_name.ilike.%${user.email}%`);
  let contactQuery = supabase
    .from("contacts")
    .select("created_at,updated_at")
    .eq("recruiter_id", user.id);
  let outreachQuery = supabase
    .from("outreach_logs")
    .select("created_at")
    .eq("recruiter_id", user.id);
  if (startDate) {
    ledgerQuery = ledgerQuery.gte("date_created", `${startDate}T00:00:00Z`);
    contactQuery = contactQuery.gte("created_at", `${startDate}T00:00:00Z`);
    outreachQuery = outreachQuery.gte("created_at", `${startDate}T00:00:00Z`);
  }
  if (endDate) {
    ledgerQuery = ledgerQuery.lte("date_created", `${endDate}T23:59:59Z`);
    contactQuery = contactQuery.lte("created_at", `${endDate}T23:59:59Z`);
    outreachQuery = outreachQuery.lte("created_at", `${endDate}T23:59:59Z`);
  }
  const [{ data: ledger }, { data: contacts }, { data: outreach }] = await Promise.all([ledgerQuery, contactQuery, outreachQuery]);
  const byDate = new Map<string, number>();
  (ledger || []).forEach((row: any) => {
    const date = String(row.date_created || "").slice(0, 10);
    if (date) byDate.set(date, (byDate.get(date) || 0) + 1);
  });
  (contacts || []).forEach((row: any) => {
    const date = String(row.created_at || row.updated_at || "").slice(0, 10);
    if (date) byDate.set(date, byDate.get(date) || 0);
  });
  return {
    period: startDate && endDate ? `${startDate} to ${endDate}` : "All imported data",
    total: ledger?.length || 0,
    contacts: contacts?.length || 0,
    outreach: outreach?.length || 0,
    byDate: Array.from(byDate.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count }))
  };
}

export async function requestCredits(email: string, type = "all") {
  const user = await findSupabaseUser(email);
  if (!user) return { error: "Unauthorized" };
  await (getSupabaseAdmin() as any).from("app_audit_log").insert({
    actor_email: user.email,
    action: "request_credits",
    details: { name: user.name, type, requestedAt: new Date().toISOString() }
  });
  return { ok: true };
}

export async function getReferralStats(email: string, startDate = "", endDate = "") {
  const user = await findSupabaseUser(email);
  if (!user) return { total: 0, referredRecruiters: [] };
  const { data: referred } = await (getSupabaseAdmin() as any)
    .from("app_users")
    .select("email,name")
    .ilike("legacy_type", "%PH%");
  return { total: 0, period: startDate && endDate ? `${startDate} to ${endDate}` : "All imported data", referredRecruiters: referred || [] };
}

export async function submitLeave(email: string, data: { leaveDate: string; duration: string; reason: string }) {
  const user = await findSupabaseUser(email);
  if (!user) return { error: "Unauthorized" };
  await (getSupabaseAdmin() as any).from("leave_requests").insert({
    user_id: user.id,
    email: user.email,
    name: user.name,
    leave_date: data.leaveDate,
    duration_days: Number(data.duration || 1),
    reason: data.reason || "",
    submitted_date: todayIso()
  });
  return { ok: true };
}

export async function submitFeedback(email: string, data: {
  salesNavAll?: boolean;
  salesNavNoCount?: string;
  salesNavNoReason?: string;
  unusual?: string;
  responsesToday?: string;
  comments?: string;
}) {
  const user = await findSupabaseUser(email);
  if (!user) return { error: "Unauthorized" };
  await (getSupabaseAdmin() as any).from("daily_feedback").insert({
    user_id: user.id,
    email: user.email,
    name: user.name,
    submitted_date: todayIso(),
    salesnav_all: Boolean(data.salesNavAll),
    salesnav_no_count: Number(data.salesNavNoCount || 0),
    salesnav_no_reason: data.salesNavNoReason || "",
    unusual: data.unusual || "",
    responses_today: Number(data.responsesToday || 0),
    comments: data.comments || ""
  });
  return { ok: true };
}

function nextStatusForNurture(nurtureType: string) {
  const map: Record<string, string> = {
    SDFU: "SDFU Sent",
    FU1: "FU1 Sent",
    FU2: "FU2 Sent",
    FU3: "FU3 Sent",
    Interested: "Interested",
    INT: "Interested",
    Unsure: "Unsure",
    SalesNavRemove: "DM-SN Expire",
    "Not Interested": "Not Interested"
  };
  return map[nurtureType] || `${nurtureType} Sent`;
}

export async function saveNurture(email: string, li: string, reply: string, nurtureType: string, conversation = "", clientName = "", source = "") {
  if (!reply.trim()) return { error: "No message to save." };
  if (clientName && nurtureType !== "Not Interested" && await isClientPaused(email, clientName)) {
    return { error: `${clientName} is currently paused. Use Client Rotation instead.` };
  }
  const found = await findFuRowByLi(email, li);
  if (!found) return { error: "Contact not found in FU Tracker." };
  const row = [...found.row];
  const today = todayIso();
  const newStatus = nextStatusForNurture(nurtureType);
  row[FU.STATUS] = newStatus;
  row[FU.CONVO] = conversation;
  row[FU.REPLY] = reply;
  if (source === "custom") row[FU.TAG] = "Custom";
  if (clientName && nurtureType !== "Not Interested") row[FU.CLIENT] = cleanClientName(clientName);
  if (!row[FU.DATE_J] && ["Interested", "INT", "Unsure", "Client Rotation", "CA/NY Territory Change", "Not Interested"].includes(nurtureType)) row[FU.DATE_J] = today;
  if (!row[FU.DATE_L] && nurtureType === "SalesNavRemove") row[FU.DATE_L] = today;

  // Supabase first (primary, fast) — the recruiter's save succeeds and
  // returns as soon as this lands, the Sheet write below is best-effort.
  await upsertSupabaseContact(email, {
    name: String(row[FU.NAME] || ""),
    li,
    clientName: cleanClientName(clientName || String(row[FU.CLIENT] || "")),
    status: newStatus,
    nextAction: String(row[FU.NEXT_ACTION] || ""),
    conversation,
    reply,
    source: String(row[FU.SOURCE] || source || ""),
    salesNavId: String(row[FU.SALES_NAV] || ""),
    code: String(row[FU.CODE] || ""),
    tag: String(row[FU.TAG] || ""),
    cany: String(row[FU.CANY] || "").toLowerCase() === "yes",
    legacyRow: found.rowNumber,
    lastNurtureType: nurtureType,
    dateJ: normalizeDateCell(row[FU.DATE_J]),
    dateK: normalizeDateCell(row[FU.DATE_K]),
    dateL: normalizeDateCell(row[FU.DATE_L]),
    dateM: normalizeDateCell(row[FU.DATE_M])
  });
  try {
    const range = `${quoteSheetName(found.title)}!A${found.rowNumber}:Q${found.rowNumber}`;
    await updateValues(found.spreadsheetId, range, [row.slice(0, 17)]);
  } catch (e) {
    console.error("saveNurture sheet write failed:", e);
  }
  return { ok: true, newStatus };
}

export async function markStatus(email: string, li: string, status: string, nextAction: string) {
  const found = await findFuRowByLi(email, li);
  if (!found) return { error: "Contact not found." };
  await upsertSupabaseContact(email, {
    name: String(found.row[FU.NAME] || ""),
    li,
    clientName: cleanClientName(String(found.row[FU.CLIENT] || "")),
    status,
    nextAction,
    legacyRow: found.rowNumber
  });
  try {
    await updateValues(found.spreadsheetId, `${quoteSheetName(found.title)}!F${found.rowNumber}:G${found.rowNumber}`, [[status, nextAction]]);
  } catch (e) {
    console.error("markStatus sheet write failed:", e);
  }
  return { ok: true };
}

// Single-cell FU Tracker Status write (Col F only), used by Operations
// recall so it never clobbers an unrelated Next Action note — mirrors GAS
// apiOpsRecallAppt's single setValue on FU.STATUS.
export async function setFuStatusOnly(email: string, li: string, status: string) {
  const found = await findFuRowByLi(email, li);
  if (!found) return { ok: false, reason: "Contact not found in FU Tracker." };
  await updateValues(found.spreadsheetId, `${quoteSheetName(found.title)}!${colName(FU.STATUS)}${found.rowNumber}`, [[status]]);
  return { ok: true };
}

export async function saveOutreach(email: string, data: {
  name: string;
  li: string;
  outType: string;
  content: string;
  subject?: string;
  code?: string;
  salesNavId?: string;
  isCany?: boolean;
}) {
  if (!data.name || !data.li || !data.content) return { error: "Name, LinkedIn URL, and content are required." };
  const sheet = await getFuSheet(email);
  if (!sheet) return { error: "FU Tracker sheet not configured." };
  const found = await findFuRowByLi(email, data.li);
  const today = todayIso();
  const sourceLabel = data.outType === "DM" ? "DM" : data.outType === "Invite" ? "Invite" : "InMail";

  // Supabase first (primary, fast): the FU Tracker contact record and the
  // Master LI outreach log both go to Supabase only — the old
  // MASTER_DB_ID sheet append is gone, outreach_logs is now the sole
  // "Master LI database" per the agreed data architecture.
  await upsertSupabaseContact(email, {
    name: data.name,
    li: data.li,
    status: "Awaiting Response",
    source: sourceLabel,
    salesNavId: data.salesNavId || "",
    code: data.subject || data.code || "",
    cany: Boolean(data.isCany),
    outreachType: data.outType,
    legacyRow: found?.rowNumber
  });
  await insertSupabaseOutreach(email, {
    name: data.name,
    li: data.li,
    outreachType: data.outType,
    subject: data.subject || data.code || "",
    message: data.content
  });

  // Recruiter's own FU Tracker sheet, second and best-effort.
  try {
    if (found) {
      const row = [...found.row];
      row[FU.STATUS] = "Awaiting Response";
      row[FU.SOURCE] = sourceLabel;
      row[FU.SALES_NAV] = data.salesNavId || "";
      row[FU.CODE] = data.subject || data.code || "";
      if (data.isCany) row[FU.CANY] = "Yes";
      await updateValues(found.spreadsheetId, `${quoteSheetName(found.title)}!A${found.rowNumber}:R${found.rowNumber}`, [row.slice(0, 18)]);
    } else {
      const newRow = Array(18).fill("");
      newRow[FU.DATE] = today;
      newRow[FU.NAME] = data.name;
      newRow[FU.LI] = data.li;
      newRow[FU.STATUS] = "Awaiting Response";
      newRow[FU.SOURCE] = sourceLabel;
      newRow[FU.SALES_NAV] = data.salesNavId || "";
      newRow[FU.CODE] = data.subject || data.code || "";
      if (data.isCany) newRow[FU.CANY] = "Yes";
      await appendValues(sheet.spreadsheetId, `${quoteSheetName(sheet.title)}!A:R`, [newRow]);
    }
  } catch (e) {
    console.error("saveOutreach sheet write failed:", e);
  }
  return { ok: true };
}

export async function bootstrapRecruiter(email: string) {
  const [usage, clients, tasks, clientRatio] = await Promise.all([
    getUsage(email),
    getClients(email),
    getDailyTasks(email),
    getClientRatio(email)
  ]);
  return { usage, clients, tasks, clientRatio };
}
