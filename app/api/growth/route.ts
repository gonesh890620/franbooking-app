import { error, json, requireSession } from "@/lib/http";
import { getGrowthPayload } from "@/lib/growthData";
import { canOpenRole } from "@/lib/roles";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { setSession } from "@/lib/auth";
import { brainstormWithCeo } from "@/lib/ai";
import { roleForLegacyType } from "@/lib/legacyRecruiter";
import { getFeedbackForDate, getNurtureFuStats, getRecruiterDirectory, getRecruiterOnlineStatus, getRecruitersOnLeave, getRecruitersOnLeaveTomorrow, getS2AByRecruiterRange, getWaitList } from "@/lib/growthDashboard";
import { appendClientPaymentToSheet, appendCostToSheet, appendTaskToSheet, appendWaitlistToSheet, reassignTaskInSheet, updateTaskStatusInSheet } from "@/lib/growthSheets";
import { addClient, archiveClient, getAllClientTracker, getClientEmail, getLedgerCsvRows, logSlotCheck, logVacationCheck, markLedgerSent, updateClient } from "@/lib/clientTracker";
import {
  addVendor, addVendorOrder, addVendorProfile, getVendorData, logVendorCommunication, logVendorFollowUpBulk,
  logVendorIssue, logVendorIssueFollowUp, replaceVendorProfile, updateVendor, updateVendorIssue, updateVendorOrder, updateVendorProfile
} from "@/lib/vendorManagement";
import { getRecruiterBillingReport, getRecruiterPaymentsReport, getRecruiterRosterForPayment, markRecruiterPaid, setRecruiterWiseAccount } from "@/lib/recruiterPayments";
import { addRecurringTask, getRecurringTasks, runRecurringCheck, toggleRecurringTask } from "@/lib/recurringTasks";

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

    // Client Tracker: full table + Add/Update/Archive Client, Mark Ledger
    // Sent, Ledger CSV export, and the Slot/Vacation-check follow-up badges.
    // Business logic + Master Tracker/Leads Ledger dual-write live in
    // lib/clientTracker.ts; this route just authorizes and dispatches.
    if (action === "clientTrackerAll") {
      const result = await getAllClientTracker();
      return json(result);
    }
    if (action === "addClient") {
      const result = await addClient(body.data || {});
      return json(result, result.error ? 400 : 200);
    }
    if (action === "updateClient") {
      const result = await updateClient(String(body.clientName || ""), body.data || {});
      return json(result, result.error ? 400 : 200);
    }
    if (action === "archiveClient") {
      const result = await archiveClient(String(body.clientName || ""), String(body.reason || ""), session.name);
      return json(result, result.error ? 400 : 200);
    }
    if (action === "logSlotCheck") {
      const result = await logSlotCheck(String(body.clientName || ""), body.resultType);
      return json(result, result.error ? 400 : 200);
    }
    if (action === "logVacationCheck") {
      const result = await logVacationCheck(String(body.clientName || ""), body.resultType);
      return json(result, result.error ? 400 : 200);
    }
    if (action === "markLedgerSent") {
      const result = await markLedgerSent(String(body.clientName || ""), String(body.cycleNumber || ""));
      return json(result, result.error ? 400 : 200);
    }
    if (action === "getClientEmail") {
      const result = await getClientEmail(String(body.clientName || ""));
      return json(result, result.error ? 400 : 200);
    }
    if (action === "getLedgerCsvRows") {
      const result = await getLedgerCsvRows(String(body.clientName || ""));
      return json(result, result.error ? 400 : 200);
    }
    // Vendor Management — Vendors/Profiles/Issues/Orders/Communications.
    // Business logic + Vendor spreadsheet dual-write live in
    // lib/vendorManagement.ts; this route just authorizes and dispatches.
    if (action === "vendorData") {
      return json(await getVendorData());
    }
    if (action === "addVendorProfile") {
      const result = await addVendorProfile(body.data || {});
      return json(result, result.error ? 400 : 200);
    }
    if (action === "updateVendorProfile") {
      const result = await updateVendorProfile(String(body.profileId || ""), body.data || {});
      return json(result, result.error ? 400 : 200);
    }
    if (action === "replaceVendorProfile") {
      const result = await replaceVendorProfile(String(body.oldProfileId || ""), body.data || {}, body.issueId ? String(body.issueId) : undefined);
      return json(result, result.error ? 400 : 200);
    }
    if (action === "logVendorIssue") {
      const result = await logVendorIssue(String(body.profileId || ""), body.data || {});
      return json(result, result.error ? 400 : 200);
    }
    if (action === "updateVendorIssue") {
      const result = await updateVendorIssue(String(body.issueId || ""), body.data || {});
      return json(result, result.error ? 400 : 200);
    }
    if (action === "logVendorIssueFollowUp") {
      const result = await logVendorIssueFollowUp(String(body.issueId || ""));
      return json(result, result.error ? 400 : 200);
    }
    if (action === "logVendorFollowUpBulk") {
      const result = await logVendorFollowUpBulk(Array.isArray(body.issueIds) ? body.issueIds : []);
      return json(result, result.error ? 400 : 200);
    }
    if (action === "addVendor") {
      const result = await addVendor(body.data || {});
      return json(result, result.error ? 400 : 200);
    }
    if (action === "updateVendor") {
      const result = await updateVendor(String(body.vendorId || ""), body.data || {});
      return json(result, result.error ? 400 : 200);
    }
    if (action === "logVendorCommunication") {
      const result = await logVendorCommunication(body.data || {});
      return json(result, result.error ? 400 : 200);
    }
    if (action === "addVendorOrder") {
      const result = await addVendorOrder(body.data || {});
      return json(result, result.error ? 400 : 200);
    }
    if (action === "updateVendorOrder") {
      const result = await updateVendorOrder(String(body.orderId || ""), body.data || {});
      return json(result, result.error ? 400 : 200);
    }

    // Recruiter Payments + Wise workflow (Finance panel).
    if (action === "recruiterPaymentsReport") {
      return json(await getRecruiterPaymentsReport());
    }
    if (action === "markRecruiterPaid") {
      const result = await markRecruiterPaid(String(body.recruiterEmail || ""), String(body.cycleKey || ""), String(body.invoiceId || ""), session.email);
      return json(result, result.error ? 400 : 200);
    }
    if (action === "recruiterRosterForPayment") {
      return json(await getRecruiterRosterForPayment());
    }
    if (action === "setRecruiterWiseAccount") {
      const result = await setRecruiterWiseAccount(String(body.recruiterEmail || ""), String(body.wiseAccount || ""));
      return json(result, result.error ? 400 : 200);
    }
    if (action === "recruiterBillingReport") {
      return json(await getRecruiterBillingReport());
    }

    // Recurring Tasks (Daily Task panel).
    if (action === "recurringTasks") {
      return json(await getRecurringTasks());
    }
    if (action === "addRecurringTask") {
      const result = await addRecurringTask(body.data || {}, session.email, session.name);
      return json(result, result.error ? 400 : 200);
    }
    if (action === "toggleRecurringTask") {
      const result = await toggleRecurringTask(String(body.id || ""), !!body.active);
      return json(result, result.error ? 400 : 200);
    }
    if (action === "runRecurringCheck") {
      return json(await runRecurringCheck());
    }

    if (action === "addWaitlist") {
      const clientName = String(body.clientName || "").trim();
      if (!clientName) return json({ error: "Client Name is required" }, 400);
      const date = body.date || new Date().toISOString().slice(0, 10);
      const contactEmail = body.contactEmail || "";
      const eta = body.eta || "";
      const notes = body.notes || "";
      await supabase.from("wait_list").insert({ entry_date: date, client_name: clientName, contact_email: contactEmail, eta_launch: eta, notes });
      try {
        await appendWaitlistToSheet(date, clientName, contactEmail, eta, notes);
      } catch (e) {
        console.error("addWaitlist sheet write failed:", e);
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
    if (action === "feedbackByDate") {
      return json(await getFeedbackForDate(String(body.date || "")));
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
