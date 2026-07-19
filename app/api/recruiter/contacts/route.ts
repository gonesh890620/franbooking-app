import { error, json, requireSession } from "@/lib/http";
import { getContacts } from "@/lib/legacyRecruiter";

export async function GET(req: Request) {
  try {
    const session = requireSession();
    const url = new URL(req.url);
    return json(await getContacts(session.email, url.searchParams.get("q") || ""));
  } catch (e) {
    return error(e instanceof Error ? e.message : "Could not load contacts", 500);
  }
}
