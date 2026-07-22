import { getSupabaseAdmin } from "./supabaseAdmin";
import { cleanClientName } from "./legacyMaps";
import {
  appendMasterTrackerActionTaken,
  appendMasterTrackerRow,
  buildPausedReasonValue,
  deleteMasterTrackerRow,
  updateMasterTrackerFields
} from "./masterTracker";
import { relabelLeadsLedgerRow } from "./growthSheets";

// Mirrors GAS isCurrentCycleCampaign_ — a Leads Ledger row with no trailing
// "-<number>" suffix is still unlabeled (pending/current cycle); a suffixed
// row has already been cycle-labeled by a previous Mark Ledger Sent.
function isCurrentCycleRow(campaignLower: string) {
  return !/-\s*\d+\s*$/.test(String(campaignLower || "").trim());
}

function classifyFeedbackCategory(rawCategory: string) {
  const c = String(rawCategory || "").trim().toLowerCase();
  if (c.indexOf("pipeline") >= 0) return "positive";
  if (c.indexOf("no show") >= 0) return "noShow";
  return "negative";
}

// Parses the "| ETA <yyyy-MM-dd|TBD>" suffix buildPausedReasonValue embeds
// into a PAUSED Vacation reason — must stay in sync with that format.
export function shouldShowVacationBadge(pausedReason: string) {
  const m = /PAUSED Vacation.*\|\s*ETA\s+(\d{4}-\d{2}-\d{2}|TBD)/i.exec(pausedReason || "");
  if (!m) return false;
  const eta = m[1];
  if (eta === "TBD") {
    const dow = new Date().getDay();
    return dow === 1 || dow === 4;
  }
  return new Date().toISOString().slice(0, 10) >= eta;
}

export function statusCellColor(status: string) {
  const s = String(status || "").toLowerCase();
  if (s.indexOf("fire") >= 0) return "#f6b26b";
  if (s.indexOf("smok") >= 0) return "#00ffff";
  if (s.indexOf("track") >= 0) return "#00b621";
  if (s.indexOf("improv") >= 0) return "#ffff00";
  if (s.indexOf("not started") >= 0) return "#efa6a6";
  if (s.indexOf("pause") >= 0) return "#ff3232";
  return "";
}

export function quotaPctCellColor(pct: number) {
  const n = Number(pct) || 0;
  if (n >= 100) return "#00ff39";
  if (n >= 85) return "#da8cd7";
  return "";
}

