import { error, json, requireSession } from "@/lib/http";
import { getClientPortalPayload } from "@/lib/clientPortalData";
import { canOpenRole } from "@/lib/roles";

export async function GET() {
  try {
    const session = requireSession();
    if (!canOpenRole(session, "client")) return error("Access denied", 403);
    return json(await getClientPortalPayload(session));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Client portal load failed";
    return error(message, message === "Unauthorized" ? 401 : 500);
  }
}
