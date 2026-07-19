import { error, json, requireSession } from "@/lib/http";
import { saveNurture } from "@/lib/legacyRecruiter";

export async function POST(req: Request) {
  try {
    const session = requireSession();
    const body = await req.json();
    const result = await saveNurture(
      session.email,
      String(body.li || ""),
      String(body.reply || ""),
      String(body.nurtureType || ""),
      String(body.conversation || ""),
      String(body.client || ""),
      String(body.source || "")
    );
    return json(result, result.error ? 400 : 200);
  } catch (e) {
    return error(e instanceof Error ? e.message : "Could not save nurture", 500);
  }
}