export async function getAllClientTracker() {
  const supabase = getSupabaseAdmin() as any;
  const { data: campaignRows } = await supabase
    .from("campaigns")
    .select("*, clients(event_url)")
    .eq("archived", false)
    .order("campaign_name", { ascending: true });

  const clients = (campaignRows || []).map((row: any) => ({
    name: row.campaign_name,
    campaignId: row.campaign_id,
    status: row.campaign_status || "",
    quota: row.quota ?? null,
    targetAvgPerDay: row.target_avg_leads_day ?? null,
    cycleNumber: row.cycle || null,
    totalAppts: 0,
    overallCanyCount: 0,
    overallCanyPct: 0,
    cycleTotalAppts: 0,
    cycleCanyCount: 0,
    cycleCanyPct: 0,
    remainingThisCycle: null as number | null,
    last7Appts: 0,
    quotaCompletePct: 0,
    feedback: { positive: 0, negative: 0, noShow: 0 },
    actionTaken: row.action_taken || "",
    chargeAmt: row.charge_amount,
    payment: row.payment || "",
    currentStatus: row.campaign_status || "",
    pausedReason: row.paused_reason || "",
    currentCycleStart: row.current_cycle_start || "",
    paymentNotes: row.payment_notes || "",
    quotaNotes: row.quota_notes || "",
    vertical: row.vertical || "",
    packageType: row.package_type || "",
    launchDate: row.launch_date || "",
    accountId: row.account_id,
    accountName: row.account_name || "",
    eventUrl: row.clients?.event_url || "",
    _baseLower: String(row.campaign_name || "").toLowerCase()
  }));

  const byBase = new Map<string, (typeof clients)[number]>();
  const baseLowerList: string[] = [];
  clients.forEach((c: any) => {
    byBase.set(c._baseLower, c);
    baseLowerList.push(c._baseLower);
  });
  // Longest base first, so a client name that's a prefix of another
  // client's name doesn't accidentally win the match.
  baseLowerList.sort((a, b) => b.length - a.length);

  function findClientFor(campaignLower: string) {
    if (byBase.has(campaignLower)) return byBase.get(campaignLower)!;
    for (const base of baseLowerList) {
      if (campaignLower.indexOf(base) === 0 && campaignLower.length > base.length) return byBase.get(base)!;
    }
    return null;
  }

  // 7-day window (calendar-day, midnight-anchored, matching the Growth
  // dashboard's period windows) for the per-client "Last 7 Days Appts" column.
  const last7Cut = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);

  const { data: ledgerRows } = await supabase
    .from("leads_ledger")
    .select("campaign_name,state,date_created")
    .limit(50000);
  (ledgerRows || []).forEach((row: any) => {
    const campaign = String(row.campaign_name || "").trim();
    const cLower = campaign.toLowerCase();
    if (!cLower || cLower.indexOf("canc") >= 0) return;
    const client = findClientFor(cLower);
    if (!client) return;
    client.totalAppts++;
    const dateKey = String(row.date_created || "").slice(0, 10);
    if (dateKey && dateKey >= last7Cut) client.last7Appts++;
    const state = String(row.state || "").trim().toUpperCase();
    const isCany = state === "CA" || state === "NY" || state === "CALIFORNIA" || state === "NEW YORK";
    if (isCany) client.overallCanyCount++;
    if (isCurrentCycleRow(cLower)) {
      client.cycleTotalAppts++;
      if (isCany) client.cycleCanyCount++;
    }
  });

  const { data: feedbackRows } = await supabase
    .from("client_feedback")
    .select("client_name,category")
    .limit(50000);
  (feedbackRows || []).forEach((row: any) => {
    const cLower = String(row.client_name || "").trim().toLowerCase();
    if (!cLower) return;
    const client = findClientFor(cLower);
    if (!client) return;
    const bucket = classifyFeedbackCategory(row.category) as "positive" | "negative" | "noShow";
    client.feedback[bucket]++;
  });

  clients.forEach((c: any) => {
    c.overallCanyPct = c.totalAppts > 0 ? Math.round((c.overallCanyCount / c.totalAppts) * 100) : 0;
    c.cycleCanyPct = c.cycleTotalAppts > 0 ? Math.round((c.cycleCanyCount / c.cycleTotalAppts) * 100) : 0;
    if (c.quota) {
      c.quotaCompletePct = Math.round((c.cycleTotalAppts / c.quota) * 100);
      c.remainingThisCycle = c.quota - c.cycleTotalAppts;
    }
    delete c._baseLower;
  });

  return { ok: true, clients };
}

async function nextAutoNumbers() {
  const supabase = getSupabaseAdmin() as any;
  const [{ data: campaignIds }, { data: accountIds }] = await Promise.all([
    supabase.from("campaigns").select("campaign_id"),
    supabase.from("campaigns").select("account_id")
  ]);
  const maxNum = (rows: any[], key: string) =>
    (rows || []).reduce((max, r) => {
      const n = Number(r[key]);
      return Number.isFinite(n) && n > max ? n : max;
    }, 0);
  return {
    campaignId: maxNum(campaignIds, "campaign_id") + 1,
    accountId: maxNum(accountIds, "account_id") + 1
  };
}

export type AddClientInput = {
  clientName: string; vertical: string; packageType: string; accountConnectDate: string;
  quota: string | number; targetAvgLeadsDay: string | number; cycle: string | number;
  chargeAmt: string; payment: string; currentCycleStart: string; launchDate: string;
  currentStatus: string; pausedReason: string; vacationEta: string; actionTaken: string;
  paymentNotes: string; quotaNotes: string; acctAuthority: string; cycleLedgerEmail: string;
  calendlyEmail: string; distributionList: string; crm: string; crmName: string; crmAddress: string;
  eventUrl: string; userEmailGoogle: string; pw: string; tenant: string; tenantPd: string;
  webprofile: string; aboutLi: string;
};

