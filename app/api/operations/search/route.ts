import { error, json, requireSession } from "@/lib/http";
import { canOpenRole } from "@/lib/roles";
import { searchContacts } from "@/lib/opsSearch";

export async function GET(req: Request) {
  try {
    const session = requireSession();
    if (!canOpenRole(session, "operations")) return error("Access denied", 403);
    const url = new URL(req.url);
    const q = url.searchParams.get("q") || "";
    return json({ contacts: await searchContacts(q) });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Search failed";
    return error(message, message === "Unauthorized" ? 401 : 500);
  }
}
