import { error, json, requireSession } from "@/lib/http";
import { bootstrapRecruiter } from "@/lib/legacyRecruiter";

export async function GET() {
  try {
    const session = requireSession();
    return json(await bootstrapRecruiter(session.email));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not load bootstrap";
    return error(message, message === "Unauthorized" ? 401 : 500);
  }
}