export async function addClient(data: AddClientInput) {
  const clientName = String(data.clientName || "").trim();
  if (!clientName) return { error: "Client Name is required" };
  if (!data.quota) return { error: "Quota is required" };

  const supabase = getSupabaseAdmin() as any;
  const vertical = String(data.vertical || "Broker").trim();
  const prefix = vertical.toLowerCase() === "broker" ? "Franchise " : "";
  const fullName = cleanClientName(prefix + clientName);
  const todayStr = new Date().toISOString().slice(0, 10);
  const quota = Number(data.quota) || 0;
  const currentStatus = data.currentStatus || "Not Started";
  const pausedReason = currentStatus === "Paused" && data.pausedReason ? buildPausedReasonValue(data.pausedReason, data.vacationEta) : "";

  const { campaignId, accountId } = await nextAutoNumbers();

  const { data: existingClient } = await supabase.from("clients").select("id").eq("name", fullName).maybeSingle();
  let clientId = existingClient?.id;
  if (!clientId) {
    const { data: newClient, error: clientError } = await supabase.from("clients").insert({ name: fullName, status: currentStatus }).select("id").maybeSingle();
    if (clientError) return { error: `Could not save: ${clientError.message}` };
    clientId = newClient?.id;
  }

  const { error: campaignError } = await supabase.from("campaigns").insert({
    client_id: clientId,
    campaign_name: fullName,
    campaign_id: String(campaignId),
    quota,
    results_total: 0,
    results_remaining: quota,
    quota_complete_pct: 0,
    target_avg_leads_day: Number(data.targetAvgLeadsDay) || null,
    campaign_status: "",
    paused_reason: pausedReason,
    action_taken: data.actionTaken || "",
    cycle: Number(data.cycle) || 1,
    charge_amount: Number(data.chargeAmt) || null,
    payment: data.payment || "AUTO",
    current_cycle_start: data.currentCycleStart || todayStr,
    payment_notes: data.paymentNotes || "",
    quota_notes: data.quotaNotes || "",
    account_id: String(accountId),
    account_name: clientName,
    vertical,
    package_type: data.packageType || "",
    launch_date: data.launchDate || null,
    account_connect_date: data.accountConnectDate || todayStr,
    acct_authority: data.acctAuthority || "",
    cycle_ledger_email: data.cycleLedgerEmail || "",
    calendly_email: data.calendlyEmail || "",
    distribution_list: data.distributionList || "",
    crm: data.crm || "",
    crm_name: data.crmName || "",
    crm_address: data.crmAddress || "",
    archived: false
  });
  if (campaignError) return { error: `Could not save: ${campaignError.message}` };

  if (data.eventUrl) {
    await supabase.from("clients").update({ event_url: data.eventUrl }).eq("id", clientId);
  }
  await supabase.from("client_dtc_links").insert({
    client_id: clientId,
    event_url: data.eventUrl || "",
    google_user_email: data.userEmailGoogle || "",
    password_label: data.pw || "",
    tenant: data.tenant || "",
    tenant_pd: data.tenantPd || "",
    webprofile: data.webprofile || "",
    about_li: data.aboutLi || ""
  });

  try {
    await appendMasterTrackerRow({
      fullName, campaignId, quota, targetAvgLeadsDay: Number(data.targetAvgLeadsDay) || "", cycle: Number(data.cycle) || 1,
      chargeAmt: data.chargeAmt || "", payment: data.payment || "AUTO", currentStatus, currentCycleStart: data.currentCycleStart || todayStr,
      pausedReason, actionTaken: data.actionTaken || "", paymentNotes: data.paymentNotes || "", quotaNotes: data.quotaNotes || "",
      accountId, accountName: clientName, vertical, packageType: data.packageType || "", launchDate: data.launchDate || ""
    });
  } catch (e) {
    console.error("addClient Master Tracker sheet write failed:", e);
  }

  return { ok: true, accountId, campaignId, fullName };
}

export type UpdateClientInput = Partial<{
  quota: string | number; targetAvgLeadsDay: string | number; cycle: string | number; chargeAmt: string;
  payment: string; currentCycleStart: string; launchDate: string; currentStatus: string; pausedReason: string;
  vacationEta: string; vertical: string; packageType: string; actionTaken: string; paymentNotes: string; quotaNotes: string;
}>;

