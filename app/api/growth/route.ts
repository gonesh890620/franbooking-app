import { error, json, requireSession } from "@/lib/http";
import { getGrowthPayload } from "@/lib/growthData";
import { canOpenRole } from "@/lib/roles";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { setSession } from "@/lib/auth";
import { updateMasterTrackerClientStatus } from "@/lib/masterTracker";
import { brainstormWithCeo } from "@/lib/ai";
import { roleForLegacyType } from "@/lib/legacyRecruiter";
import { getNurtureFuStats, getRecruiterDirectory, getRecruiterOnlineStatus, getRecruitersOnLeave, getRecruitersOnLeaveTomorrow, getS2AByRecruiterRange, getWaitList } from "@/lib/growthDashboard";
import { appendClientPaymentToSheet, appendCostToSheet, appendTaskToSheet, reassignTaskInSheet, updateTaskStatusInSheet } from "@/lib/growthSheets";

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

    // Dual-write: Supabase first (fast read path), then the matching Google
    // Sheet tab (DAILY_TASK_SHEET_ID "Tasks"), per explicit direction that
    // every Growth panel action should land in both places.
    if (action === "addTask") {
      const legacyId = `wa-${Date.now()}`;
      const title = body.title || "";
      const description = body.description || "";
      const topic = body.topic || "";
      const priority = body.priority || "";
      const assignedEmail = body.assignedEmail || session.email;
      const assignedName = body.assignedName || session.name;
      const createdDate = new Date().toISOString().slice(0, 10);
      await supabase.from("team_tasks").insert({ legacy_id: legacyId, title, description, topic, priority, status: "Open", created_date: createdDate, assigned_email: assignedEmail, assigned_name: assignedName });
      try {
        await appendTaskToSheet(legacyId, title, description, topic, priority, body.eta || "", "Open", createdDate, assignedEmail, assignedName);
      } catch (e) {
        console.error("addTask sheet write failed:", e);
      }
      return json({ ok: true });
    }
    if (action === "taskStatus") {
      const id = String(body.id || "");
      const status = body.status || "Open";
      const { data: taskRow } = await supabase.from("team_tasks").select("legacy_id").eq("id", id).maybeSingle();
      await supabase.from("team_tasks").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
      if (taskRow?.legacy_id) {
        try { await updateTaskStatusInSheet(taskRow.legacy_id, status); } catch (e) { console.error("taskStatus sheet write failed:", e); }
      }
      return json({ ok: true });
    }
    // Matches GAS apiCeoReassignTask.
    if (action === "reassignTask") {
      const newAssignedEmail = String(body.assignedEmail || "").toLowerCase().trim();
      if (!newAssignedEmail) return json({ error: "Assignee is required" }, 400);
      const id = String(body.id || "");
      const assignedName = body.assignedName || "";
      const { data: taskRow } = await supabase.from("team_tasks").select("legacy_id").eq("id", id).maybeSingle();
      await supabase.from("team_tasks").update({
        assigned_email: newAssignedEmail,
        assigned_name: assignedName,
        updated_at: new Date().toISOString()
      }).eq("id", id);
      if (taskRow?.legacy_id) {
        try { await reassignTaskInSheet(taskRow.legacy_id, newAssignedEmail, assignedName); } catch (e) { console.error("reassignTask sheet write failed:", e); }
      }
      return json({ ok: true });
    }
    if (action === "addCost") {
      const date = body.date || new Date().toISOString().slice(0, 10);
      const amount = Number(body.amount || 0);
      const description = body.description || "";
      const notes = body.notes || "";
      const useMethod = body.useMethod || "";
      const comments = body.comments || "";
      await supabase.from("costs").insert({ date, amount, description, notes, use_method: useMethod, comments });
      try {
        await appendCostToSheet(date, amount, description, notes, useMethod, comments);
      } catch (e) {
        console.error("addCost sheet write failed:", e);
      }
      return json({ ok: true });
    }
    if (action === "addPayment") {
      const dateIssue = body.dateIssue || "";
      const datePaid = body.datePaid || "";
      const clientName = body.clientName || "";
      const invoiceRef = body.invoiceRef || "";
      const cycle = Number(body.cycle || 0);
      const totalBilled = Number(body.totalBilled || 0);
      const status = body.status || "";
      const chargedBy = body.chargedBy || "";
      await supabase.from("client_payments").insert({ date_issue: dateIssue || null, date_paid: datePaid || null, client_name: clientName, invoice_ref: invoiceRef, cycle, total_billed: totalBilled, status, charged_by: chargedBy });
      try {
        await appendClientPaymentToSheet(dateIssue, datePaid, clientName, invoiceRef, cycle, totalBilled, status, chargedBy);
      } catch (e) {
        console.error("addPayment sheet write failed:", e);
      }
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

    // Recruiter Status tiles/popups — lazy-loaded like GAS's separate
    // apiCeoGetRecruiterOnlineStatus (kept out of the main dashboard payload
    // since it's its own query pass, matching GAS's perf-driven split).
    if (action === "onlineStatus") {
      return json(await getRecruiterOnlineStatus());
    }
    if (action === "leaveToday") {
      return json({ rows: await getRecruitersOnLeave() });
    }
    if (action === "leaveTomorrow") {
      return json({ rows: await getRecruitersOnLeaveTomorrow() });
    }
    if (action === "waitList") {
      return json({ rows: await getWaitList() });
    }
    // New Nurture Sent / FU Sent — scans every recruiter's own FU Tracker
    // sheet live, so this is the slowest panel; lazy-loaded on first open.
    if (action === "nurtureFuStats") {
      return json(await getNurtureFuStats());
    }
    // Reports tab — Recruiter Directory (all Supabase-sourced).
    if (action === "recruiterDirectory") {
      return json(await getRecruiterDirectory());
    }
    // Daily Appointment by Recruiters — custom date-range table.
    if (action === "s2aRange") {
      const start = String(body.startDate || "").slice(0, 10);
      const end = String(body.endDate || "").slice(0, 10);
      if (!start || !end) return json({ error: "startDate and endDate are required" }, 400);
      return json(await getS2AByRecruiterRange(start, end));
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
