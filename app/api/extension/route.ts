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
  saveOutreach
} from "@/lib/legacyRecruiter";

function param(url: URL, key: string) {
  return url.searchParams.get(key) || "";
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const api = param(url, "api");
  const email = param(url, "email");
  try {
    if (api === "login") return json(await loginRecruiter(email, param(url, "password")));
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
    return json({ error: `Unknown or not-yet-migrated extension API: ${api}` }, 404);
  } catch (e) {
    return error(e instanceof Error ? e.message : "Extension API failed", 500);
  }
}
