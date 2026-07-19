import { error, json, requireSession } from "@/lib/http";
import { saveOutreach } from "@/lib/legacyRecruiter";

export async function POST(req: Request) {
  try {
    const session = requireSession();
    const body = await req.json();
    const result = await saveOutreach(session.email, {
      name: String(body.name || ""),
      li: String(body.li || ""),
      outType: String(body.outType || "InMail"),
      content: String(body.content || ""),
      subject: String(body.subject || ""),
      code: String(body.code || ""),
      salesNavId: String(body.salesNavId || ""),
      isCany: Boolean(body.isCany)
    });
    return json(result, result.error ? 400 : 200);
  } catch (e) {
    return error(e instanceof Error ? e.message : "Could not save outreach", 500);
  }
}
