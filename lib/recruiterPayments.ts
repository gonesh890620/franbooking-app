import { getSupabaseAdmin } from "./supabaseAdmin";

const COMPANY_START_DATE = "2026-05-01";
const REFERRAL_WINDOW_DAYS = 60;
const OWN_APPT_RATE = 40;
const REFERRAL_APPT_RATE = 5;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type Cycle = { key: string; label: string; startStr: string; endStr: string };

function buildBillingCycles(): Cycle[] {
  const [yStr, mStr] = COMPANY_START_DATE.split("-");
  let y = parseInt(yStr, 10);
  let m = parseInt(mStr, 10) - 1;
  const now = new Date();
  const cycles: Cycle[] = [];
  for (;;) {
    const firstOfMonth = new Date(y, m, 1);
    if (firstOfMonth > now) break;
    const mm = String(m + 1).padStart(2, "0");
    cycles.push({
      key: `${y}-${mm}-a`, label: `${MONTHS[m]} 1–15, ${y}`,
      startStr: new Date(y, m, 1).toISOString().slice(0, 10), endStr: new Date(y, m, 15).toISOString().slice(0, 10)
    });
    const lastDay = new Date(y, m + 1, 0).getDate();
    if (new Date(y, m, 16) <= now) {
      cycles.push({
        key: `${y}-${mm}-b`, label: `${MONTHS[m]} 16–${lastDay}, ${y}`,
        startStr: new Date(y, m, 16).toISOString().slice(0, 10), endStr: new Date(y, m, lastDay).toISOString().slice(0, 10)
      });
    }
    m++;
    if (m > 11) { m = 0; y++; }
  }
  return cycles;
}

function cycleKeyFromDateStr(dateStr: string) {
  if (!dateStr || dateStr.length < 10) return "";
  const year = dateStr.slice(0, 4);
  const month = dateStr.slice(5, 7);
  const day = parseInt(dateStr.slice(8, 10), 10);
  return `${year}-${month}-${day <= 15 ? "a" : "b"}`;
}

function normalizeType(type: string): "BD/Inhouse" | "PH" {
  const t = String(type || "").toLowerCase();
  return t === "bd" || t === "inhouse" || t === "bd/inhouse" ? "BD/Inhouse" : "PH";
}

type RosterEntry = {
  id: string; email: string; name: string; type: "BD/Inhouse" | "PH"; workingAgeDays: number | null;
  registeredStr: string; referredByRaw: string; wiseAccount: string;
};

async function loadRoster(): Promise<RosterEntry[]> {
  const supabase = getSupabaseAdmin() as any;
  const { data } = await supabase.from("app_users").select("id,email,name,legacy_type,created_at,referred_by,wise_account").eq("role", "recruiter").eq("status", "approved");
  const now = Date.now();
  return (data || []).map((u: any) => {
    const registeredStr = u.created_at ? String(u.created_at).slice(0, 10) : "";
    return {
      id: u.id as string,
      email: String(u.email || "").toLowerCase(),
      name: String(u.name || ""),
      type: normalizeType(u.legacy_type),
      workingAgeDays: u.created_at ? Math.max(0, Math.floor((now - Date.parse(u.created_at)) / 86400000)) : null,
      registeredStr,
      referredByRaw: String(u.referred_by || "").trim(),
      wiseAccount: String(u.wise_account || "").trim()
    };
  });
}

function computeReferralWindowEnd(registeredStr: string) {
  if (!registeredStr) return "";
  const start = new Date(registeredStr);
  if (isNaN(start.getTime())) return "";
  return new Date(start.getTime() + REFERRAL_WINDOW_DAYS * 86400000).toISOString().slice(0, 10);
}

