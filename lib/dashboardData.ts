import { getSupabaseAdmin } from "./supabaseAdmin";

type CountResult = {
  table: string;
  label: string;
  count: number;
};

const COUNT_TABLES = [
  ["app_users", "Users"],
  ["clients", "Clients"],
  ["campaigns", "Campaigns"],
  ["contacts", "FU Contacts"],
  ["outreach_logs", "Outreach Logs"],
  ["appointments", "Appointments"],
  ["leads_ledger", "Leads Ledger"],
  ["time_logs", "Time Logs"],
  ["applicants", "Applicants"],
  ["agent_logs", "Agent Logs"],
  ["team_tasks", "Team Tasks"],
  ["sales_nav_inventory", "Sales Nav Seats"],
  ["costs", "Costs"],
  ["client_payments", "Client Payments"]
] as const;

export async function getTableCounts(): Promise<CountResult[]> {
  const supabase = getSupabaseAdmin();
  const counts = await Promise.all(
    COUNT_TABLES.map(async ([table, label]) => {
      const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
      if (error) throw new Error(`${table}: ${error.message}`);
      return { table, label, count: count || 0 };
    })
  );
  return counts;
}

export async function getAdminUsers() {
  const supabase = getSupabaseAdmin();
  const { data: users, error: usersError } = await supabase
    .from("app_users")
    .select("id,email,name,role,legacy_type,legacy_sheet_id,status,updated_at,approved_at,expires_at,referred_by,remove_date,remove_reason")
    .order("role", { ascending: true })
    .order("name", { ascending: true });
  if (usersError) throw new Error(`app_users: ${usersError.message}`);

  const ids = (users || []).map((user: { id: string }) => user.id);
  const { data: credits, error: creditsError } = ids.length
    ? await supabase
        .from("recruiter_credits")
        .select("user_id,nurture_balance,outreach_balance,profile_balance,nurture_limit,outreach_limit,profile_limit,used_today,used_alltime")
        .in("user_id", ids)
    : { data: [], error: null };
  if (creditsError) throw new Error(`recruiter_credits: ${creditsError.message}`);

  const creditsByUser = new Map((credits || []).map((credit: { user_id: string }) => [credit.user_id, credit]));
  return (users || []).map((user: { id: string }) => ({
    ...user,
    credits: creditsByUser.get(user.id) || null
  }));
}

export async function getRecentAppointments(limit = 10) {
  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch {
    return [];
  }
  const { data, error } = await supabase
    .from("appointments")
    .select("invitee_name,client_name,recruiter_name,status,event_start_at,event_created_at")
    .order("event_created_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) return [];
  return data || [];
}

export async function getRecentApplicants(limit = 10) {
  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch {
    return [];
  }
  const { data, error } = await supabase
    .from("applicants")
    .select("name,email,status,assigned_agent_name,created_at,updated_at")
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) return [];
  return data || [];
}

export async function getDailyTasks(limit = 12) {
  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch {
    return [];
  }
  const { data, error } = await supabase
    .from("team_tasks")
    .select("title,topic,priority,status,assigned_name,assigned_email,eta,created_at")
    .order("created_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) return [];
  return data || [];
}
