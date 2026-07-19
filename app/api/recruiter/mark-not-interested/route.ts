import { error, json, requireSession } from "@/lib/http";
import { markStatus } from "@/lib/legacyRecruiter";

export async function POST(req: Request) {
  try {
    const session = requireSession();
    const body = await req.json();
    const result = await markStatus(session.email, String(body.li || ""), "Not Interested", "No action - Non-responsive");
    return json(result, result.error ? 400 : 200);
  } catch (e) {
    return error(e instanceof Error ? e.message : "Could not mark status", 500);
  }
}
