import { getSupabaseAdmin } from "./supabaseAdmin";

export async function getGrowthPayload() {
  const supabase = getSupabaseAdmin() as any;
  const [users, contacts, appts, campaigns, tasks, costs, payments, feedback] = await Promise.all([
    supabase.from("app_users").select("id,email,name,role,legacy_type,status,legacy_sheet_id").order("name", { ascending: true }),
    supabase.from("contacts").select("id,recruiter_name,recruiter_email,status,created_at,updated_at").order("updated_at", { ascending: false }).limit(1000),
    supabase.from("appointments").select("*").order("event_created_at", { ascending: false, nullsFirst: false }).limit(500),
    supabase.from("campaigns").select("*,clients(name,status,event_url)").order("campaign_name", { ascending: true }).limit(200),
    supabase.from("team_tasks").select("*").order("created_at", { ascending: false }).limit(200),
    supabase.from("costs").select("*").order("date", { ascending: false, nullsFirst: false }).limit(200),
    supabase.from("client_payments").select("*").order("date_paid", { ascending: false, nullsFirst: false }).limit(200),
    supabase.from("daily_feedback").select("*").order("created_at", { ascending: false }).limit(100)
  ]);
  const contactRows = contacts.data || [];
  const apptRows = appts.data || [];
  const today = new Date().toISOString().slice(0, 10);
  const last7Ms = Date.now() - 7 * 86400000;
  return {
    users: users.data || [],
    contacts: contactRows,
    appointments: apptRows,
    campaigns: campaigns.data || [],
    tasks: tasks.data || [],
    costs: costs.data || [],
    payments: payments.data || [],
    feedback: feedback.data || [],
    stats: {
      activeRecruiters: (users.data || []).filter((u: any) => u.role === "recruiter" && String(u.status || "").toLowerCase() === "approved").length,
      sendsLast7: contactRows.filter((c: any) => Date.parse(c.created_at || c.updated_at || "") >= last7Ms).length,
      apptsToday: apptRows.filter((a: any) => String(a.event_created_at || "").slice(0, 10) === today).length,
      apptsLast7: apptRows.filter((a: any) => Date.parse(a.event_created_at || "") >= last7Ms).length,
      activeClients: (campaigns.data || []).filter((c: any) => !/paused|inactive|archive/i.test(String(c.campaign_status || ""))).length,
      totalCost: (costs.data || []).reduce((sum: number, c: any) => sum + Number(c.amount || 0), 0),
      totalEarning: (payments.data || []).reduce((sum: number, p: any) => sum + Number(p.total_billed || 0), 0)
    }
  };
}
