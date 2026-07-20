import RoleGate from "@/components/RoleGate";
import AgentConsole from "@/components/AgentConsole";
import { getSession } from "@/lib/auth";
import { canOpenRole } from "@/lib/roles";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export default async function AgentPage() {
  const session = getSession();
  if (!canOpenRole(session, "agent")) {
    return <RoleGate session={session} role="agent" title="Agent" />;
  }

  const supabase = getSupabaseAdmin() as any;
  const { data: applicants } = await supabase.from("applicants").select("*").eq("assigned_agent_name", session!.name).order("updated_at", { ascending: false, nullsFirst: false });
  const ids = (applicants || []).map((a: any) => a.id);
  const { data: logs } = ids.length ? await supabase.from("agent_logs").select("*").in("applicant_id", ids) : { data: [] };
  return <AgentConsole session={session!} initial={{ applicants: applicants || [], logs: logs || [] }} />;
}
