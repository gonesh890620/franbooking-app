import { error, json, requireSession } from "@/lib/http";
import { getClients } from "@/lib/legacyRecruiter";

export async function GET() {
  try {
    const session = requireSession();
    return json(await getClients(session.email));
  } catch (e) {
    return error(e instanceof Error ? e.message : "Could not load clients", 500);
  }
}
