import { error, json, requireSession } from "@/lib/http";
import { getOperationsPayload } from "@/lib/operationsData";
import { canOpenRole } from "@/lib/roles";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { setFuStatusOnly } from "@/lib/legacyRecruiter";
import { updateMasterTrackerClientStatus } from "@/lib/masterTracker";

export async function GET() {
  try {
    const session = requireSession();
    if (!canOpenRole(session, "operations")) return error("Access denied", 403);
    return json(await getOperationsPayload());
  } catch (e) {
    const message = e instanceof Error ? e.message : "Operations load failed";
    return error(message, message === "Unauthorized" ? 401 : 500);
  }
}

export async function POST(req: Request) {
  try {
    const session = requireSession();
    if (!canOpenRole(session, "operations")) return error("Access denied", 403);
    const body = await req.json();
    const action = String(body.action || "");
    const supabase = getSupabaseAdmin() as any;

    if (action === "processAppointment" || action === "recallAppointment") {
      if (action === "recallAppointment" && !String(body.reason || "").trim()) {
        return error("A recall reason is required.", 400);
      }
      const status = action === "recallAppointment" ? "recalled" : "processed";
      const recruiterEmail = String(body.recruiterEmail || "").toLowerCase().trim();
      const { data: recruiter } = recruiterEmail
        ? await supabase.from("app_users").select("id,name,email").eq("email", recruiterEmail).maybeSingle()
        : { data: null };
      const updates: Record<string, unknown> = {
        status,
        recruiter_id: recruiter?.id || null,
        recruiter_name: recruiter?.name || String(body.recruiterName || ""),
        updated_at: new Date().toISOString()
      };
      if (action === "recallAppointment") {
        updates.identity_check = session.name || session.email;
        updates.canceled = "Yes";
        updates.cancellation_reason = String(body.reason || "");
        updates.canceled_by = "FranBooking";
        updates.on_leads_ledger = "No";
        updates.sent_to_client = "N/a";
      }
      await supabase.from("appointments").update(updates).eq("id", String(body.id || ""));

      // FU Tracker is Google-Sheets-only — the recruiter's pipeline status
      // lives there, not in Supabase, so recall must write the Sheet directly.
      if (action === "recallAppointment" && recruiterEmail && body.linkedinUrl) {
        await setFuStatusOnly(recruiterEmail, String(body.linkedinUrl), "Recalled");
      }
      return json({ ok: true });
    }

    if (action === "addSalesNav") {
      await supabase.from("sales_nav_inventory").insert({
        date_added: body.date || new Date().toISOString().slice(0, 10),
        vendor: body.vendor || "",
        recruiter_name: body.recruiterName || "",
        recruiter_email: body.recruiterEmail || "",
        price: Number(body.price || 0),
        status: body.status || "Active",
        payment_status: body.paymentStatus || "",
        sales_nav_id: body.salesNavId || "",
        notes: body.notes || ""
      });
      return json({ ok: true });
    }

    if (action === "addApplicant") {
      await supabase.from("applicants").insert({
        date_applied: body.dateApplied || new Date().toISOString().slice(0, 10),
        platform: body.platform || "",
        name: body.name || "",
        email: body.email || "",
        phone: body.phone || "",
        linkedin_url: body.liProfile || "",
        position: body.position || "",
        status: body.status || "Applied",
        notes: body.notes || ""
      });
      return json({ ok: true });
    }

    if (action === "assignAgent") {
      const { data: agent } = await supabase.from("app_users").select("id,name,email").eq("email", String(body.agentEmail || "").toLowerCase()).maybeSingle();
      await supabase.from("applicants").update({
        assigned_agent_id: agent?.id || null,
        assigned_agent_name: agent?.name || body.agentName || "",
        status: "Assigned",
        updated_at: new Date().toISOString()
      }).eq("id", String(body.applicantId || ""));
      return json({ ok: true });
    }

    if (action === "updateApplicantStatus") {
      await supabase.from("applicants").update({ status: body.status || "Applied", updated_at: new Date().toISOString() }).eq("id", String(body.applicantId || ""));
      return json({ ok: true });
    }

    // Full-field edit (name/email/phone/LI/position/notes), matching GAS's
    // apiOpsUpdateApplicant — distinct from the status-only quick action above.
    if (action === "updateApplicant") {
      await supabase.from("applicants").update({
        name: body.name || "",
        email: body.email || "",
        phone: body.phone || "",
        linkedin_url: body.liProfile || "",
        position: body.position || "",
        notes: body.notes || "",
        updated_at: new Date().toISOString()
      }).eq("id", String(body.applicantId || ""));
      return json({ ok: true });
    }

    if (action === "updateClientStatus") {
      const campaignId = String(body.campaignId || "");
      const { data: campaign } = await supabase.from("campaigns").select("campaign_name").eq("id", campaignId).maybeSingle();
      await supabase.from("campaigns").update({
        campaign_status: body.status || "",
        paused_reason: body.pausedReason || "",
        updated_at: new Date().toISOString()
      }).eq("id", campaignId);
      // Master Tracker dual-writes to its Google Sheet alongside Supabase.
      if (campaign?.campaign_name) {
        await updateMasterTrackerClientStatus(campaign.campaign_name, body.status || "", body.pausedReason || "");
      }
      return json({ ok: true });
    }

    return json({ error: `Unknown operations action: ${action}` }, 404);
  } catch (e) {
    return error(e instanceof Error ? e.message : "Operations action failed", 500);
  }
}