export async function updateClient(clientName: string, data: UpdateClientInput) {
  clientName = String(clientName || "").trim();
  if (!clientName) return { error: "Client Name is required" };
  const supabase = getSupabaseAdmin() as any;

  const patch: Record<string, unknown> = {};
  if (data.quota !== undefined) patch.quota = Number(data.quota) || 0;
  if (data.targetAvgLeadsDay !== undefined) patch.target_avg_leads_day = data.targetAvgLeadsDay === "" ? null : Number(data.targetAvgLeadsDay);
  if (data.cycle !== undefined) patch.cycle = Number(data.cycle) || 0;
  if (data.chargeAmt !== undefined) patch.charge_amount = data.chargeAmt === "" ? null : Number(data.chargeAmt);
  if (data.payment !== undefined) patch.payment = data.payment;
  if (data.currentCycleStart !== undefined) patch.current_cycle_start = data.currentCycleStart || null;
  if (data.launchDate !== undefined) patch.launch_date = data.launchDate || null;
  if (data.paymentNotes !== undefined) patch.payment_notes = data.paymentNotes;
  if (data.quotaNotes !== undefined) patch.quota_notes = data.quotaNotes;
  if (data.vertical !== undefined) patch.vertical = data.vertical;
  if (data.packageType !== undefined) patch.package_type = data.packageType;
  if (data.actionTaken !== undefined) patch.action_taken = data.actionTaken;

  let pausedReason = "";
  if (data.currentStatus !== undefined) {
    patch.campaign_status = data.currentStatus;
    pausedReason = data.currentStatus === "Paused" && data.pausedReason ? buildPausedReasonValue(data.pausedReason, data.vacationEta || "") : "";
    patch.paused_reason = pausedReason;
  }

  const { error } = await supabase.from("campaigns").update(patch).eq("campaign_name", clientName);
  if (error) return { error: `Could not update: ${error.message}` };

  try {
    const sheetUpdates: Partial<Record<string, string | number>> = {};
    if (data.quota !== undefined) sheetUpdates.QUOTA = Number(data.quota) || 0;
    if (data.targetAvgLeadsDay !== undefined) sheetUpdates.TARGET_AVG_LEADS_DAY = data.targetAvgLeadsDay === "" ? "" : Number(data.targetAvgLeadsDay);
    if (data.actionTaken !== undefined) sheetUpdates.ACTION_TAKEN = data.actionTaken;
    if (data.cycle !== undefined) sheetUpdates.CYCLE = Number(data.cycle) || 0;
    if (data.chargeAmt !== undefined) sheetUpdates.CHARGE_AMT = data.chargeAmt;
    if (data.payment !== undefined) sheetUpdates.PAYMENT = data.payment;
    if (data.currentCycleStart !== undefined) sheetUpdates.CURRENT_CYCLE_START = data.currentCycleStart;
    if (data.paymentNotes !== undefined) sheetUpdates.PAYMENT_NOTES = data.paymentNotes;
    if (data.quotaNotes !== undefined) sheetUpdates.QUOTA_NOTES = data.quotaNotes;
    if (data.vertical !== undefined) sheetUpdates.VERTICAL = data.vertical;
    if (data.packageType !== undefined) sheetUpdates.PACKAGE_TYPE = data.packageType;
    if (data.launchDate !== undefined) sheetUpdates.LAUNCH_DATE = data.launchDate;
    if (data.currentStatus !== undefined) {
      sheetUpdates.CURRENT_STATUS = data.currentStatus;
      sheetUpdates.PAUSED_REASON = pausedReason;
    }
    await updateMasterTrackerFields(clientName, sheetUpdates as any);
  } catch (e) {
    console.error("updateClient Master Tracker sheet write failed:", e);
  }

  return { ok: true };
}

export async function archiveClient(clientName: string, reason: string, archivedByName: string) {
  clientName = String(clientName || "").trim();
  reason = String(reason || "").trim();
  if (!clientName) return { error: "Client Name is required" };
  if (!reason) return { error: "Archive Reason is required" };
  const supabase = getSupabaseAdmin() as any;

  const { error } = await supabase.from("campaigns").update({
    archived: true, archived_at: new Date().toISOString(), archive_reason: reason, archived_by: archivedByName
  }).eq("campaign_name", clientName);
  if (error) return { error: `Could not archive: ${error.message}` };

  try {
    await deleteMasterTrackerRow(clientName);
  } catch (e) {
    console.error("archiveClient Master Tracker sheet write failed:", e);
  }

  return { ok: true };
}

export async function logSlotCheck(clientName: string, resultType: "available" | "not_available") {
  clientName = String(clientName || "").trim();
  if (!clientName) return { error: "Client Name is required" };
  if (resultType !== "available" && resultType !== "not_available") return { error: "Invalid result type" };
  return logActionTaken(clientName, resultType === "available"
    ? "Check, available now, taking live now"
    : "Checked, Still not available", resultType === "available");
}

