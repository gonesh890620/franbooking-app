import { getSupabaseAdmin } from "./supabaseAdmin";
import {
  appendVendorCommunicationToSheet,
  appendVendorOrderToSheet,
  appendVendorProfileToSheet,
  appendVendorToSheet,
  appendVendorIssueToSheet,
  updateVendorInSheet,
  updateVendorIssueInSheet,
  updateVendorOrderInSheet,
  updateVendorProfileInSheet
} from "./vendorSheets";

const VENDOR_EXPIRY_DAYS = 30;
const VENDOR_DOWNTIME_CYCLE_DAYS = 30;
const SALESNAV_NOTIFY_DAYS = 3;

export const VENDOR_ISSUE_TYPES = [
  "Restriction", "2FA Issue", "Login Issue", "Sales Nav Issue",
  "Unknown Payment Details", "Vendor Not Responding (New Order)", "Other (Please Specify)"
];
export const VENDOR_ORDER_STATUSES = ["Ordered", "Received", "Cancelled"];
export const VENDOR_COMM_CHANNELS = ["Email", "Slack", "Both"];

function addDays(dateStr: string | null, days: number): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  return new Date(d.getTime() + days * 86400000).toISOString().slice(0, 10);
}

async function nextCode(table: string, column: string, prefix: string) {
  const supabase = getSupabaseAdmin() as any;
  const { data } = await supabase.from(table).select(column);
  let max = 0;
  (data || []).forEach((row: any) => {
    const m = String(row[column] || "").match(/(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

async function nextNumericCode(table: string) {
  const supabase = getSupabaseAdmin() as any;
  const { data } = await supabase.from(table).select("code");
  const max = (data || []).reduce((m: number, row: any) => Math.max(m, Number(row.code) || 0), 0);
  return max + 1;
}

export async function getVendorData() {
  const supabase = getSupabaseAdmin() as any;
  const today = new Date().toISOString().slice(0, 10);
  const todayD = new Date(today);

  const [{ data: profileRows }, { data: issueRows }, { data: vendorRows }, { data: orderRows }, { data: commRows }]: any[] = await Promise.all([
    supabase.from("vendor_profiles").select("*").order("code", { ascending: true }),
    supabase.from("vendor_issues").select("*").order("code", { ascending: true }),
    supabase.from("vendors").select("*").order("name", { ascending: true }),
    supabase.from("vendor_orders").select("*").order("order_date", { ascending: false }),
    supabase.from("vendor_communications").select("*").order("comm_date", { ascending: false })
  ]);

  const profiles = ((profileRows || []) as any[]).map((r: any) => ({
    id: r.code,
    name: r.name,
    vendor: r.vendor_name,
    registeredDate: r.registered_date,
    expireDate: addDays(r.last_renewed_date || r.registered_date, VENDOR_EXPIRY_DAYS),
    snConnectedDate: r.sn_connected_date,
    snExpireDate: addDays(r.sn_connected_date, VENDOR_EXPIRY_DAYS),
    lastRenewedDate: r.last_renewed_date,
    status: r.status || "Active",
    replacementOf: r.replacement_of || "",
    replacedBy: r.replaced_by || "",
    replacementDate: r.replacement_date,
    notes: r.notes || "",
    managedBy: r.managed_by || "",
    liProfileUrl: r.li_profile_url || "",
    price: r.price,
    currentCycleDowntimeDays: 0,
    openIssueCount: 0,
    openIssueTypes: [] as string[],
    health: "OK",
    snDaysLeft: null as number | null
  }));

  const issues = ((issueRows || []) as any[]).map((r: any) => {
    const reportedDate = r.reported_date;
    const fixedDate = r.fixed_date;
    const solved = r.solved || "No";
    let daysToSolve: number | null = null;
    let daysOpen: number | null = null;
    if (reportedDate) {
      const reportedD = new Date(reportedDate);
      if (solved === "Yes" && fixedDate) {
        daysToSolve = Math.max(0, Math.round((new Date(fixedDate).getTime() - reportedD.getTime()) / 86400000));
      } else {
        daysOpen = Math.max(0, Math.round((todayD.getTime() - reportedD.getTime()) / 86400000));
      }
    }
    return {
      id: r.code,
      profileId: r.profile_code || "",
      vendor: r.vendor_name || "",
      reportedDate,
      issueType: r.issue_type || "",
      issueNotes: r.issue_notes || "",
      vendorFeedbackDate: r.vendor_feedback_date,
      vendorFeedback: r.vendor_feedback || "",
      fixedDate,
      solved,
      fixedByReplacement: r.fixed_by_replacement || "",
      replacementProfileId: r.replacement_profile_code || "",
      vendorEta: r.vendor_eta,
      followUpCount: r.followup_count || 0,
      lastFollowUpAt: r.last_followup_at || "",
      daysToSolve, daysOpen
    };
  });

  const vendors = ((vendorRows || []) as any[]).map((r: any) => ({
    id: r.code, name: r.name, contactPerson: r.contact_person || "", email: r.email || "",
    slack: r.slack || "", channel: r.channel || "", notes: r.notes || ""
  }));

  const orders = ((orderRows || []) as any[]).map((r: any) => {
    const orderDate = r.order_date;
    const receivedDate = r.received_date;
    const status = r.status || "Ordered";
    let daysToReceive: number | null = null;
    let daysWaiting: number | null = null;
    if (orderDate) {
      const orderD = new Date(orderDate);
      if (status === "Received" && receivedDate) {
        daysToReceive = Math.max(0, Math.round((new Date(receivedDate).getTime() - orderD.getTime()) / 86400000));
      } else if (status === "Ordered") {
        daysWaiting = Math.max(0, Math.round((todayD.getTime() - orderD.getTime()) / 86400000));
      }
    }
    return {
      id: r.code, vendor: r.vendor_name, requestedBy: r.requested_by || "", orderDate, receivedDate,
      status, price: r.price, notes: r.notes || "", profileName: r.profile_name || "",
      profileUrl: r.profile_url || "", connections: r.connections || "", location: r.location || "",
      daysToReceive, daysWaiting
    };
  });

  const communications = ((commRows || []) as any[]).map((r: any) => ({
    id: r.code, vendor: r.vendor_name, date: r.comm_date, channel: r.channel || "", note: r.note || ""
  }));

  // Downtime in current cycle + open-issue rollup, mirroring GAS's rolling
  // VENDOR_DOWNTIME_CYCLE_DAYS window anchored to each profile's own
  // Registered Date.
  const issuesByProfile = new Map<string, typeof issues>();
  issues.forEach((iss) => {
    if (!issuesByProfile.has(iss.profileId)) issuesByProfile.set(iss.profileId, []);
    issuesByProfile.get(iss.profileId)!.push(iss);
  });

  profiles.forEach((p) => {
    const myIssues = issuesByProfile.get(p.id) || [];
    if (p.registeredDate) {
      const regD = new Date(p.registeredDate);
      const daysSinceReg = Math.floor((todayD.getTime() - regD.getTime()) / 86400000);
      if (daysSinceReg >= 0) {
        const cycleIndex = Math.floor(daysSinceReg / VENDOR_DOWNTIME_CYCLE_DAYS);
        const cycleStart = new Date(regD.getTime() + cycleIndex * VENDOR_DOWNTIME_CYCLE_DAYS * 86400000);
        const cycleEndCap = new Date(cycleStart.getTime() + (VENDOR_DOWNTIME_CYCLE_DAYS - 1) * 86400000);
        const cycleEnd = cycleEndCap < todayD ? cycleEndCap : todayD;
        myIssues.forEach((iss) => {
          if (!iss.reportedDate) return;
          const openStart = new Date(iss.reportedDate);
          const openEnd = iss.fixedDate ? new Date(iss.fixedDate) : todayD;
          const overlapStart = openStart > cycleStart ? openStart : cycleStart;
          const overlapEnd = openEnd < cycleEnd ? openEnd : cycleEnd;
          const overlapDays = Math.floor((overlapEnd.getTime() - overlapStart.getTime()) / 86400000) + 1;
          if (overlapDays > 0) p.currentCycleDowntimeDays += overlapDays;
        });
      }
    }
    myIssues.forEach((iss) => {
      if (iss.solved !== "Yes") {
        p.openIssueCount++;
        if (iss.issueType && !p.openIssueTypes.includes(iss.issueType)) p.openIssueTypes.push(iss.issueType);
      }
    });
    if (p.status === "Replaced") {
      p.health = "Replaced";
    } else if (p.openIssueCount > 0) {
      p.health = p.openIssueTypes.join(", ");
    } else if (p.snExpireDate) {
      const snDaysLeft = Math.floor((new Date(p.snExpireDate).getTime() - todayD.getTime()) / 86400000);
      p.snDaysLeft = snDaysLeft;
      p.health = snDaysLeft < 0 ? "Sales Nav Expired" : snDaysLeft <= SALESNAV_NOTIFY_DAYS ? "Expiring Soon" : "OK";
    } else {
      p.health = "OK";
    }
  });

  // Vendor summary — purchased/active/issue counts, issue-type breakdown,
  // order pipeline, communication history, open-issue ETA status.
  type VendorSummary = {
    vendor: string; vendorId: string; contactPerson: string; email: string; slack: string; channel: string; notes: string;
    totalPurchased: number; active: number; withOpenIssue: number;
    issueTypeBreakdown: Record<string, number>; issueTypeProfileNames: Record<string, string[]>;
    lastVendorUpdate: string; lastFollowUpAt: string;
    ordered: number; received: number; avgOrderDays: number | null;
    lastCommDate: string; lastCommChannel: string; lastCommNote: string;
    oldestOpenIssueDate: string; openIssuesWithEta: number; openIssuesNoEta: number; nearestEta: string;
    _orderDaysSum?: number; _orderDaysCount?: number;
  };
  const vendorMap = new Map<string, VendorSummary>();
  function ensureVendor(name: string): VendorSummary {
    if (!vendorMap.has(name)) {
      vendorMap.set(name, {
        vendor: name, vendorId: "", contactPerson: "", email: "", slack: "", channel: "", notes: "",
        totalPurchased: 0, active: 0, withOpenIssue: 0, issueTypeBreakdown: {}, issueTypeProfileNames: {},
        lastVendorUpdate: "", lastFollowUpAt: "", ordered: 0, received: 0, avgOrderDays: null,
        lastCommDate: "", lastCommChannel: "", lastCommNote: "",
        oldestOpenIssueDate: "", openIssuesWithEta: 0, openIssuesNoEta: 0, nearestEta: ""
      });
    }
    return vendorMap.get(name)!;
  }
  vendors.forEach((v) => {
    const entry = ensureVendor(v.name);
    entry.vendorId = v.id; entry.contactPerson = v.contactPerson; entry.email = v.email;
    entry.slack = v.slack; entry.channel = v.channel; entry.notes = v.notes;
  });
  profiles.forEach((p) => {
    if (!p.vendor) return;
    const v = ensureVendor(p.vendor);
    if (!p.replacementOf) v.totalPurchased++;
    if (p.health === "OK") v.active++;
    if (p.openIssueCount > 0) v.withOpenIssue++;
  });
  const profileById = new Map(profiles.map((p) => [p.id, p]));
  issues.forEach((iss) => {
    const p = profileById.get(iss.profileId);
    const vendorName = p ? p.vendor : iss.vendor;
    if (!vendorName) return;
    const v = ensureVendor(vendorName);
    if (iss.vendorFeedbackDate && (!v.lastVendorUpdate || iss.vendorFeedbackDate > v.lastVendorUpdate)) v.lastVendorUpdate = iss.vendorFeedbackDate;
    if (iss.lastFollowUpAt && (!v.lastFollowUpAt || iss.lastFollowUpAt > v.lastFollowUpAt)) v.lastFollowUpAt = iss.lastFollowUpAt;
    if (iss.solved !== "Yes") {
      if (iss.issueType) {
        v.issueTypeBreakdown[iss.issueType] = (v.issueTypeBreakdown[iss.issueType] || 0) + 1;
        if (!v.issueTypeProfileNames[iss.issueType]) v.issueTypeProfileNames[iss.issueType] = [];
        const label = p ? p.name : (iss.issueNotes || "No details provided");
        if (!v.issueTypeProfileNames[iss.issueType].includes(label)) v.issueTypeProfileNames[iss.issueType].push(label);
      }
      if (!v.oldestOpenIssueDate || (iss.reportedDate && iss.reportedDate < v.oldestOpenIssueDate)) v.oldestOpenIssueDate = iss.reportedDate;
      if (iss.vendorEta) {
        v.openIssuesWithEta++;
        if (!v.nearestEta || iss.vendorEta < v.nearestEta) v.nearestEta = iss.vendorEta;
      } else {
        v.openIssuesNoEta++;
      }
    }
  });
  orders.forEach((o) => {
    if (!o.vendor) return;
    const v = ensureVendor(o.vendor);
    if (o.status === "Ordered") v.ordered++;
    if (o.status === "Received") {
      v.received++;
      if (o.daysToReceive !== null) {
        v._orderDaysSum = (v._orderDaysSum || 0) + o.daysToReceive;
        v._orderDaysCount = (v._orderDaysCount || 0) + 1;
      }
    }
  });
  const commsByVendor = new Map<string, typeof communications>();
  communications.forEach((c) => {
    if (!c.vendor) return;
    if (!commsByVendor.has(c.vendor)) commsByVendor.set(c.vendor, []);
    commsByVendor.get(c.vendor)!.push(c);
  });
  commsByVendor.forEach((list, vendorName) => {
    const sorted = list.slice().sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    const v = ensureVendor(vendorName);
    if (sorted.length) { v.lastCommDate = sorted[0].date; v.lastCommChannel = sorted[0].channel; v.lastCommNote = sorted[0].note; }
  });

  const vendorSummary = Array.from(vendorMap.values()).map((v) => {
    if (v._orderDaysCount) v.avgOrderDays = Math.round((v._orderDaysSum! / v._orderDaysCount) * 10) / 10;
    delete v._orderDaysSum; delete v._orderDaysCount;
    return v;
  }).sort((a, b) => a.vendor.localeCompare(b.vendor));

  return {
    ok: true, profiles, issues, vendors, orders, communications, vendorSummary,
    issueTypes: VENDOR_ISSUE_TYPES, orderStatuses: VENDOR_ORDER_STATUSES, commChannels: VENDOR_COMM_CHANNELS
  };
}

export async function addVendorProfile(data: any) {
  const name = String(data.name || "").trim();
  if (!name) return { error: "Profile name is required" };
  const vendor = String(data.vendor || "").trim();
  if (!vendor) return { error: "Vendor name is required" };
  const supabase = getSupabaseAdmin() as any;
  const code = await nextCode("vendor_profiles", "code", "VP");
  const row = {
    code, name, vendor_name: vendor,
    registered_date: data.registeredDate || null, sn_connected_date: data.snConnectedDate || null,
    status: data.status || "Active", notes: data.notes || "", managed_by: data.managedBy || "",
    li_profile_url: data.liProfileUrl || "", price: data.price || null
  };
  const { error } = await supabase.from("vendor_profiles").insert(row);
  if (error) return { error: `Could not add profile: ${error.message}` };
  try { await appendVendorProfileToSheet(row); } catch (e) { console.error("addVendorProfile sheet write failed:", e); }
  return { ok: true, id: code };
}

export async function updateVendorProfile(profileId: string, data: any) {
  profileId = String(profileId || "").trim();
  if (!profileId) return { error: "No profile specified" };
  const supabase = getSupabaseAdmin() as any;
  const patch: Record<string, unknown> = {};
  const map: Record<string, string> = {
    name: "name", vendor: "vendor_name", registeredDate: "registered_date", snConnectedDate: "sn_connected_date",
    status: "status", notes: "notes", managedBy: "managed_by", liProfileUrl: "li_profile_url", price: "price",
    lastRenewedDate: "last_renewed_date"
  };
  Object.keys(map).forEach((key) => { if (data[key] !== undefined) patch[map[key]] = data[key] || null; });
  patch.updated_at = new Date().toISOString();
  const { error } = await supabase.from("vendor_profiles").update(patch).eq("code", profileId);
  if (error) return { error: `Could not update profile: ${error.message}` };
  try { await updateVendorProfileInSheet(profileId, patch); } catch (e) { console.error("updateVendorProfile sheet write failed:", e); }
  return { ok: true };
}

export async function replaceVendorProfile(oldProfileId: string, newProfileData: any, issueId?: string) {
  oldProfileId = String(oldProfileId || "").trim();
  if (!oldProfileId) return { error: "No profile specified" };
  const newName = String(newProfileData?.name || "").trim();
  if (!newName) return { error: "New profile name is required" };
  const supabase = getSupabaseAdmin() as any;

  const { data: oldRow } = await supabase.from("vendor_profiles").select("*").eq("code", oldProfileId).maybeSingle();
  if (!oldRow) return { error: "Original profile not found" };

  const code = await nextCode("vendor_profiles", "code", "VP");
  const todayStr = new Date().toISOString().slice(0, 10);
  const newRow = {
    code, name: newName, vendor_name: newProfileData.vendor || oldRow.vendor_name,
    registered_date: newProfileData.registeredDate || todayStr, sn_connected_date: newProfileData.snConnectedDate || null,
    status: "Active", replacement_of: oldProfileId, notes: newProfileData.notes || "",
    managed_by: newProfileData.managedBy || oldRow.managed_by, li_profile_url: newProfileData.liProfileUrl || "",
    price: newProfileData.price || oldRow.price
  };
  const { error: insErr } = await supabase.from("vendor_profiles").insert(newRow);
  if (insErr) return { error: `Could not replace profile: ${insErr.message}` };

  await supabase.from("vendor_profiles").update({ status: "Replaced", replaced_by: code, replacement_date: todayStr, updated_at: new Date().toISOString() }).eq("code", oldProfileId);

  issueId = String(issueId || "").trim();
  if (issueId) {
    const { data: issueRow } = await supabase.from("vendor_issues").select("solved").eq("code", Number(issueId)).maybeSingle();
    const issuePatch: Record<string, unknown> = { fixed_by_replacement: "Yes", replacement_profile_code: code };
    if (issueRow && issueRow.solved !== "Yes") { issuePatch.solved = "Yes"; issuePatch.fixed_date = todayStr; }
    await supabase.from("vendor_issues").update(issuePatch).eq("code", Number(issueId));
    try { await updateVendorIssueInSheet(Number(issueId), issuePatch); } catch (e) { console.error("replaceVendorProfile issue sheet write failed:", e); }
  }

  try {
    await appendVendorProfileToSheet(newRow);
    await updateVendorProfileInSheet(oldProfileId, { status: "Replaced", replaced_by: code, replacement_date: todayStr });
  } catch (e) { console.error("replaceVendorProfile sheet write failed:", e); }

  return { ok: true, newId: code };
}

export async function logVendorIssue(profileId: string, data: any) {
  profileId = String(profileId || "").trim();
  const vendorName = String(data?.vendor || "").trim();
  if (!profileId && !vendorName) return { error: "Select a profile or a vendor." };
  const issueType = String(data?.issueType || "").trim();
  if (!issueType) return { error: "Issue type is required" };
  const supabase = getSupabaseAdmin() as any;
  const code = await nextNumericCode("vendor_issues");
  const todayStr = new Date().toISOString().slice(0, 10);
  const row = {
    code, profile_code: profileId || null, reported_date: data.reportedDate || todayStr, issue_type: issueType,
    issue_notes: data.issueNotes || "", solved: "No", vendor_name: profileId ? null : vendorName,
    followup_count: 0
  };
  const { error } = await supabase.from("vendor_issues").insert(row);
  if (error) return { error: `Could not log issue: ${error.message}` };
  try { await appendVendorIssueToSheet(row); } catch (e) { console.error("logVendorIssue sheet write failed:", e); }
  return { ok: true, id: code };
}

export async function updateVendorIssue(issueId: string, data: any) {
  issueId = String(issueId || "").trim();
  if (!issueId) return { error: "No issue specified" };
  const supabase = getSupabaseAdmin() as any;
  const patch: Record<string, unknown> = {};
  const map: Record<string, string> = {
    issueType: "issue_type", issueNotes: "issue_notes", vendorFeedbackDate: "vendor_feedback_date",
    vendorFeedback: "vendor_feedback", fixedDate: "fixed_date", solved: "solved", vendorEta: "vendor_eta"
  };
  Object.keys(map).forEach((key) => { if (data[key] !== undefined) patch[map[key]] = data[key] || null; });
  if (data.solved === "Yes" && !data.fixedDate) patch.fixed_date = new Date().toISOString().slice(0, 10);
  patch.updated_at = new Date().toISOString();
  const { error } = await supabase.from("vendor_issues").update(patch).eq("code", Number(issueId));
  if (error) return { error: `Could not update issue: ${error.message}` };
  try { await updateVendorIssueInSheet(Number(issueId), patch); } catch (e) { console.error("updateVendorIssue sheet write failed:", e); }
  return { ok: true };
}

export async function logVendorIssueFollowUp(issueId: string) {
  issueId = String(issueId || "").trim();
  if (!issueId) return { error: "No issue specified" };
  const supabase = getSupabaseAdmin() as any;
  const { data: row } = await supabase.from("vendor_issues").select("followup_count").eq("code", Number(issueId)).maybeSingle();
  if (!row) return { error: "Issue not found" };
  const followUpCount = (row.followup_count || 0) + 1;
  const nowStr = new Date().toLocaleString("en-US", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).replace(",", "");
  const patch = { followup_count: followUpCount, last_followup_at: nowStr };
  await supabase.from("vendor_issues").update(patch).eq("code", Number(issueId));
  try { await updateVendorIssueInSheet(Number(issueId), patch); } catch (e) { console.error("logVendorIssueFollowUp sheet write failed:", e); }
  return { ok: true, followUpCount, lastFollowUpAt: nowStr };
}

export async function logVendorFollowUpBulk(issueIds: string[]) {
  if (!issueIds || !issueIds.length) return { error: "No issues specified" };
  let updated = 0;
  let lastFollowUpAt = "";
  for (const id of issueIds) {
    const res = await logVendorIssueFollowUp(id);
    if (!("error" in res)) { updated++; lastFollowUpAt = res.lastFollowUpAt; }
  }
  return { ok: true, updated, lastFollowUpAt };
}

export async function addVendor(data: any) {
  const name = String(data?.name || "").trim();
  if (!name) return { error: "Vendor name is required" };
  const supabase = getSupabaseAdmin() as any;
  const { data: existing } = await supabase.from("vendors").select("id").ilike("name", name).maybeSingle();
  if (existing) return { error: "A vendor with this name already exists" };
  const code = await nextCode("vendors", "code", "VN");
  const row = {
    code, name, contact_person: data.contactPerson || "", email: data.email || "",
    slack: data.slack || "", channel: data.channel || "", notes: data.notes || ""
  };
  const { error } = await supabase.from("vendors").insert(row);
  if (error) return { error: `Could not add vendor: ${error.message}` };
  try { await appendVendorToSheet(row); } catch (e) { console.error("addVendor sheet write failed:", e); }
  return { ok: true, id: code };
}

export async function updateVendor(vendorId: string, data: any) {
  vendorId = String(vendorId || "").trim();
  if (!vendorId) return { error: "No vendor specified" };
  const supabase = getSupabaseAdmin() as any;
  const patch: Record<string, unknown> = {};
  const map: Record<string, string> = { name: "name", contactPerson: "contact_person", email: "email", slack: "slack", channel: "channel", notes: "notes" };
  Object.keys(map).forEach((key) => { if (data[key] !== undefined) patch[map[key]] = data[key]; });
  patch.updated_at = new Date().toISOString();
  const { error } = await supabase.from("vendors").update(patch).eq("code", vendorId);
  if (error) return { error: `Could not update vendor: ${error.message}` };
  try { await updateVendorInSheet(vendorId, patch); } catch (e) { console.error("updateVendor sheet write failed:", e); }
  return { ok: true };
}

export async function logVendorCommunication(data: any) {
  const vendor = String(data?.vendor || "").trim();
  if (!vendor) return { error: "Vendor is required" };
  const note = String(data?.note || "").trim();
  if (!note) return { error: "Note is required" };
  const supabase = getSupabaseAdmin() as any;
  const code = await nextNumericCode("vendor_communications");
  const todayStr = new Date().toISOString().slice(0, 10);
  const row = { code, vendor_name: vendor, comm_date: data.date || todayStr, channel: data.channel || "", note };
  const { error } = await supabase.from("vendor_communications").insert(row);
  if (error) return { error: `Could not log communication: ${error.message}` };
  try { await appendVendorCommunicationToSheet(row); } catch (e) { console.error("logVendorCommunication sheet write failed:", e); }
  return { ok: true, id: code };
}

export async function addVendorOrder(data: any) {
  const vendor = String(data?.vendor || "").trim();
  if (!vendor) return { error: "Vendor is required" };
  const supabase = getSupabaseAdmin() as any;
  const code = await nextCode("vendor_orders", "code", "ORD");
  const todayStr = new Date().toISOString().slice(0, 10);
  const row = {
    code, vendor_name: vendor, requested_by: data.requestedBy || "", order_date: data.orderDate || todayStr,
    status: "Ordered", price: data.price || null, notes: data.notes || "", profile_name: data.profileName || "",
    profile_url: data.profileUrl || "", connections: data.connections || "", location: data.location || ""
  };
  const { error } = await supabase.from("vendor_orders").insert(row);
  if (error) return { error: `Could not add order: ${error.message}` };
  try { await appendVendorOrderToSheet(row); } catch (e) { console.error("addVendorOrder sheet write failed:", e); }
  return { ok: true, id: code };
}

export async function updateVendorOrder(orderId: string, data: any) {
  orderId = String(orderId || "").trim();
  if (!orderId) return { error: "No order specified" };
  const supabase = getSupabaseAdmin() as any;
  const patch: Record<string, unknown> = {};
  const map: Record<string, string> = {
    status: "status", receivedDate: "received_date", price: "price", notes: "notes",
    profileName: "profile_name", profileUrl: "profile_url", connections: "connections", location: "location"
  };
  Object.keys(map).forEach((key) => { if (data[key] !== undefined) patch[map[key]] = data[key] || null; });
  if (data.status === "Received" && !data.receivedDate) patch.received_date = new Date().toISOString().slice(0, 10);
  patch.updated_at = new Date().toISOString();
  const { error } = await supabase.from("vendor_orders").update(patch).eq("code", orderId);
  if (error) return { error: `Could not update order: ${error.message}` };
  try { await updateVendorOrderInSheet(orderId, patch); } catch (e) { console.error("updateVendorOrder sheet write failed:", e); }
  return { ok: true };
}
