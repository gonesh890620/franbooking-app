import { getSupabaseAdmin } from "./supabaseAdmin";

const SALESNAV_EXPIRE_DAYS = 29;
const SALESNAV_NOTIFY_DAYS = 3;

function computeSalesNavExpiry(dateVal: string | null) {
  if (!dateVal) return { toBeExpire: "", daysLeft: null as number | null };
  const start = new Date(`${String(dateVal).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return { toBeExpire: "", daysLeft: null as number | null };
  const expire = new Date(start.getTime() + SALESNAV_EXPIRE_DAYS * 86400000);
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  const daysLeft = Math.ceil((expire.getTime() - today.getTime()) / 86400000);
  return { toBeExpire: expire.toISOString().slice(0, 10), daysLeft };
}

// Vendor-grouped Sales Nav summary — expiring-soon groups and outstanding
// vendor payments due, matching GAS apiOpsGetSalesNavInventory.
function summarizeSalesNav(rows: any[]) {
  let totalUsed = 0;
  let expiredSoFar = 0;
  let activeNow = 0;
  const expiringGroups = new Map<string, any[]>();
  const vendorTotals = new Map<string, { vendor: string; count: number; total: number }>();

  for (const row of rows) {
    if (!row.date_added && !row.salesnav_id && !row.vendor) continue;
    const exp = computeSalesNavExpiry(row.date_added);
    totalUsed++;
    if (exp.daysLeft !== null) {
      if (exp.daysLeft < 0) expiredSoFar++;
      else activeNow++;
    }
    const entry = { ...row, toBeExpire: exp.toBeExpire, daysLeft: exp.daysLeft };
    if (exp.daysLeft !== null && exp.daysLeft >= 0 && exp.daysLeft <= SALESNAV_NOTIFY_DAYS) {
      const key = row.vendor || "(No Vendor)";
      if (!expiringGroups.has(key)) expiringGroups.set(key, []);
      expiringGroups.get(key)!.push(entry);
    }
    if (!row.payment_status && row.vendor) {
      const existing = vendorTotals.get(row.vendor) || { vendor: row.vendor, count: 0, total: 0 };
      existing.count++;
      existing.total += Number(row.price || 0);
      vendorTotals.set(row.vendor, existing);
    }
  }

  const expiringByVendor = Array.from(expiringGroups.entries())
    .map(([vendor, entries]) => ({ vendor, count: entries.length, entries: entries.sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0)) }))
    .sort((a, b) => (a.count === b.count ? a.vendor.localeCompare(b.vendor) : b.count - a.count));

  const vendorsDue = Array.from(vendorTotals.values()).sort((a, b) => b.total - a.total);

  return { stats: { totalUsed, expiredSoFar, activeNow }, expiringByVendor, vendorsDue };
}

export async function getOperationsPayload() {
  const supabase = getSupabaseAdmin() as any;
  const [appointments, salesNav, applicants, agents, clients] = await Promise.all([
    supabase.from("appointments").select("*").order("event_created_at", { ascending: false, nullsFirst: false }).limit(80),
    supabase.from("sales_nav_inventory").select("*").order("date_added", { ascending: false, nullsFirst: false }).limit(200),
    supabase.from("applicants").select("*").order("updated_at", { ascending: false, nullsFirst: false }).limit(120),
    supabase.from("app_users").select("email,name").eq("role", "agent").order("name", { ascending: true }),
    supabase.from("campaigns").select("*,clients(name,status,event_url)").order("campaign_name", { ascending: true }).limit(160)
  ]);
  const salesNavRows = salesNav.data || [];
  return {
    appointments: appointments.data || [],
    salesNav: salesNavRows,
    salesNavSummary: summarizeSalesNav(salesNavRows),
    applicants: applicants.data || [],
    agents: agents.data || [],
    clients: clients.data || []
  };
}
