import { error, json } from "@/lib/http";
import {
  bootstrapRecruiter,
  getClients,
  getContacts,
  getDailyTasks,
  getClientRatio,
  getTargetArea,
  getUnsureCriteria,
  getOutreachTemplate,
  getNurtureTemplate,
  getFuContactName,
  checkLiDuplicate,
  getBillingStats,
  getReferralStats,
  requestCredits,
  bulkSetCany,
  submitFeedback,
  submitLeave,
  getUsage,
  loginRecruiter,
  markStatus,
  saveNurture,
  saveOutreach,
  timeLogStart,
  timeLogEnd,
  timeLogPing
} from "@/lib/legacyRecruiter";
import { checkAndDecrementCredit, refundCredit } from "@/lib/credits";
import { generateNurtureCopy, generateOutreachCopy, rewriteNurtureCopy, rewriteOutreachCopy } from "@/lib/ai";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

function param(url: URL, key: string) {
  return url.searchParams.get(key) || "";
}

async function logAiUsage(email: string, action: string, details: string, cost: number) {
  try {
    const supabase = getSupabaseAdmin() as any;
    await supabase.from("app_audit_log").insert({ actor_email: email, action, details: { details, cost } });
  } catch {
    // Non-blocking — never fail the AI/extension response over logging.
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const api = param(url, "api");
  const email = param(url, "email");
  try {
    if (api === "login") return json(await loginRecruiter(email, param(url, "password")));

    // Combined login+bootstrap+timeLogStart in one round trip, matching
    // GAS apiLoginBootstrap — reduces the extension's login-time request count.
    if (api === "loginBootstrap") {
      const login = await loginRecruiter(email, param(url, "password"));
      if (!login || !login.ok || (login as any).role !== "recruiter") return json({ login });
      const [timeLog, boot] = await Promise.all([timeLogStart(email), bootstrapRecruiter(email)]);
      return json({ login, timeLog, usage: boot.usage, clients: boot.clients, clientRatio: boot.clientRatio, tasks: boot.tasks });
    }

    if (api === "bootstrap") return json(await bootstrapRecruiter(email));
    if (api === "usage") return json(await getUsage(email));
    if (api === "tasks") return json(await getDailyTasks(email));
    if (api === "clients") return json(await getClients(email));
    if (api === "clientRatio") return json(await getClientRatio(email));
    if (api === "contacts") return json(await getContacts(email, param(url, "q")));
    if (api === "outreachTpl") return json(await getOutreachTemplate(email, param(url, "outType") || "InMail"));
    if (api === "nurtureTpl") return json(await getNurtureTemplate(email, param(url, "nType") || "Interested", param(url, "client")));
    if (api === "checkLiDup") return json(await checkLiDuplicate(email, param(url, "li")));
    if (api === "targetArea") return json(await getTargetArea(email, param(url, "q")));
    if (api === "unsureCriteria") return json(await getUnsureCriteria());
    if (api === "billingStats") return json(await getBillingStats(email, param(url, "startDate"), param(url, "endDate")));
    if (api === "referralStats") return json(await getReferralStats(email, param(url, "startDate"), param(url, "endDate")));

    if (api === "saveStatus") return json(await markStatus(email, param(url, "li"), param(url, "status"), ""));

    if (api === "saveNurture") {
      return json(await saveNurture(
        email,
        param(url, "li"),
        param(url, "reply"),
        param(url, "nType"),
        param(url, "convo"),
        param(url, "client"),
        param(url, "source")
      ));
    }
    if (api === "saveOutreach") {
      return json(await saveOutreach(email, {
        name: param(url, "name"),
        li: param(url, "li"),
        outType: param(url, "outType") || "InMail",
        content: param(url, "content"),
        subject: param(url, "subject"),
        code: param(url, "code"),
        salesNavId: param(url, "salesNavId"),
        isCany: param(url, "isCany") === "1" || param(url, "isCany") === "true"
      }));
    }
    if (api === "markNotInterested") {
      return json(await markStatus(email, param(url, "li"), "Not Interested", "No action - Non-responsive"));
    }
    if (api === "markProfileRestricted") {
      return json(await markStatus(email, param(url, "li"), "Profile Restricted", "No Action-Closed"));
    }
    if (api === "bulkSetCany") return json(await bulkSetCany(email, (param(url, "lis") || "").split("|").filter(Boolean)));
    if (api === "requestCredits") return json(await requestCredits(email, param(url, "type") || "all"));
    if (api === "submitLeave") return json(await submitLeave(email, {
      leaveDate: param(url, "leaveDate"),
      duration: param(url, "duration"),
      reason: param(url, "reason")
    }));
    if (api === "submitFeedback") return json(await submitFeedback(email, {
      salesNavAll: param(url, "salesNavAll") === "1" || param(url, "salesNavAll") === "true",
      salesNavNoCount: param(url, "salesNavNoCount"),
      salesNavNoReason: param(url, "salesNavNoReason"),
      unusual: param(url, "unusual"),
      responsesToday: param(url, "responsesToday"),
      comments: param(url, "comments")
    }));

    // Time Log heartbeat — our own sessionId-based contract (not GAS's
    // rowNum/tabName scheme, since the extension is being updated to talk to
    // this backend anyway).
    if (api === "timeLogStart") return json(await timeLogStart(email));
    if (api === "timeLogPing") return json(await timeLogPing(email, param(url, "sessionId")));
    if (api === "timeLogEnd") return json(await timeLogEnd(email, param(url, "sessionId")));

    // AI Generate/Rewrite — same credit-spend/refund-on-failure behavior as
    // the webapp's /api/recruiter/ai route.
    if (api === "aiOutreach") {
      if (!(await checkAndDecrementCredit(email, "outreach"))) return json({ error: "outreach_limit", message: "No outreach credits remaining." }, 402);
      try {
        const reply = await generateOutreachCopy(param(url, "name"), param(url, "outType") || "InMail");
        await logAiUsage(email, "generate_outreach", param(url, "outType") || "InMail", reply.cost);
        return json({ body: reply.text });
      } catch (e) {
        await refundCredit(email, "outreach");
        throw e;
      }
    }
    if (api === "aiRewriteOutreach") {
      if (!(await checkAndDecrementCredit(email, "outreach"))) return json({ error: "outreach_limit", message: "No outreach credits remaining." }, 402);
      try {
        const reply = await rewriteOutreachCopy(param(url, "name"), param(url, "draft"), param(url, "outType") || "InMail");
        await logAiUsage(email, "rewrite_outreach", param(url, "li"), reply.cost);
        return json({ body: reply.text });
      } catch (e) {
        await refundCredit(email, "outreach");
        throw e;
      }
    }
    if (api === "aiNurture") {
      const nurtureType = param(url, "nType") || "Interested";
      if (nurtureType !== "Not Interested" && !(await checkAndDecrementCredit(email, "nurture"))) {
        return json({ error: "nurture_limit", message: "No nurture credits remaining." }, 402);
      }
      try {
        const prospectName = await getFuContactName(email, param(url, "li"));
        const reply = await generateNurtureCopy(prospectName, nurtureType, param(url, "convo"), param(url, "client"));
        if (reply.cost) await logAiUsage(email, "generate_nurture", nurtureType, reply.cost);
        return json({ body: reply.text });
      } catch (e) {
        if (nurtureType !== "Not Interested") await refundCredit(email, "nurture");
        throw e;
      }
    }
    if (api === "aiRewriteNurture") {
      if (!(await checkAndDecrementCredit(email, "nurture"))) return json({ error: "nurture_limit", message: "No nurture credits remaining." }, 402);
      try {
        const prospectName = await getFuContactName(email, param(url, "li"));
        const reply = await rewriteNurtureCopy(prospectName, param(url, "draft"), param(url, "client"));
        await logAiUsage(email, "rewrite_nurture", param(url, "li"), reply.cost);
        return json({ body: reply.text });
      } catch (e) {
        await refundCredit(email, "nurture");
        throw e;
      }
    }

    // Profile Selection (content.js scoring buttons) — a credit-metered but
    // free (no AI cost) action: checkProfileCredit decrements 1 profile
    // credit before scoring, logProfileSelection just logs the completed
    // action afterward, matching GAS's split apiCheckProfileCredit/
    // apiLogProfileSelection.
    if (api === "checkProfileCredit") {
      const ok = await checkAndDecrementCredit(email, "profile");
      if (!ok) return json({ ok: false, error: "No Profile Selection credits remaining." });
      return json({ ok: true });
    }
    if (api === "logProfileSelection") {
      try {
        await (getSupabaseAdmin() as any).from("app_audit_log").insert({
          actor_email: email,
          action: "profile_selection",
          details: { name: param(url, "name") || email, cost: Number(param(url, "cost") || 0) }
        });
      } catch {
        // Non-blocking.
      }
      return json({ ok: true });
    }

    return json({ error: `Unknown or not-yet-migrated extension API: ${api}` }, 404);
  } catch (e) {
    return error(e instanceof Error ? e.message : "Extension API failed", 500);
  }
}
