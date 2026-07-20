import { getSupabaseAdmin } from "./supabaseAdmin";

export async function getClientPortalPayload(session: { email: string; name: string }) {
  const supabase = getSupabaseAdmin() as any;
  const { data: user } = await supabase
    .from("app_users")
    .select("legacy_sheet_id,name,email")
    .eq("email", session.email)
    .maybeSingle();
  const campaignName = String(user?.legacy_sheet_id || user?.name || session.name || "").trim();
  let query = supabase
    .from("leads_ledger")
    .select("*")
    .order("date_created", { ascending: false, nullsFirst: false })
    .limit(500);
  if (campaignName) query = query.ilike("campaign_name", `${campaignName}%`);
  const { data: leads } = await query;
  const rows = leads || [];
  const now = Date.now();
  const dayMs = 86400000;
  const stats = {
    campaignName,
    totalAppts: rows.length,
    last7: rows.filter((r: any) => Date.parse(r.date_created || "") >= now - 7 * dayMs).length,
    last14: rows.filter((r: any) => Date.parse(r.date_created || "") >= now - 14 * dayMs).length,
    last28: rows.filter((r: any) => Date.parse(r.date_created || "") >= now - 28 * dayMs).length,
    canyPct: rows.length ? Math.round((rows.filter((r: any) => ["CA", "NY", "CALIFORNIA", "NEW YORK"].includes(String(r.state || "").toUpperCase())).length / rows.length) * 100) : 0
  };
  const byDate = new Map<string, number>();
  const byState = new Map<string, number>();
  rows.forEach((row: any) => {
    const date = String(row.date_created || "").slice(0, 10);
    if (date) byDate.set(date, (byDate.get(date) || 0) + 1);
    const state = String(row.state || "Unknown").trim() || "Unknown";
    byState.set(state, (byState.get(state) || 0) + 1);
  });
  return {
    stats,
    growth: Array.from(byDate.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count })),
    states: Array.from(byState.entries()).sort((a, b) => b[1] - a[1]).map(([state, count]) => ({ state, count })),
    leads: rows
  };
}
