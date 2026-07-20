import { error, json, requireSession } from "@/lib/http";
import { timeLogEnd, timeLogPing, timeLogStart } from "@/lib/legacyRecruiter";

export async function POST(req: Request) {
  try {
    const session = requireSession();
    const body = await req.json();
    const action = String(body.action || "");
    if (action === "start") return json(await timeLogStart(session.email));
    if (action === "ping") return json(await timeLogPing(session.email, String(body.sessionId || "")));
    if (action === "end") return json(await timeLogEnd(session.email, String(body.sessionId || "")));
    return json({ error: `Unknown time log action: ${action}` }, 404);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Time log failed";
    return error(message, message === "Unauthorized" ? 401 : 500);
  }
}
