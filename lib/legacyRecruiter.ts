import { CONFIG } from "./config";
import { clearSession, setSession } from "./auth";
import { appendValues, colName, findSheetTitle, getValues, quoteSheetName, updateValues } from "./sheets";
import { cleanClientName, FU, normalizeDateCell, normalizeLi, RC, SheetRow, todayIso } from "./legacyMaps";
import { getSupabaseAdmin } from "./supabaseAdmin";

const ACCESS_TAB = "Recruiters";

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
  } catch {
    // Sheet save remains the fallback until the Supabase cutover SQL is applied.
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

export async function findRecruiter(email: string): Promise<RecruiterRecord | null> {
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

export function logoutRecruiter() {
  clearSession();
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

export async function getClients(email: string) {
  const supabaseUser = await findSupabaseUser(email);
  if (supabaseUser) {
    const { data } = await (getSupabaseAdmin() as any)
      .from("recruiter_client_assignments")
      .select("status,event_url,nurture_pct,cany_appts,flag_notes,clients(name)")
      .eq("recruiter_id", supabaseUser.id);
    const clients = (data || [])
      .map((row: any) => ({
        name: cleanClientName(row.clients?.name || ""),
        status: String(row.status || "").trim(),
        eventUrl: String(row.event_url || "").trim(),
        nurturePct: String(row.nurture_pct || "").trim(),
        canyAppts: String(row.cany_appts || "").trim(),
        flagNotes: String(row.flag_notes || "").trim()
      }))
      .filter((client: ClientAssignment) => client.name);
    if (clients.length) return { clients };
  }

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
    reviewTasks.sort((a, b) => (b.daysWaiting ?? -1) - (a.daysWaiting ?? -1));
    return { tasks, reviewTasks, canyMax: CONFIG.canyMax };
  } catch {
    return null;
  }
}

export async function getDailyTasks(email: string) {
  const supabaseTasks = await getSupabaseDailyTasks(email);
  if (supabaseTasks) return supabaseTasks;

  const sheet = await getFuSheet(email);
  if (!sheet) return { tasks: [], reviewTasks: [] };
  const rows = await getValues(sheet.spreadsheetId, `${quoteSheetName(sheet.title)}!A2:R`);
  const today = todayIso();
  const tasks: DailyTask[] = [];
  const reviewTasks: DailyTask[] = [];
  for (let i = 0; i < rows.length; i++) {
    const parsed = deriveTaskFromRow(rows[i] as SheetRow, i + 2, today);
    if (parsed.todayTask) tasks.push(parsed.todayTask);
    if (parsed.reviewTask) reviewTasks.push(parsed.reviewTask);
  }
  const clients: ClientAssignment[] = (await getClients(email)).clients || [];
  const paused = new Set(clients.filter((c) => /paused/i.test(c.status)).map((c) => c.name));
  tasks.forEach((t) => (t.paused = paused.has(t.client)));
  reviewTasks.forEach((t) => (t.paused = paused.has(t.client)));
  reviewTasks.sort((a, b) => (b.daysWaiting ?? -1) - (a.daysWaiting ?? -1));
  return { tasks, reviewTasks, canyMax: CONFIG.canyMax };
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
    return {
      contacts: (data || []).map((row: any) => ({
        name: String(row.name || "").trim(),
        li: String(row.linkedin_url || "").trim(),
        status: String(row.status || "").trim(),
        client: cleanClientName(row.clients?.name || ""),
        canyFlag: row.cany ? "Yes" : "",
        row: Number(row.legacy_row || 0)
      }))
    };
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
  const range = `${quoteSheetName(found.title)}!A${found.rowNumber}:Q${found.rowNumber}`;
  await updateValues(found.spreadsheetId, range, [row.slice(0, 17)]);
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
  return { ok: true, newStatus };
}

export async function markStatus(email: string, li: string, status: string, nextAction: string) {
  const found = await findFuRowByLi(email, li);
  if (!found) return { error: "Contact not found." };
  await updateValues(found.spreadsheetId, `${quoteSheetName(found.title)}!F${found.rowNumber}:G${found.rowNumber}`, [[status, nextAction]]);
  await upsertSupabaseContact(email, {
    name: String(found.row[FU.NAME] || ""),
    li,
    clientName: cleanClientName(String(found.row[FU.CLIENT] || "")),
    status,
    nextAction,
    legacyRow: found.rowNumber
  });
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
  const rec = await findRecruiter(email);
  await appendValues(CONFIG.masterDbId, "'Sheet1'!A:G", [[today, data.name, data.li, "", "", "", rec?.name || email]]);
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
  return { ok: true };
}

export async function bootstrapRecruiter(email: string) {
  const [usage, clients, tasks] = await Promise.all([
    getUsage(email),
    getClients(email),
    getDailyTasks(email)
  ]);
  return { usage, clients, tasks };
}