async function buildRecruiterPaymentsRows() {
  const supabase = getSupabaseAdmin() as any;
  const roster = await loadRoster();
  const byEmail = new Map(roster.map((r) => [r.email, r]));
  const byName = new Map(roster.map((r) => [r.name.toLowerCase(), r]));

  const referredByOf = new Map<string, { referrerNameLower: string; windowStart: string; windowEnd: string }>();
  roster.forEach((r) => {
    if (!r.referredByRaw) return;
    const refKey = r.referredByRaw.toLowerCase();
    const referrer = byEmail.get(refKey) || byName.get(refKey);
    if (!referrer || referrer.name.toLowerCase() === r.name.toLowerCase()) return;
    referredByOf.set(r.name.toLowerCase(), {
      referrerNameLower: referrer.name.toLowerCase(),
      windowStart: r.registeredStr,
      windowEnd: computeReferralWindowEnd(r.registeredStr)
    });
  });

  const cycles = buildBillingCycles();
  const ownApptsByKey = new Map<string, number>();
  const referralApptsByKey = new Map<string, number>();

  const { data: ledgerRows } = await supabase.from("leads_ledger").select("campaign_name,date_created,recruiter_name").limit(50000);
  (ledgerRows || []).forEach((row: any) => {
    const campaign = String(row.campaign_name || "").trim().toLowerCase();
    if (!campaign || campaign.indexOf("canc") >= 0) return;
    const dateStr = row.date_created ? String(row.date_created).slice(0, 10) : "";
    if (!dateStr) return;
    const recName = String(row.recruiter_name || "").trim();
    if (!recName) return;
    const cKey = cycleKeyFromDateStr(dateStr);
    const recNameLower = recName.toLowerCase();
    const ownKey = `${recNameLower}|${cKey}`;
    ownApptsByKey.set(ownKey, (ownApptsByKey.get(ownKey) || 0) + 1);
    const refInfo = referredByOf.get(recNameLower);
    if (refInfo && dateStr >= refInfo.windowStart && dateStr <= refInfo.windowEnd) {
      const refKey2 = `${refInfo.referrerNameLower}|${cKey}`;
      referralApptsByKey.set(refKey2, (referralApptsByKey.get(refKey2) || 0) + 1);
    }
  });

  const { data: paidRows } = await supabase.from("recruiter_payments_log").select("recruiter_email,cycle_key,invoice_id,paid_date");
  const paidMap = new Map<string, { invoiceId: string; paidDate: string }>();
  (paidRows || []).forEach((row: any) => {
    const em = String(row.recruiter_email || "").toLowerCase();
    const ck = String(row.cycle_key || "");
    if (!em || !ck) return;
    paidMap.set(`${em}|${ck}`, { invoiceId: row.invoice_id || "", paidDate: row.paid_date || "" });
  });

  const rows: any[] = [];
  roster.forEach((r) => {
    const nameKey = r.name.toLowerCase();
    cycles.forEach((c) => {
      if (r.registeredStr && c.endStr < r.registeredStr) return;
      const ownAppts = ownApptsByKey.get(`${nameKey}|${c.key}`) || 0;
      const referralAppts = referralApptsByKey.get(`${nameKey}|${c.key}`) || 0;
      const ownBill = ownAppts * OWN_APPT_RATE;
      const referralBill = referralAppts * REFERRAL_APPT_RATE;
      const paidInfo = paidMap.get(`${r.email}|${c.key}`) || null;
      rows.push({
        name: r.name, email: r.email, type: r.type, workingAgeDays: r.workingAgeDays, wiseAccount: r.wiseAccount,
        cycleKey: c.key, cycleLabel: c.label, cycleStart: c.startStr, cycleEnd: c.endStr,
        ownAppts, ownBill, referralAppts, referralBill, totalBill: ownBill + referralBill,
        paid: !!paidInfo, invoiceId: paidInfo?.invoiceId || "", paidDate: paidInfo?.paidDate || ""
      });
    });
  });
  rows.sort((a, b) => a.name.localeCompare(b.name) || (b.cycleStart < a.cycleStart ? -1 : b.cycleStart > a.cycleStart ? 1 : 0));

  return { roster, cycles, rows };
}

export async function getRecruiterPaymentsReport() {
  const built = await buildRecruiterPaymentsRows();
  return { ok: true, rows: built.rows, cycles: built.cycles, ownApptRate: OWN_APPT_RATE, referralApptRate: REFERRAL_APPT_RATE };
}

