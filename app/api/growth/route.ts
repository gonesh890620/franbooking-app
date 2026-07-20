import { error, json, requireSession } from "@/lib/http";
import { getGrowthPayload } from "@/lib/growthData";
import { canOpenRole } from "@/lib/roles";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

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
    if (action === "addCost") {
      await supabase.from("costs").insert({ date: body.date || new Date().toISOString().slice(0, 10), amount: Number(body.amount || 0), description: body.description || "", notes: body.notes || "", use_method: body.useMethod || "", comments: body.comments || "" });
      return json({ ok: true });
    }
    if (action === "addPayment") {
      await supabase.from("client_payments").insert({ date_issue: body.dateIssue || null, date_paid: body.datePaid || null, client_name: body.clientName || "", invoice_ref: body.invoiceRef || "", cycle: Number(body.cycle || 0), total_billed: Number(body.totalBilled || 0), status: body.status || "", charged_by: body.chargedBy || "" });
      return json({ ok: true });
    }
    return json({ error: `Unknown growth action: ${action}` }, 404);
  } catch (e) {
    return error(e instanceof Error ? e.message : "Growth action failed", 500);
  }
}
