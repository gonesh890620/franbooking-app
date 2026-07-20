import { error, json, requireSession } from "@/lib/http";
import { canOpenRole } from "@/lib/roles";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET() {
  try {
    const session = requireSession();
    if (!canOpenRole(session, "agent")) return error("Access denied", 403);
    const supabase = getSupabaseAdmin() as any;
    const { data: applicants } = await supabase
      .from("applicants")
      .select("*")
      .eq("assigned_agent_name", session.name)
      .order("updated_at", { ascending: false, nullsFirst: false });
    const ids = (applicants || []).map((a: any) => a.id);
    const { data: logs } = ids.length
      ? await supabase.from("agent_logs").select("*").in("applicant_id", ids)
      : { data: [] };
    return json({ applicants: applicants || [], logs: logs || [] });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Agent load failed";
    return error(message, message === "Unauthorized" ? 401 : 500);
  }
}

export async function POST(req: Request) {
  try {
    const session = requireSession();
    if (!canOpenRole(session, "agent")) return error("Access denied", 403);
    const body = await req.json();
    const action = String(body.action || "");
    const supabase = getSupabaseAdmin() as any;

    if (action === "updateApplicantLink") {
      await supabase.from("applicants").update({
        linkedin_url: String(body.liProfile || ""),
        updated_at: new Date().toISOString()
      }).eq("id", String(body.applicantId || ""));
      return json({ ok: true });
    }

    if (action === "saveLog") {
      const applicantId = String(body.applicantId || "");
      await supabase.from("agent_logs").upsert({
        applicant_id: applicantId,
        agent_email: session.email,
        agent_name: session.name,
        checklist: body.checklist || {},
        answers: body.answers || {},
        notes: String(body.notes || ""),
        updated_date: new Date().toISOString().slice(0, 10),
        updated_at: new Date().toISOString()
      }, { onConflict: "applicant_id" });
      return json({ ok: true });
    }

    if (action === "markHired") {
      await supabase.from("applicants").update({ status: "Hired", updated_at: new Date().toISOString() }).eq("id", String(body.applicantId || ""));
      return json({ ok: true });
    }

    return json({ error: `Unknown agent action: ${action}` }, 404);
  } catch (e) {
    return error(e instanceof Error ? e.message : "Agent action failed", 500);
  }
}
