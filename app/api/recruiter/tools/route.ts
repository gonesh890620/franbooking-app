import { error, json, requireSession } from "@/lib/http";
import {
  bulkSetCany,
  checkLiDuplicate,
  getBillingStats,
  getClientRatio,
  getNurtureTemplate,
  getOutreachTemplate,
  getReferralStats,
  getTargetArea,
  getUnsureCriteria,
  submitFeedback,
  submitLeave
} from "@/lib/legacyRecruiter";

export async function GET(req: Request) {
  try {
    const session = requireSession();
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "";
    if (action === "checkLiDup") return json(await checkLiDuplicate(session.email, url.searchParams.get("li") || ""));
    if (action === "targetArea") return json(await getTargetArea(session.email, url.searchParams.get("q") || ""));
    if (action === "unsureCriteria") return json(await getUnsureCriteria());
    if (action === "outreachTpl") return json(await getOutreachTemplate(session.email, url.searchParams.get("outType") || "InMail"));
    if (action === "nurtureTpl") return json(await getNurtureTemplate(session.email, url.searchParams.get("nType") || "Interested", url.searchParams.get("client") || ""));
    if (action === "clientRatio") return json(await getClientRatio(session.email));
    if (action === "billingStats") return json(await getBillingStats(session.email, url.searchParams.get("startDate") || "", url.searchParams.get("endDate") || ""));
    if (action === "referralStats") return json(await getReferralStats(session.email, url.searchParams.get("startDate") || "", url.searchParams.get("endDate") || ""));
    return json({ error: `Unknown recruiter tool: ${action}` }, 404);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Recruiter tool failed";
    return error(message, message === "Unauthorized" ? 401 : 500);
  }
}

export async function POST(req: Request) {
  try {
    const session = requireSession();
    const body = await req.json();
    const action = String(body.action || "");
    if (action === "bulkSetCany") return json(await bulkSetCany(session.email, Array.isArray(body.lis) ? body.lis : []));
    if (action === "submitLeave") return json(await submitLeave(session.email, {
      leaveDate: String(body.leaveDate || ""),
      duration: String(body.duration || "1"),
      reason: String(body.reason || "")
    }));
    if (action === "submitFeedback") return json(await submitFeedback(session.email, body));
    return json({ error: `Unknown recruiter tool: ${action}` }, 404);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Recruiter tool failed";
    return error(message, message === "Unauthorized" ? 401 : 500);
  }
}
