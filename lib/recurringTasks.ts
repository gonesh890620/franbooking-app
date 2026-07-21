import { getSupabaseAdmin } from "./supabaseAdmin";

export async function getRecurringTasks() {
  const supabase = getSupabaseAdmin() as any;
  const { data } = await supabase.from("recurring_team_tasks").select("*").order("created_at", { ascending: false });
  const rows = (data || []).map((r: any) => ({
    id: r.id, title: r.title, description: r.description || "", topic: r.topic || "General",
    priority: r.priority || "Medium", daysOfMonth: (r.days_of_month || []).join(","), active: !!r.active,
    lastGenerated: r.last_generated, assignedEmail: r.assigned_email || "", assignedName: r.assigned_name || ""
  }));
  return { ok: true, rows };
}

export async function addRecurringTask(data: any, sessionEmail: string, sessionName: string) {
  const title = String(data?.title || "").trim();
  if (!title) return { error: "Title is required" };
  const daysOfMonth = String(data?.daysOfMonth || "").trim();
  if (!daysOfMonth) return { error: "Days of Month is required (e.g. 1,16)" };
  const validDays = daysOfMonth.split(",").map((s: string) => parseInt(s.trim(), 10)).filter((n: number) => Number.isFinite(n) && n >= 1 && n <= 31);
  if (!validDays.length) return { error: "Days of Month must be numbers 1-31, comma separated" };

  const supabase = getSupabaseAdmin() as any;
  const { error } = await supabase.from("recurring_team_tasks").insert({
    title, description: data.description || "", topic: data.topic || "General", priority: data.priority || "Medium",
    days_of_month: validDays, active: true,
    assigned_email: (data.assignedEmail || sessionEmail || "").toLowerCase(), assigned_name: data.assignedName || sessionName || ""
  });
  if (error) return { error: `Could not save recurring task: ${error.message}` };
  return { ok: true };
}

export async function toggleRecurringTask(id: string, active: boolean) {
  if (!id) return { error: "No recurring task specified" };
  const supabase = getSupabaseAdmin() as any;
  const { error } = await supabase.from("recurring_team_tasks").update({ active }).eq("id", id);
  if (error) return { error: `Could not update recurring task: ${error.message}` };
  return { ok: true };
}

// Creates at most one Task per Recurring Task per calendar month, even if
// called more than once today — mirrors GAS's generateRecurringTasksIfDue_.
export async function runRecurringCheck() {
  const supabase = getSupabaseAdmin() as any;
  const { data: templates } = await supabase.from("recurring_team_tasks").select("*").eq("active", true);
  const today = new Date();
  const todayDay = today.getDate();
  const todayMonthKey = today.toISOString().slice(0, 7);
  const todayStr = today.toISOString().slice(0, 10);

  let created = 0;
  for (const t of templates || []) {
    const days: number[] = t.days_of_month || [];
    if (!days.includes(todayDay)) continue;
    const lastGenMonthKey = t.last_generated ? String(t.last_generated).slice(0, 7) : "";
    if (lastGenMonthKey === todayMonthKey) continue;

    const legacyId = `rt-${Date.now()}-${created}`;
    const { error } = await supabase.from("team_tasks").insert({
      legacy_id: legacyId, title: t.title, description: t.description || "", topic: t.topic || "General",
      priority: t.priority || "Medium", eta_text: "TBD", status: "Open", created_date: todayStr,
      source: `Auto (Recurring #${t.id})`, assigned_email: t.assigned_email || "", assigned_name: t.assigned_name || ""
    });
    if (error) { console.error("runRecurringCheck insert failed:", error); continue; }
    await supabase.from("recurring_team_tasks").update({ last_generated: todayStr }).eq("id", t.id);
    created++;
  }
  return { ok: true, created };
}