export async function markRecruiterPaid(recruiterEmail: string, cycleKey: string, invoiceId: string, paidByEmail: string) {
  invoiceId = String(invoiceId || "").trim();
  if (!invoiceId) return { error: "Invoice ID is required" };
  recruiterEmail = String(recruiterEmail || "").toLowerCase().trim();
  cycleKey = String(cycleKey || "").trim();
  if (!recruiterEmail || !cycleKey) return { error: "Missing recruiter or billing cycle" };

  const built = await buildRecruiterPaymentsRows();
  const row = built.rows.find((r) => r.email === recruiterEmail && r.cycleKey === cycleKey);
  if (!row) return { error: "Could not find that recruiter/cycle combination" };
  if (row.paid) return { error: `Already marked paid — Invoice #${row.invoiceId} on ${row.paidDate}.` };

  const method = row.type === "BD/Inhouse" ? "Payoneer" : "Wise";
  const supabase = getSupabaseAdmin() as any;
  const { error } = await supabase.from("recruiter_payments_log").insert({
    paid_date: new Date().toISOString().slice(0, 10), recruiter_name: row.name, recruiter_email: row.email,
    recruiter_type: row.type, cycle_key: row.cycleKey, cycle_label: row.cycleLabel, cycle_start: row.cycleStart,
    cycle_end: row.cycleEnd, own_appts: row.ownAppts, own_bill: row.ownBill, referral_appts: row.referralAppts,
    referral_bill: row.referralBill, total_bill: row.totalBill, invoice_id: invoiceId, paid_by: paidByEmail, method
  });
  if (error) return { error: `Could not mark paid: ${error.message}` };
  return { ok: true, method, totalBill: row.totalBill, cycleLabel: row.cycleLabel };
}

export async function getRecruiterRosterForPayment() {
  const roster = await loadRoster();
  roster.sort((a, b) => a.name.localeCompare(b.name));
  return { ok: true, roster: roster.map((r) => ({ email: r.email, name: r.name, type: r.type, wiseAccount: r.wiseAccount })) };
}

export async function setRecruiterWiseAccount(recruiterEmail: string, wiseAccount: string) {
  recruiterEmail = String(recruiterEmail || "").toLowerCase().trim();
  if (!recruiterEmail) return { error: "No recruiter specified" };
  const supabase = getSupabaseAdmin() as any;
  const { error } = await supabase.from("app_users").update({ wise_account: String(wiseAccount || "").trim() }).eq("email", recruiterEmail);
  if (error) return { error: `Could not save Wise account: ${error.message}` };
  return { ok: true, wiseAccount: String(wiseAccount || "").trim() };
}

// Billing Cycle by Recruiter report (Reports tab) — same cycles as the
// payments report, appts (leads_ledger) + sends (outreach_logs), no referral
// attribution layered on (that's payments-only).
export async function getRecruiterBillingReport() {
  const supabase = getSupabaseAdmin() as any;
  const roster = await loadRoster();
  const cycles = buildBillingCycles();

  const apptsByKey = new Map<string, number>();
  const { data: ledgerRows } = await supabase.from("leads_ledger").select("campaign_name,date_created,recruiter_name").limit(50000);
  (ledgerRows || []).forEach((row: any) => {
    const campaign = String(row.campaign_name || "").trim().toLowerCase();
    if (!campaign || campaign.indexOf("canc") >= 0) return;
    const dateStr = row.date_created ? String(row.date_created).slice(0, 10) : "";
    const recName = String(row.recruiter_name || "").trim();
    if (!dateStr || !recName) return;
    const key = `${recName.toLowerCase()}|${cycleKeyFromDateStr(dateStr)}`;
    apptsByKey.set(key, (apptsByKey.get(key) || 0) + 1);
  });

  const sendsByKey = new Map<string, number>();
  const { data: outreachRows } = await supabase.from("outreach_logs").select("recruiter_id,created_at").limit(50000);
  const nameByRecruiterId = new Map(roster.map((r) => [r.id, r.name]));
  (outreachRows || []).forEach((row: any) => {
    const dateStr = row.created_at ? String(row.created_at).slice(0, 10) : "";
    const recName = String(nameByRecruiterId.get(row.recruiter_id) || "").trim();
    if (!dateStr || !recName) return;
    const key = `${recName.toLowerCase()}|${cycleKeyFromDateStr(dateStr)}`;
    sendsByKey.set(key, (sendsByKey.get(key) || 0) + 1);
  });

  const rows: any[] = [];
  roster.forEach((r) => {
    const nameKey = r.name.toLowerCase();
    cycles.forEach((c) => {
      if (r.registeredStr && c.endStr < r.registeredStr) return;
      const key = `${nameKey}|${c.key}`;
      rows.push({
        name: r.name, email: r.email, type: r.type, workingAgeDays: r.workingAgeDays,
        cycleLabel: c.label, cycleStart: c.startStr, cycleEnd: c.endStr,
        appts: apptsByKey.get(key) || 0, sends: sendsByKey.get(key) || 0
      });
    });
  });
  rows.sort((a, b) => a.name.localeCompare(b.name) || (b.cycleStart < a.cycleStart ? -1 : b.cycleStart > a.cycleStart ? 1 : 0));

  return { ok: true, rows };
}
