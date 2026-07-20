import { getSupabaseAdmin } from "./supabaseAdmin";

export async function getOperationsPayload() {
  const supabase = getSupabaseAdmin() as any;
  const [appointments, salesNav, applicants, agents, clients] = await Promise.all([
    supabase.from("appointments").select("*").order("event_created_at", { ascending: false, nullsFirst: false }).limit(80),
    supabase.from("sales_nav_inventory").select("*").order("date_added", { ascending: false, nullsFirst: false }).limit(120),
    supabase.from("applicants").select("*").order("updated_at", { ascending: false, nullsFirst: false }).limit(120),
    supabase.from("app_users").select("email,name").eq("role", "agent").order("name", { ascending: true }),
    supabase.from("campaigns").select("*,clients(name,status,event_url)").order("campaign_name", { ascending: true }).limit(160)
  ]);
  return {
    appointments: appointments.data || [],
    salesNav: salesNav.data || [],
    applicants: applicants.data || [],
    agents: agents.data || [],
    clients: clients.data || []
  };
}
