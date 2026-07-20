import { error, json, requireSession } from "@/lib/http";
import { getGrowthPayload } from "@/lib/growthData";
import { canOpenRole } from "@/lib/roles";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { setSession } from "@/lib/auth";
import { updateMasterTrackerClientStatus } from "@/lib/masterTracker";
import { brainstormWithCeo } from "@/lib/ai";
import { roleForLegacyType } from "@/lib/legacyRecruiter";

export async function GET() {
  try {
    const session = requireSession();
    if (!canOpenRole(session, "growth")) return error("Access denied", 403);
    return json(await getGrowthPayload());
  } catch (e) {
    const message = e instanceof Error ? e.message : "Growth load failed";
    return error(message, message === "Unauthorized" ? 401 : 500);
  }
}

export async function POST(req: Request) {
  try {
    const session = requireSession();
    if (!canOpenRole(session, "growth")) return error("Access denied", 403);
    const body = await req.json();
    const action = String(body.action || "");
    const supabase = getSupabaseAdmin() as any;

    if (action === "addTask") {
      await supabase.from("team_tasks").insert({ title: body.title || "", description: body.description || "", topic: body.topic || "", priority: body.priority || "", status: "Open", assigned_email: body.assignedEmail || session.email, assigned_name: body.assignedName || session.name });
      return json({ ok: true });
    }
    if (action === "taskStatus") {
      await supabase.from("team_tasks").update({ status: body.status || "Open", updated_at: new Date().toISOString() }).eq("id", String(body.id || ""));
      return json({ ok: true });
    }
    // Matches GAS apiCeoReassignTask.
    if (action === "reassignTask") {
      const newAssignedEmail = String(body.assignedEmail || "").toLowerCase().trim();
      if (!newAssignedEmail) return json({ error: "Assignee is required" }, 400);
      await supabase.from("team_tasks").update({
        assigned_email: newAssignedEmail,
        assigned_name: body.assignedName || "",
        updated_at: new Date().toISOString()
      }).eq("id", String(body.id || ""));
      return json({ ok: true });
    }
    if (action === "addCost") {
      await supabase.from("costs").insert({ date: body.date || new Date().toISOString().slice(0, 10), amount: Number(body.amount || 0), description: body.description || "", notes: body.notes || "", use_method: body.useMethod || "", comments: body.comments || "" });
      return json({ ok: true });
    }
    if (action === "addPayment") {
      await supabase.from("client_payments").insert({ date_issue: body.dateIssue || null, date_paid: body.datePaid || null, client_name: body.clientName || "", invoice_ref: body.invoiceRef || "", cycle: Number(body.cycle || 0), total_billed: Number(body.totalBilled || 0), status: body.status || "", charged_by: body.chargedBy || "" });
      return json({ ok: true });
    }

    // Client Tracker status change — dual-writes Supabase campaigns + the
    // Master Tracker sheet, same as Operations' updateClientStatus (Phase 1).
    if (action === "updateClientStatus") {
      const campaignId = String(body.campaignId || "");
      const { data: campaign } = await supabase.from("campaigns").select("campaign_name").eq("id", campaignId).maybeSingle();
      await supabase.from("campaigns").update({
        campaign_status: body.status || "",
        paused_reason: body.pausedReason || "",
        updated_at: new Date().toISOString()
      }).eq("id", campaignId);
      if (campaign?.campaign_name) {
        await updateMasterTrackerClientStatus(campaign.campaign_name, body.status || "", body.pausedReason || "");
      }
      return json({ ok: true });
    }

    // Matches GAS apiCeoMarkFeedbackReviewed — Supabase daily_feedback
    // already has a `reviewed` column, so this is a plain update.
    if (action === "markFeedbackReviewed") {
      await supabase.from("daily_feedback").update({ reviewed: true }).eq("id", String(body.id || ""));
      return json({ ok: true });
    }

    // Matches GAS apiCeoListOpsUsers / apiCeoListRecruiters — rosters for the
    // impersonation picker, sourced from Supabase app_users (Access Control
    // is Supabase-only per the data architecture).
    if (action === "listOpsUsers") {
      const { data } = await supabase.from("app_users").select("email,name").eq("role", "operations").eq("status", "approved").order("name", { ascending: true });
      return json({ users: data || [] });
    }
    if (action === "listRecruiters") {
      const { data } = await supabase.from("app_users").select("email,name").eq("role", "recruiter").eq("status", "approved").order("name", { ascending: true });
      return json({ users: data || [] });
    }

    // Impersonation — swaps the session to the target user while stashing
    // the Growth identity so the target panel can show a "Return to Growth"
    // banner. Matches GAS's sessionStorage-based impersonation, adapted to
    // this app's signed-cookie session.
    if (action === "impersonate") {
      const targetEmail = String(body.targetEmail || "").toLowerCase().trim();
      if (!targetEmail) return json({ error: "Target email is required" }, 400);
      const { data: target } = await supabase.from("app_users").select("email,name,legacy_type,role").eq("email", targetEmail).maybeSingle();
      if (!target) return json({ error: "User not found" }, 404);
      const type = String(target.legacy_type || target.role || "PH");
      setSession({
        email: target.email,
        name: target.name,
        type,
        impersonatorEmail: session.email,
        impersonatorName: session.name
      });
      const role = roleForLegacyType(type);
      const page = role === "operations" ? "/operations" : role === "recruiter" ? "/recruiter" : "/growth";
      return json({ ok: true, page });
    }

    // CEO Brainstorm chat — grounds the model in the already-loaded Growth
    // dashboard snapshot (simplified vs. GAS's exhaustive per-recruiter S2A
    // pull, which depends on data this port doesn't compute).
    if (action === "brainstorm") {
      const question = String(body.question || "").trim();
      if (!question) return json({ error: "No question provided" }, 400);
      const payload = await getGrowthPayload();
      const snapshot =
        `Active recruiters: ${payload.stats.activeRecruiters} | Active clients: ${payload.stats.activeClients}\n` +
        `Appointments last 7 days: ${payload.stats.apptsLast7} | Appointments today: ${payload.stats.apptsToday}\n` +
        `Sends last 7 days: ${payload.stats.sendsLast7}\n` +
        `Total cost: $${Math.round(payload.stats.totalCost)} | Total earnings: $${Math.round(payload.stats.totalEarning)}\n`;
      try {
        const reply = await brainstormWithCeo(question, Array.isArray(body.history) ? body.history : [], snapshot);
        await supabase.from("app_audit_log").insert({ actor_email: session.email, action: "ceo_brainstorm", details: { question: question.slice(0, 120), cost: reply.cost } });
        return json({ ok: true, reply: reply.text });
      } catch (e) {
        return error(e instanceof Error ? e.message : "Brainstorm failed", 500);
      }
    }

    return json({ error: `Unknown growth action: ${action}` }, 404);
  } catch (e) {
    return error(e instanceof Error ? e.message : "Growth action failed", 500);
  }
}
