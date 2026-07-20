import { getSupabaseAdmin } from "./supabaseAdmin";

// "-1"/"-2" etc. suffix on a campaign name marks a past cycle of the same
// client (see PROJECT_CONTEXT.md's Campaign naming convention); no suffix
// means the current cycle. Mirrors GAS Client.html's cycle badge/filter.
function cycleFromCampaignName(campaignName: string) {
  const match = String(campaignName || "").match(/-(\d+)$/);
  return match ? match[1] : "current";
}

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
  const cycleSet = new Set<string>();
  const leadsWithTags = rows.map((row: any) => {
    const date = String(row.date_created || "").slice(0, 10);
    if (date) byDate.set(date, (byDate.get(date) || 0) + 1);
    const state = String(row.state || "Unknown").trim() || "Unknown";
    byState.set(state, (byState.get(state) || 0) + 1);
    const cycle = cycleFromCampaignName(row.campaign_name);
    cycleSet.add(cycle);
    return { ...row, cycle };
  });
  const cycles = Array.from(cycleSet).sort((a, b) => (a === "current" ? -1 : b === "current" ? 1 : Number(a) - Number(b)));
  return {
    stats,
    growth: Array.from(byDate.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count })),
    states: Array.from(byState.entries()).sort((a, b) => b[1] - a[1]).map(([state, count]) => ({ state, count })),
    cycles,
    leads: leadsWithTags
  };
}
