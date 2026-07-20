import { error, json, requireSession } from "@/lib/http";
import { getFuContactName } from "@/lib/legacyRecruiter";
import { checkAndDecrementCredit, refundCredit } from "@/lib/credits";
import { generateNurtureCopy, generateOutreachCopy, rewriteNurtureCopy, rewriteOutreachCopy } from "@/lib/ai";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

async function logAiUsage(email: string, action: string, details: string, cost: number) {
  try {
    const supabase = getSupabaseAdmin() as any;
    await supabase.from("app_audit_log").insert({ actor_email: email, action, details: { details, cost } });
    await supabase.from("ai_cost_logs").insert({ email, action, cost });
  } catch {
    // Non-blocking — never fail the AI response over logging.
  }
}

export async function POST(req: Request) {
  let session;
  try {
    session = requireSession();
  } catch (e) {
    return error("Unauthorized", 401);
  }
  const body = await req.json();
  const action = String(body.action || "");
  const email = session.email;

  try {
    if (action === "generateOutreach") {
      if (!(await checkAndDecrementCredit(email, "outreach"))) {
        return json({ error: "outreach_limit", message: "No outreach credits remaining." }, 402);
      }
      try {
        const reply = await generateOutreachCopy(String(body.name || ""), String(body.outType || "InMail"));
        await logAiUsage(email, "generate_outreach", String(body.outType || "InMail"), reply.cost);
        return json({ body: reply.text });
      } catch (e) {
        await refundCredit(email, "outreach");
        throw e;
      }
    }

    if (action === "rewriteOutreach") {
      if (!(await checkAndDecrementCredit(email, "outreach"))) {
        return json({ error: "outreach_limit", message: "No outreach credits remaining." }, 402);
      }
      try {
        const reply = await rewriteOutreachCopy(String(body.name || ""), String(body.draft || ""), String(body.outType || "InMail"));
        await logAiUsage(email, "rewrite_outreach", String(body.li || ""), reply.cost);
        return json({ body: reply.text });
      } catch (e) {
        await refundCredit(email, "outreach");
        throw e;
      }
    }

    if (action === "generateNurture") {
      const nurtureType = String(body.nurtureType || "Interested");
      if (nurtureType !== "Not Interested" && !(await checkAndDecrementCredit(email, "nurture"))) {
        return json({ error: "nurture_limit", message: "No nurture credits remaining." }, 402);
      }
      try {
        const prospectName = await getFuContactName(email, String(body.li || ""));
        const reply = await generateNurtureCopy(prospectName, nurtureType, String(body.conversation || ""), String(body.client || ""));
        if (reply.cost) await logAiUsage(email, "generate_nurture", nurtureType, reply.cost);
        return json({ body: reply.text });
      } catch (e) {
        if (nurtureType !== "Not Interested") await refundCredit(email, "nurture");
        throw e;
      }
    }

    if (action === "rewriteNurture") {
      if (!(await checkAndDecrementCredit(email, "nurture"))) {
        return json({ error: "nurture_limit", message: "No nurture credits remaining." }, 402);
      }
      try {
        const prospectName = await getFuContactName(email, String(body.li || ""));
        const reply = await rewriteNurtureCopy(prospectName, String(body.draft || ""), String(body.client || ""));
        await logAiUsage(email, "rewrite_nurture", String(body.li || ""), reply.cost);
        return json({ body: reply.text });
      } catch (e) {
        await refundCredit(email, "nurture");
        throw e;
      }
    }

    return json({ error: `Unknown AI action: ${action}` }, 404);
  } catch (e) {
    return error(e instanceof Error ? e.message : "AI request failed", 500);
  }
}