export async function logVacationCheck(clientName: string, resultType: "back" | "still_away") {
  clientName = String(clientName || "").trim();
  if (!clientName) return { error: "Client Name is required" };
  if (resultType !== "back" && resultType !== "still_away") return { error: "Invalid result type" };
  return logActionTaken(clientName, resultType === "back"
    ? "Checked, client is back - reactivated"
    : "Checked, still on vacation", resultType === "back");
}

async function logActionTaken(clientName: string, message: string, reactivate: boolean) {
  const supabase = getSupabaseAdmin() as any;
  const stamp = new Date().toLocaleString("en-US", { month: "2-digit", day: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
  const line = `${stamp}: ${message}`;

  const { data: campaign } = await supabase.from("campaigns").select("action_taken").eq("campaign_name", clientName).maybeSingle();
  if (!campaign) return { error: `Client not found: ${clientName}` };
  const existing = String(campaign.action_taken || "").trim();
  const updated = existing ? `${line}\n${existing}` : line;
  const patch: Record<string, unknown> = { action_taken: updated };
  if (reactivate) {
    patch.campaign_status = "Active";
    patch.paused_reason = "";
  }
  const { error } = await supabase.from("campaigns").update(patch).eq("campaign_name", clientName);
  if (error) return { error: `Could not log check: ${error.message}` };

  try {
    await appendMasterTrackerActionTaken(clientName, line, reactivate);
  } catch (e) {
    console.error("logActionTaken Master Tracker sheet write failed:", e);
  }
  return { ok: true };
}

export async function markLedgerSent(clientName: string, cycleNumber: string) {
  clientName = String(clientName || "").trim();
  cycleNumber = String(cycleNumber || "").trim();
  if (!clientName || !cycleNumber) return { error: "Client Name and Cycle Number are required" };
  const supabase = getSupabaseAdmin() as any;

  const { data: campaign } = await supabase.from("campaigns").select("quota").eq("campaign_name", clientName).maybeSingle();
  const quota = campaign?.quota && Number(campaign.quota) > 0 ? Number(campaign.quota) : 30;

  const { data: matched } = await supabase
    .from("leads_ledger")
    .select("id,legacy_row")
    .ilike("campaign_name", clientName)
    .order("legacy_row", { ascending: true })
    .limit(quota);

  const rows: any[] = matched || [];
  if (!rows.length) return { ok: true, labeled: 0, message: "No unlabeled current-cycle leads found for this client." };

  const newLabel = `${clientName} - ${cycleNumber}`;
  const { error } = await supabase.from("leads_ledger").update({ campaign_name: newLabel }).in("id", rows.map((r) => r.id));
  if (error) return { error: `Could not mark ledger sent: ${error.message}` };

  try {
    for (const row of rows) {
      if (row.legacy_row) await relabelLeadsLedgerRow(row.legacy_row, newLabel);
    }
  } catch (e) {
    console.error("markLedgerSent Leads Ledger sheet write failed:", e);
  }

  return { ok: true, labeled: rows.length, newLabel, quotaUsed: quota };
}

export async function getClientEmail(clientName: string) {
  clientName = String(clientName || "").trim();
  if (!clientName) return { error: "Client Name is required" };
  const supabase = getSupabaseAdmin() as any;
  const { data } = await supabase.from("campaigns").select("cycle_ledger_email").eq("campaign_name", clientName).maybeSingle();
  return { ok: true, recipientEmail: data?.cycle_ledger_email || "" };
}

export async function getLedgerCsvRows(clientName: string) {
  clientName = String(clientName || "").trim();
  if (!clientName) return { error: "Client Name is required" };
  const supabase = getSupabaseAdmin() as any;
  const { data } = await supabase
    .from("leads_ledger")
    .select("campaign_name,contact_name,contact_email,phone,company,title,linkedin_url,location,state,date_created")
    .ilike("campaign_name", clientName)
    .limit(5000);
  const rows = (data || []).map((r: any) => ({
    clientCampaign: r.campaign_name,
    name: r.contact_name || "",
    email: r.contact_email || "",
    phone: r.phone || "",
    company: r.company || "",
    title: r.title || "",
    linkedinUrl: r.linkedin_url || "",
    location: r.location || "",
    state: r.state || "",
    dateCreated: r.date_created || ""
  }));
  return { ok: true, rows };
}
